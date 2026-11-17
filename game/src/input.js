// Keyboard and pointer input. Held keys give a two-dimensional move vector
// (WASD or arrow keys); one-shot presses (start, pause) are queued as bit
// flags and taken once by the loop, so a press between two frames is never
// lost and never counted twice. Keys for later segments (E interact, F
// enter/exit vehicle, Shift sprint) are tracked here now so their wiring
// does not change when those segments land.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
/** B3 one-shot combat presses: R reload, 1 fists, 2 pistol. */
export const ACTION_RELOAD = 4;
export const ACTION_FISTS = 8;
export const ACTION_PISTOL = 16;
/** B4 one-shot menu presses: W/Up and S/Down move the highlight. */
export const ACTION_MENU_UP = 32;
export const ACTION_MENU_DOWN = 64;
/** B5 one-shot toggles: M shows or hides the minimap, N mutes the sound. */
export const ACTION_MINIMAP = 128;
export const ACTION_MUTE = 256;

const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const RELOAD = new Set(['KeyR']);
const FISTS = new Set(['Digit1']);
const PISTOL = new Set(['Digit2']);
const MINIMAP = new Set(['KeyM']);
const MUTE = new Set(['KeyN']);
// Reserved for B2–B4: E interact, F enter/exit vehicle, Shift sprint.
const RESERVED = new Set(['KeyE', 'KeyF', 'ShiftLeft', 'ShiftRight']);

export function createInput(target) {
  const held = new Set();
  let actions = 0;
  /** The pointer in viewport (CSS) pixels, for aiming; combat reads it through mouse(). */
  const mouse = { x: 0, y: 0, down: false, clicked: false };

  window.addEventListener('keydown', (event) => {
    if (UP.has(event.code) || DOWN.has(event.code) || LEFT.has(event.code) || RIGHT.has(event.code)) {
      held.add(event.code);
      // W/S and the arrows are also the menu keys: queue one press each so
      // a quick tap between two frames still moves the highlight, exactly once.
      if (!event.repeat) {
        if (UP.has(event.code)) actions |= ACTION_MENU_UP;
        if (DOWN.has(event.code)) actions |= ACTION_MENU_DOWN;
      }
    } else if (CONFIRM.has(event.code)) {
      // Space is both the start button and the punch (B3): hold it too, so
      // the loop can take its rising edge while the game is running.
      held.add(event.code);
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (RELOAD.has(event.code)) {
      // One-shot combat presses are queued as flags, never polled from the
      // held set: a quick tap between two frames still fires, exactly once.
      if (!event.repeat) actions |= ACTION_RELOAD;
    } else if (FISTS.has(event.code)) {
      if (!event.repeat) actions |= ACTION_FISTS;
    } else if (PISTOL.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PISTOL;
    } else if (MINIMAP.has(event.code)) {
      if (!event.repeat) actions |= ACTION_MINIMAP;
    } else if (MUTE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_MUTE;
    } else if (RESERVED.has(event.code)) {
      held.add(event.code);
    } else return;
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    held.delete(event.code);
  });
  // A key released while the tab is hidden never sends keyup: let go of everything on blur.
  window.addEventListener('blur', () => {
    held.clear();
    mouse.down = false;
  });
  target.addEventListener('pointermove', (event) => {
    mouse.x = event.clientX;
    mouse.y = event.clientY;
  });
  target.addEventListener('pointerdown', (event) => {
    mouse.x = event.clientX;
    mouse.y = event.clientY;
    mouse.down = true;
    mouse.clicked = true;
    actions |= ACTION_CONFIRM;
  });
  window.addEventListener('pointerup', () => {
    mouse.down = false;
  });

  function hasAny(codes) {
    for (const code of codes) if (held.has(code)) return true;
    return false;
  }

  return {
    /** Normalised {x, y} move vector: -1/0/1 per axis, diagonals normalised. */
    moveVector() {
      const x = (hasAny(RIGHT) ? 1 : 0) - (hasAny(LEFT) ? 1 : 0);
      const y = (hasAny(DOWN) ? 1 : 0) - (hasAny(UP) ? 1 : 0);
      if (x !== 0 && y !== 0) {
        const inv = 1 / Math.SQRT2;
        return { x: x * inv, y: y * inv };
      }
      return { x, y };
    },
    /** True while a held key (E, F, Shift, a move key, or Space) is down. */
    isDown(code) {
      return held.has(code);
    },
    /** The pointer's viewport position and whether its button is held. */
    mouse() {
      return { x: mouse.x, y: mouse.y, down: mouse.down };
    },
    /** True once per click since the last call (aiming/shooting reads it). */
    takeClick() {
      const clicked = mouse.clicked;
      mouse.clicked = false;
      return clicked;
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
