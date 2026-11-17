// The screenshot scenes behind ?shot=start|play|end. Each one stages a real
// moment with the systems B1–B5 built — a title frame, a downtown chase with
// the heat on, a boardwalk stroll among pedestrians — so the frame shows the
// game as it is played, and the same seed always gives the same frame.
import { STEP } from './config.js';
import { SCREEN_PLAY, SCREEN_TITLE } from './render.js';

/** The plaza corner where the chase shot parks Jax's car. */
const CHASE_SPOT = { x: 1680, y: 1260 };
/** A boardwalk point by the sand, for the on-foot shot. */
const BOARDWALK_SPOT = { x: 2880, y: 1300 };
/** Seconds of street life stepped for the chase; cruisers answer the heat. */
const CHASE_STEPS = 150;
/** Seconds of street life stepped for the boardwalk stroll. */
const BOARDWALK_STEPS = 480;
/** Keep this clear around the staged car, or a bystander pins it in place. */
const CLEAR_RADIUS = 150;

/**
 * Set the world to the named scene (start, play or end) and return the
 * screen to draw over it. `systems` is the live game — vehicles, traffic,
 * wanted, police, missions, pedestrians — needed for the staged scenes;
 * without it every name falls back to the plain title frame.
 */
export function stageShot(name, world, player, camera, systems = null) {
  if (name === 'play' && systems) return stageChase(world, player, camera, systems);
  if (name === 'end' && systems) return stageBoardwalk(world, player, camera, systems);
  player.player.x = world.city.spawn.x;
  player.player.y = world.city.spawn.y;
  player.player.facing = -Math.PI / 2;
  camera.snapTo(player.player.x, player.player.y);
  return { screen: SCREEN_TITLE };
}

/** Downtown chase: Jax in a car at the plaza corner, two stars, job M1 live. */
function stageChase(world, player, camera, systems) {
  const { vehicles, traffic, wanted, police, missions, pedestrians, effects } = systems;
  // Jax takes the nearest parked car at the plaza corner.
  let car = null;
  let best = Infinity;
  for (const vehicle of vehicles) {
    if (vehicle.police || vehicle.locked || !vehicle.parked) continue;
    const dist = Math.hypot(vehicle.x - CHASE_SPOT.x, vehicle.y - CHASE_SPOT.y);
    if (dist < best) {
      best = dist;
      car = vehicle;
    }
  }
  if (car) {
    car.x = CHASE_SPOT.x;
    car.y = CHASE_SPOT.y;
    car.angle = 0;
    car.speed = 0;
    car.parked = false;
    car.stolen = true;
    car.driver = 'player';
    traffic.removeCar(car);
    player.player.vehicle = car;
    player.player.x = car.x;
    player.player.y = car.y;
  } else {
    player.player.x = CHASE_SPOT.x;
    player.player.y = CHASE_SPOT.y;
  }
  // Nudge any bystander off the patch: a car teleported onto a passing
  // traffic car pins both in place, so the staged car never gets moving.
  for (const vehicle of vehicles) {
    if (vehicle !== car && Math.hypot(vehicle.x - CHASE_SPOT.x, vehicle.y - CHASE_SPOT.y) < CLEAR_RADIUS) {
      vehicle.x = 420;
      vehicle.y = 420;
      vehicle.speed = 0;
    }
  }
  missions.start('m1');
  wanted.setStars(2);
  // Let the street live a few seconds: traffic rolls, pedestrians stroll,
  // and the cruisers answer the heat and close in on Jax. Particles age
  // every step, exactly as the live loop ages them, so a cruiser's halo
  // stays a halo instead of stacking into a white blob.
  for (let index = 0; index < CHASE_STEPS; index += 1) {
    traffic.update(STEP, world.isBlocked);
    pedestrians.update(STEP, world.isBlocked, vehicles);
    police.update(STEP, player.player, world.isBlocked);
    effects.update(STEP);
  }
  camera.snapTo(player.player.x, player.player.y);
  return { screen: SCREEN_PLAY };
}

/** Boardwalk stroll: Jax on foot by the sand, pedestrians around him. */
function stageBoardwalk(world, player, camera, systems) {
  const { vehicles, traffic, pedestrians, effects } = systems;
  player.player.vehicle = null;
  player.player.x = BOARDWALK_SPOT.x;
  player.player.y = BOARDWALK_SPOT.y;
  player.player.facing = Math.PI;
  for (let index = 0; index < BOARDWALK_STEPS; index += 1) {
    traffic.update(STEP, world.isBlocked);
    pedestrians.update(STEP, world.isBlocked, vehicles);
    effects.update(STEP);
  }
  camera.snapTo(player.player.x, player.player.y);
  return { screen: SCREEN_PLAY };
}
