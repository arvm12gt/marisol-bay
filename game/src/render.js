// Drawing only: the city, the player and the current screen in, pixels out.
// The camera shows a 1280x720 window of the world, scaled to fit the browser
// window and centred. Only what the camera sees is drawn. Flat shapes and
// canvas text; the dusk wash is one translucent fill over the finished world.
import { CITY, FONT, GRID, PALETTE, VIEW } from './config.js';
import { vehicleLabel } from './vehicles.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_BUSTED = 'busted';
/** B4: the job list, a job briefing, the end of a job, and the controls. */
export const SCREEN_MISSIONS = 'missions';
export const SCREEN_BRIEFING = 'briefing';
export const SCREEN_PASSED = 'passed';
export const SCREEN_FAILED = 'failed';
export const SCREEN_HOWTO = 'howto';

/** The panel's width; its height grows with its lines: room for the title, the lines and the prompt. */
const PANEL = { width: 640, top: 150, line: 32, bottom: 72 };

function litWindow(litSeed, col, row) {
  // A deterministic lit-or-dark choice per window, from the building's seed.
  const v = Math.sin(litSeed * 127.1 + col * 311.7 + row * 74.7) * 43758.5453;
  return v - Math.floor(v) < 0.45;
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / VIEW.width, height / VIEW.height);
    view.x = (width - VIEW.width * view.scale) / 2;
    view.y = (height - VIEW.height * view.scale) / 2;
  }

  const fonts = new Map();
  function text(value, x, y, size, color, align) {
    if (!fonts.has(size)) fonts.set(size, `${size}px ${FONT}`);
    context.font = fonts.get(size);
    context.fillStyle = color;
    context.textAlign = align;
    context.fillText(value, x, y);
  }

  /**
   * The world rectangle actually visible on screen. The camera frames a fixed
   * 1280x720 window of the city, but a wider or taller browser window shows
   * more of the world around it (the scale is set by the smaller dimension),
   * so the visible rect — not the camera's 1280x720 — decides what to draw.
   */
  function visibleRect(camera) {
    const worldW = canvas.width / view.scale;
    const worldH = canvas.height / view.scale;
    return {
      x: camera.x + camera.width / 2 - worldW / 2,
      y: camera.y + camera.height / 2 - worldH / 2,
      width: worldW,
      height: worldH,
    };
  }

  function inView(rect, x, y, w, h) {
    return (
      x + w >= rect.x - 40 && x <= rect.x + rect.width + 40 &&
      y + h >= rect.y - 40 && y <= rect.y + rect.height + 40
    );
  }

  function drawGround(rect, world) {
    const { city } = world;
    // Padded by the same margin the culling uses, so a building drawn just
    // past the view edge still stands on ground, never on the backdrop.
    const pad = 64;
    const x0 = rect.x - pad;
    const y0 = rect.y - pad;
    const w = rect.width + pad * 2;
    const h = rect.height + pad * 2;
    // City ground first, then the eastern strip over it.
    context.fillStyle = PALETTE.ground;
    context.fillRect(x0, y0, w, h);
    context.fillStyle = PALETTE.boardwalk;
    context.fillRect(city.boardwalkX, y0, city.sandX - city.boardwalkX, h);
    context.fillStyle = PALETTE.sand;
    context.fillRect(city.sandX, y0, city.seaX - city.sandX, h);
    // Wet sand near the waterline.
    context.fillStyle = PALETTE.sandWet;
    context.fillRect(city.seaX - 90, y0, 90, h);
    // Sea: two bands, deep further east, with a foam line at the shore.
    context.fillStyle = PALETTE.seaShallow;
    context.fillRect(city.seaX, y0, 260, h);
    context.fillStyle = PALETTE.seaDeep;
    context.fillRect(city.seaX + 260, y0, w, h);
    context.fillStyle = 'rgba(245, 234, 214, 0.55)';
    context.fillRect(city.seaX - 4, y0, 8, h);
  }

  function drawRoads(rect, world) {
    const { city } = world;
    const half = GRID.roadWidth / 2;
    const sw = GRID.sidewalk;
    const x1 = rect.x + rect.width;
    const y1 = rect.y + rect.height;
    // Sidewalks: pale strips flanking every road.
    context.fillStyle = PALETTE.sidewalk;
    for (const ax of city.avenues) {
      if (ax + half + sw < rect.x || ax - half - sw > x1) continue;
      context.fillRect(ax - half - sw, rect.y, sw, rect.height);
      context.fillRect(ax + half, rect.y, sw, rect.height);
    }
    for (const sy of city.streets) {
      if (sy + half + sw < rect.y || sy - half - sw > y1) continue;
      context.fillRect(rect.x, sy - half - sw, rect.width, sw);
      context.fillRect(rect.x, sy + half, rect.width, sw);
    }
    // Asphalt.
    context.fillStyle = PALETTE.road;
    for (const ax of city.avenues) {
      if (ax + half < rect.x || ax - half > x1) continue;
      context.fillRect(ax - half, rect.y, GRID.roadWidth, rect.height);
    }
    for (const sy of city.streets) {
      if (sy + half < rect.y || sy - half > y1) continue;
      context.fillRect(rect.x, sy - half, rect.width, GRID.roadWidth);
    }
    // Centre dashes, skipping intersections.
    context.fillStyle = PALETTE.laneDash;
    const dash = 34;
    const gap = 30;
    for (const ax of city.avenues) {
      if (ax + half < rect.x || ax - half > x1) continue;
      for (let y = rect.y - (rect.y % (dash + gap)); y < y1; y += dash + gap) {
        if (city.streets.some((sy) => Math.abs(y + dash / 2 - sy) < half + dash)) continue;
        context.fillRect(ax - 3, y, 6, dash);
      }
    }
    for (const sy of city.streets) {
      if (sy + half < rect.y || sy - half > y1) continue;
      for (let x = rect.x - (rect.x % (dash + gap)); x < x1; x += dash + gap) {
        if (city.avenues.some((ax) => Math.abs(x + dash / 2 - ax) < half + dash)) continue;
        context.fillRect(x, sy - 3, dash, 6);
      }
    }
    // Crosswalks at every intersection.
    context.fillStyle = PALETTE.crosswalk;
    for (const ax of city.avenues) {
      for (const sy of city.streets) {
        if (!inView(rect, ax - half, sy - half, GRID.roadWidth, GRID.roadWidth)) continue;
        for (let i = -2; i <= 2; i += 1) {
          context.fillRect(ax - half + 8, sy + i * 18 - 5, 18, 10);
          context.fillRect(ax + half - 26, sy + i * 18 - 5, 18, 10);
          context.fillRect(ax + i * 18 - 5, sy - half + 8, 10, 18);
          context.fillRect(ax + i * 18 - 5, sy + half - 26, 10, 18);
        }
      }
    }
  }

  function drawBoardwalk(rect, world) {
    const { city } = world;
    if (city.boardwalkX > rect.x + rect.width || city.sandX < rect.x) return;
    // Plank lines down the boardwalk.
    context.strokeStyle = PALETTE.boardwalkPlank;
    context.lineWidth = 2;
    context.beginPath();
    for (let y = rect.y - (rect.y % 26); y < rect.y + rect.height; y += 26) {
      context.moveTo(city.boardwalkX, y);
      context.lineTo(city.sandX, y);
    }
    context.stroke();
  }

  function drawBuildings(rect, world) {
    const { city } = world;
    for (const b of city.buildings) {
      if (!inView(rect, b.x, b.y, b.w, b.h)) continue;
      // Soft shadow, offset south-east as the sun sets in the west.
      context.fillStyle = 'rgba(40, 20, 10, 0.25)';
      context.fillRect(b.x + 8, b.y + 10, b.w, b.h);
      context.fillStyle = b.color;
      context.fillRect(b.x, b.y, b.w, b.h);
      context.strokeStyle = PALETTE.roof;
      context.lineWidth = 4;
      context.strokeRect(b.x + 2, b.y + 2, b.w - 4, b.h - 4);
      // Windows.
      const cellW = b.w / b.cols;
      const cellH = b.h / b.rows;
      for (let col = 0; col < b.cols; col += 1) {
        for (let row = 0; row < b.rows; row += 1) {
          context.fillStyle = litWindow(b.litSeed, col, row) ? PALETTE.windowLit : PALETTE.windowDark;
          context.fillRect(b.x + col * cellW + cellW * 0.28, b.y + row * cellH + cellH * 0.3, cellW * 0.44, cellH * 0.4);
        }
      }
    }
  }

  function drawPalms(rect, world) {
    const { city } = world;
    for (const p of city.palms) {
      if (!inView(rect, p.x - 30, p.y - 30, 60, 60)) continue;
      context.fillStyle = 'rgba(40, 20, 10, 0.25)';
      context.beginPath();
      context.ellipse(p.x + 6, p.y + 8, 16, 7, 0, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = PALETTE.palmTrunk;
      context.lineWidth = 5;
      context.beginPath();
      context.moveTo(p.x, p.y + 10);
      context.lineTo(p.x + 3, p.y - 12);
      context.stroke();
      context.fillStyle = PALETTE.palmFrond;
      for (let i = 0; i < 6; i += 1) {
        const angle = (i / 6) * Math.PI * 2 + 0.4;
        context.beginPath();
        context.ellipse(
          p.x + 3 + Math.cos(angle) * 13,
          p.y - 12 + Math.sin(angle) * 10,
          13,
          5,
          angle,
          0,
          Math.PI * 2,
        );
        context.fill();
      }
    }
  }

  function drawVehicles(rect, vehicles) {
    for (const vehicle of vehicles) {
      const type = vehicle.type;
      const halfLen = type.length / 2;
      const halfWid = type.width / 2;
      if (!inView(rect, vehicle.x - halfLen - 10, vehicle.y - halfLen - 10, type.length + 20, type.length + 20)) continue;
      // Shadow, then the body turned to the car's heading.
      context.fillStyle = PALETTE.playerShadow;
      context.beginPath();
      context.ellipse(vehicle.x + 5, vehicle.y + 7, halfLen, halfWid, vehicle.angle, 0, Math.PI * 2);
      context.fill();
      context.save();
      context.translate(vehicle.x, vehicle.y);
      context.rotate(vehicle.angle);
      context.fillStyle = vehicle.color;
      context.fillRect(-halfLen, -halfWid, type.length, type.width);
      context.strokeStyle = 'rgba(20, 12, 8, 0.55)';
      context.lineWidth = 2;
      context.strokeRect(-halfLen, -halfWid, type.length, type.width);
      // Windshield and rear window.
      context.fillStyle = '#20262e';
      context.fillRect(halfLen * 0.28, -halfWid + 4, halfLen * 0.34, type.width - 8);
      context.fillRect(-halfLen * 0.72, -halfWid + 4, halfLen * 0.3, type.width - 8);
      if (type.key === 'pickup') {
        // Open bed behind the cab.
        context.fillStyle = 'rgba(20, 12, 8, 0.35)';
        context.fillRect(-halfLen + 4, -halfWid + 4, halfLen * 0.78, type.width - 8);
      } else {
        // Roof.
        context.fillStyle = 'rgba(255, 255, 255, 0.16)';
        context.fillRect(-halfLen * 0.2, -halfWid + 4, halfLen * 0.44, type.width - 8);
      }
      if (type.key === 'taxi') {
        // Chequered band and a roof sign: this is a cab, not a plain sedan.
        context.fillStyle = '#20262e';
        for (let i = 0; i < 6; i += 1) {
          if (i % 2 === 0) context.fillRect(-halfLen + 6 + i * 9, -halfWid, 9, 5);
          else context.fillRect(-halfLen + 6 + i * 9, halfWid - 5, 9, 5);
        }
        context.fillStyle = '#f2c94c';
        context.fillRect(-8, -5, 16, 10);
        context.fillStyle = '#20262e';
        context.font = 'bold 7px sans-serif';
        context.textAlign = 'center';
        context.fillText('TAXI', 0, 2.5);
      }
      if (type.key === 'sport') {
        // A racing stripe down the middle.
        context.fillStyle = 'rgba(255, 255, 255, 0.35)';
        context.fillRect(-halfLen, -2.5, type.length, 5);
      }
      if (vehicle.police) {
        // White doors and the roof light bar: red on one side, blue on the
        // other, alternating with the cruiser's light phase.
        context.fillStyle = PALETTE.policeWhite;
        context.fillRect(-halfLen * 0.05, -halfWid + 3, halfLen * 0.3, type.width - 6);
        const phase = (vehicle.lightPhase ?? 0) % 1;
        const redOn = phase < 0.5;
        context.fillStyle = '#20262e';
        context.fillRect(-14, -6, 28, 12);
        context.globalAlpha = redOn ? 1 : 0.25;
        context.fillStyle = PALETTE.policeRed;
        context.fillRect(-13, -5, 12, 10);
        context.globalAlpha = redOn ? 0.25 : 1;
        context.fillStyle = PALETTE.policeBlue;
        context.fillRect(1, -5, 12, 10);
        context.globalAlpha = 1;
      }
      // Headlights ahead, taillights behind.
      context.fillStyle = '#ffe9a8';
      context.fillRect(halfLen - 2, -halfWid + 4, 3, 5);
      context.fillRect(halfLen - 2, halfWid - 9, 3, 5);
      context.fillStyle = '#c93a2e';
      context.fillRect(-halfLen - 1, -halfWid + 4, 3, 5);
      context.fillRect(-halfLen - 1, halfWid - 9, 3, 5);
      context.restore();
    }
  }

  function drawPedestrians(rect, pedestrians) {
    for (const ped of pedestrians) {
      if (!inView(rect, ped.x - 20, ped.y - 20, 40, 40)) continue;
      context.fillStyle = PALETTE.playerShadow;
      context.beginPath();
      context.ellipse(ped.x + 3, ped.y + 5, 10, 5, 0, 0, Math.PI * 2);
      context.fill();
      if (ped.state === 'down') {
        // Lying flat: a long shape and a head beside it.
        context.save();
        context.translate(ped.x, ped.y);
        context.rotate(ped.angle);
        context.fillStyle = ped.shirt;
        context.beginPath();
        context.ellipse(0, 0, 13, 6, 0, 0, Math.PI * 2);
        context.fill();
        context.restore();
        context.fillStyle = ped.skin;
        context.beginPath();
        context.arc(ped.x + Math.cos(ped.angle) * 15, ped.y + Math.sin(ped.angle) * 15, 5, 0, Math.PI * 2);
        context.fill();
        continue;
      }
      // Two feet that step with the walk cycle, then body and head.
      const step = Math.sin(ped.phase) * 4;
      const px = Math.cos(ped.angle);
      const py = Math.sin(ped.angle);
      const nx = -py;
      const ny = px;
      context.fillStyle = ped.pants;
      context.beginPath();
      context.arc(ped.x + px * step + nx * 4, ped.y + py * step + ny * 4, 3, 0, Math.PI * 2);
      context.arc(ped.x - px * step - nx * 4, ped.y - py * step - ny * 4, 3, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = ped.shirt;
      context.beginPath();
      context.arc(ped.x, ped.y, 9, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = ped.skin;
      context.beginPath();
      context.arc(ped.x + px * 2, ped.y + py * 2, 5, 0, Math.PI * 2);
      context.fill();
    }
  }

  function drawPlayer(rect, player) {
    // In a car Jax is the car: draw the vehicle, not the walker.
    if (player.vehicle) return;
    if (!inView(rect, player.x - 30, player.y - 30, 60, 60)) return;
    // Shadow, then body, head and a nose tick showing which way Jax faces.
    context.fillStyle = PALETTE.playerShadow;
    context.beginPath();
    context.ellipse(player.x, player.y + 10, 15, 7, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = PALETTE.playerJacket;
    context.beginPath();
    context.arc(player.x, player.y, player.radius, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = PALETTE.playerSkin;
    context.beginPath();
    context.arc(
      player.x + Math.cos(player.facing) * 4,
      player.y + Math.sin(player.facing) * 4,
      player.radius * 0.55,
      0,
      Math.PI * 2,
    );
    context.fill();
    context.strokeStyle = PALETTE.playerPants;
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(player.x + Math.cos(player.facing) * (player.radius - 2), player.y + Math.sin(player.facing) * (player.radius - 2));
    context.lineTo(player.x + Math.cos(player.facing) * (player.radius + 7), player.y + Math.sin(player.facing) * (player.radius + 7));
    context.stroke();
  }

  function drawHud(extras) {
    // Screen space: reset the transform first (the caller draws the HUD after the world).
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    context.textBaseline = 'top';
    text('MARISOL BAY', 24, 18, 26, PALETTE.text, 'left');
    text(`$${extras.cash ?? 0}`, 24, 50, 22, PALETTE.accent, 'left');
    // Wanted stars, top right: gold for the heat Jax holds, dim for the rest.
    const stars = extras.stars ?? 0;
    let starLine = '';
    for (let i = 0; i < 5; i += 1) starLine += i < stars ? '★' : '☆';
    text(starLine, VIEW.width - 24, 16, 26, stars > 0 ? PALETTE.wantedStar : PALETTE.wantedStarEmpty, 'right');
    if (extras.vehicle) {
      text(vehicleLabel(extras.vehicle), 24, 78, 20, PALETTE.text, 'left');
      text('WASD drive · E exit car · P pause', VIEW.width - 24, 50, 18, PALETTE.muted, 'right');
    } else {
      text('WASD / arrows to walk · E steal car · P pause', VIEW.width - 24, 50, 18, PALETTE.muted, 'right');
      // On foot, the weapon line: fists, or the pistol with its ammunition.
      if (extras.weapon === 'pistol') {
        text(`PISTOL ${extras.mag ?? 0}/${extras.reserve ?? 0} · R reload · 1 fists · 2 pistol`, 24, 78, 20, PALETTE.text, 'left');
      } else if (extras.weapon === 'fists') {
        text('FISTS · Space punch · 2 pistol', 24, 78, 20, PALETTE.text, 'left');
      }
    }
    // Bust meter: a cruiser sitting on a slow Jax fills it toward BUSTED.
    if ((extras.bust ?? 0) > 0) {
      const barW = 220;
      const barX = (VIEW.width - barW) / 2;
      const barY = 92;
      text('POLICE CLOSING IN', VIEW.width / 2, barY - 26, 18, PALETTE.bustRed, 'center');
      context.fillStyle = 'rgba(20, 12, 8, 0.7)';
      context.fillRect(barX, barY, barW, 14);
      context.fillStyle = PALETTE.bustRed;
      context.fillRect(barX, barY, barW * Math.min(1, extras.bust), 14);
      context.strokeStyle = PALETTE.text;
      context.lineWidth = 2;
      context.strokeRect(barX, barY, barW, 14);
    }
    if (extras.hint) {
      text(extras.hint, VIEW.width / 2, VIEW.height - 44, 20, PALETTE.accent, 'center');
    }
    // The live job: its current objective and the distance to it.
    if (extras.objective) {
      text(extras.objective, 24, 106, 20, PALETTE.accent, 'left');
    }
    // The live side activity: a fare, a race clock, or a recent result.
    if (extras.activity) {
      text(extras.activity, 24, 134, 20, PALETTE.text, 'left');
    }
    // Sun tokens found, top right under the wanted stars.
    if (extras.tokens) {
      text(`☀ ${extras.tokens.collected}/${extras.tokens.total}`, VIEW.width - 24, 78, 20, PALETTE.accent, 'right');
    }
  }

  function drawPanel(title, lines, prompt) {
    const height = PANEL.top + lines.length * PANEL.line + PANEL.bottom;
    const x = (VIEW.width - PANEL.width) / 2;
    const y = (VIEW.height - height) / 2;
    context.fillStyle = PALETTE.panel;
    context.fillRect(x, y, PANEL.width, height);
    context.textBaseline = 'alphabetic';
    text(title, VIEW.width / 2, y + 78, 46, PALETTE.accent, 'center');
    for (let index = 0; index < lines.length; index += 1) {
      text(lines[index], VIEW.width / 2, y + PANEL.top + index * PANEL.line, 20, PALETTE.muted, 'center');
    }
    text(prompt, VIEW.width / 2, y + height - 38, 22, PALETTE.text, 'center');
  }

  const HOWTO_LINES = [
    'WASD or arrow keys — walk and drive.',
    'E — steal a car / get out of one.',
    'Space — punch · Click — aim and shoot the pistol.',
    '1 fists · 2 pistol · R reload.',
    'Drive a cab and fares will find you.',
    'Drive into the pink RACE marker to run the loop.',
    '30 gold sun tokens hide around the bay, $25 each.',
    'Missions pay cash. Finish one job to unlock the next.',
  ];

  /** Objective and fare markers: a pulsing diamond on a beam of light. */
  function drawMarkers(rect, markers) {
    const pulse = 0.65 + 0.35 * Math.sin((performance.now() / 1000) * 4);
    for (const marker of markers) {
      if (!inView(rect, marker.x - 40, marker.y - 160, 80, 200)) continue;
      context.globalAlpha = 0.25 * pulse;
      context.fillStyle = marker.color;
      context.fillRect(marker.x - 3, marker.y - 130, 6, 130);
      context.globalAlpha = pulse;
      const r = marker.big ? 16 : 10;
      context.save();
      context.translate(marker.x, marker.y);
      context.rotate(Math.PI / 4);
      context.fillStyle = marker.color;
      context.fillRect(-r / 2, -r / 2, r, r);
      context.restore();
      context.globalAlpha = 1;
      if (marker.label) {
        text(marker.label, marker.x, marker.y - 34, 16, marker.color, 'center');
      }
    }
  }

  /** Sun tokens still lying out in the world: small gold coins. */
  function drawTokens(rect, tokens) {
    for (const token of tokens) {
      if (!inView(rect, token.x - 16, token.y - 16, 32, 32)) continue;
      context.fillStyle = '#f2c94c';
      context.beginPath();
      context.arc(token.x, token.y, 7, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#fff3c9';
      context.beginPath();
      context.arc(token.x, token.y, 3, 0, Math.PI * 2);
      context.fill();
    }
  }

  /**
   * A menu: a title, an optional blurb, and a list of items the player
   * moves through with W/S or the arrow keys. Returns the item rects in
   * view coordinates, so the main loop can hit-test clicks against them.
   */
  function drawMenu(menu) {
    if (!menu) return null;
    const itemH = 44;
    const gap = 8;
    const blurb = menu.blurb ?? [];
    const width = 640;
    const x = (VIEW.width - width) / 2;
    const height = 130 + blurb.length * 30 + menu.items.length * (itemH + gap) + 64;
    const y = (VIEW.height - height) / 2;
    context.fillStyle = PALETTE.panel;
    context.fillRect(x, y, width, height);
    context.textBaseline = 'alphabetic';
    text(menu.title, VIEW.width / 2, y + 78, 46, PALETTE.accent, 'center');
    for (let i = 0; i < blurb.length; i += 1) {
      text(blurb[i], VIEW.width / 2, y + 120 + i * 30, 20, PALETTE.muted, 'center');
    }
    const rects = [];
    const itemsTop = y + 120 + blurb.length * 30 + 12;
    for (let i = 0; i < menu.items.length; i += 1) {
      const item = menu.items[i];
      const ix = x + 80;
      const iy = itemsTop + i * (itemH + gap);
      const iw = width - 160;
      if (i === menu.selected) {
        context.fillStyle = 'rgba(242, 201, 76, 0.22)';
        context.fillRect(ix, iy, iw, itemH);
        context.strokeStyle = PALETTE.accent;
        context.lineWidth = 2;
        context.strokeRect(ix, iy, iw, itemH);
      }
      text(item.label, VIEW.width / 2, iy + 29, 22, item.disabled ? 'rgba(245, 234, 214, 0.35)' : PALETTE.text, 'center');
      rects.push({ x: ix, y: iy, w: iw, h: itemH, action: item.action, disabled: item.disabled, index: i });
    }
    text(menu.footer ?? '', VIEW.width / 2, y + height - 30, 18, PALETTE.muted, 'center');
    return rects;
  }

  /** Paint one frame: the city through the camera, then the HUD or a panel.
   * `extras` carries the live vehicles, pedestrians, the driven car and any
   * interaction hint; screenshot staging passes the same shape. Menu screens
   * return their item rects for click hit-testing. */
  function draw(world, player, camera, screen, extras = {}) {
    const rect = visibleRect(camera);
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.setTransform(view.scale, 0, 0, view.scale, view.x - camera.x * view.scale, view.y - camera.y * view.scale);
    drawGround(rect, world);
    drawRoads(rect, world);
    drawBoardwalk(rect, world);
    drawBuildings(rect, world);
    drawPalms(rect, world);
    drawVehicles(rect, extras.vehicles ?? []);
    drawPedestrians(rect, extras.pedestrians ?? []);
    drawPlayer(rect, player);
    // Golden-hour wash over the world, before the HUD.
    context.fillStyle = PALETTE.duskTint;
    context.fillRect(rect.x - 64, rect.y - 64, rect.width + 128, rect.height + 128);
    // Particles sit on top of the wash so flashes and glows read clearly.
    if (extras.effects) extras.effects.draw(context, rect);
    if (extras.markers) drawMarkers(rect, extras.markers);
    if (extras.tokensList) drawTokens(rect, extras.tokensList);
    // Crosshair at the mouse while the pistol is out (on foot only).
    if (extras.aim && extras.weapon === 'pistol' && !player.vehicle) {
      const ax = extras.aim.x;
      const ay = extras.aim.y;
      context.strokeStyle = PALETTE.accent;
      context.lineWidth = 2;
      context.beginPath();
      context.arc(ax, ay, 10, 0, Math.PI * 2);
      context.moveTo(ax - 14, ay);
      context.lineTo(ax - 6, ay);
      context.moveTo(ax + 6, ay);
      context.lineTo(ax + 14, ay);
      context.moveTo(ax, ay - 14);
      context.lineTo(ax, ay - 6);
      context.moveTo(ax, ay + 6);
      context.lineTo(ax, ay + 14);
      context.stroke();
    }
    // Screen overlays, in screen space. Menus return their item rects so
    // the main loop can hit-test clicks against them.
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    if (screen === SCREEN_TITLE || screen === SCREEN_MISSIONS || screen === SCREEN_PAUSED) {
      if (screen === SCREEN_PAUSED) drawHud(extras);
      return { menu: drawMenu(extras.menu) };
    }
    if (screen === SCREEN_BRIEFING) {
      const briefing = extras.briefing ?? { title: '', lines: [], prompt: '' };
      drawPanel(briefing.title, briefing.lines, briefing.prompt);
      return {};
    }
    if (screen === SCREEN_PASSED) {
      const panel = extras.endPanel ?? { lines: [] };
      drawPanel('JOB DONE', panel.lines, 'Press Space to continue');
      return {};
    }
    if (screen === SCREEN_FAILED) {
      const panel = extras.endPanel ?? { lines: [] };
      drawPanel('JOB FAILED', panel.lines, 'Press Space to continue');
      return {};
    }
    if (screen === SCREEN_HOWTO) {
      drawPanel('HOW TO PLAY', HOWTO_LINES, 'Press Space to go back');
      return {};
    }
    drawHud(extras);
    if (screen === SCREEN_BUSTED) {
      const fine = extras.bustInfo?.fine ?? 0;
      drawPanel(
        'BUSTED',
        ['The Bay PD caught Jax.', `Fine paid: $${fine}.`, 'The heat is off — for now.'],
        'Press Space to continue',
      );
    }
    return {};
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw };
}
