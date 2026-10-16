// Saved data, on the device.
// Every stored value carries a format version, so future changes can upgrade old data
// instead of misreading it. History keeps full interval detail for recent sessions and a
// summary for older ones, so it stays well inside the browser's storage limit.

export const SETTINGS_KEY = 'cadence';
export const HISTORY_KEY = 'cadence-history';
export const SETTINGS_VERSION = 2;
export const HISTORY_VERSION = 2;
export const DETAILED_SESSIONS = 100;   // sessions that keep their per-interval detail

const read = (store, key) => {
  try { const raw = store.getItem(key); return raw == null ? null : JSON.parse(raw); } catch { return null; }
};
const write = (store, key, value) => {
  try { store.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
};

// ---------- Settings ----------
const DEFAULT_SETTINGS = { type: 'steady', minutes: 30 };

export function loadSettings(store) {
  const s = read(store, SETTINGS_KEY);
  if (!s || typeof s !== 'object') return { ...DEFAULT_SETTINGS };
  // v1 had no version and also stored distance settings, which no longer exist.
  return {
    type: typeof s.type === 'string' ? s.type : DEFAULT_SETTINGS.type,
    minutes: Number.isFinite(s.minutes) ? s.minutes : DEFAULT_SETTINGS.minutes,
  };
}

export function saveSettings(store, settings) {
  return write(store, SETTINGS_KEY, { v: SETTINGS_VERSION, type: settings.type, minutes: settings.minutes });
}

// ---------- History ----------
// Older sessions drop their per-interval detail; everything shown or exported as a row stays.
export function compact(sessions, keep = DETAILED_SESSIONS) {
  return sessions.map((x, i) => (i < keep || !x.segments ? x : (({ segments, ...rest }) => rest)(x)));
}

export function loadHistory(store) {
  const h = read(store, HISTORY_KEY);
  if (Array.isArray(h)) {
    // v1 stored a bare list. Upgrade it in place.
    const sessions = h.filter((x) => x && x.id);
    write(store, HISTORY_KEY, { v: HISTORY_VERSION, sessions: compact(sessions) });
    return sessions;
  }
  if (!h || !Array.isArray(h.sessions)) return [];
  return h.sessions;
}

// Saves the list, newest first. If storage is full, it keeps less detail and tries again.
export function storeHistory(store, sessions) {
  for (const keep of [DETAILED_SESSIONS, 20, 0]) {
    if (write(store, HISTORY_KEY, { v: HISTORY_VERSION, sessions: compact(sessions, keep) })) return true;
  }
  return false;
}

export function addSession(store, rec) {
  return storeHistory(store, [rec, ...loadHistory(store)]);
}

export function removeSession(store, id) {
  return storeHistory(store, loadHistory(store).filter((x) => x.id !== id));
}
