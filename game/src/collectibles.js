// Sun tokens: 30 gold tokens hidden around Marisol Bay — the boardwalk,
// the beach, the sidewalks and the south plaza. A fixed seed stream places
// them, so the same seed always hides them in the same spots and a save can
// name them by index. Walking (or driving) over one picks it up for $25;
// all thirty pay a $500 bonus.
import { CITY, GRID } from './config.js';
import { range } from './random.js';

export const TOKEN_COUNT = 30;
const TOKEN_CASH = 25;
const ALL_BONUS = 500;
const PICKUP_RADIUS = 36;

export function createCollectibles(world, random, player, effects) {
  const { city } = world;
  const tokens = [];
  for (let i = 0; i < TOKEN_COUNT; i += 1) {
    const roll = random();
    let x;
    let y;
    if (roll < 0.35) {
      // Boardwalk or beach, the east strip.
      x = range(random, city.boardwalkX + 16, city.seaX - 60);
      y = range(random, 120, city.height - 120);
    } else if (roll < 0.7) {
      // A sidewalk beside a road.
      const vertical = random() < 0.5;
      const off = GRID.roadWidth / 2 + GRID.sidewalk / 2;
      if (vertical) {
        const avenue = city.avenues[Math.floor(random() * city.avenues.length)];
        x = avenue + (random() < 0.5 ? -off : off);
        y = range(random, 120, city.height - 120);
      } else {
        const street = city.streets[Math.floor(random() * city.streets.length)];
        x = range(random, 120, city.boardwalkX - 120);
        y = street + (random() < 0.5 ? -off : off);
      }
    } else {
      // The south plaza, open ground.
      x = range(random, 200, 2600);
      y = range(random, 2240, 2520);
    }
    const spot = world.nearestWalkable(x, y, 10);
    tokens.push({ index: i, x: spot.x, y: spot.y, taken: false });
  }

  const events = [];

  const collectibles = {
    /** Every token, taken or not: the renderer draws the ones still out. */
    list: tokens,
    get collected() {
      return tokens.filter((t) => t.taken).length;
    },
    get total() {
      return TOKEN_COUNT;
    },
  };

  /** One fixed step: Jax walks or drives over a token and pockets it. */
  function update() {
    for (const token of tokens) {
      if (token.taken) continue;
      const dx = token.x - player.x;
      const dy = token.y - player.y;
      if (dx * dx + dy * dy < PICKUP_RADIUS * PICKUP_RADIUS) {
        token.taken = true;
        player.cash += TOKEN_CASH;
        effects.coins(token.x, token.y, 6);
        events.push({ type: 'token', amount: TOKEN_CASH, collected: collectibles.collected });
        if (collectibles.collected === TOKEN_COUNT) {
          player.cash += ALL_BONUS;
          events.push({ type: 'tokens-complete', amount: ALL_BONUS });
        }
      }
    }
  }

  /** Mark tokens taken from a save, by index (the layout is seeded). */
  function applySave(takenIndices) {
    for (const token of tokens) token.taken = takenIndices.includes(token.index);
  }

  /** Forget every pickup (a new game). */
  function reset() {
    for (const token of tokens) token.taken = false;
  }

  /** Take the events since the last call (the main loop announces them). */
  function drainEvents() {
    return events.splice(0, events.length);
  }

  collectibles.update = update;
  collectibles.applySave = applySave;
  collectibles.reset = reset;
  collectibles.drainEvents = drainEvents;
  return collectibles;
}
