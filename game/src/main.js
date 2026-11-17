// Boot and the one loop: input is read every frame, the world advances in fixed
// 1/60 s steps (several in a slow frame, none in a fast one), and the renderer
// paints what the camera sees. The game moves between three screens: title,
// play and paused. B1 is on foot only: Jax walks the streets of Marisol Bay.
//
// ?seed=N fixes the city. ?shot=start|play|end (with &seed=N) stages that scene
// instead of running the loop, paints it twice and sets window.__shotReady
// for a screenshot.
//
// window.__marisol exposes the live world, player and camera for headless
// checks (B1 verification) and later screenshot tooling; it is read-only
// from the page's point of view and changes nothing about the game.
import { STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld } from './world.js';
import { createPlayer } from './player.js';
import { createCamera } from './camera.js';
import { ACTION_CONFIRM, ACTION_PAUSE, createInput } from './input.js';
import { createRenderer, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { stageShot } from './shots.js';
import { driveVehicle, nearestVehicle, spawnParkedCars } from './vehicles.js';
import { createTraffic } from './traffic.js';
import { createPedestrians } from './pedestrians.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const player = createPlayer(world.city.spawn);
const camera = createCamera();
camera.snapTo(player.player.x, player.player.y);
// B2: parked cars, traffic and pedestrians share one vehicle list, so the
// renderer, the traffic AI and the carjacking all see the same cars. Each
// system draws from its own seeded stream, so the city itself is untouched
// by the seed and a ?seed=N still reproduces the same map.
const vehicles = spawnParkedCars(world, createRandom(seed + 101), 14);
const traffic = createTraffic(world, createRandom(seed + 202), vehicles, 16);
const pedestrians = createPedestrians(world, createRandom(seed + 303), 26);
const renderer = createRenderer(canvas);

// A live handle for headless verification and screenshot tooling.
window.__marisol = { world, player: player.player, camera: camera.camera, seed, vehicles, traffic, pedestrians };

function runShot(name) {
  const scene = stageShot(name, world, player, camera);
  let painted = 0;
  function paint() {
    renderer.draw(world, player.player, camera.camera, scene.screen, {
      vehicles,
      pedestrians: pedestrians.list,
    });
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let accumulator = 0;
  let last = performance.now();
  let eWasDown = false;

  // Screen readers (and anyone watching the page's text) hear the screen changes.
  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce('Playing. Jax Marlowe is on foot in Marisol Bay.');
  }

  /** Step into the nearest parked or slow car (E), taking it off traffic's hands. */
  function tryEnterVehicle() {
    const car = nearestVehicle(vehicles, player.player.x, player.player.y, 80);
    if (car === null || Math.abs(car.speed) > 90) return;
    traffic.removeCar(car);
    car.driver = 'player';
    car.parked = false;
    player.player.vehicle = car;
    player.player.x = car.x;
    player.player.y = car.y;
    announce(`Driving the ${car.type.name}.`);
  }

  /** Step out of the driven car onto walkable ground beside it (E). */
  function exitVehicle() {
    const car = player.player.vehicle;
    car.driver = null;
    car.parked = true;
    car.speed = 0;
    player.player.vehicle = null;
    const sideX = Math.cos(car.angle + Math.PI / 2);
    const sideY = Math.sin(car.angle + Math.PI / 2);
    const spot = world.nearestWalkable(
      car.x + sideX * 44,
      car.y + sideY * 44,
      player.player.radius,
    );
    player.player.x = spot.x;
    player.player.y = spot.y;
    announce('On foot.');
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_CONFIRM && screen === SCREEN_TITLE) startGame();
    else if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Playing.');
    }
  }

  function step() {
    if (screen !== SCREEN_PLAY) return;
    // E is a held key in input.js, so take its rising edge here: one press,
    // one enter or exit, never a flicker.
    const eDown = input.isDown('KeyE');
    if (eDown && !eWasDown) {
      if (player.player.vehicle) exitVehicle();
      else tryEnterVehicle();
    }
    eWasDown = eDown;

    if (player.player.vehicle) {
      const car = player.player.vehicle;
      const move = input.moveVector();
      const prevX = car.x;
      const prevY = car.y;
      driveVehicle(car, STEP, -move.y, move.x, world.isBlocked);
      // Soft car-to-car collision: never overlap another car.
      for (const other of vehicles) {
        if (other === car) continue;
        const dx = car.x - other.x;
        const dy = car.y - other.y;
        if (dx * dx + dy * dy < 30 * 30) {
          car.x = prevX;
          car.y = prevY;
          car.speed *= 0.3;
          break;
        }
      }
      player.player.x = car.x;
      player.player.y = car.y;
      player.player.facing = car.angle;
    } else {
      player.update(STEP, input.moveVector(), world.isBlocked);
      // Jax walks around cars, never through them.
      for (const car of vehicles) {
        const dx = player.player.x - car.x;
        const dy = player.player.y - car.y;
        const distSq = dx * dx + dy * dy;
        if (distSq < 34 * 34 && distSq > 0.01) {
          const dist = Math.sqrt(distSq);
          player.player.x = car.x + (dx / dist) * 34;
          player.player.y = car.y + (dy / dist) * 34;
        }
      }
    }
    traffic.update(STEP, world.isBlocked);
    pedestrians.update(STEP, world.isBlocked, vehicles);
    camera.update(STEP, player.player.x, player.player.y);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    const nearCar = player.player.vehicle
      ? null
      : nearestVehicle(vehicles, player.player.x, player.player.y, 80);
    renderer.draw(world, player.player, camera.camera, screen, {
      vehicles,
      pedestrians: pedestrians.list,
      vehicle: player.player.vehicle,
      hint: nearCar ? `Press E to steal the ${nearCar.type.name}` : '',
    });
  }

  // Leaving the tab pauses a running game rather than letting Jax stand in traffic unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Marisol Bay. Press Space or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
