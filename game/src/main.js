// Boot and the one loop: input is read every frame, the world advances in fixed
// 1/60 s steps (several in a slow frame, none in a fast one), and the renderer
// paints what the camera sees. The game moves between screens: title (a
// menu), missions, briefing, play, paused, busted, and the end of a job.
// B4 adds the job chain, taxi fares, street races, sun tokens and saves.
//
// ?seed=N fixes the city. ?shot=start|play|end (with &seed=N) stages that scene
// instead of running the loop, paints it twice and sets window.__shotReady
// for a screenshot.
//
// window.__marisol exposes the live world, player and camera for headless
// checks (B1 verification) and later screenshot tooling; it is read-only
// from the page's point of view and changes nothing about the game.
import { HOSPITAL, STEP, VIEW } from './config.js';
import { createRandom } from './random.js';
import { createWorld } from './world.js';
import { createPlayer } from './player.js';
import { createCamera } from './camera.js';
import {
  ACTION_CONFIRM,
  ACTION_FISTS,
  ACTION_MENU_DOWN,
  ACTION_MENU_UP,
  ACTION_MINIMAP,
  ACTION_MUTE,
  ACTION_PAUSE,
  ACTION_PISTOL,
  ACTION_RELOAD,
  createInput,
} from './input.js';
import {
  SCREEN_BRIEFING,
  SCREEN_BUSTED,
  SCREEN_DOWN,
  SCREEN_FAILED,
  SCREEN_HOWTO,
  SCREEN_MISSIONS,
  SCREEN_PASSED,
  SCREEN_PAUSED,
  SCREEN_PLAY,
  SCREEN_TITLE,
  createRenderer,
} from './render.js';
import { stageShot } from './shots.js';
import { driveVehicle, nearestVehicle, spawnParkedCars } from './vehicles.js';
import { createTraffic } from './traffic.js';
import { createPedestrians } from './pedestrians.js';
import { createWanted } from './wanted.js';
import { createPolice } from './police.js';
import { createCombat } from './combat.js';
import { createEffects } from './effects.js';
import { createMissions } from './missions.js';
import { createTaxi } from './taxi.js';
import { RACE_CHECKPOINTS, createRaces, formatRaceTime } from './races.js';
import { createCollectibles } from './collectibles.js';
import { clearSave, loadSave, saveGame } from './save.js';
import { createAudio } from './audio.js';

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
// B4: the five jobs, taxi fares, the street race, sun tokens and saves.
const missions = createMissions({ world, player: player.player, vehicles, wanted, effects });
const taxi = createTaxi(world, createRandom(seed + 606), player.player);
const races = createRaces(world, player.player, vehicles, effects);
const collectibles = createCollectibles(world, createRandom(seed + 505), player.player, effects);
const renderer = createRenderer(canvas);

// A save from an earlier visit restores cash, finished jobs, picked-up
// tokens and race best times before the title menu appears.
const loadedSave = loadSave();
let saveExists = loadedSave !== null;
if (loadedSave) {
  player.player.cash = loadedSave.cash;
  missions.applySave(loadedSave.missionsCompleted);
  collectibles.applySave(loadedSave.tokensTaken);
  races.applySave(loadedSave.raceBest);
}

// B5: synthesized sound (its mute state comes from the save) and the
// minimap, which lives in the renderer.
const audio = createAudio({ muted: loadedSave ? loadedSave.muted : false });

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
  missions,
  taxi,
  races,
  collectibles,
  audio,
  minimap: renderer.minimap,
};

// The title menu's story blurb (the panel's own title is MARISOL BAY).
// Module level so the title screenshot paints the same menu as the game.
const TITLE_BLURB = [
  'Jax Marlowe just rolled into town with nothing but a stolen',
  'sunset and a name to make. Mama Rosa has work for him —',
  'if he can stay out of trouble long enough to take it.',
];

function runShot(name) {
  const scene = stageShot(name, world, player, camera, {
    vehicles,
    traffic,
    wanted,
    police,
    missions,
    pedestrians,
    effects,
  });
  // The staged screen, for headless tooling (runGame never runs in shot mode,
  // so __marisol.getScreen is not attached here).
  window.__shotScreen = scene.screen;
  // The same extras the live loop paints, so a shot shows the full HUD:
  // stars, cash, health, the minimap and the current objective.
  const markers = [...missions.markers(), ...taxi.markers(), ...races.markers()];
  const tokensList = collectibles.list.filter((t) => !t.taken);
  const missionObjective = missions.current ? missions.currentObjective() : null;
  let painted = 0;
  function paint() {
    renderer.draw(world, player.player, camera.camera, scene.screen, {
      vehicles,
      pedestrians: pedestrians.list,
      vehicle: player.player.vehicle,
      effects,
      stars: wanted.stars,
      cash: player.player.cash,
      weapon: player.player.vehicle ? null : combat.weapon,
      mag: combat.mag,
      reserve: combat.reserve,
      bust: police.bust,
      health: player.player.health,
      maxHealth: player.player.maxHealth,
      armor: player.player.armor,
      maxArmor: player.player.maxArmor,
      muted: audio.muted,
      minimapVisible: renderer.minimap.visible,
      minimap: {
        world,
        player: player.player,
        policeCars: police.cars,
        markers,
        tokens: tokensList,
        hideout: wanted.hideout,
      },
      shake: effects.shakeOffset(),
      armorList: collectibles.armor.filter((v) => !v.taken),
      objective: missionObjective ? missionObjective.text : null,
      activity: null,
      // The title shot paints the same menu the game opens with (same
      // blurb, same items; the item list lives here and in titleMenuItems).
      menu:
        scene.screen === SCREEN_TITLE
          ? {
              title: 'MARISOL BAY',
              blurb: TITLE_BLURB,
              items: [
                { label: 'Start Game', action: 'start' },
                { label: 'Continue', action: 'continue', disabled: !saveExists },
                { label: 'Missions', action: 'missions' },
                { label: 'How to Play', action: 'howto' },
              ],
              selected: 0,
              footer: 'WASD or arrows to choose · Space or click to select',
            }
          : null,
      markers,
      tokensList,
      tokens: { collected: collectibles.collected, total: collectibles.total },
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
  /** B5: seconds the FLATLINED panel has been up; it releases Jax after 3. */
  let downTimer = 0;
  /** B5: the hospital bill of the last death, shown on the FLATLINED panel. */
  let downBill = 0;
  /** B5: seconds since Jax last took damage; health comes back after 8 calm seconds. */
  let hurtTimer = 99;
  /** B5: seconds until the next crash can hurt again (one impact, one hit). */
  let crashCooldown = 0;
  /** B5: seconds until the next skid mark may be laid. */
  let skidTimer = 0;
  /** B5: seconds until the next smoke puff from a damaged car. */
  let smokeTimer = 0;
  /** The job on the briefing screen, or null. */
  let briefingMission = null;
  /** The last finished job, shown on the JOB DONE / JOB FAILED panel. */
  let missionEnd = null;
  /** A bust ended a job in progress: the FAILED panel follows the BUSTED one. */
  let pendingMissionFailed = false;
  /** The menu item highlighted on the current menu screen. */
  let menuSelected = 0;
  /** The menu item rects from the last painted frame, for click hit-testing. */
  let menuRects = null;
  window.__marisol.input = input;
  window.__marisol.getScreen = () => screen;
  window.__marisol.getMenu = () => ({ screen, selected: menuSelected, menu: menuFor(screen) });
  window.__marisol.getMissionEnd = () => missionEnd;
  window.__marisol.saveGame = () => saveGameNow();
  /** Headless checks: hurt Jax (and run the death flow if he goes down). */
  window.__marisol.damagePlayer = (amount) => hurtPlayer(amount);
  /** Headless checks: wear a car down (it explodes at 0 durability). */
  window.__marisol.damageVehicle = (car, amount) => damageVehicle(car, amount);

  // Screen readers (and anyone watching the page's text) hear the screen changes.
  function announce(message) {
    status.textContent = message;
  }

  function titleMenuItems() {
    return [
      { label: 'Start Game', action: 'start' },
      { label: 'Continue', action: 'continue', disabled: !saveExists },
      { label: 'Missions', action: 'missions' },
      { label: 'How to Play', action: 'howto' },
    ];
  }

  function missionMenuItems() {
    return missions.defs.map((def, i) => ({
      label: `${i + 1}. ${def.name} — $${def.reward}${
        missions.isCompleted(def.id) ? ' · DONE' : missions.isUnlocked(def.id) ? '' : ' · LOCKED'
      }`,
      action: `mission:${def.id}`,
      disabled: !missions.isUnlocked(def.id),
    }));
  }

  function pauseMenuItems() {
    return [
      { label: 'Resume', action: 'resume' },
      { label: 'Save Game', action: 'save' },
      { label: 'Quit to Title', action: 'quit' },
    ];
  }

  /** The menu for a menu screen: title, blurb, items and footer. */
  function menuFor(currentScreen) {
    if (currentScreen === SCREEN_TITLE) {
      return {
        title: 'MARISOL BAY',
        blurb: TITLE_BLURB,
        items: titleMenuItems(),
        selected: menuSelected,
        footer: 'WASD or arrows to choose · Space or click to select',
      };
    }
    if (currentScreen === SCREEN_MISSIONS) {
      return {
        title: 'MISSIONS',
        blurb: ['Mama Rosa has work. Finish one job to unlock the next.'],
        items: missionMenuItems(),
        selected: menuSelected,
        footer: 'Space to open the briefing · Esc to go back',
      };
    }
    if (currentScreen === SCREEN_PAUSED) {
      return {
        title: 'PAUSED',
        blurb: ['The bay will wait for you.'],
        items: pauseMenuItems(),
        selected: menuSelected,
        footer: 'P or Esc resumes',
      };
    }
    return null;
  }

  /** Write the current run to the save slot. */
  function saveGameNow() {
    saveGame({
      cash: player.player.cash,
      missionsCompleted: missions.completed,
      raceBest: races.best,
      tokensTaken: collectibles.list.filter((t) => t.taken).map((t) => t.index),
      muted: audio.muted,
    });
    saveExists = true;
  }

  /** A fresh run: forget the save, the jobs and the tokens, and put Jax back at the plaza. */
  function newGame() {
    if (player.player.vehicle) exitVehicle();
    clearSave();
    saveExists = false;
    missions.reset();
    collectibles.reset();
    races.reset();
    wanted.reset();
    police.clearAll();
    combat.mag = combat.MAG_SIZE;
    combat.reserve = 48;
    player.resetHealth();
    // Burnt-out cars come back clean on a fresh run.
    for (const car of vehicles) {
      car.durability = 100;
      car.wrecked = false;
      car.color = car.paint;
    }
    player.player.cash = 0;
    player.player.x = world.city.spawn.x;
    player.player.y = world.city.spawn.y;
    player.player.facing = -Math.PI / 2;
    camera.snapTo(player.player.x, player.player.y);
    briefingMission = null;
    missionEnd = null;
    pendingMissionFailed = false;
    screen = SCREEN_PLAY;
    announce('A fresh start in Marisol Bay.');
  }

  function activateMenuItem(item) {
    if (!item || item.disabled) return;
    const action = item.action;
    if (action === 'start') newGame();
    else if (action === 'continue') {
      screen = SCREEN_PLAY;
      announce('Welcome back to Marisol Bay.');
    } else if (action === 'missions') {
      screen = SCREEN_MISSIONS;
      menuSelected = 0;
    } else if (action === 'howto') {
      screen = SCREEN_HOWTO;
    } else if (action === 'resume') {
      screen = SCREEN_PLAY;
      announce('Playing.');
    } else if (action === 'save') {
      saveGameNow();
      announce('Saved.');
    } else if (action === 'quit') {
      saveGameNow();
      screen = SCREEN_TITLE;
      menuSelected = 0;
      announce('Marisol Bay.');
    } else if (action.startsWith('mission:')) {
      const def = missions.defs.find((d) => d.id === action.slice(8));
      if (def) {
        briefingMission = def;
        screen = SCREEN_BRIEFING;
      }
    }
  }

  /** Start the briefed job and send Jax out. */
  function beginMission(def) {
    if (missions.start(def.id)) {
      briefingMission = null;
      screen = SCREEN_PLAY;
      announce(`${def.name}. ${def.objectives[0].label}.`);
    }
  }

  /** Move the highlight with W/S or the arrow keys, one step per press. */
  function menuNav(actions) {
    const items = menuFor(screen)?.items ?? [];
    if (items.length === 0) return;
    menuSelected = Math.min(menuSelected, items.length - 1);
    if (actions & ACTION_MENU_UP) menuSelected = (menuSelected + items.length - 1) % items.length;
    if (actions & ACTION_MENU_DOWN) menuSelected = (menuSelected + 1) % items.length;
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

  /** Viewport (CSS) pixels to view coordinates (the 1280x720 menu space). */
  function clickToView(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const scale = Math.min(canvas.width / VIEW.width, canvas.height / VIEW.height);
    const offsetX = (canvas.width - VIEW.width * scale) / 2;
    const offsetY = (canvas.height - VIEW.height * scale) / 2;
    const devX = (clientX - rect.left) * (canvas.width / rect.width);
    const devY = (clientY - rect.top) * (canvas.height / rect.height);
    return { x: (devX - offsetX) / scale, y: (devY - offsetY) / scale };
  }

  /** Step into the nearest parked or slow car (E), taking it off traffic's hands. */
  function tryEnterVehicle() {
    const car = nearestVehicle(vehicles, player.player.x, player.player.y, 80);
    if (car === null || Math.abs(car.speed) > 90) return;
    if (car.police) {
      announce('Locked. The cruiser will not open.');
      return;
    }
    if (car.locked) {
      announce('That car is spoken for.');
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

  /**
   * Leave the BUSTED panel: back to the streets, or to the JOB FAILED panel
   * when the bust ended a job in progress.
   */
  function releaseBusted() {
    // Drop the stale fail event the bust queued; the panel already says it.
    missions.drainEvents();
    if (pendingMissionFailed) {
      pendingMissionFailed = false;
      screen = SCREEN_FAILED;
      announce('Job failed.');
    } else {
      screen = SCREEN_PLAY;
      announce('Back on the streets.');
    }
  }

  function handleActions(actions) {
    // P or Esc: pause, resume, or step back through the menus.
    if (actions & ACTION_PAUSE) {
      if (screen === SCREEN_PLAY) {
        screen = SCREEN_PAUSED;
        menuSelected = 0;
        announce('Paused.');
      } else if (screen === SCREEN_PAUSED) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      } else if (screen === SCREEN_MISSIONS) {
        screen = SCREEN_TITLE;
        menuSelected = 0;
      } else if (screen === SCREEN_BRIEFING) {
        screen = SCREEN_MISSIONS;
        menuSelected = 0;
      } else if (screen === SCREEN_HOWTO) {
        screen = SCREEN_TITLE;
        menuSelected = 0;
      }
      return;
    }
    if (!(actions & ACTION_CONFIRM)) return;
    if (screen === SCREEN_TITLE) activateMenuItem(titleMenuItems()[menuSelected]);
    else if (screen === SCREEN_MISSIONS) activateMenuItem(missionMenuItems()[menuSelected]);
    else if (screen === SCREEN_BRIEFING) {
      if (briefingMission) beginMission(briefingMission);
    } else if (screen === SCREEN_PASSED || screen === SCREEN_FAILED) {
      screen = SCREEN_MISSIONS;
      menuSelected = 0;
    } else if (screen === SCREEN_HOWTO) {
      screen = SCREEN_TITLE;
      menuSelected = 0;
    } else if (screen === SCREEN_PAUSED) activateMenuItem(pauseMenuItems()[menuSelected]);
    else if (screen === SCREEN_BUSTED) releaseBusted();
    else if (screen === SCREEN_DOWN) releaseDown();
  }

  /**
   * The bust meter filled: fine Jax part of his cash, clear the heat, pull
   * the cruisers off the street, and leave him on foot where he was caught.
   * A bust during a job fails it; the FAILED panel follows this one.
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

  // A bust ends a job in progress: record the failure now, show the panel
  // after the BUSTED one releases.
  police.setBustedHandler(() => {
    if (missions.current) {
      const name = missions.current.def.name;
      missions.fail('busted');
      missionEnd = { kind: 'failed', name, reason: 'busted' };
      pendingMissionFailed = true;
    }
  });

  /**
   * B5: hurt Jax (armor takes 60% until it runs out). Going down sends
   * him to hospital; otherwise the health comes back after 8 calm seconds.
   */
  function hurtPlayer(amount) {
    if (screen !== SCREEN_PLAY || player.player.health <= 0) return;
    hurtTimer = 0;
    effects.shake(0.45);
    audio.play('hurt');
    const died = player.hurt(amount);
    if (died) triggerDown();
  }

  /** B5: one hard impact — damage scales with the speed that was lost. */
  function crashHit(speed) {
    if (crashCooldown > 0 || screen !== SCREEN_PLAY) return;
    crashCooldown = 0.6;
    const damage = Math.max(4, Math.min(24, Math.round((speed - 200) * 0.04)));
    if (player.player.vehicle) damageVehicle(player.player.vehicle, damage * 2);
    effects.shake(0.5);
    audio.play('crash');
    hurtPlayer(damage);
  }

  /** B5: wear a car down; at 0 durability it burns out. */
  function damageVehicle(car, amount) {
    if (!car || car.wrecked || car.police) return;
    car.durability -= amount;
    if (car.durability <= 0) explodeVehicle(car);
  }

  /** B5: a car burning out — fireball, wreck, and Jax thrown clear if he was driving. */
  function explodeVehicle(car) {
    car.wrecked = true;
    car.parked = true;
    car.speed = 0;
    car.color = '#1c1a18';
    effects.explosion(car.x, car.y);
    audio.play('explosion');
    if (car.driver === 'player') {
      car.driver = null;
      player.player.vehicle = null;
      const spot = world.nearestWalkable(car.x + 40, car.y + 40, player.player.radius);
      player.player.x = spot.x;
      player.player.y = spot.y;
      hurtPlayer(25);
    } else if (car.driver === 'ai') {
      traffic.removeCar(car);
      car.driver = null;
    }
  }

  /**
   * B5: Jax went down — hospital bill, wake up at Marisol General with
   * full health, the heat cleared, the cruisers gone. A death during a
   * job fails it; the FAILED panel follows this one.
   */
  function triggerDown() {
    const stars = wanted.stars;
    const bill = Math.min(player.player.cash, 100 + 25 * stars);
    player.player.cash -= bill;
    downBill = bill;
    if (player.player.vehicle) {
      const car = player.player.vehicle;
      car.driver = null;
      car.parked = true;
      car.speed = 0;
      player.player.vehicle = null;
    }
    player.player.x = HOSPITAL.x;
    player.player.y = HOSPITAL.y;
    player.resetHealth();
    wanted.reset();
    police.clearAll();
    downTimer = 0;
    screen = SCREEN_DOWN;
    announce(`Flatlined. Hospital bill $${bill}.`);
    audio.play('down');
    if (missions.current) {
      const name = missions.current.def.name;
      missions.fail('down');
      missionEnd = { kind: 'failed', name, reason: 'down' };
      pendingMissionFailed = true;
    }
  }

  /**
   * Leave the FLATLINED panel: back to the streets, or to the JOB FAILED
   * panel when the death ended a job in progress.
   */
  function releaseDown() {
    // Drop the stale fail event the death queued; the panel already says it.
    missions.drainEvents();
    if (pendingMissionFailed) {
      pendingMissionFailed = false;
      screen = SCREEN_FAILED;
      announce('Job failed.');
    } else {
      screen = SCREEN_PLAY;
      announce('Back on the streets.');
    }
  }

  function step() {
    if (screen !== SCREEN_PLAY) return;
    // B5: the continuous voices follow the drive; the siren fades in
    // with the nearest cruiser. Health comes back after 8 calm seconds.
    let nearestCruiser = null;
    for (const car of police.cars) {
      const dist = Math.hypot(car.x - player.player.x, car.y - player.player.y);
      if (nearestCruiser === null || dist < nearestCruiser) nearestCruiser = dist;
    }
    audio.update(STEP, {
      speed: player.player.vehicle ? player.player.vehicle.speed : 0,
      inCar: player.player.vehicle !== null,
      sirenDist: nearestCruiser,
    });
    hurtTimer += STEP;
    if (crashCooldown > 0) crashCooldown -= STEP;
    if (hurtTimer > 8 && player.player.health > 0 && player.player.health < player.player.maxHealth) {
      player.heal(6 * STEP);
    }
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
      const speedBefore = car.speed;
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
      // B5: a hard stop — into a wall or another car — hurts Jax and his car.
      if (Math.abs(speedBefore) > 300 && Math.abs(car.speed) < Math.abs(speedBefore) * 0.45) {
        crashHit(Math.abs(speedBefore));
      }
      // B5: hard cornering at speed leaves skid marks; a battered car smokes.
      skidTimer -= STEP;
      if (Math.abs(move.x) > 0.6 && Math.abs(car.speed) > 220 && skidTimer <= 0) {
        effects.skid(car.x, car.y, car.angle);
        skidTimer = 0.06;
      }
      smokeTimer -= STEP;
      if (car.durability < 40 && smokeTimer <= 0) {
        effects.smoke(car.x, car.y, 2);
        smokeTimer = 0.25;
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
      else if (event.type === 'shot') audio.play('shot');
      else if (event.type === 'punch') audio.play('punch');
      else if (event.type === 'hit') audio.play('hit');
      else if (event.type === 'reload' || event.type === 'reloaded') audio.play('reload');
    }

    // B4: the job chain, the cab fares, the race and the sun tokens. A job
    // that passes or fails changes the screen, which stops the stepping loop
    // at the end of this frame.
    missions.update(STEP);
    for (const event of missions.drainEvents()) {
      if (event.type === 'started') announce(`${event.name} — good luck.`);
      else if (event.type === 'objective') announce(`${event.label} — done.`);
      else if (event.type === 'objective-progress') announce(`${event.label}: ${event.got} of ${event.total}.`);
      else if (event.type === 'passed') {
        missionEnd = { kind: 'passed', name: event.name, reward: event.reward };
        saveGameNow();
        screen = SCREEN_PASSED;
        announce(`${event.name} complete. Earned $${event.reward}.`);
        audio.play('missionPass');
      } else if (event.type === 'failed') {
        missionEnd = { kind: 'failed', name: event.name, reason: event.reason };
        screen = SCREEN_FAILED;
        announce('Job failed.');
        audio.play('missionFail');
      }
    }
    taxi.update(STEP);
    for (const event of taxi.drainEvents()) {
      if (event.type === 'fare-offered') announce('Fare waiting — drive to the gold marker.');
      else if (event.type === 'passenger') announce(`Passenger aboard. Fare $${event.fare}.`);
      else if (event.type === 'fare-paid') {
        announce(`Fare paid: $${event.amount}${event.tip ? ' (with tip)' : ''}.`);
        saveGameNow();
        audio.play('fare');
      } else if (event.type === 'fare-cancelled') announce('The fare walked away.');
    }
    races.update(STEP, world.isBlocked);
    for (const event of races.drainEvents()) {
      if (event.type === 'race-start') announce('Race starting — get ready.');
      else if (event.type === 'race-go') announce('Go!');
      else if (event.type === 'checkpoint') {
        announce(`Checkpoint ${event.index} of ${event.total}.`);
        audio.play('checkpoint');
      } else if (event.type === 'race-done') {
        announce(`Race done in ${formatRaceTime(event.time)} — $${event.pay}.`);
        saveGameNow();
        audio.play('missionPass');
      } else if (event.type === 'race-lost') {
        announce('The rival beat you to the line.');
        audio.play('missionFail');
      } else if (event.type === 'race-abandoned') announce('Race abandoned.');
    }
    collectibles.update();
    for (const event of collectibles.drainEvents()) {
      if (event.type === 'token') {
        announce(`Sun token ${event.collected} of 30 — $${event.amount}.`);
        audio.play('token');
      } else if (event.type === 'tokens-complete') {
        announce(`All 30 tokens! Bonus $${event.amount}.`);
        saveGameNow();
        audio.play('missionPass');
      } else if (event.type === 'armor') {
        announce(`Armor vest — +${event.amount} armor.`);
        audio.play('pickup');
      }
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
    // B5: a cruiser's ram hurts Jax and his car.
    for (const event of police.drainEvents()) {
      if (event.type === 'ram') {
        if (player.player.vehicle) damageVehicle(player.player.vehicle, event.amount * 2);
        audio.play('crash');
        hurtPlayer(event.amount);
      }
    }
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
    // B5: M toggles the minimap, N toggles the sound; any press at all
    // unlocks the audio context (browsers block it before a gesture).
    if (actions & ACTION_MINIMAP) renderer.minimap.toggle();
    if (actions & ACTION_MUTE) {
      audio.setMuted(!audio.muted);
      announce(audio.muted ? 'Sound muted.' : 'Sound on.');
    }
    if (actions !== 0) audio.unlock();
    // On a menu screen a click picks the item under it (a click on empty
    // space picks nothing) and swallows the press it came with, so one
    // click never fires two menu actions.
    let effectiveActions = actions;
    const isMenuScreen = screen === SCREEN_TITLE || screen === SCREEN_MISSIONS || screen === SCREEN_PAUSED;
    if (isMenuScreen) {
      menuNav(actions);
      if (input.takeClick()) {
        const mouse = input.mouse();
        const view = clickToView(mouse.x, mouse.y);
        const hit = (menuRects ?? []).find(
          (r) => view.x >= r.x && view.x <= r.x + r.w && view.y >= r.y && view.y <= r.y + r.h,
        );
        if (hit) {
          if (hit.disabled) menuSelected = hit.index;
          else activateMenuItem(hit);
        }
        effectiveActions = 0;
      }
    }
    handleActions(effectiveActions);
    if (wasPlay) {
      combatActions |= actions & (ACTION_CONFIRM | ACTION_RELOAD | ACTION_FISTS | ACTION_PISTOL);
    }
    if (screen === SCREEN_BUSTED) {
      // The bust panel holds the world still, then sends Jax back out —
      // or on to the JOB FAILED panel when the bust ended a job.
      bustTimer += frameDt;
      if (bustTimer >= 3) releaseBusted();
      accumulator = 0;
    } else if (screen === SCREEN_DOWN) {
      // The hospital panel holds the world still, then sends Jax back out —
      // or on to the JOB FAILED panel when the death ended a job.
      downTimer += frameDt;
      if (downTimer >= 3) releaseDown();
      accumulator = 0;
    } else if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    // The steal hint skips cruisers and locked cars: they never open.
    let nearCar = null;
    if (!player.player.vehicle) {
      let bestDist = 80;
      for (const vehicle of vehicles) {
        if (vehicle.police || vehicle.locked) continue;
        const dist = Math.hypot(vehicle.x - player.player.x, vehicle.y - player.player.y);
        if (dist < bestDist) {
          nearCar = vehicle;
          bestDist = dist;
        }
      }
    }
    const mouse = input.mouse();
    const aim = screenToWorld(mouse.x, mouse.y);
    // The live job, the live fare or race, and the markers they point at.
    const missionObjective = missions.current ? missions.currentObjective() : null;
    let activity = null;
    if (taxi.state === 'toPickup') {
      activity = 'FARE — pick up the passenger';
    } else if (taxi.state === 'toDropoff') {
      const fare = taxi.fare;
      const dist = Math.round(Math.hypot(fare.dropoff.x - player.player.x, fare.dropoff.y - player.player.y) / 10);
      const tip = fare.elapsed <= fare.parTime ? ' · tip if fast' : '';
      activity = `FARE $${fare.fare} — drop off · ${dist}m${tip}`;
    } else if (races.state === 'countdown') {
      activity = `RACE starts in ${Math.ceil(races.countdown)}…`;
    } else if (races.state === 'running') {
      activity = `RACE ${formatRaceTime(races.elapsed)} · CP ${races.checkpointIndex}/${RACE_CHECKPOINTS.length}`;
    } else if (races.resultTimer > 0) {
      activity = races.resultText;
    }
    const markers = [...missions.markers(), ...taxi.markers(), ...races.markers()];
    const tokensList = collectibles.list.filter((t) => !t.taken);
    const drawn = renderer.draw(world, player.player, camera.camera, screen, {
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
      downInfo: { bill: downBill },
      // B5: health and armor, the mute state, the minimap and the shake.
      health: player.player.health,
      maxHealth: player.player.maxHealth,
      armor: player.player.armor,
      maxArmor: player.player.maxArmor,
      muted: audio.muted,
      minimapVisible: renderer.minimap.visible,
      minimap: {
        world,
        player: player.player,
        policeCars: police.cars,
        markers,
        tokens: tokensList,
        hideout: wanted.hideout,
      },
      shake: effects.shakeOffset(),
      armorList: collectibles.armor.filter((v) => !v.taken),
      menu: menuFor(screen),
      briefing: briefingMission
        ? {
            title: briefingMission.name,
            lines: [
              ...briefingMission.story,
              '',
              `Reward: $${briefingMission.reward}.`,
              ...(briefingMission.stars ? [`The heat starts at ${briefingMission.stars} stars.`] : []),
              ...(briefingMission.timeLimit ? [`Clock: ${briefingMission.timeLimit} seconds.`] : []),
            ],
            prompt: 'Press Space to start · Esc to go back',
          }
        : null,
      endPanel: missionEnd
        ? {
            lines:
              missionEnd.kind === 'passed'
                ? [
                    `${missionEnd.name} complete.`,
                    `Reward: $${missionEnd.reward}.`,
                    missions.nextId ? 'The next job is unlocked.' : 'All five jobs done. Marisol Bay is yours.',
                  ]
                : missionEnd.reason === 'busted'
                  ? ['The Bay PD caught Jax.', 'The job is blown.']
                  : missionEnd.reason === 'down'
                    ? ['Jax went down in the streets.', 'The job is blown.']
                    : ['The clock ran out.', 'The job is blown.'],
          }
        : { lines: [] },
      objective: missionObjective ? missionObjective.text : null,
      activity,
      markers,
      tokensList,
      tokens: { collected: collectibles.collected, total: collectibles.total },
    });
    menuRects = drawn?.menu ?? null;
  }

  // Leaving the tab pauses a running game rather than letting Jax stand in traffic unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      menuSelected = 0;
      announce('Paused.');
    }
  });

  announce('Marisol Bay. Choose a job, or start driving.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
