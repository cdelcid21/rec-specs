import { state, STORAGE_KEY, ROSTER_KEY, SEASON_KEY } from './state.js';

// ── Persisted global data ─────────────────────
export let roster = []; // [{ num, name }]
export let season = []; // array of game records

// ── localStorage helpers ──────────────────────
export function safeGet(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch (_) { return null; }
}
export function safeSet(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch (_) {}
}

// ── Roster / season mutations ─────────────────
/** Remove a player from the roster array in-place. */
export function removeFromRoster(num) {
  const idx = roster.findIndex(p => p.num === num);
  if (idx !== -1) roster.splice(idx, 1);
}

/** Strip a player from all season game records in-place and persist. */
export function removePlayerFromSeason(num) {
  for (let i = 0; i < season.length; i++) {
    season[i] = { ...season[i], players: season[i].players.filter(n => n !== num) };
  }
  safeSet(SEASON_KEY, season);
}

// ── Roster persistence ────────────────────────
export function saveRoster() {
  safeSet(ROSTER_KEY, roster);
}
export function loadRoster() {
  const saved = safeGet(ROSTER_KEY);
  if (saved) { roster.length = 0; roster.push(...saved); }
}

// ── Season persistence ────────────────────────
export function loadSeason() {
  const saved = safeGet(SEASON_KEY);
  if (saved) { season.length = 0; season.push(...saved); }
}
export function saveSeasonGame() {
  season.push({
    players:  [...state.players],
    playTime: { ...state.playTime },
    posTime:  Object.fromEntries(
      [...state.players].map(n => [n, { ...(state.posTime[n] || { fw:0, def:0, gk:0 }) }])
    ),
    gkHalves: [state.gkFirstHalf, state.field['gk']].filter(Boolean),
    score: { ...state.score },
    date:  Date.now(),
  });
  state.gkFirstHalf = null;
  safeSet(SEASON_KEY, season);
}

// ── Session state persistence ─────────────────
export function saveState() {
  const { players, field, subs, timer, playTime, posTime, score, gkFirstHalf } = state;
  const { elapsed, phase, secondHalfActive } = timer;
  safeSet(STORAGE_KEY, {
    version: 1,
    players: [...players], // Set → Array for JSON serialisation
    field, subs,
    timer: { elapsed, phase, secondHalfActive },
    playTime, posTime, score, gkFirstHalf,
  });
}

export function clearSavedState() {
  try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
}

export function restoreState() {
  const saved = safeGet(STORAGE_KEY);
  if (!saved || !saved.players || !saved.players.length) return false;

  // Migration hook — extend here as the schema evolves
  // const v = saved.version || 0;
  // if (v < 1) { /* backfill missing fields */ }

  state.players     = new Set(saved.players); // Array → Set
  Object.assign(state.field, saved.field || {});
  state.subs        = saved.subs        || [];
  state.playTime    = saved.playTime    || {};
  state.posTime     = saved.posTime     || {};
  state.score       = saved.score       || { us: 0, them: 0 };
  state.gkFirstHalf = saved.gkFirstHalf || null;

  const t = saved.timer || {};
  state.timer.elapsed          = t.elapsed          || 0;
  state.timer.secondHalfActive = t.secondHalfActive || false;
  // If the timer was running when the page closed, restore as paused
  state.timer.phase = t.phase === 'running' ? 'paused' : (t.phase || 'idle');

  return true;
}

// ── Utility functions that depend on roster/season ──
/** Display name for a jersey number (falls back to #num if not on roster). */
export function playerName(num) {
  const p = roster.find(p => p.num === num);
  return p ? p.name : `#${num}`;
}

/** True if the player has any recorded play time in the season history. */
export function hasPlayerPlayTime(num) {
  return season.some(game => game.players.includes(num) && (game.playTime[num] || 0) > 0);
}
