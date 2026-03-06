// ─────────────────────────────────────────────
//  STATE
// ─────────────────────────────────────────────
const ZONES = ['fw1','fw2','fw3','def1','def2','def3','gk'];
const HALF  = 20 * 60; // 1200 seconds

// Default zone positions (% of field width/height) — used to seed draw-tokens
const ZONE_POS = {
  fw1:  {x:20, y:59}, fw2:  {x:50, y:56}, fw3:  {x:80, y:59},
  def1: {x:20, y:74}, def2: {x:50, y:71}, def3: {x:80, y:74},
  gk:   {x:50, y:88},
};

// ── Tunable constants ─────────────────────────
const PEEK_DELAY_MS      = 400;   // hold duration (ms) before play-time peek activates
const PEEK_CANCEL_PX     = 10;    // finger movement (px) that cancels a pending peek
const RESET_HOLD_MS      = 600;   // hold duration (ms) on skip-back button to trigger full reset
const SKIP_DELTA_SECS    = 30;    // seconds added/subtracted by skip forward/back buttons
const REPORT_DELAY_MS    = 350;   // delay (ms) before the halftime/fulltime report appears
const MAX_SUB_OUT_HINTS  = 3;     // max number of "sub out" hints shown during peek mode
const HEAVY_PLAY_RATIO   = 0.70;  // play-time fraction at or above which a player is "heavy"
const MODERATE_PLAY_RATIO= 0.40;  // play-time fraction at or above which a player is "moderate"
const FREE_DRAG_MIN_PCT  = 3;     // lower clamp (%) for free-drag token position in draw mode
const FREE_DRAG_MAX_PCT  = 97;    // upper clamp (%) for free-drag token position in draw mode
const STORAGE_KEY        = 'rec-specs-state'; // localStorage key for session persistence
const ROSTER_KEY         = 'rec-specs-roster';
const SEASON_KEY         = 'rec-specs-season';

let roster = []; // persistent player list: [{ num, name }]
let season = [];

function saveRoster() {
  try { localStorage.setItem(ROSTER_KEY, JSON.stringify(roster)); } catch (_) {}
}
function loadRoster() {
  try {
    const raw = localStorage.getItem(ROSTER_KEY);
    if (raw) roster = JSON.parse(raw);
  } catch (_) {}
}

function loadSeason() {
  try {
    const raw = localStorage.getItem(SEASON_KEY);
    if (raw) season = JSON.parse(raw);
  } catch (_) {}
}

function saveSeasonGame() {
  season.push({
    players:  [...state.players],
    playTime: { ...state.playTime },
    posTime:  Object.fromEntries(
      state.players.map(n => [n, { ...(state.posTime[n] || { fw:0, def:0, gk:0 }) }])
    ),
  });
  try { localStorage.setItem(SEASON_KEY, JSON.stringify(season)); } catch (_) {}
}

// Return display name for a jersey number (falls back to #num if not on roster)
function playerName(num) {
  const p = roster.find(p => p.num === num);
  return p ? p.name : `#${num}`;
}

const state = {
  players: [],
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
};

// ─────────────────────────────────────────────
//  NAVIGATION
// ─────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  // Hide bottom nav during live game
  const nav = document.getElementById('bottom-nav');
  if (id === 'game-screen') {
    nav.classList.add('hidden');
  } else {
    nav.classList.remove('hidden');
  }
}

function updateHomeScreen() {
  const cta   = document.getElementById('home-cta');
  const empty = document.getElementById('home-empty');
  const count = document.getElementById('home-roster-count');
  if (roster.length === 0) {
    cta.style.display   = 'none';
    empty.style.display = '';
  } else {
    cta.style.display   = '';
    empty.style.display = 'none';
    count.textContent   = roster.length + ' player' + (roster.length !== 1 ? 's' : '') + ' in roster';
  }
}

function goBackToHome() {
  updateHomeScreen();
  showScreen('home-screen');
  setActiveTab('game');
}

// ── Bottom Nav ──────────────────────────────────
function setActiveTab(tab) {
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  const el = document.getElementById('nav-' + tab);
  if (el) el.classList.add('active');
}

document.getElementById('nav-game').addEventListener('click', () => {
  updateHomeScreen();
  showScreen('home-screen');
  setActiveTab('game');
});

document.getElementById('nav-roster').addEventListener('click', () => {
  showScreen('roster-screen');
  setActiveTab('roster');
  renderRoster();
});

document.getElementById('nav-stats').addEventListener('click', () => {
  showScreen('stats-screen');
  setActiveTab('stats');
  renderSeasonTab();
});

document.getElementById('nav-practice').addEventListener('click', () => {
  showScreen('drills-screen');
  setActiveTab('practice');
});

// Home screen "Start Game" CTA → goes to game setup (fresh selection each time)
document.getElementById('btn-home-start').addEventListener('click', () => {
  state.players = [];
  showScreen('game-setup-screen');
  renderGameSetup();
});

document.getElementById('btn-back-home-stats').addEventListener('click', goBackToHome);
document.getElementById('btn-back-home-drills').addEventListener('click', goBackToHome);
document.getElementById('btn-back-home-gamesetup').addEventListener('click', goBackToHome);

// ─────────────────────────────────────────────
//  ROSTER SCREEN  (management: add / delete)
// ─────────────────────────────────────────────
const rosterList   = document.getElementById('roster-list');
const addNameEl    = document.getElementById('add-name');
const addNumEl     = document.getElementById('add-num');
const btnAddPlayer = document.getElementById('btn-add-player');

function renderRoster() {
  const rosterCount = document.getElementById('roster-count');
  rosterList.innerHTML = '';
  roster.forEach(({ num, name }) => {
    const item = document.createElement('div');
    item.className = 'roster-item';
    item.innerHTML = `
      <span class="roster-name">${name}</span>
      <span class="roster-num">#${num}</span>
      <button class="roster-remove" data-num="${num}">✕</button>`;
    rosterList.appendChild(item);
  });

  rosterList.querySelectorAll('.roster-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const num = btn.dataset.num;
      roster = roster.filter(p => p.num !== num);
      state.players = state.players.filter(p => p !== num);
      saveRoster();
      updateHomeScreen();
      renderRoster();
    });
  });

  rosterCount.textContent = roster.length === 0
    ? 'Add players to your roster'
    : `${roster.length} player${roster.length !== 1 ? 's' : ''} on your roster`;
}

btnAddPlayer.addEventListener('click', () => {
  const name = addNameEl.value.trim();
  const num  = addNumEl.value.trim();
  if (!name || !num) return;
  if (roster.some(p => p.num === num)) return; // no duplicate jersey numbers
  roster.push({ num, name });
  saveRoster();
  updateHomeScreen();
  addNameEl.value = '';
  addNumEl.value  = '';
  renderRoster();
});

// Allow pressing Enter in either input to add the player
[addNameEl, addNumEl].forEach(el => {
  el.addEventListener('keydown', e => { if (e.key === 'Enter') btnAddPlayer.click(); });
});

// ─────────────────────────────────────────────
//  GAME SETUP SCREEN  (attendance: select who showed up)
// ─────────────────────────────────────────────
const gameSetupList  = document.getElementById('game-setup-list');
const gameSetupCount = document.getElementById('game-setup-count');
const btnStartGame   = document.getElementById('btn-start-game');

function renderGameSetup() {
  gameSetupList.innerHTML = '';
  roster.forEach(({ num, name }) => {
    const item = document.createElement('div');
    item.className = 'roster-item';
    const isIn = state.players.includes(num);
    item.innerHTML = `
      <button class="roster-check ${isIn ? 'checked' : ''}" data-num="${num}"></button>
      <span class="roster-name">${name}</span>
      <span class="roster-num">#${num}</span>`;
    gameSetupList.appendChild(item);
  });

  gameSetupList.querySelectorAll('.roster-check').forEach(btn => {
    btn.addEventListener('click', () => {
      const num = btn.dataset.num;
      if (state.players.includes(num)) {
        state.players = state.players.filter(p => p !== num);
      } else {
        state.players.push(num);
      }
      renderGameSetup();
    });
  });

  const n = state.players.length;
  gameSetupCount.textContent = n === 0
    ? 'Select players for today'
    : `${n} of ${roster.length} player${roster.length !== 1 ? 's' : ''} selected`;
  btnStartGame.disabled = n < 1;
}


function renderSeasonTab() {
  const el = document.getElementById('season-stats');
  if (season.length === 0) {
    el.innerHTML = '<p class="season-empty">No games recorded yet</p>';
    return;
  }

  // Aggregate play time + position time per player across all games
  const totals = {};
  season.forEach(game => {
    game.players.forEach(num => {
      if (!totals[num]) totals[num] = { time:0, fw:0, def:0, gk:0, games:0 };
      totals[num].time  += game.playTime[num] || 0;
      const pt = game.posTime[num] || {};
      totals[num].fw   += pt.fw  || 0;
      totals[num].def  += pt.def || 0;
      totals[num].gk   += pt.gk  || 0;
      totals[num].games++;
    });
  });

  // Sort most → least time
  const sorted = Object.entries(totals).sort((a, b) => b[1].time - a[1].time);

  el.innerHTML = `<div class="season-games-count">${season.length} game${season.length !== 1 ? 's' : ''} played</div>`;
  sorted.forEach(([num, data]) => {
    const playerMaxTime = data.games * HALF * 2; // max possible for games this player was in
    const fwW  = (data.fw  / playerMaxTime * 100).toFixed(1);
    const defW = (data.def / playerMaxTime * 100).toFixed(1);
    const gkW  = (data.gk  / playerMaxTime * 100).toFixed(1);
    const row  = document.createElement('div');
    row.className = 'report-row';
    row.innerHTML = `
      <div class="report-name">${playerName(num)}</div>
      <div class="report-jersey">#${num}</div>
      <div class="report-time">${fmtPlayTime(data.time)}</div>
      <div class="report-bar-outer">
        <div class="bar-fw"  style="width:${fwW}%"></div>
        <div class="bar-def" style="width:${defW}%"></div>
        <div class="bar-gk"  style="width:${gkW}%"></div>
      </div>`;
    el.appendChild(row);
  });
}

// Clear season — two-tap confirmation
let clearSeasonPending = false;
let clearSeasonTimer   = null;
const btnClearSeason = document.getElementById('btn-clear-season');

btnClearSeason.addEventListener('click', () => {
  if (clearSeasonPending) {
    clearTimeout(clearSeasonTimer);
    clearSeasonPending = false;
    btnClearSeason.textContent = 'Clear Season';
    season = [];
    try { localStorage.removeItem(SEASON_KEY); } catch (_) {}
    renderSeasonTab();
  } else {
    clearSeasonPending = true;
    btnClearSeason.textContent = 'Tap again to confirm';
    clearSeasonTimer = setTimeout(() => {
      clearSeasonPending = false;
      btnClearSeason.textContent = 'Clear Season';
    }, 3000);
  }
});

btnStartGame.addEventListener('click', () => {
  state.subs = [...state.players];
  ZONES.forEach(z => state.field[z] = null);
  state.playTime = {};
  state.posTime  = {};
  state.players.forEach(num => {
    state.playTime[num] = 0;
    state.posTime[num]  = { fw:0, def:0, gk:0 };
  });
  showScreen('game-screen');
  renderGame();
});

// ─────────────────────────────────────────────
//  TIMER
// ─────────────────────────────────────────────
const timerDisplay = document.getElementById('timer-display');
const halfBadge    = document.getElementById('half-badge');
const btnAction    = document.getElementById('btn-action');
const btnSkipBack  = document.getElementById('btn-skip-back');
const btnSkipFwd   = document.getElementById('btn-skip-fwd');
const btnBackSetup = document.getElementById('btn-back-setup');

function pad(n) { return String(n).padStart(2, '0'); }
function fmt(s) { return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`; }

function renderTimer() {
  const { elapsed, phase } = state.timer;
  timerDisplay.className = 'timer-display';

  const skipsEnabled = (phase === 'running' || phase === 'paused');
  btnSkipBack.disabled = !skipsEnabled;
  btnSkipFwd.disabled  = !skipsEnabled;
  btnAction.style.display = '';
  halfBadge.textContent = phase === 'idle' ? '' : (state.timer.secondHalfActive ? '2H' : '1H');
  btnBackSetup.style.display = phase === 'idle' ? '' : 'none';

  switch (phase) {
    case 'idle':
      timerDisplay.textContent = '00:00';
      btnAction.textContent = '▶';
      break;
    case 'running':
      timerDisplay.textContent = fmt(elapsed);
      btnAction.textContent = '⏸';
      break;
    case 'paused':
      timerDisplay.textContent = fmt(elapsed);
      btnAction.textContent = '▶';
      break;
    case 'halftime':
      timerDisplay.classList.add('alert', 'small-label');
      timerDisplay.textContent = 'HALF';
      btnAction.textContent = '2H';
      break;
    case 'fulltime':
      timerDisplay.classList.add('alert', 'small-label');
      timerDisplay.textContent = 'FULL';
      btnAction.style.display = 'none';
      break;
  }
}

async function acquireWakeLock() {
  try {
    if ('wakeLock' in navigator) state.wakeLock = await navigator.wakeLock.request('screen');
  } catch (_) {}
}

function releaseWakeLock() {
  if (state.wakeLock) { state.wakeLock.release().catch(() => {}); state.wakeLock = null; }
}

function tick() {
  state.timer.elapsed++;
  // Accumulate play time + position time for all currently on-field players
  ZONES.forEach(zone => {
    const num = state.field[zone];
    if (num !== null) {
      state.playTime[num] = (state.playTime[num] || 0) + 1;
      if (!state.posTime[num]) state.posTime[num] = { fw:0, def:0, gk:0 };
      const pos = zone.startsWith('fw') ? 'fw' : zone.startsWith('def') ? 'def' : 'gk';
      state.posTime[num][pos]++;
    }
  });
  // Keep peek display live while held
  if (peekActive) {
    document.querySelectorAll('#game-screen .player-token').forEach(token => {
      if (token.dataset.num && token.dataset.savedText !== undefined)
        token.textContent = fmtPlayTime(state.playTime[token.dataset.num] || 0);
    });
    applySubHints();
  }
  if (state.timer.elapsed >= HALF) {
    clearInterval(state.timer.interval);
    state.timer.interval = null;
    releaseWakeLock();
    state.timer.phase = state.timer.secondHalfActive ? 'fulltime' : 'halftime';
    if (state.timer.phase === 'fulltime') saveSeasonGame();
    if ('vibrate' in navigator) navigator.vibrate([300, 100, 300]);
    setTimeout(() => showReport(state.timer.phase), REPORT_DELAY_MS);
  }
  renderTimer();
  saveState();
}

btnAction.addEventListener('click', () => {
  const { phase } = state.timer;
  if (phase === 'idle' || phase === 'paused') {
    state.timer.phase = 'running';
    state.timer.interval = setInterval(tick, 1000);
    acquireWakeLock();
  } else if (phase === 'running') {
    clearInterval(state.timer.interval);
    state.timer.interval = null;
    state.timer.phase = 'paused';
    releaseWakeLock();
  } else if (phase === 'halftime') {
    state.timer.elapsed = 0;
    state.timer.secondHalfActive = true;
    state.timer.phase = 'running';
    state.timer.interval = setInterval(tick, 1000);
    acquireWakeLock();
  }
  renderTimer();
  saveState();
});

function doReset() {
  clearInterval(state.timer.interval);
  releaseWakeLock();
  Object.assign(state.timer, { elapsed:0, phase:'idle', interval:null, secondHalfActive:false });
  state.players.forEach(num => {
    state.playTime[num] = 0;
    state.posTime[num]  = { fw:0, def:0, gk:0 };
  });
  clearSavedState();
  renderTimer();
}

function goBackToSetup() {
  clearSavedState();
  showScreen('game-setup-screen');
  renderGameSetup();
}

btnBackSetup.addEventListener('click', goBackToSetup);

// Adjust play/position time for all on-field players by delta seconds
function adjustPlayerTimes(delta) {
  ZONES.forEach(zone => {
    const num = state.field[zone];
    if (num === null) return;
    state.playTime[num] = Math.max(0, (state.playTime[num] || 0) + delta);
    if (!state.posTime[num]) state.posTime[num] = { fw:0, def:0, gk:0 };
    const pos = zone.startsWith('fw') ? 'fw' : zone.startsWith('def') ? 'def' : 'gk';
    state.posTime[num][pos] = Math.max(0, (state.posTime[num][pos] || 0) + delta);
  });
}

// +30s skip forward
btnSkipFwd.addEventListener('click', () => {
  const { phase } = state.timer;
  if (phase !== 'running' && phase !== 'paused') return;
  const prev = state.timer.elapsed;
  state.timer.elapsed = Math.min(HALF - 1, prev + SKIP_DELTA_SECS);
  adjustPlayerTimes(state.timer.elapsed - prev);
  renderTimer();
  saveState();
});

// −30s tap = skip back 30s; long-hold 600ms = full reset
let skipHoldTimer = null;
let skipHoldFired = false;

btnSkipBack.addEventListener('touchstart', e => {
  e.preventDefault();
  skipHoldFired = false;
  skipHoldTimer = setTimeout(() => {
    skipHoldFired = true;
    doReset();
  }, RESET_HOLD_MS);
}, { passive: false });

btnSkipBack.addEventListener('touchend', () => {
  clearTimeout(skipHoldTimer);
  skipHoldTimer = null;
  if (!skipHoldFired) {
    const { phase } = state.timer;
    if (phase !== 'running' && phase !== 'paused') return;
    const prev = state.timer.elapsed;
    state.timer.elapsed = Math.max(0, prev - SKIP_DELTA_SECS);
    adjustPlayerTimes(state.timer.elapsed - prev);
    renderTimer();
    saveState();
  }
  skipHoldFired = false;
});

btnSkipBack.addEventListener('touchcancel', () => {
  clearTimeout(skipHoldTimer);
  skipHoldTimer = null;
  skipHoldFired = false;
});

// ─────────────────────────────────────────────
//  RENDER
// ─────────────────────────────────────────────
function renderGame() {
  renderField();
  renderSubs();
  renderTimer();
  saveState();
}

function renderField() {
  ZONES.forEach(zone => {
    const dz  = document.getElementById(`dz-${zone}`);
    const num = state.field[zone];

    // Remove existing token (sibling to ring, not inside it)
    const existing = dz.querySelector('.player-token');
    if (existing) existing.remove();

    if (num !== null) {
      dz.classList.add('occupied');
      dz.appendChild(makeToken(num, 'on-field', zone));
    } else {
      dz.classList.remove('occupied');
    }
  });
}

function renderSubs() {
  const container = document.getElementById('sub-tokens');
  container.innerHTML = '';
  state.subs.forEach(num => container.appendChild(makeToken(num, 'on-sub', 'sub')));
}

function makeToken(num, cls, origin) {
  const el = document.createElement('div');
  el.className = `player-token ${cls}`;
  el.textContent = playerName(num);
  el.dataset.num    = num;
  el.dataset.origin = origin;
  el.addEventListener('touchstart', onTouchStart, { passive: false });
  return el;
}

// ─────────────────────────────────────────────
//  DRAG AND DROP
// ─────────────────────────────────────────────
let drag = null; // { num, origin, el }
const clone = document.getElementById('drag-clone');

function onTouchStart(e) {
  if (state.drawMode) return; // draw mode uses its own field-level handler
  e.preventDefault();
  const t  = e.touches[0];
  const el = e.currentTarget;

  // Style the floating clone
  clone.textContent  = el.textContent;
  clone.style.background  = el.classList.contains('on-field') ? '#f5f5f5' : '#222222';
  clone.style.color       = el.classList.contains('on-field') ? '#111827' : '#6b7280';
  clone.style.boxShadow   = '0 4px 16px rgba(0,0,0,0.5)';
  clone.style.left        = t.clientX + 'px';
  clone.style.top         = t.clientY + 'px';
  clone.style.display     = 'flex';

  el.classList.add('dragging');

  drag = { num: el.dataset.num, origin: el.dataset.origin, el };

  document.addEventListener('touchmove', onTouchMove, { passive: false });
  document.addEventListener('touchend',  onTouchEnd);
}

function onTouchMove(e) {
  e.preventDefault();
  if (!drag) return;
  const t = e.touches[0];
  clone.style.left = t.clientX + 'px';
  clone.style.top  = t.clientY + 'px';
  highlightTarget(t.clientX, t.clientY);
}

function onTouchEnd(e) {
  if (!drag) return;
  document.removeEventListener('touchmove', onTouchMove);
  document.removeEventListener('touchend',  onTouchEnd);

  const t = e.changedTouches[0];

  clearHighlights();
  drag.el.classList.remove('dragging');

  const target = getTarget(t.clientX, t.clientY);
  clone.style.display = 'none'; // hide AFTER getTarget, not before
  if (target) handleDrop(target);

  drag = null;
  renderGame();
}

// Find the drop target under the finger (hide clone first so it doesn't block)
function getTarget(x, y) {
  clone.style.display = 'none';
  const el = document.elementFromPoint(x, y);
  clone.style.display = 'flex'; // always restore; onTouchEnd hides it after calling us
  if (!el) return null;

  const dz  = el.closest('.drop-zone');
  if (dz) return { type: 'zone', zone: dz.dataset.zone };

  const sub = el.closest('.sub-strip');
  if (sub) return { type: 'sub' };

  return null;
}

function highlightTarget(x, y) {
  clearHighlights();
  const target = getTarget(x, y);
  if (!target) return;
  if (target.type === 'zone') {
    document.getElementById(`dz-${target.zone}`).classList.add('drag-over');
  } else {
    document.getElementById('sub-tokens').classList.add('drag-over');
  }
}

function clearHighlights() {
  document.querySelectorAll('.drop-zone.drag-over').forEach(el => el.classList.remove('drag-over'));
  document.getElementById('sub-tokens').classList.remove('drag-over');
}

// ─────────────────────────────────────────────
//  DROP LOGIC
// ─────────────────────────────────────────────
function handleDrop(target) {
  const { num, origin } = drag;

  if (target.type === 'sub') {
    if (origin === 'sub') return;             // already a sub
    state.field[origin] = null;
    if (!state.subs.includes(num)) state.subs.push(num);
    return;
  }

  const zone     = target.zone;
  const occupant = state.field[zone];

  if (!occupant) {
    // Empty slot — place directly
    placeOnField(num, origin, zone);
  } else if (origin !== 'sub') {
    // Field → occupied Field — direct swap
    state.field[origin] = occupant;
    state.field[zone]   = num;
  } else {
    // Sub → occupied Field — needs confirmation
    pendingSub = { num, occupant, zone };
    showConfirm(num, occupant);
  }
}

function placeOnField(num, origin, zone) {
  if (origin === 'sub') {
    state.subs = state.subs.filter(p => p !== num);
  } else {
    state.field[origin] = null;
  }
  state.field[zone] = num;
}

// ─────────────────────────────────────────────
//  CONFIRMATION MODAL
// ─────────────────────────────────────────────
let pendingSub = null;

const confirmModal = document.getElementById('confirm-modal');
const confirmText  = document.getElementById('confirm-text');
const confirmYes   = document.getElementById('confirm-yes');
const confirmNo    = document.getElementById('confirm-no');

function showConfirm(inNum, outNum) {
  confirmText.textContent = `Put ${playerName(inNum)} in for ${playerName(outNum)}?`;
  confirmModal.classList.add('active');
}

confirmYes.addEventListener('click', () => {
  confirmModal.classList.remove('active');
  if (!pendingSub) return;
  const { num, occupant, zone } = pendingSub;
  state.subs        = state.subs.filter(p => p !== num);
  state.field[zone] = num;
  if (!state.subs.includes(occupant)) state.subs.push(occupant);
  pendingSub = null;
  renderGame();
});

confirmNo.addEventListener('click', () => {
  confirmModal.classList.remove('active');
  pendingSub = null;
});

// ─────────────────────────────────────────────
//  DRAW & SHIFT MODE
// ─────────────────────────────────────────────
const gameScreen = document.getElementById('game-screen');
const fieldEl    = document.getElementById('field');
const drawCanvas = document.getElementById('draw-canvas');
const btnDraw    = document.getElementById('btn-draw');
const btnClear   = document.getElementById('btn-clear');
const ctx        = drawCanvas.getContext('2d');

// ── Canvas helpers ────────────────────────────
function resizeCanvas() {
  drawCanvas.width  = fieldEl.offsetWidth;
  drawCanvas.height = fieldEl.offsetHeight;
  applyCtxStyles();
}
function applyCtxStyles() {
  ctx.strokeStyle = 'rgba(255,255,255,0.88)';
  ctx.lineWidth   = 4;
  ctx.lineCap     = 'round';
  ctx.lineJoin    = 'round';
}
function clearCanvas() {
  ctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
}
function getCanvasCoords(touch) {
  const r = drawCanvas.getBoundingClientRect();
  return {
    x: (touch.clientX - r.left) * (drawCanvas.width  / r.width),
    y: (touch.clientY - r.top)  * (drawCanvas.height / r.height),
  };
}

// ── Enter / Exit ──────────────────────────────
function enterDrawMode() {
  state.drawMode = true;
  resizeCanvas();
  drawCanvas.style.display = 'block';
  gameScreen.classList.add('draw-mode-active');
  btnDraw.classList.add('active');

  // Spawn free-floating draw-tokens at each occupied zone position
  ZONES.forEach(zone => {
    const num = state.field[zone];
    if (!num) return;
    const { x, y } = ZONE_POS[zone];
    const token = document.createElement('div');
    token.className = 'player-token on-field draw-token';
    token.textContent = playerName(num);
    token.dataset.num  = num;
    token.dataset.zone = zone;
    token.style.left = x + '%';
    token.style.top  = y + '%';
    fieldEl.appendChild(token);
  });
}

function exitDrawMode() {
  state.drawMode = false;
  clearCanvas();
  drawCanvas.style.display = 'none';
  gameScreen.classList.remove('draw-mode-active');
  btnDraw.classList.remove('active');
  document.querySelectorAll('.draw-token').forEach(el => el.remove());
  renderGame(); // snap players back to zones
}

btnDraw.addEventListener('click', () => {
  state.drawMode ? exitDrawMode() : enterDrawMode();
});

btnClear.addEventListener('click', clearCanvas);

// ── Free-drag draw-tokens ─────────────────────
let freeDrag = null;

function startFreeDrag(e, token) {
  e.preventDefault();
  freeDrag = token;
  token.classList.add('dragging');

  function onMove(ev) {
    ev.preventDefault();
    if (!freeDrag) return;
    const t    = ev.touches[0];
    const rect = fieldEl.getBoundingClientRect();
    const x = Math.max(FREE_DRAG_MIN_PCT, Math.min(FREE_DRAG_MAX_PCT, ((t.clientX - rect.left) / rect.width)  * 100));
    const y = Math.max(FREE_DRAG_MIN_PCT, Math.min(FREE_DRAG_MAX_PCT, ((t.clientY - rect.top)  / rect.height) * 100));
    freeDrag.style.left = x + '%';
    freeDrag.style.top  = y + '%';
  }

  function onEnd() {
    if (freeDrag) freeDrag.classList.remove('dragging');
    freeDrag = null;
    document.removeEventListener('touchmove', onMove);
    document.removeEventListener('touchend',  onEnd);
  }

  document.addEventListener('touchmove', onMove, { passive: false });
  document.addEventListener('touchend',  onEnd);
}

// ── Freehand drawing ──────────────────────────
let isDrawing = false;

fieldEl.addEventListener('touchstart', e => {
  if (!state.drawMode) return;

  // If touching a draw-token → free drag it
  const dt = e.target.closest('.draw-token');
  if (dt) { startFreeDrag(e, dt); return; }

  // Otherwise → draw
  e.preventDefault();
  isDrawing = true;
  const { x, y } = getCanvasCoords(e.touches[0]);
  ctx.beginPath();
  ctx.moveTo(x, y);

  function onDrawMove(ev) {
    ev.preventDefault();
    if (!isDrawing) return;
    const { x: dx, y: dy } = getCanvasCoords(ev.touches[0]);
    ctx.lineTo(dx, dy);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(dx, dy);
  }

  function onDrawEnd() {
    isDrawing = false;
    document.removeEventListener('touchmove', onDrawMove);
    document.removeEventListener('touchend',  onDrawEnd);
  }

  document.addEventListener('touchmove', onDrawMove, { passive: false });
  document.addEventListener('touchend',  onDrawEnd);
}, { passive: false });

// ─────────────────────────────────────────────
//  PLAYING TIME PEEK
// ─────────────────────────────────────────────
let peekActive = false;
let peekTimer  = null;
let peekStartX = 0, peekStartY = 0;

function fmtPlayTime(secs) {
  return `${Math.floor(secs / 60)}:${pad(secs % 60)}`;
}

// Highlight which field players to sub out (red) and bench players to sub in (green).
// N = bench count → flag the N longest-on field players (FWDs prioritized on ties).
function applySubHints() {
  const tokens = document.querySelectorAll('#game-screen .player-token');
  tokens.forEach(t => t.classList.remove('sub-out-hint', 'sub-in-hint'));

  const benchCount = state.subs.length;
  if (benchCount === 0) return;

  // Build ranked list of field candidates (GK excluded)
  const candidates = ZONES
    .filter(zone => zone !== 'gk' && state.field[zone] !== null)
    .map(zone => ({
      num:   state.field[zone],
      time:  state.playTime[state.field[zone]] || 0,
      isFwd: zone.startsWith('fw'),
    }))
    .sort((a, b) => {
      if (b.time !== a.time) return b.time - a.time;       // most time first
      return a.isFwd === b.isFwd ? 0 : a.isFwd ? -1 : 1;  // FWDs before DEFs on tie
    });

  const subOutNums = new Set(
    candidates.slice(0, Math.min(benchCount, candidates.length, MAX_SUB_OUT_HINTS)).map(c => c.num)
  );

  tokens.forEach(token => {
    const num = token.dataset.num;
    if (!num) return;
    if (subOutNums.has(num))          token.classList.add('sub-out-hint');
    else if (state.subs.includes(num)) token.classList.add('sub-in-hint');
  });
}

function enterPeek() {
  if (drag) return; // drag won the race — skip peek
  peekActive = true;
  gameScreen.classList.add('peek-mode');
  document.querySelectorAll('#game-screen .player-token').forEach(token => {
    const num = token.dataset.num;
    if (!num) return;
    token.dataset.savedText = token.textContent;
    token.textContent = fmtPlayTime(state.playTime[num] || 0);
  });
  applySubHints();
}

function exitPeek() {
  if (!peekActive) return;
  peekActive = false;
  gameScreen.classList.remove('peek-mode');
  document.querySelectorAll('#game-screen .player-token').forEach(token => {
    token.classList.remove('sub-out-hint', 'sub-in-hint');
    if (token.dataset.savedText !== undefined) {
      token.textContent = token.dataset.savedText;
      delete token.dataset.savedText;
    }
  });
}

gameScreen.addEventListener('touchstart', e => {
  if (drag || state.drawMode) return;
  peekStartX = e.touches[0].clientX;
  peekStartY = e.touches[0].clientY;
  peekTimer = setTimeout(() => { peekTimer = null; enterPeek(); }, PEEK_DELAY_MS);
}, { passive: true });

gameScreen.addEventListener('touchmove', e => {
  if (!peekTimer) return;
  const dx = e.touches[0].clientX - peekStartX;
  const dy = e.touches[0].clientY - peekStartY;
  if (Math.hypot(dx, dy) > PEEK_CANCEL_PX) { clearTimeout(peekTimer); peekTimer = null; }
}, { passive: true });

gameScreen.addEventListener('touchend', () => {
  if (peekTimer) { clearTimeout(peekTimer); peekTimer = null; }
  exitPeek();
});

// ─────────────────────────────────────────────
//  HALFTIME / FULLTIME REPORT
// ─────────────────────────────────────────────
const reportModal = document.getElementById('report-modal');

document.getElementById('report-close').addEventListener('click', () => {
  reportModal.classList.remove('active');
  if (state.timer.phase === 'fulltime') {
    doReset();
    goBackToHome();
  }
});

// ─────────────────────────────────────────────
//  PERSISTENCE
// ─────────────────────────────────────────────
function saveState() {
  const { players, field, subs, timer, playTime, posTime } = state;
  const { elapsed, phase, secondHalfActive } = timer;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      players, field, subs,
      timer: { elapsed, phase, secondHalfActive },
      playTime, posTime,
    }));
  } catch (_) {}
}

function clearSavedState() {
  try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
}

function restoreState() {
  let saved;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    saved = JSON.parse(raw);
  } catch (_) { return false; }

  if (!saved.players || !saved.players.length) return false;

  state.players  = saved.players;
  Object.assign(state.field, saved.field || {});
  state.subs     = saved.subs     || [];
  state.playTime = saved.playTime || {};
  state.posTime  = saved.posTime  || {};

  const t = saved.timer || {};
  state.timer.elapsed          = t.elapsed          || 0;
  state.timer.secondHalfActive = t.secondHalfActive || false;
  // If the timer was running when the page closed, restore as paused
  state.timer.phase = t.phase === 'running' ? 'paused' : (t.phase || 'idle');

  return true;
}

// ─────────────────────────────────────────────
//  SERVICE WORKER
// ─────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

function showReport(phase) {
  const maxTime = phase === 'fulltime' ? HALF * 2 : HALF;

  document.getElementById('report-title').textContent =
    phase === 'halftime' ? 'HALF TIME' : 'FULL TIME';

  const sorted = [...state.players].sort(
    (a, b) => (state.playTime[a] || 0) - (state.playTime[b] || 0)
  );

  const list = document.getElementById('report-list');
  list.innerHTML = '';

  sorted.forEach(num => {
    const total = state.playTime[num] || 0;
    const pos   = state.posTime[num]  || { fw:0, def:0, gk:0 };
    const pct   = total / maxTime;

    const statusClass = pct >= HEAVY_PLAY_RATIO ? 'heavy' : pct >= MODERATE_PLAY_RATIO ? 'moderate' : 'fresh';

    const fwW  = (pos.fw  / maxTime * 100).toFixed(1);
    const defW = (pos.def / maxTime * 100).toFixed(1);
    const gkW  = (pos.gk  / maxTime * 100).toFixed(1);

    const row = document.createElement('div');
    row.className = `report-row ${statusClass}`;
    row.innerHTML = `
      <div class="report-dot"></div>
      <div class="report-name">${playerName(num)}</div>
      <div class="report-jersey">#${num}</div>
      <div class="report-time">${fmtPlayTime(total)}</div>
      <div class="report-bar-outer">
        <div class="bar-fw"  style="width:${fwW}%"></div>
        <div class="bar-def" style="width:${defW}%"></div>
        <div class="bar-gk"  style="width:${gkW}%"></div>
      </div>`;
    list.appendChild(row);
  });

  reportModal.classList.add('active');
}

// ─────────────────────────────────────────────
//  STARTUP — restore previous session if saved
// ─────────────────────────────────────────────
loadRoster();       // load roster first
loadSeason();       // load season data
renderRoster();     // populate roster management screen
updateHomeScreen(); // set adaptive home state based on roster
if (restoreState()) {
  showScreen('game-screen');
  renderGame();
}
