// Combat: fists and a pistol, on foot only — Jax cannot fight from the
// driver's seat in B3. Fists are a short punch at the nearest pedestrian
// (Space or click); the pistol aims at the mouse and fires hitscan shots
// (hold click, R reloads). A pedestrian takes three punches or two bullets
// before they go down and drop a few dollars; hitting one scatters them and
// adds to the wanted level, and every shot fired does too. The main loop
// drains `events` for the announcements; the HUD reads weapon/mag/reserve.
const MAG_SIZE = 12;
const FIRE_INTERVAL = 0.22;
const RELOAD_TIME = 0.9;
const BULLET_RANGE = 520;
const BULLET_STEP = 18;
const PUNCH_RANGE = 48;
const PUNCH_INTERVAL = 0.35;
const PED_HP = 3;
const PUNCH_DAMAGE = 1;
const BULLET_DAMAGE = 2;
const CASH_DROP_MIN = 5;
const CASH_DROP_MAX = 20;

export function createCombat({ player, pedestrians, wanted, effects, world }) {
  const combat = {
    /** 'fists' | 'pistol'. */
    weapon: 'pistol',
    /** Rounds in the magazine. */
    mag: MAG_SIZE,
    /** Spare rounds. */
    reserve: 48,
  };
  const pedHp = new Map();
  /** Pedestrians already counted once for the assault crime. */
  const assaultCounted = new Set();
  const events = [];
  let fireCooldown = 0;
  let punchCooldown = 0;
  let reloadTimer = 0;

  function dropCash(ped) {
    const amount = CASH_DROP_MIN + Math.floor(Math.random() * (CASH_DROP_MAX - CASH_DROP_MIN + 1));
    player.cash += amount;
    effects.coins(ped.x, ped.y, 5);
    events.push({ type: 'cash', amount });
  }

  /** Hurt a pedestrian: flee on a glancing hit, go down and drop cash at 0 hp. */
  function damagePed(ped, amount, fromX, fromY) {
    const hp = (pedHp.get(ped) ?? PED_HP) - amount;
    const dx = ped.x - fromX;
    const dy = ped.y - fromY;
    const len = Math.hypot(dx, dy) || 1;
    if (hp <= 0) {
      pedHp.delete(ped);
      ped.state = 'down';
      ped.downTimer = 2.5;
      ped.speed = 0;
      effects.smoke(ped.x, ped.y, 4);
      dropCash(ped);
    } else {
      pedHp.set(ped, hp);
      ped.state = 'flee';
      ped.fleeTimer = 1.2;
      ped.fleeX = dx / len;
      ped.fleeY = dy / len;
    }
  }

  /** One punch at the nearest pedestrian in reach. */
  function punch() {
    let best = null;
    let bestDist = PUNCH_RANGE;
    for (const ped of pedestrians.list) {
      if (ped.state === 'down') continue;
      const dist = Math.hypot(ped.x - player.x, ped.y - player.y);
      if (dist < bestDist) {
        best = ped;
        bestDist = dist;
      }
    }
    if (best === null) return;
    player.facing = Math.atan2(best.y - player.y, best.x - player.x);
    if (!assaultCounted.has(best)) {
      assaultCounted.add(best);
      wanted.addCrime('assault');
    }
    damagePed(best, PUNCH_DAMAGE, player.x, player.y);
    events.push({ type: 'punch' });
  }

  /**
   * One hitscan shot toward (aimX, aimY). The ray walks forward in short
   * steps: a building stops it with a spark, a pedestrian in the way takes
   * the hit. Returns true when a pedestrian was hit.
   */
  function shoot(aimX, aimY) {
    const dx = aimX - player.x;
    const dy = aimY - player.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = dx / len;
    const ny = dy / len;
    player.facing = Math.atan2(ny, nx);
    const muzzleX = player.x + nx * 24;
    const muzzleY = player.y + ny * 24;
    effects.flash(muzzleX, muzzleY, Math.atan2(ny, nx));
    wanted.addCrime('shoot');
    let hitPed = null;
    let endX = player.x + nx * BULLET_RANGE;
    let endY = player.y + ny * BULLET_RANGE;
    for (let step = BULLET_STEP; step <= BULLET_RANGE; step += BULLET_STEP) {
      const px = player.x + nx * step;
      const py = player.y + ny * step;
      if (world.isBlocked(px, py, 4)) {
        endX = px;
        endY = py;
        break;
      }
      for (const ped of pedestrians.list) {
        if (ped.state === 'down') continue;
        const pdx = ped.x - px;
        const pdy = ped.y - py;
        if (pdx * pdx + pdy * pdy < 22 * 22) {
          hitPed = ped;
          endX = px;
          endY = py;
          break;
        }
      }
      if (hitPed !== null) break;
    }
    if (hitPed !== null) {
      wanted.addCrime('hitPedestrian');
      damagePed(hitPed, BULLET_DAMAGE, player.x, player.y);
      events.push({ type: 'hit' });
    } else {
      effects.sparks(endX, endY, 4);
      events.push({ type: 'shot' });
    }
  }

  /**
   * One fixed step. `input` is the frame's combat input from the main loop:
   * aim in world units, punch as a rising edge, shootHeld while the mouse
   * button is down, reload as a rising edge, switchTo as 'fists'/'pistol'.
   */
  function update(dt, input) {
    if (fireCooldown > 0) fireCooldown -= dt;
    if (punchCooldown > 0) punchCooldown -= dt;
    if (reloadTimer > 0) {
      reloadTimer -= dt;
      if (reloadTimer <= 0) {
        const need = MAG_SIZE - combat.mag;
        const moved = Math.min(need, combat.reserve);
        combat.mag += moved;
        combat.reserve -= moved;
        events.push({ type: 'reloaded' });
      }
    }
    // No fighting from the driver's seat.
    if (player.vehicle) return;
    if (input.switchTo === 'fists' || input.switchTo === 'pistol') {
      combat.weapon = input.switchTo;
      reloadTimer = 0;
    }
    if (combat.weapon === 'fists') {
      if (input.punch && punchCooldown <= 0) {
        punchCooldown = PUNCH_INTERVAL;
        punch();
      }
      return;
    }
    if (input.reload && reloadTimer <= 0 && combat.mag < MAG_SIZE && combat.reserve > 0) {
      reloadTimer = RELOAD_TIME;
      events.push({ type: 'reload' });
    }
    if (input.shootHeld && reloadTimer <= 0 && fireCooldown <= 0) {
      if (combat.mag > 0) {
        combat.mag -= 1;
        fireCooldown = FIRE_INTERVAL;
        shoot(input.aimX, input.aimY);
      } else if (combat.reserve > 0) {
        // Dry-fire starts a reload instead of doing nothing.
        reloadTimer = RELOAD_TIME;
        events.push({ type: 'reload' });
      }
    }
  }

  /** Take the events since the last call (the main loop announces them). */
  function drainEvents() {
    return events.splice(0, events.length);
  }

  combat.update = update;
  combat.drainEvents = drainEvents;
  combat.MAG_SIZE = MAG_SIZE;
  return combat;
}
