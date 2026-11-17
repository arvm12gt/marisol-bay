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
import { STEP, VIEW } from './config.js';
import { createRandom } from './random.js';
import { createWorld } from './world.js';
import { createPlayer } from './player.js';
import { createCamera } from './camera.js';
import {
  ACTION_CONFIRM,
  ACTION_FISTS,
  ACTION_PAUSE,
  ACTION_PISTOL,
  ACTION_RELOAD,
  createInput,
} from './input.js';
import { createRenderer, SCREEN_BUSTED, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { stageShot } from './shots.js';
import { driveVehicle, nearestVehicle, spawnParkedCars } from './vehicles.js';
import { createTraffic } from './traffic.js';
import { createPedestrians } from './pedestrians.js';
import { createWanted } from './wanted.js';
import { createPolice } from './police.js';
import { createCombat } from './combat.js';
import { createEffects } from './effects.js';

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
// B3: particles, the wanted level, the cruisers that answer it, and combat.
// The police read the wanted level every step; combat and the loop report
// crimes into it; the effects feed every impact and muzzle flash.
const effects = createEffects();
const wanted = createWanted();
const police = createPolice(world, createRandom(seed + 404), vehicles, wanted, effects);
const combat = createCombat({ player: player.player, pedestrians, wanted, effects, world });
const renderer = createRenderer(canvas);

// A live handle for headless verification and screenshot tooling.
window.__marisol = {
  world,
  player: player.player,
  camera: camera.camera,
  seed,
  vehicles,
  traffic,
  pedestrians,
  wanted,
  police,
  combat,
  effects,
};

function runShot(name) {
  const scene = stageShot(name, world, player, camera);
  let painted = 0;
  function paint() {
    renderer.draw(world, player.player, camera.camera, scene.screen, {
      vehicles,
      pedestrians: pedestrians.list,
      effects,
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
  /** One-shot combat presses stashed by the frame for the next step. */
  let combatActions = 0;
  /** Seconds the BUSTED panel has been up; it releases Jax after 3. */
  let bustTimer = 0;
  /** The fine of the last bust, shown on the BUSTED panel. */
  let bustFine = 0;
  window.__marisol.input = input;
  window.__marisol.getScreen = () => screen;

  // Screen readers (and anyone watching the page's text) hear the screen changes.
  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    accumulator = 0;
    screen = SCREEN_PLAY;
    // The click that started the game is not a punch or a shot.
    input.takeClick();
    announce('Playing. Jax Marlowe is on foot in Marisol Bay.');
  }

  /** Viewport (CSS) pixels to world units, inverting the renderer's transform. */
  function screenToWorld(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const scale = Math.min(canvas.width / VIEW.width, canvas.height / VIEW.height);
    const offsetX = (canvas.width - VIEW.width * scale) / 2;
    const offsetY = (canvas.height - VIEW.height * scale) / 2;
    const devX = (clientX - rect.left) * (canvas.width / rect.width);
    const devY = (clientY - rect.top) * (canvas.height / rect.height);
    return {
      x: camera.camera.x + (devX - offsetX) / scale,
      y: camera.camera.y + (devY - offsetY) / scale,
    };
  }

  /** Step into the nearest parked or slow car (E), taking it off traffic's hands. */
  function tryEnterVehicle() {
    const car = nearestVehicle(vehicles, player.player.x, player.player.y, 80);
    if (car === null || Math.abs(car.speed) > 90) return;
    if (car.police) {
      announce('Locked. The cruiser will not open.');
      return;
    }
    traffic.removeCar(car);
    car.driver = 'player';
    car.parked = false;
    // The first theft of a car is a crime; getting back into a car Jax
    // already stole is not one again.
    if (!car.stolen) {
      car.stolen = true;
      wanted.addCrime('stealCar');
    }
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

  function handleActions(actions) {
    if (actions & ACTION_CONFIRM && screen === SCREEN_TITLE) startGame();
    else if (actions & ACTION_CONFIRM && screen === SCREEN_BUSTED) {
      screen = SCREEN_PLAY;
      announce('Back on the streets.');
    } else if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Playing.');
    }
  }

  /**
   * The bust meter filled: fine Jax part of his cash, clear the heat, pull
   * the cruisers off the street, and leave him on foot where he was caught.
   * B4's missions hook the bust through police.onBusted to fail the run.
   */
  function triggerBusted() {
    const stars = wanted.stars;
    const fine = Math.min(player.player.cash, 50 + 50 * stars);
    player.player.cash -= fine;
    bustFine = fine;
    if (player.player.vehicle) {
      const car = player.player.vehicle;
      car.driver = null;
      car.parked = true;
      car.speed = 0;
      player.player.vehicle = null;
      const spot = world.nearestWalkable(car.x + 40, car.y + 40, player.player.radius);
      player.player.x = spot.x;
      player.player.y = spot.y;
    }
    wanted.reset();
    police.clearAll();
    bustTimer = 0;
    screen = SCREEN_BUSTED;
    announce(`Busted. Paid a $${fine} fine.`);
    if (typeof police.onBusted === 'function') police.onBusted({ fine, stars });
  }

  function step() {
    if (screen !== SCREEN_PLAY) return;
    // The frame's one-shot combat presses, consumed here so a quick tap
    // between two frames still fires, exactly once.
    const combatInput = combatActions;
    combatActions = 0;
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
          effects.sparks(car.x, car.y, 6);
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

    // Combat input: Space or a click punches with fists; the mouse aims the
    // pistol and holding it fires; R reloads, 1/2 switch weapons. The
    // one-shot presses arrive as queued flags (see step's head), so a fast
    // tap is never lost between frames.
    const mouse = input.mouse();
    const clicked = input.takeClick();
    const aim = screenToWorld(mouse.x, mouse.y);
    combat.update(STEP, {
      aimX: aim.x,
      aimY: aim.y,
      punch: combat.weapon === 'fists' && ((combatInput & ACTION_CONFIRM) !== 0 || clicked),
      shootHeld: mouse.down,
      reload: (combatInput & ACTION_RELOAD) !== 0,
      switchTo:
        (combatInput & ACTION_FISTS) !== 0
          ? 'fists'
          : (combatInput & ACTION_PISTOL) !== 0
            ? 'pistol'
            : null,
    });
    for (const event of combat.drainEvents()) {
      if (event.type === 'cash') announce(`Picked up $${event.amount}.`);
    }

    traffic.update(STEP, world.isBlocked);
    pedestrians.update(STEP, world.isBlocked, vehicles, (ped, vehicle) => {
      // Only Jax's car counts as his crime; a traffic car or a cruiser
      // knocking someone down is not charged to him.
      if (vehicle === player.player.vehicle) wanted.addCrime('hitPedestrian');
      effects.smoke(ped.x, ped.y, 3);
    });
    wanted.update(STEP, police.cars, player.player.x, player.player.y);
    police.update(STEP, player.player, world.isBlocked);
    effects.update(STEP);
    if (police.bust >= 1) triggerBusted();
    camera.update(STEP, player.player.x, player.player.y);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const frameDt = Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    accumulator += frameDt;
    // Take the frame's one-shot presses once: the screen transitions use
    // them, and the combat bits are stashed for the next step. A press made
    // while already playing also counts as a punch (Space/click, fists).
    const wasPlay = screen === SCREEN_PLAY;
    const actions = input.takeActions();
    handleActions(actions);
    if (wasPlay) {
      combatActions |= actions & (ACTION_CONFIRM | ACTION_RELOAD | ACTION_FISTS | ACTION_PISTOL);
    }
    if (screen === SCREEN_BUSTED) {
      // The bust panel holds the world still, then sends Jax back out.
      bustTimer += frameDt;
      if (bustTimer >= 3) {
        screen = SCREEN_PLAY;
        announce('Back on the streets.');
      }
      accumulator = 0;
    } else if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    // The steal hint skips cruisers: they are locked and never stealable.
    let nearCar = null;
    if (!player.player.vehicle) {
      let bestDist = 80;
      for (const vehicle of vehicles) {
        if (vehicle.police) continue;
        const dist = Math.hypot(vehicle.x - player.player.x, vehicle.y - player.player.y);
        if (dist < bestDist) {
          nearCar = vehicle;
          bestDist = dist;
        }
      }
    }
    const mouse = input.mouse();
    const aim = screenToWorld(mouse.x, mouse.y);
    renderer.draw(world, player.player, camera.camera, screen, {
      vehicles,
      pedestrians: pedestrians.list,
      vehicle: player.player.vehicle,
      hint: nearCar ? `Press E to steal the ${nearCar.type.name}` : '',
      effects,
      stars: wanted.stars,
      cash: player.player.cash,
      weapon: player.player.vehicle ? null : combat.weapon,
      mag: combat.mag,
      reserve: combat.reserve,
      bust: police.bust,
      aim,
      bustInfo: { fine: bustFine },
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
