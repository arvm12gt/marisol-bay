// Wanted: Jax's heat with the Bay PD, 0 to 5 stars. Crimes raise it at
// once; slipping out of sight lets it cool one star at a time, so a chase
// ends by breaking line of sight, not by waiting it out in the open. The
// police read `stars` every step to decide how many cruisers to field, and
// B4's missions set stars directly (a hot delivery starts at 2, the
// heat-escape run at 4), so this module owns the number and nothing else
// writes it except through addCrime / setStars / reset.

/** Seconds of the same crime that only add heat instead of another star. */
const CRIME_COOLDOWN = {
  stealCar: 1,
  hitPedestrian: 2,
  shoot: 5,
  hitPolice: 2,
  assault: 3,
};

/** How many stars each crime is worth the first time it lands. */
const CRIME_STARS = {
  stealCar: 1,
  hitPedestrian: 1,
  shoot: 2,
  hitPolice: 1,
  assault: 1,
};

export const MAX_STARS = 5;
/** A cruiser this far away can still see Jax; further out, he is hidden. */
const SIGHT_DIST = 700;

export function createWanted() {
  const wanted = {
    /** Current stars, 0 to 5. */
    stars: 0,
    /** Alarm level inside the current star, 0 to 1; crimes refill it. */
    heat: 0,
    /** Seconds spent hidden from every cruiser. */
    hiddenTimer: 0,
    /** Last game time each crime added a star (for the cooldown). */
    lastCrime: {},
    /** Total game seconds elapsed, for cooldowns. */
    time: 0,
    /** A hideout point, or null: inside it the heat cools three times as fast (B4, the Heat Escape job). */
    hideout: null,
  };

  /**
   * Commit a crime. The first of a kind within its cooldown adds stars;
   * repeats while hot only refill the heat, so three quick shots do not
   * jump straight to five stars.
   */
  function addCrime(kind) {
    const value = CRIME_STARS[kind];
    if (value === undefined) return;
    const since = wanted.time - (wanted.lastCrime[kind] ?? -Infinity);
    if (since >= (CRIME_COOLDOWN[kind] ?? 2)) {
      wanted.stars = Math.min(MAX_STARS, wanted.stars + value);
      wanted.lastCrime[kind] = wanted.time;
    }
    wanted.heat = 1;
    wanted.hiddenTimer = 0;
  }

  /** Set the stars directly (B4 missions stage a wanted level). */
  function setStars(stars) {
    wanted.stars = Math.max(0, Math.min(MAX_STARS, Math.floor(stars)));
    wanted.heat = wanted.stars > 0 ? 1 : 0;
    wanted.hiddenTimer = 0;
  }

  /** Clear the heat entirely (a bust, or a mission that pays it off). */
  function reset() {
    wanted.stars = 0;
    wanted.heat = 0;
    wanted.hiddenTimer = 0;
  }

  /** Set the hideout point ({x, y, radius}) or clear it with null. */
  function setHideout(point) {
    wanted.hideout = point;
    wanted.hiddenTimer = 0;
  }

  /** Cool one star off after enough hidden time at the current heat. */
  function coolOff(dt) {
    wanted.hiddenTimer += dt;
    // Higher heat takes longer to shake: 4 seconds a star, plus 3 per star held.
    const coolTime = 4 + wanted.stars * 3;
    if (wanted.hiddenTimer >= coolTime) {
      wanted.stars -= 1;
      wanted.heat = wanted.stars > 0 ? 0.8 : 0;
      wanted.hiddenTimer = 0;
    }
  }

  /**
   * One fixed step. `policeCars` is the police list; `playerX`/`playerY`
   * is Jax. Hidden time builds only while no cruiser is near, then one
   * star cools off at a time — except inside the hideout, where the heat
   * cools three times as fast even with cruisers on the block.
   */
  function update(dt, policeCars, playerX, playerY) {
    wanted.time += dt;
    if (wanted.stars === 0) {
      wanted.heat = 0;
      wanted.hiddenTimer = 0;
      return;
    }
    const hideout = wanted.hideout;
    if (
      hideout !== null &&
      Math.hypot(playerX - hideout.x, playerY - hideout.y) < hideout.radius
    ) {
      coolOff(dt * 3);
      return;
    }
    let nearest = Infinity;
    for (const car of policeCars) {
      const dist = Math.hypot(car.x - playerX, car.y - playerY);
      if (dist < nearest) nearest = dist;
    }
    if (nearest > SIGHT_DIST) {
      coolOff(dt);
    } else {
      wanted.hiddenTimer = 0;
    }
  }

  // The same object the closures above mutate: a spread copy would freeze
  // stars/heat at their creation values and the HUD would never move.
  wanted.addCrime = addCrime;
  wanted.setStars = setStars;
  wanted.setHideout = setHideout;
  wanted.reset = reset;
  wanted.update = update;
  return wanted;
}
