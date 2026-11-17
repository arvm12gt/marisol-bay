// Street races: a start line on Coral Avenue and four checkpoints around
// the city. Drive into the start line and the countdown runs; hit every
// checkpoint in order and the clock stops. A rival in a Sunset GT runs the
// same course by pure pursuit — beat him to the line. Best times are saved
// per race; leaving the car mid-race abandons it. Finishing pays $50, and
// $100 when the rival is beaten.
import { CITY } from './config.js';
import { createVehicle, driveVehicle } from './vehicles.js';

export const RACE_ID = 'downtown-loop';
export const RACE_START = { x: 1260, y: 840 };
export const RACE_CHECKPOINTS = [
  { x: 2520, y: 840 },
  { x: 2520, y: 2100 },
  { x: 420, y: 2100 },
  { x: 420, y: 420 },
];
const ZONE_RADIUS = 70;
const COUNTDOWN_SECONDS = 3;
/** The rival's target speed: a steady cruise a decent driver beats. */
const RIVAL_SPEED = 500;
/** Seconds the rival may crawl before it is moved back onto the course. */
const RIVAL_STUCK_SECONDS = 2.5;
const FINISH_PAY = 50;
const WIN_BONUS = 50;
/** Seconds the result stays on the HUD after a race ends. */
const RESULT_SECONDS = 6;

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

function angleDiff(target, current) {
  let diff = target - current;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}

function distTo(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** "1:23.4" from seconds. */
export function formatRaceTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds - minutes * 60;
  return `${minutes}:${rest.toFixed(1).padStart(4, '0')}`;
}

export function createRaces(world, player, vehicles, effects) {
  const events = [];
  let rival = null;

  const races = {
    /** 'idle' | 'countdown' | 'running'. */
    state: 'idle',
    /** Index of the next checkpoint. */
    checkpointIndex: 0,
    /** Seconds on the clock since GO. */
    elapsed: 0,
    /** Seconds left on the start countdown. */
    countdown: 0,
    /** Best time per race id, in seconds. */
    best: {},
    /** The last result line, while it is still on the HUD. */
    resultText: '',
    resultTimer: 0,
  };

  /** Put the rival on the course, just behind the start line. */
  function spawnRival() {
    const car = createVehicle('sport', RACE_START.x, RACE_START.y + 60, 0);
    car.driver = 'rival';
    /** Locked like a cruiser: the player may not steal the rival's car. */
    car.locked = true;
    car.rivalCheckpoint = 0;
    car.stuckTimer = 0;
    vehicles.push(car);
    rival = { car, checkpointIndex: 0, stuckTimer: 0 };
    return rival;
  }

  function despawnRival() {
    if (rival === null) return;
    const index = vehicles.indexOf(rival.car);
    if (index !== -1) vehicles.splice(index, 1);
    rival = null;
  }

  /** The rival's next point: its checkpoint, or the start line before GO. */
  function rivalTarget() {
    if (rival.checkpointIndex >= RACE_CHECKPOINTS.length) return null;
    return RACE_CHECKPOINTS[rival.checkpointIndex];
  }

  /** Drive the rival toward its next checkpoint, one fixed step. */
  function updateRival(dt, isBlocked) {
    if (rival === null) return;
    const car = rival.car;
    const target = rivalTarget();
    if (target === null) return;
    // Stuck against a building or a jam: move it back onto the course,
    // halfway to the next checkpoint from the one before it.
    if (Math.abs(car.speed) < 25) rival.stuckTimer += dt;
    else rival.stuckTimer = 0;
    if (rival.stuckTimer > RIVAL_STUCK_SECONDS) {
      const prev =
        rival.checkpointIndex === 0 ? RACE_START : RACE_CHECKPOINTS[rival.checkpointIndex - 1];
      car.x = (prev.x + target.x) / 2;
      car.y = (prev.y + target.y) / 2;
      car.angle = Math.atan2(target.y - prev.y, target.x - prev.x);
      car.speed = 0;
      rival.stuckTimer = 0;
      return;
    }
    const desired = Math.atan2(target.y - car.y, target.x - car.x);
    const steer = clamp(angleDiff(desired, car.angle) * 2.2, -1, 1);
    const throttle = clamp((RIVAL_SPEED - car.speed) / 140, -1, 1);
    driveVehicle(car, dt, throttle, steer, isBlocked);
    if (distTo(car, target) < ZONE_RADIUS) {
      rival.checkpointIndex += 1;
      if (rival.checkpointIndex >= RACE_CHECKPOINTS.length) {
        // The rival crossed the line first.
        events.push({ type: 'race-lost', time: races.elapsed });
        despawnRival();
        races.state = 'idle';
        races.checkpointIndex = 0;
        races.resultText = `Rival won — ${formatRaceTime(races.elapsed)}. Try again.`;
        races.resultTimer = RESULT_SECONDS;
      }
    }
  }

  /** One fixed step: start, count down, time and chase the checkpoints. */
  function update(dt, isBlocked) {
    if (races.resultTimer > 0) races.resultTimer -= dt;
    if (races.state === 'idle') {
      if (player.vehicle !== null && distTo(player, RACE_START) < ZONE_RADIUS) {
        races.state = 'countdown';
        races.countdown = COUNTDOWN_SECONDS;
        races.checkpointIndex = 0;
        races.elapsed = 0;
        spawnRival();
        events.push({ type: 'race-start' });
      }
      return;
    }
    if (player.vehicle === null) {
      // Out of the car mid-race: the run is abandoned.
      despawnRival();
      races.state = 'idle';
      races.checkpointIndex = 0;
      events.push({ type: 'race-abandoned' });
      return;
    }
    if (races.state === 'countdown') {
      races.countdown -= dt;
      if (races.countdown <= 0) {
        races.state = 'running';
        races.elapsed = 0;
        events.push({ type: 'race-go' });
      }
      return;
    }
    races.elapsed += dt;
    updateRival(dt, isBlocked);
    if (races.state !== 'running') return;
    const target = RACE_CHECKPOINTS[races.checkpointIndex];
    if (distTo(player, target) < ZONE_RADIUS) {
      races.checkpointIndex += 1;
      effects.sparks(target.x, target.y, 8);
      if (races.checkpointIndex >= RACE_CHECKPOINTS.length) {
        const time = races.elapsed;
        // The rival is still on the course, so Jax beat it to the line.
        const beatRival = rival !== null;
        const pay = FINISH_PAY + (beatRival ? WIN_BONUS : 0);
        player.cash += pay;
        const prevBest = races.best[RACE_ID];
        const isBest = prevBest === undefined || time < prevBest;
        if (isBest) races.best[RACE_ID] = Math.round(time * 10) / 10;
        despawnRival();
        races.state = 'idle';
        races.checkpointIndex = 0;
        events.push({ type: 'race-done', time, pay, best: races.best[RACE_ID], isBest });
        races.resultText = `Race done in ${formatRaceTime(time)} — $${pay}.${
          isBest ? ' New best!' : ''
        }`;
        races.resultTimer = RESULT_SECONDS;
      } else {
        events.push({ type: 'checkpoint', index: races.checkpointIndex, total: RACE_CHECKPOINTS.length });
      }
    }
  }

  /** The start line and the checkpoints, for the renderer. */
  function markers() {
    const out = [];
    if (races.state === 'idle') {
      out.push({ x: RACE_START.x, y: RACE_START.y, color: '#e84a7a', label: 'RACE', big: true });
      return out;
    }
    for (let i = races.checkpointIndex; i < RACE_CHECKPOINTS.length; i += 1) {
      const point = RACE_CHECKPOINTS[i];
      out.push({
        x: point.x,
        y: point.y,
        color: '#e84a7a',
        label: `CP ${i + 1}`,
        big: i === races.checkpointIndex,
      });
    }
    return out;
  }

  /** Best times from a save. */
  function applySave(bestTimes) {
    races.best = {};
    for (const [id, time] of Object.entries(bestTimes ?? {})) {
      if (typeof time === 'number' && time > 0) races.best[id] = time;
    }
  }

  /** Forget the run state (a new game). */
  function reset() {
    despawnRival();
    races.state = 'idle';
    races.checkpointIndex = 0;
    races.elapsed = 0;
    races.countdown = 0;
    races.best = {};
    races.resultText = '';
    races.resultTimer = 0;
  }

  /** Take the events since the last call (the main loop announces them). */
  function drainEvents() {
    return events.splice(0, events.length);
  }

  races.update = update;
  races.markers = markers;
  races.applySave = applySave;
  races.reset = reset;
  races.drainEvents = drainEvents;
  return races;
}
