// Jax Marlowe on foot: position, facing and walking. Movement is resolved one
// axis at a time against the world's collision query, so sliding along a
// building wall works and a diagonal into a corner never tunnels through it.
import { PLAYER } from './config.js';

export function createPlayer(spawn) {
  const player = {
    name: PLAYER.name,
    x: spawn.x,
    y: spawn.y,
    radius: PLAYER.radius,
    /** Facing angle in radians; 0 is east, -PI/2 is north. */
    facing: -Math.PI / 2,
    moving: false,
    /** Cash on hand: pedestrians drop it (B3), missions and fares pay it (B4), a bust fines it (B3). */
    cash: 0,
    /** The vehicle Jax is driving, or null while on foot (B2). */
    vehicle: null,
  };

  /** One fixed step: `move` is a normalised {x, y} vector from input. */
  function update(dt, move, isBlocked) {
    player.moving = move.x !== 0 || move.y !== 0;
    if (!player.moving) return;
    const speed = PLAYER.walkSpeed * dt;
    const nextX = player.x + move.x * speed;
    if (!isBlocked(nextX, player.y, player.radius)) player.x = nextX;
    const nextY = player.y + move.y * speed;
    if (!isBlocked(player.x, nextY, player.radius)) player.y = nextY;
    const targetFacing = Math.atan2(move.y, move.x);
    let diff = targetFacing - player.facing;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    player.facing += diff * Math.min(1, PLAYER.turnRate * dt);
  }

  return { player, update };
}
