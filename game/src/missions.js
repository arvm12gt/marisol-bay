// Missions: the five jobs Mama Rosa lines up for Jax, in order. Each one
// is a chain of objectives — go somewhere, steal a car, hold a spot, lose
// the heat — with a cash reward at the end. A bust fails a run in progress
// (the main loop hooks police.onBusted); a timed job fails when its clock
// runs out. Progress is saved as finished job ids; the next job unlocks
// when the previous one is done.
import { createVehicle } from './vehicles.js';

export const MISSION_IDS = ['m1', 'm2', 'm3', 'm4', 'm5'];

/** The garage the stolen Sunset GT goes to (1st Street and Coral Avenue). */
const GARAGE = { x: 420, y: 420 };
/** Jax's hideout: the south plaza, where the heat cools three times as fast. */
const HIDEOUT = { x: 1260, y: 2380 };
/** The pier vault, out on the sand by the boardwalk. */
const VAULT = { x: 3050, y: 1300 };
/** The Sunset GT waits in the south plaza, clear of parked traffic. */
const TARGET_CAR_SPOT = { x: 700, y: 2400 };
const PICKUP_M2 = { x: 2520, y: 420 };
const DROPOFF_M2 = { x: 420, y: 2100 };
const BEACH_PACKAGES = [
  { x: 2880, y: 600 },
  { x: 2880, y: 1300 },
  { x: 2880, y: 2000 },
];
/** Seconds Jax must stand in the vault zone to crack it. */
const HOLD_SECONDS = 10;

const DEFS = [
  {
    id: 'm1',
    name: 'First Wheels',
    reward: 300,
    stars: 0,
    story: [
      'Mama Rosa needs a Sunset GT for a client.',
      'Take it from the south plaza and bring it',
      'to the garage on 1st Street. Do not scratch it.',
    ],
    objectives: [
      { type: 'steal', label: 'Steal the Sunset GT', short: 'STEAL' },
      { type: 'deliver', label: 'Deliver it to the garage', short: 'GARAGE', point: GARAGE, radius: 90 },
    ],
  },
  {
    id: 'm2',
    name: 'Hot Package',
    reward: 500,
    stars: 2,
    timeLimit: 110,
    story: [
      'A hot package has to cross town in 110 seconds.',
      'The Bay PD already has your name — the heat',
      'starts at 2 stars. Drive like it matters.',
    ],
    objectives: [
      { type: 'goto', label: 'Pick up the package', short: 'PICK UP', point: PICKUP_M2, radius: 70 },
      { type: 'goto', label: 'Deliver it before the clock runs out', short: 'DROP OFF', point: DROPOFF_M2, radius: 70 },
    ],
  },
  {
    id: 'm3',
    name: 'Beach Run',
    reward: 400,
    stars: 0,
    story: [
      'Three packages washed up along the boardwalk.',
      'Walk the sand, grab them all, and bring',
      'Mama Rosa her cut. The beach is quiet — mostly.',
    ],
    objectives: [
      { type: 'collect', label: 'Collect the boardwalk packages', short: 'PACKAGE', points: BEACH_PACKAGES, radius: 60 },
    ],
  },
  {
    id: 'm4',
    name: 'Heat Escape',
    reward: 600,
    stars: 4,
    story: [
      'The heat is at 4 stars and the whole Bay PD',
      'is on your tail. Get back to the hideout',
      'and stay out of sight until it cools off.',
    ],
    objectives: [
      { type: 'goto', label: 'Reach the hideout', short: 'HIDEOUT', point: HIDEOUT, radius: 90 },
      { type: 'loseHeat', label: 'Lose the heat at the hideout', short: 'HIDEOUT', point: HIDEOUT, radius: 120 },
    ],
  },
  {
    id: 'm5',
    name: 'The Big Score',
    reward: 1500,
    stars: 0,
    story: [
      'The pier vault holds the weekend’s take.',
      'Crack it, then run — the whole city will',
      'be at 5 stars by the time the alarm sounds.',
    ],
    objectives: [
      { type: 'goto', label: 'Reach the pier vault', short: 'VAULT', point: VAULT, radius: 80 },
      { type: 'hold', label: 'Crack the vault — stay in the zone', short: 'CRACKING', point: VAULT, radius: 90, holdSeconds: HOLD_SECONDS },
      { type: 'goto', label: 'Escape to the hideout', short: 'HIDEOUT', point: HIDEOUT, radius: 90, setStarsOnStart: 5 },
    ],
  },
];

function distTo(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function createMissions({ world, player, vehicles, wanted, effects }) {
  const completedIds = [];
  let current = null;
  const events = [];

  const missions = {
    /** The five job definitions, in order. */
    defs: DEFS,
    /** Ids of finished jobs, in the order they were finished. */
    get completed() {
      return [...completedIds];
    },
    /** The run in progress, or null. */
    get current() {
      return current;
    },
    /** The next job id, or null when all five are done. */
    get nextId() {
      const next = DEFS.find((d) => !completedIds.includes(d.id));
      return next ? next.id : null;
    },
    isUnlocked(id) {
      const index = DEFS.findIndex((d) => d.id === id);
      if (index === -1) return false;
      return index === 0 || completedIds.includes(DEFS[index - 1].id);
    },
    isCompleted(id) {
      return completedIds.includes(id);
    },
  };

  /** The live objective, with a HUD line and a distance, or null. */
  function currentObjective() {
    if (current === null) return null;
    const objective = current.objectives[current.index];
    const number = DEFS.findIndex((d) => d.id === current.def.id) + 1;
    let distance = null;
    let extra = '';
    if (objective.type === 'steal' && current.targetCar) {
      distance = distTo(player, current.targetCar);
    } else if (objective.point) {
      distance = distTo(player, objective.point);
    }
    if (objective.type === 'collect') {
      const got = objective.collected.filter(Boolean).length;
      extra = ` ${got}/${objective.points.length}`;
    } else if (objective.type === 'hold') {
      extra = ` ${Math.ceil(objective.progress)}/${objective.holdSeconds}s`;
    } else if (objective.type === 'loseHeat') {
      extra = ` · ${wanted.stars}★ left`;
    }
    const distText = distance === null ? '' : ` · ${Math.round(distance / 10)}m`;
    return {
      text: `M${number} ${current.def.name} — ${objective.label}${extra}${distText}`,
      label: objective.label,
      distance,
    };
  }

  /** Begin a job: stage its stars, its hideout and its target car. */
  function start(id) {
    if (current !== null) return false;
    const def = DEFS.find((d) => d.id === id);
    if (!def || !missions.isUnlocked(id)) return false;
    const objectives = def.objectives.map((o) => ({
      ...o,
      done: false,
      collected: o.type === 'collect' ? o.points.map(() => false) : undefined,
      progress: o.type === 'hold' ? 0 : undefined,
    }));
    current = { def, index: 0, objectives, timer: def.timeLimit ?? null, targetCar: null };
    if (def.stars) wanted.setStars(def.stars);
    if (id === 'm1') {
      const car = createVehicle('sport', TARGET_CAR_SPOT.x, TARGET_CAR_SPOT.y, -Math.PI / 2);
      car.parked = true;
      /** The job's car: the renderer and the HUD point at it. */
      car.missionTarget = true;
      vehicles.push(car);
      current.targetCar = car;
    }
    if (id === 'm4') wanted.setHideout({ x: HIDEOUT.x, y: HIDEOUT.y, radius: 120 });
    events.push({ type: 'started', id, name: def.name });
    return true;
  }

  /** Tidy up after a run ends: the hideout stops hiding, the target car stays a normal car. */
  function cleanup() {
    if (current !== null && current.targetCar) {
      const car = current.targetCar;
      car.missionTarget = false;
      // A failed job leaves the car where it is; a passed one hands it to
      // Jax as his own ride, so it is never despawned under the player.
      if (player.vehicle !== car) {
        const index = vehicles.indexOf(car);
        if (index !== -1) vehicles.splice(index, 1);
      } else {
        car.stolen = true;
      }
    }
    wanted.setHideout(null);
  }

  /** The run is done: pay the reward and unlock the next job. */
  function pass() {
    const def = current.def;
    player.cash += def.reward;
    if (!completedIds.includes(def.id)) completedIds.push(def.id);
    events.push({ type: 'passed', id: def.id, name: def.name, reward: def.reward });
    cleanup();
    current = null;
  }

  /** End the run early: 'busted' or 'time'. */
  function fail(reason) {
    if (current === null) return;
    events.push({ type: 'failed', id: current.def.id, name: current.def.name, reason });
    cleanup();
    current = null;
  }

  /** A bust ends a run in progress (called from police.onBusted). */
  function onBusted() {
    if (current !== null) fail('busted');
  }

  /** One fixed step: run the clock and check the live objective. */
  function update(dt) {
    if (current === null) return;
    if (current.timer !== null) {
      current.timer -= dt;
      if (current.timer <= 0) {
        fail('time');
        return;
      }
    }
    const objective = current.objectives[current.index];
    let done = false;
    switch (objective.type) {
      case 'goto':
        done = distTo(player, objective.point) < objective.radius;
        break;
      case 'steal':
        done = player.vehicle !== null && player.vehicle === current.targetCar;
        break;
      case 'deliver':
        done = player.vehicle === current.targetCar && distTo(player, objective.point) < objective.radius;
        break;
      case 'collect': {
        let changed = false;
        objective.points.forEach((point, i) => {
          if (!objective.collected[i] && distTo(player, point) < objective.radius) {
            objective.collected[i] = true;
            changed = true;
            effects.coins(point.x, point.y, 5);
          }
        });
        if (changed) {
          events.push({
            type: 'objective-progress',
            label: objective.label,
            got: objective.collected.filter(Boolean).length,
            total: objective.points.length,
          });
        }
        done = objective.collected.every(Boolean);
        break;
      }
      case 'hold':
        if (distTo(player, objective.point) < objective.radius) objective.progress += dt;
        done = objective.progress >= objective.holdSeconds;
        break;
      case 'loseHeat':
        done = wanted.stars === 0 && distTo(player, objective.point) < objective.radius;
        break;
      default:
        break;
    }
    if (!done) return;
    objective.done = true;
    events.push({ type: 'objective', label: objective.label });
    current.index += 1;
    const next = current.objectives[current.index];
    if (next && next.setStarsOnStart !== undefined) wanted.setStars(next.setStarsOnStart);
    if (current.index >= current.objectives.length) pass();
  }

  /** The live objective's markers, for the renderer. */
  function markers() {
    if (current === null) return [];
    const objective = current.objectives[current.index];
    switch (objective.type) {
      case 'goto':
      case 'deliver':
      case 'hold':
      case 'loseHeat':
        return [{ x: objective.point.x, y: objective.point.y, color: '#f2c94c', label: objective.short, big: true }];
      case 'steal':
        if (current.targetCar) {
          return [{ x: current.targetCar.x, y: current.targetCar.y, color: '#f2c94c', label: objective.short, big: true }];
        }
        return [];
      case 'collect':
        return objective.points
          .filter((point, i) => !objective.collected[i])
          .map((point) => ({ x: point.x, y: point.y, color: '#f2c94c', label: objective.short, big: false }));
      default:
        return [];
    }
  }

  /** Finished job ids from a save. */
  function applySave(ids) {
    completedIds.length = 0;
    for (const id of ids ?? []) {
      if (MISSION_IDS.includes(id) && !completedIds.includes(id)) completedIds.push(id);
    }
  }

  /** Forget every run and every finish (a new game). */
  function reset() {
    if (current !== null) {
      // A run in progress is dropped, not failed: no event, no panel.
      cleanup();
      current = null;
    }
    completedIds.length = 0;
  }

  /** Take the events since the last call (the main loop announces them). */
  function drainEvents() {
    return events.splice(0, events.length);
  }

  missions.currentObjective = currentObjective;
  missions.start = start;
  missions.pass = pass;
  missions.fail = fail;
  missions.onBusted = onBusted;
  missions.update = update;
  missions.markers = markers;
  missions.applySave = applySave;
  missions.reset = reset;
  missions.drainEvents = drainEvents;
  return missions;
}
