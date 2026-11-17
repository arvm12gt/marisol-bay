// The screenshot scenes behind ?shot=start|play|end. Each one walks Jax from
// the plaza spawn for a fixed time along a deterministic route (east, south,
// west, north, …), so the frame is what a short walk really looks like and the
// same seed always gives the same frame. B6 will stage the real chase, heist
// and taxi scenes here once those systems exist.
import { STEP } from './config.js';
import { SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const START_SECONDS = 0;
const PLAY_SECONDS = 26;
const END_SECONDS = 60;
/** Seconds spent walking each way before turning. */
const LEG_SECONDS = 2;
const DIRECTIONS = [
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 0, y: -1 },
];

/**
 * Set `world`/`player`/`camera` to the named scene (start, play or end; any
 * other name is start) and return the screen to draw over it.
 */
export function stageShot(name, world, player, camera) {
  player.player.x = world.city.spawn.x;
  player.player.y = world.city.spawn.y;
  player.player.facing = -Math.PI / 2;
  camera.snapTo(player.player.x, player.player.y);
  if (name !== 'play' && name !== 'end') {
    return { screen: SCREEN_TITLE };
  }
  const seconds = name === 'end' ? END_SECONDS : PLAY_SECONDS;
  const stepsPerLeg = Math.round(LEG_SECONDS / STEP);
  for (let index = 0; index < seconds / STEP; index += 1) {
    const move = DIRECTIONS[Math.floor(index / stepsPerLeg) % DIRECTIONS.length];
    player.update(STEP, move, world.isBlocked);
    camera.update(STEP, player.player.x, player.player.y);
  }
  return { screen: SCREEN_PLAY };
}
