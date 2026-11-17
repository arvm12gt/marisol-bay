// Vehicles: four original car models and the arcade driving physics every
// driver shares — the player (B2), the traffic AI (B2) and the police (B3).
// A car is two collision circles (front and rear axle) so its corners never
// tunnel through a building, and its speed, angle and type are the whole of
// its state: the HUD, the traffic AI and later segments all read them.
import { GRID } from './config.js';
import { pick, range } from './random.js';

/** The four models of Marisol Bay, all original names. */
export const CAR_TYPES = {
  sedan: {
    key: 'sedan',
    name: 'Coral Sedan',
    topSpeed: 520,
    accel: 300,
    brake: 620,
    /** Radians per second of steering at full lock and low speed. */
    turn: 2.9,
    length: 64,
    width: 32,
    colors: ['#c94f43', '#4f7ec9', '#e8e0cc', '#7a8a99', '#3f6f5a'],
  },
  taxi: {
    key: 'taxi',
    name: 'Bay Cab',
    topSpeed: 480,
    accel: 270,
    brake: 620,
    turn: 3.1,
    length: 64,
    width: 32,
    colors: ['#f2c94c'],
  },
  pickup: {
    key: 'pickup',
    name: 'Dune Pickup',
    topSpeed: 460,
    accel: 240,
    brake: 560,
    turn: 2.4,
    length: 76,
    width: 34,
    colors: ['#8a5a3a', '#5a6e8a', '#6e8a4f', '#a03a3a'],
  },
  sport: {
    key: 'sport',
    name: 'Sunset GT',
    topSpeed: 660,
    accel: 420,
    brake: 700,
    turn: 3.5,
    length: 68,
    width: 30,
    colors: ['#e84a7a', '#2a2a33', '#f2f2f2', '#ff7a2a'],
  },
};

export const CAR_TYPE_KEYS = Object.keys(CAR_TYPES);

/** A vehicle's turning circles: the probe radius and how far each probe sits from the centre. */
function probes(vehicle) {
  const half = vehicle.type.length / 2 - vehicle.type.width / 2;
  return { half, radius: vehicle.type.width / 2 + 2 };
}

let nextId = 1;

/** One car at (x, y) facing `angle` (0 is east, -PI/2 is north). */
export function createVehicle(typeKey, x, y, angle, color) {
  const type = CAR_TYPES[typeKey] ?? CAR_TYPES.sedan;
  return {
    id: nextId++,
    type,
    x,
    y,
    angle,
    /** Signed speed in world units per second; negative is reversing. */
    speed: 0,
    color: color ?? type.colors[Math.floor(Math.random() * type.colors.length)],
    /** 'player' | 'ai' | null (parked, nobody inside). */
    driver: null,
    /** A parked car never moves on its own. */
    parked: false,
  };
}

/**
 * One fixed step of arcade driving. `throttle` is -1..1 (gas / brake and
 * reverse), `steer` is -1..1 (left / right). Movement is resolved one axis
 * at a time against the world's collision query, so a car slides along a
 * building wall instead of sticking to it; a blocked axis costs speed.
 */
export function driveVehicle(vehicle, dt, throttle, steer, isBlocked) {
  const type = vehicle.type;
  if (throttle > 0) {
    vehicle.speed += type.accel * throttle * dt;
  } else if (throttle < 0) {
    if (vehicle.speed > 5) vehicle.speed += type.brake * throttle * dt;
    else vehicle.speed += type.accel * 0.55 * throttle * dt;
  }
  // Drag and rolling resistance: a car with no input coasts to a stop.
  vehicle.speed -= vehicle.speed * 0.5 * dt;
  vehicle.speed -= Math.sign(vehicle.speed) * 14 * dt;
  if (vehicle.speed > 0 && vehicle.speed < 2) vehicle.speed = 0;
  if (vehicle.speed < 0 && vehicle.speed > -2) vehicle.speed = 0;
  const reverseMax = 100;
  if (vehicle.speed > type.topSpeed) vehicle.speed = type.topSpeed;
  if (vehicle.speed < -reverseMax) vehicle.speed = -reverseMax;

  // Steering bites harder at low speed and fades at the top end; reversing
  // flips it, as it should.
  const grip = Math.min(1, Math.abs(vehicle.speed) / 150);
  const highSpeed = 1 - 0.45 * Math.min(1, Math.abs(vehicle.speed) / type.topSpeed);
  vehicle.angle += type.turn * steer * grip * highSpeed * Math.sign(vehicle.speed || 1) * dt;

  const fx = Math.cos(vehicle.angle);
  const fy = Math.sin(vehicle.angle);
  const { half, radius } = probes(vehicle);
  const dx = fx * vehicle.speed * dt;
  const dy = fy * vehicle.speed * dt;

  function axleBlocked(nx, ny) {
    return (
      isBlocked(nx + fx * half, ny + fy * half, radius) ||
      isBlocked(nx - fx * half, ny - fy * half, radius)
    );
  }

  let bumped = false;
  if (!axleBlocked(vehicle.x + dx, vehicle.y)) vehicle.x += dx;
  else bumped = true;
  if (!axleBlocked(vehicle.x, vehicle.y + dy)) vehicle.y += dy;
  else bumped = true;
  if (bumped) {
    vehicle.speed *= 0.35;
    if (Math.abs(vehicle.speed) < 30) vehicle.speed = 0;
  }
}

/**
 * Parked cars along the kerbs of the city's avenues and streets, clear of
 * intersections so traffic can still pass. Each one is a car a player can
 * walk up to and steal (B2) or a cab a fare can hail (B4).
 */
export function spawnParkedCars(world, random, count) {
  const { city } = world;
  const cars = [];
  const roadHalf = GRID.roadWidth / 2;
  const parkOffset = roadHalf - 19;
  let tries = 0;
  while (cars.length < count && tries < count * 40) {
    tries += 1;
    const vertical = random() < 0.5;
    const side = random() < 0.5 ? -1 : 1;
    let x;
    let y;
    let angle;
    if (vertical) {
      const avenue = pick(random, city.avenues);
      y = range(random, 120, city.height - 120);
      // Keep clear of the intersections on this avenue.
      if (city.streets.some((sy) => Math.abs(y - sy) < 110)) continue;
      x = avenue + side * parkOffset;
      angle = side < 0 ? -Math.PI / 2 : Math.PI / 2;
    } else {
      const street = pick(random, city.streets);
      x = range(random, 120, city.boardwalkX - 120);
      if (city.avenues.some((ax) => Math.abs(x - ax) < 110)) continue;
      y = street + side * parkOffset;
      angle = side < 0 ? 0 : Math.PI;
    }
    if (world.isBlocked(x, y, 22)) continue;
    if (cars.some((car) => (car.x - x) ** 2 + (car.y - y) ** 2 < 120 * 120)) continue;
    // One taxi in five, so a cab is usually in sight; the rest are mixed.
    const typeKey = random() < 0.2 ? 'taxi' : pick(random, ['sedan', 'sedan', 'pickup', 'sport']);
    const car = createVehicle(typeKey, x, y, angle);
    car.parked = true;
    cars.push(car);
  }
  return cars;
}

/** The nearest vehicle within `maxDist` of (x, y), or null. */
export function nearestVehicle(vehicles, x, y, maxDist) {
  let best = null;
  let bestDist = maxDist;
  for (const vehicle of vehicles) {
    const dx = vehicle.x - x;
    const dy = vehicle.y - y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < bestDist) {
      best = vehicle;
      bestDist = dist;
    }
  }
  return best;
}

/** The HUD line for a driven car: its name and a speed in miles per hour. */
export function vehicleLabel(vehicle) {
  const mph = Math.round(Math.abs(vehicle.speed) * 0.12);
  return `${vehicle.type.name} · ${mph} mph`;
}
