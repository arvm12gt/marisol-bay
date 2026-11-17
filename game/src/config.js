// Marisol Bay: every tuning number, colour and original name in one place.
// The world is a fixed-size coastal city in world units; the camera shows a
// 1280x720 window of it, scaled to the browser window, so no rule below
// depends on the screen size. All names, people and places are original:
// nothing here comes from any Rockstar / GTA title, character, map or asset.

export const CITY = {
  name: 'Marisol Bay',
  // Whole playable map, in world units. The city occupies the west ~78%;
  // the east strip is boardwalk, beach and sea.
  width: 3600,
  height: 2600,
  /** x where the boardwalk starts. */
  boardwalkX: 2820,
  /** x where the sand starts. */
  sandX: 2940,
  /** x where the sea starts; walking past this is blocked. */
  seaX: 3440,
};

/** The street grid: avenues run north-south, streets east-west. */
export const GRID = {
  /** Distance between parallel road centrelines. */
  spacing: 420,
  /** Road width, kerb to kerb. */
  roadWidth: 110,
  /** Sidewalk strip on each side of a road. */
  sidewalk: 26,
  /** First / last avenue centreline (city area only). */
  firstAvenue: 420,
  lastAvenue: 2520,
  firstStreet: 420,
  lastStreet: 2100,
};

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** The camera's view, in world units: one screenful of the city at a time. */
export const VIEW = { width: 1280, height: 720 };

export const PLAYER = {
  name: 'Jax Marlowe',
  radius: 14,
  walkSpeed: 260,
  /** How quickly the player turns to face the direction of travel. */
  turnRate: 14,
};

export const CAMERA = {
  /** Exponential follow rate: higher is snappier, lower is dreamier. */
  followRate: 6,
};

/** The fixer who gives Jax his jobs (introduced properly in B4). */
export const FIXER = { name: 'Mama Rosa' };

/** Golden-hour dusk over a pastel deco city. */
export const PALETTE = {
  backdrop: '#1c1410',
  // Sea, deep to shallow, east edge.
  seaDeep: '#17455f',
  seaShallow: '#2e7d8c',
  sand: '#e9cf9d',
  sandWet: '#d9b57e',
  boardwalk: '#a97e4f',
  boardwalkPlank: '#8f6a3e',
  // City ground: warm pavement between the roads.
  ground: '#c9b18c',
  sidewalk: '#d8c39e',
  road: '#4b423c',
  roadEdge: '#6b5f55',
  laneDash: '#e8c96a',
  crosswalk: '#e8e0cc',
  // Pastel deco buildings, picked per building from the seeded RNG.
  buildings: ['#f2a7a0', '#f6c177', '#a8d8c8', '#f7d774', '#e8a2c0', '#9ec7e8', '#f9e2c0', '#c9b8e8'],
  roof: '#7a6a58',
  windowLit: '#ffd98a',
  windowDark: '#5d5348',
  palmTrunk: '#7a5a3a',
  palmFrond: '#3f8f5f',
  playerJacket: '#3b6ea5',
  playerSkin: '#e8b98a',
  playerPants: '#2e2a33',
  playerShadow: 'rgba(40, 20, 10, 0.35)',
  // A warm dusk wash laid over the finished frame.
  duskTint: 'rgba(255, 166, 77, 0.10)',
  panel: 'rgba(32, 22, 16, 0.92)',
  text: '#f5ead6',
  muted: '#c9b18c',
  accent: '#f2c94c',
  /** Wanted stars, police lights and the bust meter (B3). */
  wantedStar: '#f2c94c',
  wantedStarEmpty: 'rgba(245, 234, 214, 0.35)',
  policeRed: '#e23b2e',
  policeBlue: '#2e6fe2',
  policeWhite: '#dfe3e8',
  bustRed: '#e23b2e',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the save will be kept between visits (this browser only; used from B4). */
export const SAVE_KEY = 'marisol-bay.save';
