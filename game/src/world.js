// Marisol Bay itself: a seeded coastal city, generated once at boot. The city
// is a grid of avenues and streets; the blocks between them hold pastel deco
// buildings; east of the last avenue a boardwalk runs along the sand and the
// sea. This module owns the map and the collision queries and knows nothing
// about drawing or input, so later segments (traffic, pedestrians, police)
// can all ask it the same questions: is this spot road, sidewalk, beach or
// blocked, and where can something spawn?
import { CITY, GRID, PALETTE } from './config.js';
import { pick, range } from './random.js';

/** Where the player starts: the plaza at the corner of Coral Avenue and 3rd Street. */
export const SPAWN = { x: 1260, y: 1260 };

const AVENUES = [];
for (let x = GRID.firstAvenue; x <= GRID.lastAvenue; x += GRID.spacing) AVENUES.push(x);
const STREETS = [];
for (let y = GRID.firstStreet; y <= GRID.lastStreet; y += GRID.spacing) STREETS.push(y);

function circleHitsRect(x, y, r, rect) {
  const cx = Math.max(rect.x, Math.min(x, rect.x + rect.w));
  const cy = Math.max(rect.y, Math.min(y, rect.y + rect.h));
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy < r * r;
}

export function createWorld(random) {
  const buildings = [];
  const palms = [];

  // One or two buildings per block, inset from the road by the sidewalk strip.
  // Blocks are bounded by road edges; the last column of blocks stops at the
  // boardwalk, and the strip south of the last street is an open plaza.
  const roadHalf = GRID.roadWidth / 2;
  const inset = roadHalf + GRID.sidewalk + 8;
  for (let a = 0; a < AVENUES.length; a += 1) {
    const x0 = AVENUES[a] + inset;
    const x1 = (a + 1 < AVENUES.length ? AVENUES[a + 1] : CITY.boardwalkX) - inset;
    for (let s = 0; s < STREETS.length; s += 1) {
      const y0 = STREETS[s] + inset;
      const y1 = (s + 1 < STREETS.length ? STREETS[s + 1] : CITY.height - 60) - inset;
      if (x1 - x0 < 90 || y1 - y0 < 90) continue;
      const count = random() < 0.55 ? 1 : 2;
      if (count === 1) {
        const w = range(random, 120, x1 - x0 - 24);
        const h = range(random, 100, y1 - y0 - 24);
        buildings.push({
          x: x0 + range(random, 0, x1 - x0 - w),
          y: y0 + range(random, 0, y1 - y0 - h),
          w,
          h,
          color: pick(random, PALETTE.buildings),
          // Window grid, decided at generation so the frame never recomputes it.
          cols: Math.max(2, Math.floor(w / 46)),
          rows: Math.max(2, Math.floor(h / 52)),
          litSeed: random(),
        });
      } else {
        const split = range(random, 0.38, 0.62);
        const gap = 26;
        const w1 = (x1 - x0) * split - gap / 2;
        const w2 = (x1 - x0) * (1 - split) - gap / 2;
        for (const [bx, bw] of [[x0, w1], [x0 + w1 + gap, w2]]) {
          const h = range(random, 90, y1 - y0 - 16);
          buildings.push({
            x: bx,
            y: y0 + range(random, 0, y1 - y0 - h),
            w: bw,
            h,
            color: pick(random, PALETTE.buildings),
            cols: Math.max(2, Math.floor(bw / 46)),
            rows: Math.max(2, Math.floor(h / 52)),
            litSeed: random(),
          });
        }
      }
    }
  }

  // Palms down the boardwalk and along the plaza's south edge.
  for (let y = 120; y < CITY.height - 120; y += 170) {
    palms.push({ x: CITY.boardwalkX + 34 + range(random, -8, 8), y: y + range(random, -20, 20) });
  }
  for (let x = 300; x < CITY.boardwalkX - 200; x += 260) {
    palms.push({ x: x + range(random, -16, 16), y: CITY.height - 90 + range(random, -12, 12) });
  }

  const city = {
    width: CITY.width,
    height: CITY.height,
    boardwalkX: CITY.boardwalkX,
    sandX: CITY.sandX,
    seaX: CITY.seaX,
    avenues: AVENUES,
    streets: STREETS,
    buildings,
    palms,
    spawn: { ...SPAWN },
  };

  /** True when a circle of radius `r` at (x, y) would touch a building, the sea or the map edge. */
  function isBlocked(x, y, r) {
    if (x - r < 0 || x + r > CITY.width || y - r < 0 || y + r > CITY.height) return true;
    if (x + r > CITY.seaX) return true;
    for (let i = 0; i < buildings.length; i += 1) {
      if (circleHitsRect(x, y, r, buildings[i])) return true;
    }
    return false;
  }

  /** 'road' | 'sidewalk' | 'plaza' | 'boardwalk' | 'beach' | 'sea' | 'building'. */
  function zoneAt(x, y) {
    if (x >= CITY.seaX) return 'sea';
    if (x >= CITY.sandX) return 'beach';
    if (x >= CITY.boardwalkX) return 'boardwalk';
    for (let i = 0; i < buildings.length; i += 1) {
      const b = buildings[i];
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return 'building';
    }
    const half = GRID.roadWidth / 2;
    const onAvenue = AVENUES.some((ax) => Math.abs(x - ax) <= half);
    const onStreet = STREETS.some((sy) => Math.abs(y - sy) <= half);
    if (onAvenue || onStreet) return 'road';
    const nearRoad =
      AVENUES.some((ax) => Math.abs(x - ax) <= half + GRID.sidewalk) ||
      STREETS.some((sy) => Math.abs(y - sy) <= half + GRID.sidewalk);
    if (nearRoad) return 'sidewalk';
    return 'plaza';
  }

  /** A walkable point near (x, y): nudges off buildings and out of the sea. */
  function nearestWalkable(x, y, r) {
    if (!isBlocked(x, y, r)) return { x, y };
    for (let radius = 24; radius <= 400; radius += 24) {
      for (let step = 0; step < 8; step += 1) {
        const angle = (step / 8) * Math.PI * 2;
        const px = x + Math.cos(angle) * radius;
        const py = y + Math.sin(angle) * radius;
        if (!isBlocked(px, py, r)) return { x: px, y: py };
      }
    }
    return { ...SPAWN };
  }

  return { city, isBlocked, zoneAt, nearestWalkable };
}
