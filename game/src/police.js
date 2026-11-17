// Police: the Bay PD cruisers that answer a wanted level. Cruisers live in
// the same shared vehicle list as every other car (never in traffic.cars —
// traffic would treat them as obstacles to avoid), drive through the same
// driveVehicle physics, and chase Jax by steering toward him. One star
// fields one cruiser, five stars field six; when the heat cools, the
// farthest cruiser peels off first. A cruiser that pulls up beside a slow
// Jax fills the bust meter, and a full meter means BUSTED: the main loop
// takes the fine and resets the heat. B4's missions hook the bust through
// `onBusted` to fail a run in progress.
import { CITY } from './config.js';
import { createVehicle, driveVehicle } from './vehicles.js';

/** Cruisers wanted, by stars: 1 star fields 1, 5 stars field 6. */
function desiredCount(stars) {
  if (stars <= 0) return 0;
  return Math.min(6, stars + (stars >= 5 ? 1 : 0));
}
/** A cruiser this close and Jax this slow fills the bust meter. */
const BUST_RADIUS = 90;
const BUST_PLAYER_SPEED = 70;
/** Seconds beside a cruiser to fill the meter from empty. */
const BUST_SECONDS = 2.2;
/** A cruiser this far from Jax is out of sight and can be repositioned. */
const FAR_DIST = 1600;
/** How often a new cruiser may roll in (no pop-in convoys). */
const SPAWN_INTERVAL = 0.6;
/** A cruiser stuck this long off the chase gets moved back in. */
const STUCK_SECONDS = 4;

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

function angleDiff(target, current) {
  let diff = target - current;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}

export function createPolice(world, random, vehicles, wanted, effects, options = {}) {
  const { city } = world;
  /** The cruisers, a subset of the shared `vehicles` list. */
  const cars = [];
  let spawnTimer = 0;

  const police = {
    /** The cruisers (a live subset of the shared vehicle list). */
    cars,
    /** 0 to 1: how close Jax is to being busted. Read by the main loop. */
    bust: 0,
    /**
     * Called by the main loop when the bust meter fills, with
     * { fine, stars } — B4 sets this to fail a mission in progress.
     */
    onBusted: options.onBusted ?? null,
  };

  /** A road point `minDist` to `maxDist` from (x, y), facing along its road. */
  function spawnPointNear(x, y, minDist, maxDist) {
    for (let attempt = 0; attempt < 14; attempt += 1) {
      const vertical = random() < 0.5;
      let px;
      let py;
      let angle;
      if (vertical) {
        const avenue = city.avenues[Math.floor(random() * city.avenues.length)];
        const dir = random() < 0.5 ? -1 : 1;
        const along = minDist + random() * (maxDist - minDist);
        py = y + dir * along;
        px = avenue + (dir < 0 ? 27 : -27);
        angle = dir < 0 ? -Math.PI / 2 : Math.PI / 2;
        if (py < 60 || py > CITY.height - 60) continue;
      } else {
        const street = city.streets[Math.floor(random() * city.streets.length)];
        const dir = random() < 0.5 ? -1 : 1;
        const along = minDist + random() * (maxDist - minDist);
        px = x + dir * along;
        py = street + (dir > 0 ? 27 : -27);
        angle = dir > 0 ? 0 : Math.PI;
        if (px < 60 || px > CITY.boardwalkX - 60) continue;
      }
      if (world.isBlocked(px, py, 26)) continue;
      const dist = Math.hypot(px - x, py - y);
      if (dist < minDist || dist > maxDist) continue;
      return { x: px, y: py, angle };
    }
    return null;
  }

  /** Roll one cruiser in near the player, at a road point out of arm's reach. */
  function spawnCar(player) {
    const spot = spawnPointNear(player.x, player.y, 320, 800);
    if (spot === null) return null;
    const car = createVehicle('police', spot.x, spot.y, spot.angle);
    car.driver = 'police';
    /** Marks it a cruiser: the renderer draws the light bar, and the player may not steal it. */
    car.police = true;
    /** Light-bar phase: the renderer blinks red/blue off this. */
    car.lightPhase = random();
    car.stuckTimer = 0;
    car.glowTimer = 0;
    car.ramCooldown = 0;
    cars.push(car);
    vehicles.push(car);
    return car;
  }

  /** Drop a cruiser from the police list and the shared vehicle list. */
  function despawnCar(car) {
    const index = cars.indexOf(car);
    if (index !== -1) cars.splice(index, 1);
    const shared = vehicles.indexOf(car);
    if (shared !== -1) vehicles.splice(shared, 1);
  }

  /** Pull every cruiser off the street (a bust clears the heat). */
  function clearAll() {
    for (let i = cars.length - 1; i >= 0; i -= 1) despawnCar(cars[i]);
    police.bust = 0;
  }

  /** Register the bust callback (B4 missions fail the run from it). */
  function setBustedHandler(handler) {
    police.onBusted = handler;
  }

  /**
   * One fixed step: match cruisers to the wanted level, chase the player,
   * ram his car, and fill the bust meter when a cruiser sits on a slow Jax.
   * `player` is player.player (x, y, vehicle); `isBlocked` is world's.
   */
  function update(dt, player, isBlocked) {
    spawnTimer += dt;
    const desired = desiredCount(wanted.stars);
    if (cars.length < desired && spawnTimer >= SPAWN_INTERVAL) {
      spawnCar(player);
      spawnTimer = 0;
    }
    // Too many cruisers: the farthest one peels off first.
    while (cars.length > desired) {
      let farthest = cars[0];
      let farthestDist = -1;
      for (const car of cars) {
        const dist = Math.hypot(car.x - player.x, car.y - player.y);
        if (dist > farthestDist) {
          farthest = car;
          farthestDist = dist;
        }
      }
      despawnCar(farthest);
    }

    let nearestDist = Infinity;
    let playerSpeed = 0;
    if (player.vehicle) playerSpeed = Math.abs(player.vehicle.speed);

    for (let i = cars.length - 1; i >= 0; i -= 1) {
      const car = cars[i];
      const dx = player.x - car.x;
      const dy = player.y - car.y;
      const dist = Math.hypot(dx, dy) || 1;
      if (dist < nearestDist) nearestDist = dist;

      // A cruiser that lost the chase entirely gets moved back into it.
      if (dist > FAR_DIST) {
        const spot = spawnPointNear(player.x, player.y, 320, 800);
        if (spot !== null) {
          car.x = spot.x;
          car.y = spot.y;
          car.angle = spot.angle;
          car.speed = 0;
          car.stuckTimer = 0;
        }
        continue;
      }

      // Stuck against a building or a jammed street: give it a fresh start.
      if (Math.abs(car.speed) < 25 && dist > 250) car.stuckTimer += dt;
      else car.stuckTimer = 0;
      if (car.stuckTimer > STUCK_SECONDS) {
        const spot = spawnPointNear(player.x, player.y, 320, 600);
        if (spot !== null) {
          car.x = spot.x;
          car.y = spot.y;
          car.angle = spot.angle;
          car.speed = 0;
        }
        car.stuckTimer = 0;
      }

      // Pure pursuit: steer at Jax, gas toward him, ease off on top of him.
      const desiredAngle = Math.atan2(dy, dx);
      const steer = clamp(angleDiff(desiredAngle, car.angle) * 2.2, -1, 1);
      let targetSpeed = car.type.topSpeed * 0.92;
      if (dist < 70) targetSpeed = player.vehicle ? Math.abs(player.vehicle.speed) + 30 : 0;
      const throttle = clamp((targetSpeed - car.speed) / 140, -1, 1);
      driveVehicle(car, dt, throttle, steer, isBlocked);

      // Flashing light bar: alternate the halo colour, a few times a second.
      car.lightPhase += dt * 1.6;
      car.glowTimer -= dt;
      if (car.glowTimer <= 0) {
        car.glowTimer = 0.14;
        const phase = car.lightPhase % 1;
        effects.glow(car.x, car.y, phase < 0.5 ? 'rgba(226, 59, 46, 0.5)' : 'rgba(46, 111, 226, 0.5)', 52);
      }

      // Ramming the player's car: slow him down, and a hard hit he drives
      // into a cruiser counts as his crime, not the cruiser's.
      if (player.vehicle) {
        const pcar = player.vehicle;
        const pdx = pcar.x - car.x;
        const pdy = pcar.y - car.y;
        const pdist = Math.hypot(pdx, pdy);
        if (pdist < 46 && pdist > 0.01) {
          if (Math.abs(pcar.speed) > 120) {
            const toward = (Math.cos(pcar.angle) * pdx + Math.sin(pcar.angle) * pdy) / pdist;
            if (toward > 0.4 && car.ramCooldown <= 0) {
              wanted.addCrime('hitPolice');
              car.ramCooldown = 2;
            }
            pcar.speed *= 0.55;
            effects.sparks(pcar.x, pcar.y, 8);
          }
        }
      }
      if (car.ramCooldown > 0) car.ramCooldown -= dt;
    }

    // Cruisers keep their distance from each other instead of piling up.
    for (let i = 0; i < cars.length; i += 1) {
      for (let j = i + 1; j < cars.length; j += 1) {
        const a = cars[i];
        const b = cars[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 40 && dist > 0.01) {
          const push = (40 - dist) / 2;
          const nx = dx / dist;
          const ny = dy / dist;
          a.x -= nx * push;
          a.y -= ny * push;
          b.x += nx * push;
          b.y += ny * push;
        }
      }
    }

    // Bust: a cruiser sitting on a slow Jax fills the meter; speed or
    // distance bleeds it back off. On foot Jax counts as slow — a cruiser
    // that pulls up beside him arrests him.
    const slow = player.vehicle ? playerSpeed < BUST_PLAYER_SPEED : true;
    if (nearestDist < BUST_RADIUS && slow) {
      police.bust = Math.min(1, police.bust + dt / BUST_SECONDS);
    } else {
      police.bust = Math.max(0, police.bust - dt / 1.2);
    }
  }

  police.clearAll = clearAll;
  police.setBustedHandler = setBustedHandler;
  police.update = update;
  return police;
}
