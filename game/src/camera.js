// A camera that follows one point in the world: the view is a fixed 1280x720
// window of the city, centred on its target as far as the map edges allow,
// gliding instead of snapping so turns and street crossings feel smooth.
import { CAMERA, CITY, VIEW } from './config.js';

export function createCamera() {
  const camera = { x: 0, y: 0, width: VIEW.width, height: VIEW.height };

  /** Snap the view so (x, y) is centred (used at boot and after teleports). */
  function snapTo(x, y) {
    camera.x = Math.min(Math.max(x - VIEW.width / 2, 0), CITY.width - VIEW.width);
    camera.y = Math.min(Math.max(y - VIEW.height / 2, 0), CITY.height - VIEW.height);
  }

  /** Glide toward centring (x, y), one fixed step at a time. */
  function update(dt, x, y) {
    const targetX = Math.min(Math.max(x - VIEW.width / 2, 0), CITY.width - VIEW.width);
    const targetY = Math.min(Math.max(y - VIEW.height / 2, 0), CITY.height - VIEW.height);
    const rate = 1 - Math.exp(-CAMERA.followRate * dt);
    camera.x += (targetX - camera.x) * rate;
    camera.y += (targetY - camera.y) * rate;
  }

  return { camera, snapTo, update };
}
