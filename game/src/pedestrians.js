// Pedestrians: the people of Marisol Bay, strolling the sidewalks and the
// boardwalk. They walk between sidewalk points, pause now and then, and
// scatter when a fast car bears down on them — and a car that actually
// catches one knocks them down for a moment before they pick themselves up
// and run. All original, drawn as small top-down figures: a shirt, a head
// and two feet that step with the walk.
import { CITY, GRID } from './config.js';
import { pick, range } from './random.js';

const SHIRTS = ['#e86a5a', '#5a9e6f', '#e8b13c', '#7a6fc9', '#c95a8a', '#4f8a9e', '#e8e0cc', '#8a5a3a'];
const PANTS = ['#2e2a33', '#3a4a5a', '#5a3a2e', '#6e6e6e'];
const SKINS = ['#e8b98a', '#c98a5a', '#8a5a3a', '#f2c9a0'];

const WALK_SPEED_MIN = 46;
const WALK_SPEED_MAX = 84;
const FLEE_SPEED = 195;
/** A car this close and this fast makes nearby pedestrians scatter. */
const FLEE_DIST = 130;
const FLEE_SPEED_THRESHOLD = 130;
/** A car that touches a pedestrian at speed knocks them down. */
const HIT_DIST = 26;
const HIT_SPEED = 60;
const DOWN_SECONDS = 1.6;
const FLEE_SECONDS = 1.2;

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

export function createPedestrians(world, random, count = 26) {
  const { city } = world;
  const roadHalf = GRID.roadWidth / 2;
  const walkOffset = roadHalf + GRID.sidewalk / 2;

  /** A random point on a sidewalk, the boardwalk or the south plaza. */
  function randomStrollPoint() {
    const roll = random();
    if (roll < 0.42) {
      const avenue = pick(random, city.avenues);
      const side = random() < 0.5 ? -1 : 1;
      return { x: avenue + side * walkOffset, y: range(random, 120, city.height - 120) };
    }
    if (roll < 0.84) {
      const street = pick(random, city.streets);
      const side = random() < 0.5 ? -1 : 1;
      return { x: range(random, 120, city.boardwalkX - 120), y: street + side * walkOffset };
    }
    if (roll < 0.94) {
      return { x: range(random, city.boardwalkX + 12, city.sandX - 12), y: range(random, 120, city.height - 120) };
    }
    return { x: range(random, 200, 2600), y: range(random, 2240, 2520) };
  }

  function spawnPedestrian() {
    const spot = randomStrollPoint();
    const point = world.nearestWalkable(spot.x, spot.y, 10);
    return {
      x: point.x,
      y: point.y,
      /** Facing angle; 0 is east. */
      angle: range(random, -Math.PI, Math.PI),
      speed: 0,
      walkSpeed: range(random, WALK_SPEED_MIN, WALK_SPEED_MAX),
      shirt: pick(random, SHIRTS),
      pants: pick(random, PANTS),
      skin: pick(random, SKINS),
      /** Walk-cycle phase: the feet step with its sine. */
      phase: range(random, 0, Math.PI * 2),
      /** 'walk' | 'idle' | 'flee' | 'down'. */
      state: 'walk',
      target: null,
      idleTimer: 0,
      fleeTimer: 0,
      downTimer: 0,
      fleeX: 0,
      fleeY: 0,
    };
  }

  const list = [];
  for (let i = 0; i < count; i += 1) list.push(spawnPedestrian());

  /** The nearest vehicle that threatens this pedestrian, or null. */
  function threatNear(ped, vehicles) {
    let best = null;
    let bestDist = FLEE_DIST;
    for (const vehicle of vehicles) {
      const dx = ped.x - vehicle.x;
      const dy = ped.y - vehicle.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist >= bestDist) continue;
      // A fast car is a threat from afar; a slow one only up close — a parked
      // car is never a threat, so pedestrians stroll past it.
      const speed = Math.abs(vehicle.speed);
      if (speed > FLEE_SPEED_THRESHOLD || (dist < 55 && speed > 30)) {
        best = vehicle;
        bestDist = dist;
      }
    }
    return best === null ? null : { vehicle: best, distance: bestDist };
  }

  /** One fixed step: walk, idle, flee or lie down, then move. */
  function update(dt, isBlocked, vehicles) {
    for (const ped of list) {
      if (ped.state === 'down') {
        ped.downTimer -= dt;
        ped.speed = 0;
        if (ped.downTimer <= 0) {
          // Get up and run from whatever hit them.
          ped.state = 'flee';
          ped.fleeTimer = FLEE_SECONDS;
          const threat = threatNear(ped, vehicles);
          if (threat !== null) {
            const dx = ped.x - threat.vehicle.x;
            const dy = ped.y - threat.vehicle.y;
            const len = Math.hypot(dx, dy) || 1;
            ped.fleeX = dx / len;
            ped.fleeY = dy / len;
          } else {
            ped.fleeX = Math.cos(ped.angle);
            ped.fleeY = Math.sin(ped.angle);
          }
        }
        continue;
      }

      // A fast car nearby — or any car right on top of them — means run.
      const threat = threatNear(ped, vehicles);
      if (threat !== null && ped.state !== 'flee') {
        ped.state = 'flee';
        ped.fleeTimer = FLEE_SECONDS;
        const dx = ped.x - threat.vehicle.x;
        const dy = ped.y - threat.vehicle.y;
        const len = Math.hypot(dx, dy) || 1;
        ped.fleeX = dx / len;
        ped.fleeY = dy / len;
      }

      // A car that catches one at speed knocks them down.
      if (ped.state !== 'down') {
        for (const vehicle of vehicles) {
          const dx = ped.x - vehicle.x;
          const dy = ped.y - vehicle.y;
          if (dx * dx + dy * dy < HIT_DIST * HIT_DIST && Math.abs(vehicle.speed) > HIT_SPEED) {
            ped.state = 'down';
            ped.downTimer = DOWN_SECONDS;
            ped.speed = 0;
            break;
          }
        }
        if (ped.state === 'down') continue;
      }

      let moveX = 0;
      let moveY = 0;
      if (ped.state === 'flee') {
        ped.fleeTimer -= dt;
        ped.speed = FLEE_SPEED;
        moveX = ped.fleeX;
        moveY = ped.fleeY;
        if (ped.fleeTimer <= 0) {
          ped.state = 'walk';
          ped.target = null;
        }
      } else if (ped.state === 'idle') {
        ped.idleTimer -= dt;
        ped.speed = 0;
        if (ped.idleTimer <= 0) {
          ped.state = 'walk';
          ped.target = null;
        }
      } else {
        if (ped.target === null) {
          if (random() < 0.18) {
            ped.state = 'idle';
            ped.idleTimer = range(random, 1, 3);
            continue;
          }
          ped.target = randomStrollPoint();
        }
        const dx = ped.target.x - ped.x;
        const dy = ped.target.y - ped.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 24) {
          ped.target = null;
          continue;
        }
        ped.speed = ped.walkSpeed;
        moveX = dx / dist;
        moveY = dy / dist;
      }

      if (moveX !== 0 || moveY !== 0) {
        const step = ped.speed * dt;
        const nextX = ped.x + moveX * step;
        if (!isBlocked(nextX, ped.y, 10)) ped.x = nextX;
        const nextY = ped.y + moveY * step;
        if (!isBlocked(ped.x, nextY, 10)) ped.y = nextY;
        const targetAngle = Math.atan2(moveY, moveX);
        let diff = targetAngle - ped.angle;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        ped.angle += clamp(diff, -8 * dt, 8 * dt);
        ped.phase += ped.speed * dt * 0.06;
      }
    }
  }

  return { list, update };
}
