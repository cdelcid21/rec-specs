// ─────────────────────────────────────────────
//  CONSTANTS & STATE
// ─────────────────────────────────────────────
export const ZONES = ['fw1','fw2','fw3','def1','def2','def3','gk'];
export const HALF  = 20 * 60; // 1200 seconds

// Default zone positions (% of field width/height) — used to seed draw-tokens
export const ZONE_POS = {
  fw1:  {x:20, y:59}, fw2:  {x:50, y:56}, fw3:  {x:80, y:59},
  def1: {x:20, y:74}, def2: {x:50, y:71}, def3: {x:80, y:74},
  gk:   {x:50, y:88},
};

// ── Tunable constants ─────────────────────────
export const PEEK_DELAY_MS      = 400;   // hold duration (ms) before play-time peek activates
export const PEEK_CANCEL_PX     = 10;    // finger movement (px) that cancels a pending peek
export const RESET_HOLD_MS      = 600;   // hold duration (ms) on skip-back button to trigger full reset
export const SKIP_DELTA_SECS    = 30;    // seconds added/subtracted by skip forward/back buttons
export const REPORT_DELAY_MS    = 350;   // delay (ms) before the halftime/fulltime report appears
export const MAX_SUB_OUT_HINTS  = 3;     // max number of "sub out" hints shown during peek mode
export const HEAVY_PLAY_RATIO   = 0.70;  // play-time fraction at or above which a player is "heavy"
export const MODERATE_PLAY_RATIO= 0.40;  // play-time fraction at or above which a player is "moderate"
export const FREE_DRAG_MIN_PCT  = 3;     // lower clamp (%) for free-drag token position in draw mode
export const FREE_DRAG_MAX_PCT  = 97;    // upper clamp (%) for free-drag token position in draw mode
export const STORAGE_KEY        = 'rec-specs-state'; // localStorage key for session persistence
export const ROSTER_KEY         = 'rec-specs-roster';
export const SEASON_KEY         = 'rec-specs-season';

export const state = {
  players: new Set(), // Set<jerseyNum> — players selected for today's game
  field:   { fw1:null, fw2:null, fw3:null, def1:null, def2:null, def3:null, gk:null },
  subs:    [],
  timer: {
    elapsed:          0,
    phase:            'idle', // idle | running | paused | halftime | fulltime
    interval:         null,
    secondHalfActive: false,
  },
  drawMode: false,
  wakeLock: null,
  playTime: {}, // { jerseyNum: seconds } — cumulative on-field time per player
  posTime:  {}, // { jerseyNum: { fw:0, def:0, gk:0 } } — time by position group
  score:    { us: 0, them: 0 },
  gkFirstHalf: null, // jersey num of the 1H GK; set at halftime before auto-bench
};

/** Null out every field zone — avoids repeating ZONES.forEach inline. */
export function clearField() {
  ZONES.forEach(z => { state.field[z] = null; });
}
