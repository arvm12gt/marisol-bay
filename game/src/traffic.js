// Traffic: AI cars that cruise Marisol Bay's road grid on the right-hand
// side, slow for the car ahead, yield at intersections, turn at random and
// are replaced at the map edge, so the streets stay alive. Every AI car
// lives in the same shared vehicle list as the parked cars and the player's
// car, and drives through the same driveVehicle physics in vehicles.js, so
// a stolen traffic car keeps behaving like a car.
//
// A route is a chain of legs: one leg is a single road in one direction,
// ending at the next intersection (or the road's end). At each intersection
// the car usually goes straight and sometimes turns; the leg's target point
// is the lane line at that intersection, and the car steers toward it.
import { CITY } from './config.js';
import { CAR_TYPES, createVehicle, driveVehicle } from './vehicles.js';
import { pick, range } from './random.js';

/** How far a lane sits from its road's centreline (road half-width is 55). */
const LANE = 27;
/** Chance of turning at an intersection instead of going straight. */
const TURN_CHANCE = 0.22;
/** A car this close to its leg's end takes the next leg. */
const LEG_END_DIST = 42;
/** How far ahead the car looks for something to slow down for. */
const LOOK_AHEAD = 140;

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

function angleDiff(target, current) {
  let diff = target - current;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}

/** The next road coordinate past `pos` in direction `dir`, or null at the edge. */
function nextRoad(roads, pos, dir) {
  if (dir > 0) {
    for (const road of roads) if (road > pos + 30) return road;
  } else {
    for (let i = roads.length - 1; i >= 0; i -= 1) {
      if (roads[i] < pos - 30) return roads[i];
    }
  }
  return null;
}

/** The road's end in direction `dir`: where a car leaves the map. */
function roadEnd(axis, dir) {
  if (axis === 'v') return dir < 0 ? 40 : CITY.height - 40;
  return dir < 0 ? 60 : CITY.boardwalkX - 60;
}

export function createTraffic(world, random, vehicles, targetCount = 16) {
  const { city } = world;
  /** The AI cars, a subset of the shared `vehicles` list. */
  const cars = [];
  let target = targetCount;

  /** The lane point at the end of a leg: where the car is steering toward. */
  function legTarget(leg) {
    if (leg.axis === 'v') {
      return { x: leg.line + (leg.dir < 0 ? LANE : -LANE), y: leg.end };
    }
    return { x: leg.end, y: leg.line + (leg.dir > 0 ? LANE : -LANE) };
  }

  /** The first leg of a route starting at (x, y) on `axis`/`line`, heading `dir`. */
  function firstLeg(axis, line, dir, x, y) {
    const roads = axis === 'v' ? city.streets : city.avenues;
    const pos = axis === 'v' ? y : x;
    const next = nextRoad(roads, pos, dir);
    return { axis, line, dir, end: next === null ? roadEnd(axis, dir) : next };
  }

  /** Advance a car at the end of its leg: straight, a turn, or off the map. */
  function advanceLeg(car) {
    const leg = car.leg;
    const atEdge = leg.end === roadEnd(leg.axis, leg.dir);
    if (atEdge) return false;
    if (random() < TURN_CHANCE) {
      // Turn onto the crossing road: the new leg starts at this intersection.
      const newAxis = leg.axis === 'v' ? 'h' : 'v';
      const newLine = leg.end;
      const newDir = random() < 0.5 ? -1 : 1;
      const pos = newAxis === 'v' ? car.y : car.x;
      const roads = newAxis === 'v' ? city.streets : city.avenues;
      const next = nextRoad(roads, pos, newDir);
      car.leg = {
        axis: newAxis,
        line: newLine,
        dir: newDir,
        end: next === null ? roadEnd(newAxis, newDir) : next,
      };
    } else {
      const roads = leg.axis === 'v' ? city.streets : city.avenues;
      const pos = leg.axis === 'v' ? car.y : car.x;
      const next = nextRoad(roads, pos, leg.dir);
      car.leg = {
        ...leg,
        end: next === null ? roadEnd(leg.axis, leg.dir) : next,
      };
    }
    return true;
  }

  /** Put one new AI car on the grid; `atEdge` starts it at a road's end, otherwise mid-road. */
  function spawnCar(atEdge) {
    const vertical = random() < 0.5;
    const dir = random() < 0.5 ? -1 : 1;
    const typeKey = pick(random, ['sedan', 'sedan', 'sedan', 'taxi', 'pickup', 'sport']);
    const type = CAR_TYPES[typeKey];
    let x;
    let y;
    let angle;
    let leg;
    if (vertical) {
      const avenue = pick(random, city.avenues);
      if (atEdge) {
        y = dir < 0 ? CITY.height - 60 : 60;
      } else {
        y = range(random, 140, CITY.height - 140);
      }
      x = avenue + (dir < 0 ? LANE : -LANE);
      angle = dir < 0 ? -Math.PI / 2 : Math.PI / 2;
      leg = firstLeg('v', avenue, dir, x, y);
    } else {
      const street = pick(random, city.streets);
      if (atEdge) {
        x = dir > 0 ? 80 : CITY.boardwalkX - 80;
      } else {
        x = range(random, 140, CITY.boardwalkX - 140);
      }
      y = street + (dir > 0 ? LANE : -LANE);
      angle = dir > 0 ? 0 : Math.PI;
      leg = firstLeg('h', street, dir, x, y);
    }
    const car = createVehicle(typeKey, x, y, angle);
    car.driver = 'ai';
    car.cruise = type.topSpeed * (0.36 + random() * 0.08);
    car.leg = leg;
    cars.push(car);
    vehicles.push(car);
    return car;
  }

  /** Remove a car from the AI list (the player just stole it, or it left). */
  function removeCar(car) {
    const index = cars.indexOf(car);
    if (index !== -1) cars.splice(index, 1);
  }

  /** Drop a car from both the AI list and the shared vehicle list. */
  function despawnCar(car) {
    removeCar(car);
    const index = vehicles.indexOf(car);
    if (index !== -1) vehicles.splice(index, 1);
  }

  /** The closest vehicle ahead of `car` in its lane, if any. */
  function carAhead(car) {
    const fx = Math.cos(car.angle);
    const fy = Math.sin(car.angle);
    let best = null;
    let bestForward = LOOK_AHEAD;
    for (const other of vehicles) {
      if (other === car) continue;
      const dx = other.x - car.x;
      const dy = other.y - car.y;
      const forward = dx * fx + dy * fy;
      if (forward < 10 || forward > bestForward) continue;
      const lateral = Math.abs(dx * -fy + dy * fx);
      if (lateral > 36) continue;
      best = other;
      bestForward = forward;
    }
    return best === null ? null : { vehicle: best, distance: bestForward };
  }

  /**
   * True when a car on the crossing road is inside this intersection and
   * closer to its centre than we are: it has the right of way, so we wait.
   */
  function mustYield(car) {
    const leg = car.leg;
    const target = legTarget(leg);
    const myDist = Math.hypot(target.x - car.x, target.y - car.y);
    if (myDist > 120) return false;
    for (const other of vehicles) {
      if (other === car) continue;
      const otherDist = Math.hypot(target.x - other.x, target.y - other.y);
      if (otherDist < 85 && otherDist < myDist - 10) return true;
    }
    return false;
  }

  /** One fixed step for every AI car. */
  function update(dt, isBlocked) {
    // Keep the streets full: one replacement per step at most.
    if (cars.length < target) spawnCar(true);
    for (let i = cars.length - 1; i >= 0; i -= 1) {
      const car = cars[i];
      const targetPoint = legTarget(car.leg);
      const distToEnd = Math.hypot(targetPoint.x - car.x, targetPoint.y - car.y);
      if (distToEnd < LEG_END_DIST) {
        if (!advanceLeg(car)) {
          despawnCar(car);
          continue;
        }
      }
      const point = legTarget(car.leg);
      const desired = Math.atan2(point.y - car.y, point.x - car.x);
      const steer = clamp(angleDiff(desired, car.angle) * 2.5, -1, 1);

      let targetSpeed = car.cruise;
      const ahead = carAhead(car);
      if (ahead !== null) {
        if (ahead.distance < 58) targetSpeed = 0;
        else targetSpeed = Math.min(targetSpeed, (ahead.distance - 58) * 2.2);
      }
      if (mustYield(car)) targetSpeed = 0;

      const throttle = clamp((targetSpeed - car.speed) / 140, -1, 1);
      driveVehicle(car, dt, throttle, steer, isBlocked);
    }
  }

  // Fill the streets at boot, mid-road so the first frame already has traffic.
  for (let i = 0; i < target; i += 1) spawnCar(false);

  return {
    /** The AI cars (a live subset of the shared vehicle list). */
    cars,
    update,
    removeCar,
    despawnCar,
    /** How many AI cars the streets should hold; update() tops it up. */
    setDensity(count) {
      target = Math.max(0, Math.floor(count));
    },
    get target() {
      return target;
    },
  };
}
