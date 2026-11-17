// Audio: every sound in Marisol Bay is synthesized with WebAudio — no
// external audio files, no assets to load. One-shot effects (gunshots,
// punches, pickups, the mission jingle) are short node graphs built per
// call; the engine hum and the police siren are continuous voices whose
// pitch and gain follow the game state each frame. The context is created
// lazily on the first user gesture (browsers block it before then) and
// every call is guarded, so a missing or suspended context stays silent
// instead of throwing. Muted state comes from the save slot.
export function createAudio({ muted = false } = {}) {
  let ctx = null;
  let master = null;
  let noiseBuf = null;
  let engineOsc = null;
  let engineFilter = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let mutedState = muted === true;

  /** Build the context and the two continuous voices, once. */
  function ensure() {
    if (ctx !== null) return ctx;
    try {
      const AC = window.AudioContext ?? window.webkitAudioContext;
      if (typeof AC !== 'function') return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = mutedState ? 0 : 0.5;
      master.connect(ctx.destination);
      // One shared white-noise buffer for every burst and thud.
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
      // Engine: a sawtooth through a low-pass, pitched by road speed.
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 50;
      engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 420;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      // Siren: a square wave wailing between two tones on a slow LFO.
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'square';
      sirenOsc.frequency.value = 820;
      const lfo = ctx.createOscillator();
      lfo.type = 'square';
      lfo.frequency.value = 0.9;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 130;
      lfo.connect(lfoGain);
      lfoGain.connect(sirenOsc.frequency);
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
      lfo.start();
    } catch {
      ctx = null;
    }
    return ctx;
  }

  /** A short tone that slides from `from` to `to` Hz and fades out. */
  function tone({ type = 'sine', from = 440, to = null, dur = 0.12, gain = 0.2, delay = 0 }) {
    if (ctx === null || mutedState) return;
    try {
      const t0 = ctx.currentTime + delay;
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.setValueAtTime(from, t0);
      if (to !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(gain, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      osc.connect(g);
      g.connect(master);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    } catch {
      // A voice that fails to start is silence, never a crash.
    }
  }

  /** A burst of filtered noise: gunshots, thuds, explosions. */
  function noise({ dur = 0.2, gain = 0.3, from = 3000, to = null, delay = 0 }) {
    if (ctx === null || mutedState || noiseBuf === null) return;
    try {
      const t0 = ctx.currentTime + delay;
      const src = ctx.createBufferSource();
      src.buffer = noiseBuf;
      src.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(from, t0);
      if (to !== null) filter.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(gain, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      src.connect(filter);
      filter.connect(g);
      g.connect(master);
      src.start(t0);
      src.stop(t0 + dur + 0.02);
    } catch {
      // Silence, never a crash.
    }
  }

  const SOUNDS = {
    shot() {
      noise({ dur: 0.14, gain: 0.5, from: 3200, to: 300 });
      tone({ type: 'square', from: 180, to: 60, dur: 0.1, gain: 0.25 });
    },
    punch() {
      noise({ dur: 0.09, gain: 0.35, from: 900, to: 150 });
    },
    hit() {
      tone({ type: 'triangle', from: 220, to: 110, dur: 0.12, gain: 0.25 });
      noise({ dur: 0.08, gain: 0.2, from: 1200, to: 300 });
    },
    hurt() {
      tone({ type: 'sawtooth', from: 140, to: 55, dur: 0.25, gain: 0.3 });
      noise({ dur: 0.2, gain: 0.25, from: 700, to: 120 });
    },
    crash() {
      noise({ dur: 0.3, gain: 0.4, from: 1800, to: 120 });
      tone({ type: 'square', from: 90, to: 40, dur: 0.25, gain: 0.3 });
    },
    explosion() {
      noise({ dur: 0.9, gain: 0.6, from: 2500, to: 60 });
      tone({ type: 'sine', from: 120, to: 28, dur: 0.8, gain: 0.5 });
    },
    pickup() {
      tone({ type: 'sine', from: 880, dur: 0.09, gain: 0.2 });
      tone({ type: 'sine', from: 1318, dur: 0.14, gain: 0.2, delay: 0.08 });
    },
    token() {
      tone({ type: 'sine', from: 1046, dur: 0.08, gain: 0.18 });
      tone({ type: 'sine', from: 1568, dur: 0.12, gain: 0.18, delay: 0.07 });
    },
    fare() {
      tone({ type: 'sine', from: 659, dur: 0.1, gain: 0.2 });
      tone({ type: 'sine', from: 880, dur: 0.16, gain: 0.2, delay: 0.09 });
    },
    checkpoint() {
      tone({ type: 'sine', from: 740, dur: 0.07, gain: 0.16 });
    },
    missionPass() {
      [523, 659, 784, 1046].forEach((freq, i) =>
        tone({ type: 'triangle', from: freq, dur: 0.16, gain: 0.22, delay: i * 0.11 }),
      );
    },
    missionFail() {
      tone({ type: 'triangle', from: 392, to: 370, dur: 0.22, gain: 0.22 });
      tone({ type: 'triangle', from: 311, to: 294, dur: 0.3, gain: 0.22, delay: 0.2 });
    },
    busted() {
      tone({ type: 'square', from: 620, dur: 0.16, gain: 0.18 });
      tone({ type: 'square', from: 460, dur: 0.28, gain: 0.18, delay: 0.16 });
    },
    down() {
      tone({ type: 'sine', from: 330, to: 165, dur: 0.5, gain: 0.25 });
      tone({ type: 'sine', from: 220, to: 110, dur: 0.6, gain: 0.2, delay: 0.3 });
    },
    reload() {
      tone({ type: 'square', from: 500, to: 700, dur: 0.06, gain: 0.12 });
      tone({ type: 'square', from: 700, to: 500, dur: 0.06, gain: 0.12, delay: 0.12 });
    },
    click() {
      tone({ type: 'sine', from: 900, dur: 0.05, gain: 0.14 });
    },
  };

  const audio = {
    get muted() {
      return mutedState;
    },
    /** Create (or resume) the context: call on the first user gesture. */
    unlock() {
      const c = ensure();
      if (c !== null && c.state === 'suspended') {
        c.resume().catch(() => {
          // Still suspended without a gesture: silence, not an error.
        });
      }
    },
    setMuted(muted) {
      mutedState = muted === true;
      if (ctx !== null && master !== null) {
        try {
          master.gain.setTargetAtTime(mutedState ? 0 : 0.5, ctx.currentTime, 0.05);
        } catch {
          // Mute is a setting, not a sound: it never throws.
        }
      }
    },
    /** Play a named one-shot (unknown names are ignored). */
    play(name) {
      if (ctx === null || mutedState) return;
      const fn = SOUNDS[name];
      if (typeof fn === 'function') fn();
    },
    /**
     * One frame of the continuous voices: the engine follows road speed
     * (a low idle on foot), the siren fades in as the nearest cruiser
     * closes. `sirenDist` is the nearest cruiser in world units, or null.
     */
    update(dt, { speed = 0, inCar = false, sirenDist = null } = {}) {
      if (ctx === null || engineGain === null || sirenGain === null) return;
      try {
        const t = ctx.currentTime;
        const absSpeed = Math.abs(speed);
        const engineFreq = inCar ? 50 + absSpeed * 0.16 : 42;
        const engineLevel = inCar ? 0.035 + Math.min(0.045, (absSpeed / 660) * 0.045) : 0.012;
        engineOsc.frequency.setTargetAtTime(engineFreq, t, 0.08);
        engineGain.gain.setTargetAtTime(engineLevel, t, 0.1);
        const sirenLevel =
          sirenDist === null ? 0 : Math.max(0, 1 - sirenDist / 1000) * 0.045;
        sirenGain.gain.setTargetAtTime(sirenLevel, t, 0.15);
      } catch {
        // The continuous voices never break the frame.
      }
    },
    /** Headless checks: whether a context exists, its state, and mute. */
    state() {
      return { ready: ctx !== null, contextState: ctx === null ? 'none' : ctx.state, muted: mutedState };
    },
  };
  return audio;
}
