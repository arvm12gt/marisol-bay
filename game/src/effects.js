// Effects: the smallest particle set the game needs — muzzle flashes,
// collision sparks, brake smoke, dropped-coin glints and the police light
// halo. Particles are plain data (position, velocity, life, colour); the
// renderer draws them in world space after the dusk wash, so flashes and
// glows sit on top of the city. B5 reuses the same set for pickups and
// exhaust. Nothing here allocates per frame except when a burst spawns.
const MAX_PARTICLES = 500;

function makeParticle(x, y, vx, vy, life, size, color, opts = {}) {
  return {
    x,
    y,
    vx,
    vy,
    life,
    maxLife: life,
    size,
    color,
    /** Pixels per second squared pulling the particle down. */
    gravity: opts.gravity ?? 0,
    /** Fraction of velocity kept per second (1 keeps it all). */
    drag: opts.drag ?? 1,
    /** Grows instead of shrinking while it fades (smoke). */
    grow: opts.grow ?? 0,
    /** Drawn with additive blending: flashes and light halos. */
    glow: opts.glow ?? false,
  };
}

export function createEffects() {
  const particles = [];

  function add(particle) {
    if (particles.length >= MAX_PARTICLES) particles.shift();
    particles.push(particle);
  }

  /** A burst of `count` particles flying out of (x, y) in all directions. */
  function burst(x, y, count, colors, speed, size, life, opts = {}) {
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.6);
      add(
        makeParticle(
          x,
          y,
          Math.cos(angle) * v,
          Math.sin(angle) * v,
          life * (0.6 + Math.random() * 0.7),
          size * (0.7 + Math.random() * 0.6),
          colors[Math.floor(Math.random() * colors.length)],
          opts,
        ),
      );
    }
  }

  /** Hot orange-yellow sparks: a car hit, a bullet striking a wall. */
  function sparks(x, y, count = 10) {
    burst(x, y, count, ['#ffd23e', '#ff9a2a', '#ff5a2a', '#fff3c9'], 260, 3.2, 0.45, {
      gravity: 500,
      drag: 0.4,
    });
  }

  /** Grey dust that rises and spreads: a knocked-down pedestrian, a hard stop. */
  function smoke(x, y, count = 6) {
    burst(x, y, count, ['#b8ab98', '#9a8f80', '#cfc4b2'], 42, 7, 0.9, {
      drag: 0.7,
      grow: 26,
    });
  }

  /** The bright blink at a gun's muzzle: one hot core plus a few sparks. */
  function flash(x, y, angle) {
    add(makeParticle(x, y, 0, 0, 0.07, 16, '#fff3c9', { glow: true }));
    add(makeParticle(x, y, 0, 0, 0.12, 9, '#ffd23e', { glow: true }));
    for (let i = 0; i < 3; i += 1) {
      const spread = angle + (Math.random() - 0.5) * 0.7;
      const v = 300 + Math.random() * 160;
      add(
        makeParticle(x, y, Math.cos(spread) * v, Math.sin(spread) * v, 0.18, 2.4, '#ff9a2a', {
          drag: 0.3,
          glow: true,
        }),
      );
    }
  }

  /** A soft coloured halo: a police light bar washing the street. */
  function glow(x, y, color, size = 46) {
    add(makeParticle(x, y, 0, 0, 0.22, size, color, { glow: true }));
  }

  /** Gold glints for cash a pedestrian drops when they go down. */
  function coins(x, y, count = 5) {
    burst(x, y, count, ['#f2c94c', '#ffd97a', '#fff3c9'], 130, 3.4, 0.6, {
      gravity: 420,
      drag: 0.6,
      glow: true,
    });
  }

  /** One fixed step: move every particle, age it, drop the dead ones. */
  function update(dt) {
    for (let i = particles.length - 1; i >= 0; i -= 1) {
      const p = particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        particles.splice(i, 1);
        continue;
      }
      p.vy += p.gravity * dt;
      const keep = Math.pow(p.drag, dt * 60);
      p.vx *= keep;
      p.vy *= keep;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.grow) p.size += p.grow * dt;
    }
  }

  /** Draw the particles inside `rect` (the visible world rect). */
  function draw(context, rect) {
    let additive = false;
    for (const p of particles) {
      if (
        p.x + p.size < rect.x - 20 ||
        p.x - p.size > rect.x + rect.width + 20 ||
        p.y + p.size < rect.y - 20 ||
        p.y - p.size > rect.y + rect.height + 20
      ) {
        continue;
      }
      const alpha = Math.max(0, p.life / p.maxLife);
      if (p.glow && !additive) {
        context.globalCompositeOperation = 'lighter';
        additive = true;
      } else if (!p.glow && additive) {
        context.globalCompositeOperation = 'source-over';
        additive = false;
      }
      context.globalAlpha = p.glow ? alpha * 0.85 : alpha * 0.9;
      context.fillStyle = p.color;
      context.beginPath();
      context.arc(p.x, p.y, Math.max(0.5, p.size * (p.grow ? 1 : 0.5 + alpha * 0.5)), 0, Math.PI * 2);
      context.fill();
    }
    if (additive) context.globalCompositeOperation = 'source-over';
    context.globalAlpha = 1;
  }

  return {
    update,
    draw,
    burst,
    sparks,
    smoke,
    flash,
    glow,
    coins,
    get count() {
      return particles.length;
    },
  };
}
