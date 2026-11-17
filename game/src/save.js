// Save: one localStorage slot for Marisol Bay progress — cash, finished
// jobs, sun tokens picked up, race best times and settings. The shape is
// versioned and validated on load, so a corrupt or foreign value never
// breaks the game; it just means "no save".
import { SAVE_KEY } from './config.js';

const SAVE_VERSION = 1;

export function loadSave() {
  let raw = null;
  try {
    raw = window.localStorage.getItem(SAVE_KEY);
  } catch {
    return null;
  }
  if (raw === null) return null;
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object' || data.version !== SAVE_VERSION) return null;
  return {
    version: SAVE_VERSION,
    cash: typeof data.cash === 'number' && data.cash >= 0 ? Math.floor(data.cash) : 0,
    missionsCompleted: Array.isArray(data.missionsCompleted)
      ? data.missionsCompleted.filter((id) => typeof id === 'string')
      : [],
    raceBest:
      data.raceBest && typeof data.raceBest === 'object' && !Array.isArray(data.raceBest)
        ? data.raceBest
        : {},
    tokensTaken: Array.isArray(data.tokensTaken)
      ? data.tokensTaken.filter((i) => Number.isInteger(i))
      : [],
    muted: data.muted === true,
  };
}

export function saveGame(snapshot) {
  const data = {
    version: SAVE_VERSION,
    cash: Math.max(0, Math.floor(snapshot.cash ?? 0)),
    missionsCompleted: [...(snapshot.missionsCompleted ?? [])],
    raceBest: { ...(snapshot.raceBest ?? {}) },
    tokensTaken: [...(snapshot.tokensTaken ?? [])],
    muted: snapshot.muted === true,
  };
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch {
    // Storage full or blocked: the run continues unsaved.
  }
  return data;
}

export function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // Nothing to clear.
  }
}
