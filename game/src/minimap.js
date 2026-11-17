// Minimap: a small live map of Marisol Bay in the corner of the screen —
// roads, sea, the player arrow, flashing cruiser dots, job and fare
// markers, nearby sun tokens and the hideout. M toggles it. It draws in
// screen space from the same world data the renderer already has, so it
// never needs its own copy of the city.
import { CITY, PALETTE, VIEW } from './config.js';

const MAP_W = 220;
const MAP_H = 160;
const MARGIN = 16;

export function createMinimap() {
  let visible = true;

  const minimap = {
    get visible() {
      return visible;
    },
    toggle() {
      visible = !visible;
    },
  };

  /**
   * Draw the map in screen (VIEW) coordinates. `data` is the live world:
   * { world, player, policeCars, markers, tokens, hideout }. Everything
   * is drawn from the city rect, scaled to fit the panel.
   */
  function draw(context, data) {
    const { world, player } = data;
    const { city } = world;
    const x0 = VIEW.width - MAP_W - MARGIN;
    const y0 = VIEW.height - MAP_H - MARGIN;
    const scale = Math.min(MAP_W / CITY.width, MAP_H / CITY.height);
    const mapW = CITY.width * scale;
    const mapH = CITY.height * scale;
    const ox = x0 + (MAP_W - mapW) / 2;
    const oy = y0 + (MAP_H - mapH) / 2;
    const toMapX = (x) => ox + x * scale;
    const toMapY = (y) => oy + y * scale;

    // Panel: dark backing and a thin border, so the map reads over any ground.
    context.fillStyle = 'rgba(20, 12, 8, 0.72)';
    context.fillRect(x0, y0, MAP_W, MAP_H);
    context.strokeStyle = 'rgba(245, 234, 214, 0.5)';
    context.lineWidth = 2;
    context.strokeRect(x0, y0, MAP_W, MAP_H);
    context.save();
    context.beginPath();
    context.rect(x0, y0, MAP_W, MAP_H);
    context.clip();

    // Sea and sand on the east edge, then the city ground.
    context.fillStyle = PALETTE.seaShallow;
    context.fillRect(toMapX(city.seaX), oy, mapW - (city.seaX - 0) * scale + 2, mapH);
    context.fillStyle = PALETTE.sand;
    context.fillRect(toMapX(city.sandX), oy, (city.seaX - city.sandX) * scale, mapH);
    // Roads: avenues and streets as pale lines on the dark ground.
    context.strokeStyle = 'rgba(232, 224, 204, 0.75)';
    context.lineWidth = 2;
    context.beginPath();
    for (const ax of city.avenues) {
      context.moveTo(toMapX(ax), oy);
      context.lineTo(toMapX(ax), oy + mapH);
    }
    for (const sy of city.streets) {
      context.moveTo(ox, toMapY(sy));
      context.lineTo(ox + mapW, toMapY(sy));
    }
    context.stroke();

    // The hideout: a green ring while it is the place to lose the heat.
    const hideout = data.hideout ?? null;
    if (hideout !== null) {
      context.strokeStyle = '#58b368';
      context.lineWidth = 2;
      context.beginPath();
      context.arc(toMapX(hideout.x), toMapY(hideout.y), 6, 0, Math.PI * 2);
      context.stroke();
    }

    // Job, fare and race markers: gold and pink dots, big ones ringed.
    for (const marker of data.markers ?? []) {
      context.fillStyle = marker.color;
      context.beginPath();
      context.arc(toMapX(marker.x), toMapY(marker.y), marker.big ? 4.5 : 3, 0, Math.PI * 2);
      context.fill();
      if (marker.big) {
        context.strokeStyle = marker.color;
        context.lineWidth = 1.5;
        context.beginPath();
        context.arc(toMapX(marker.x), toMapY(marker.y), 7, 0, Math.PI * 2);
        context.stroke();
      }
    }

    // Sun tokens nearby only: the whole city's thirty would swamp the map.
    for (const token of data.tokens ?? []) {
      const dx = token.x - player.x;
      const dy = token.y - player.y;
      if (dx * dx + dy * dy > 700 * 700) continue;
      context.fillStyle = '#f2c94c';
      context.beginPath();
      context.arc(toMapX(token.x), toMapY(token.y), 2, 0, Math.PI * 2);
      context.fill();
    }

    // Cruisers: red and blue by the light-bar phase, blinking twice a second.
    for (const car of data.policeCars ?? []) {
      const phase = (car.lightPhase ?? 0) % 1;
      context.fillStyle = phase < 0.5 ? PALETTE.policeRed : PALETTE.policeBlue;
      context.beginPath();
      context.arc(toMapX(car.x), toMapY(car.y), 3.5, 0, Math.PI * 2);
      context.fill();
    }

    // Jax: a white arrow pointing where he (or his car) faces.
    const angle = player.vehicle ? player.vehicle.angle : player.facing;
    const px = toMapX(player.x);
    const py = toMapY(player.y);
    context.save();
    context.translate(px, py);
    context.rotate(angle);
    context.fillStyle = '#ffffff';
    context.beginPath();
    context.moveTo(9, 0);
    context.lineTo(-6, -5.5);
    context.lineTo(-6, 5.5);
    context.closePath();
    context.fill();
    context.restore();

    context.restore();

    // North, top centre of the panel.
    context.font = `bold 12px ${'system-ui, sans-serif'}`;
    context.textAlign = 'center';
    context.textBaseline = 'top';
    context.lineWidth = 3;
    context.strokeStyle = 'rgba(20, 12, 8, 0.8)';
    context.strokeText('N', x0 + MAP_W / 2, y0 + 4);
    context.fillStyle = PALETTE.text;
    context.fillText('N', x0 + MAP_W / 2, y0 + 4);
  }

  minimap.draw = draw;
  return minimap;
}
