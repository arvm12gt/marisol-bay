// Taxi fares: while Jax drives a cab, dispatch offers fares. Drive to the
// gold marker to pick the passenger up, then to the next marker to drop
// them off. The fare grows with the trip; beating the par time adds a tip.
// Leaving the cab (or stealing another car) cancels the fare — the
// passenger is not waiting for a getaway driver.
import { CITY, GRID } from './config.js';
import { range } from './random.js';

/** Seconds in a cab before dispatch offers the next fare. */
const OFFER_DELAY = 2;
/** How close Jax must be to pick up, then to drop off. */
const PICKUP_RADIUS = 60;
const DROPOFF_RADIUS = 70;
/** A fare is a flat fee plus this much per world unit of trip. */
const BASE_FARE = 25;
const PER_UNIT = 0.03;
/** Tip for beating the par time. */
const TIP = 20;
/** World units per second the tip par assumes (a steady cruise). */
const TIP_PAR_SPEED = 350;

function distTo(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function createTaxi(world, random, player) {
  const { city } = world;
  const events = [];
  let offerTimer = 0;
  let cooldown = 0;

  const taxi = {
    /** 'off' | 'toPickup' | 'toDropoff'. */
    state: 'off',
    /** { pickup, dropoff, fare, tip, parTime, elapsed } while a fare runs. */
    fare: null,
    /** Cash earned from fares this run. */
    earned: 0,
  };

  /** A point on a road, `minDist` to `maxDist` from (nearX, nearY). */
  function randomRoadPoint(nearX, nearY, minDist, maxDist) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const vertical = random() < 0.5;
      let x;
      let y;
      if (vertical) {
        const avenue = city.avenues[Math.floor(random() * city.avenues.length)];
        x = avenue + (random() < 0.5 ? -27 : 27);
        y = range(random, 120, city.height - 120);
      } else {
        const street = city.streets[Math.floor(random() * city.streets.length)];
        x = range(random, 120, city.boardwalkX - 120);
        y = street + (random() < 0.5 ? -27 : 27);
      }
      const d = Math.hypot(x - nearX, y - nearY);
      if (d < minDist || d > maxDist) continue;
      if (world.isBlocked(x, y, 20)) continue;
      return { x, y };
    }
    return null;
  }

  function offerFare() {
    const pickup = randomRoadPoint(player.x, player.y, 300, 1400);
    if (pickup === null) return;
    taxi.state = 'toPickup';
    taxi.fare = { pickup, dropoff: null, fare: 0, tip: 0, parTime: 0, elapsed: 0 };
    events.push({ type: 'fare-offered' });
  }

  /** One fixed step: offer, pick up and drop off fares while Jax drives a cab. */
  function update(dt) {
    const car = player.vehicle;
    const drivingCab = car !== null && car.type.key === 'taxi';
    if (!drivingCab) {
      if (taxi.state !== 'off') {
        taxi.state = 'off';
        taxi.fare = null;
        events.push({ type: 'fare-cancelled' });
      }
      offerTimer = 0;
      if (cooldown > 0) cooldown -= dt;
      return;
    }
    if (cooldown > 0) {
      cooldown -= dt;
      return;
    }
    if (taxi.state === 'off') {
      offerTimer += dt;
      if (offerTimer >= OFFER_DELAY) {
        offerTimer = 0;
        offerFare();
      }
      return;
    }
    const fare = taxi.fare;
    if (taxi.state === 'toPickup') {
      if (distTo(player, fare.pickup) < PICKUP_RADIUS) {
        const dest = randomRoadPoint(fare.pickup.x, fare.pickup.y, 500, 1700);
        if (dest === null) {
          taxi.state = 'off';
          taxi.fare = null;
          return;
        }
        const trip = distTo(fare.pickup, dest);
        fare.dropoff = dest;
        fare.fare = Math.round(BASE_FARE + trip * PER_UNIT);
        fare.tip = TIP;
        fare.parTime = trip / TIP_PAR_SPEED;
        fare.elapsed = 0;
        taxi.state = 'toDropoff';
        events.push({ type: 'passenger', fare: fare.fare });
      }
      return;
    }
    fare.elapsed += dt;
    if (distTo(player, fare.dropoff) < DROPOFF_RADIUS) {
      const tip = fare.elapsed <= fare.parTime ? fare.tip : 0;
      const total = fare.fare + tip;
      player.cash += total;
      taxi.earned += total;
      events.push({ type: 'fare-paid', amount: total, tip });
      taxi.state = 'off';
      taxi.fare = null;
      cooldown = 3;
    }
  }

  /** The current fare marker, if any (the renderer draws it). */
  function markers() {
    if (taxi.state === 'toPickup') {
      return [{ x: taxi.fare.pickup.x, y: taxi.fare.pickup.y, color: '#f2c94c', label: 'FARE', big: true }];
    }
    if (taxi.state === 'toDropoff') {
      return [{ x: taxi.fare.dropoff.x, y: taxi.fare.dropoff.y, color: '#f2c94c', label: 'DROP OFF', big: true }];
    }
    return [];
  }

  /** Take the events since the last call (the main loop announces them). */
  function drainEvents() {
    return events.splice(0, events.length);
  }

  taxi.update = update;
  taxi.markers = markers;
  taxi.drainEvents = drainEvents;
  return taxi;
}
