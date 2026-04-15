// ============================================================
// OUTWORK — Workout Tracker
// ============================================================

// ─── Exercise Library ─────────────────────────────────────────
const DEFAULT_EXERCISES = [
  // Pecho
  { id: 'pushups',    name: 'Flexiones',           muscle: 'Pecho',            type: 'reps' },
  { id: 'diamond',    name: 'Diamante',             muscle: 'Pecho',            type: 'reps' },
  { id: 'archer',     name: 'Flexión Arquero',      muscle: 'Pecho',            type: 'reps' },
  { id: 'dips',       name: 'Fondos',               muscle: 'Pecho / Tríceps',  type: 'reps' },
  // Espalda
  { id: 'pullups',    name: 'Dominadas',            muscle: 'Espalda',          type: 'reps' },
  { id: 'chinups',    name: 'Chin-ups',             muscle: 'Bíceps / Espalda', type: 'reps' },
  { id: 'australian', name: 'Remo Australiano',     muscle: 'Espalda',          type: 'reps' },
  // Piernas
  { id: 'squats',     name: 'Sentadillas',          muscle: 'Piernas',          type: 'reps' },
  { id: 'bulgarian',  name: 'Búlgaras',             muscle: 'Piernas',          type: 'reps' },
  { id: 'lunges',     name: 'Estocadas',            muscle: 'Piernas',          type: 'reps' },
  { id: 'calves',     name: 'Pantorrillas',         muscle: 'Piernas',          type: 'reps' },
  // Core
  { id: 'crunches',   name: 'Abdominales',          muscle: 'Core',             type: 'reps' },
  { id: 'legRaises',  name: 'Elevación de Piernas', muscle: 'Core',             type: 'reps' },
  { id: 'plank',      name: 'Plancha (segundos)',   muscle: 'Core',             type: 'reps' },
  { id: 'superman',   name: 'Espinales',            muscle: 'Core / Espalda',   type: 'reps' },
  // Hombros
  { id: 'pikePush',   name: 'Flexiones Pica',       muscle: 'Hombros',          type: 'reps' },
  // Cardio
  { id: 'running',    name: 'Correr',               muscle: 'Cardio',           type: 'cardio' },
];

// ─── Storage ──────────────────────────────────────────────────
const DB = {
  K: { sessions: 'outwork_sessions', exercises: 'outwork_exercises' },

  getSessions() {
    try {
      return JSON.parse(localStorage.getItem(this.K.sessions) || '[]');
    } catch { return []; }
  },
  saveSessions(s) {
    try { localStorage.setItem(this.K.sessions, JSON.stringify(s)); } catch { console.warn('Storage full'); }
  },
  addSession(s) {
    const all = this.getSessions();
    all.push(s);
    this.saveSessions(all);
  },
  deleteSession(id) {
    this.saveSessions(this.getSessions().filter(s => s.id !== id));
  },
  getExercises() {
    try {
      const stored = localStorage.getItem(this.K.exercises);
      if (stored) return JSON.parse(stored);
    } catch { /* corrupted, reset to defaults */ }
    localStorage.setItem(this.K.exercises, JSON.stringify(DEFAULT_EXERCISES));
    return [...DEFAULT_EXERCISES];
  },
  saveExercises(e) {
    try { localStorage.setItem(this.K.exercises, JSON.stringify(e)); } catch { console.warn('Storage full'); }
  },
  addExercise(e) {
    const all = this.getExercises();
    all.push(e);
    this.saveExercises(all);
  },
  deleteExercise(id) {
    this.saveExercises(this.getExercises().filter(e => e.id !== id));
  },
};

// ─── State ────────────────────────────────────────────────────
const state = {
  view: 'home',
  session: null,
  sessionStep: 'select',
  selectedIds: [],
  progressExercise: null,
  newExType: 'reps',
};

// ─── Utils ────────────────────────────────────────────────────
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}
function todayStr() {
  const d = new Date();
  // Use LOCAL date — toISOString() is UTC and breaks in UTC-3 after 9pm
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function fmtDate(str) {
  const [y, m, d] = str.split('-');
  const months = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  return `${parseInt(d)} ${months[parseInt(m) - 1]} ${y}`;
}

// Volume: reps-based returns reps total, cardio returns km*80+min (heatmap proxy)
function exVolume(ex) {
  if (ex.type === 'cardio') {
    return ex.entries.reduce((a, e) => a + (e.km || 0) * 80 + (e.min || 0), 0);
  }
  return ex.sets.reduce((a, s) => a + s.reps, 0);
}
function sessionVolume(session) {
  return session.exercises.reduce((a, ex) => a + exVolume(ex), 0);
}
function sessionRepTotal(session) {
  return session.exercises
    .filter(ex => ex.type !== 'cardio')
    .reduce((a, ex) => a + ex.sets.reduce((b, s) => b + s.reps, 0), 0);
}

function localDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function getStreak() {
  const sessions = DB.getSessions();
  if (!sessions.length) return 0;
  const uniqueDates = [...new Set(sessions.map(s => s.date))].sort().reverse();
  const today = todayStr();
  const yD = new Date(); yD.setDate(yD.getDate() - 1);
  const yest = localDateStr(yD);
  if (uniqueDates[0] !== today && uniqueDates[0] !== yest) return 0;
  let streak = 0;
  const check = new Date(uniqueDates[0] + 'T12:00:00'); // noon avoids DST edge cases
  for (const date of uniqueDates) {
    if (date === localDateStr(check)) {
      streak++;
      check.setDate(check.getDate() - 1);
    } else break;
  }
  return streak;
}

// ─── Heat Map ─────────────────────────────────────────────────
function renderHeatMap() {
  const sessions = DB.getSessions();
  const dayMap = {};
  sessions.forEach(s => {
    const v = sessionVolume(s);
    dayMap[s.date] = (dayMap[s.date] || 0) + v;
  });

  // Use percentile-based thresholds for richer contrast
  const volumes = Object.values(dayMap).filter(v => v > 0).sort((a, b) => a - b);
  const p = (pct) => volumes[Math.floor(pct * (volumes.length - 1))] || 1;
  const t1 = p(0.25), t2 = p(0.50), t3 = p(0.75);

  function level(v) {
    if (v === 0) return 0;
    if (v <= t1) return 1;
    if (v <= t2) return 2;
    if (v <= t3) return 3;
    return 4;
  }

  // Build grid: last 17 weeks (Mon..Sun columns)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - 7 * 17);
  startDate.setDate(startDate.getDate() - startDate.getDay());

  const mNames = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  const cells = [];
  const monthLabels = {};
  const seenMonths = new Set(); // track year-month combos already labeled
  const cur = new Date(startDate);

  while (cur <= today) {
    const key = cur.toISOString().split('T')[0];
    const v = dayMap[key] || 0;
    const colIndex = Math.floor(cells.length / 7);

    // Label a month only the FIRST time we encounter it — no duplicates
    const monthKey = cur.getFullYear() + '-' + cur.getMonth();
    if (!seenMonths.has(monthKey)) {
      seenMonths.add(monthKey);
      monthLabels[colIndex] = mNames[cur.getMonth()];
    }

    cells.push({ key, level: level(v) });
    cur.setDate(cur.getDate() + 1);
  }

  // No padding on last column — grid ends exactly at today, like GitHub
  const numCols = Math.ceil(cells.length / 7);
  const labelArr = Array(numCols).fill('');
  Object.entries(monthLabels).forEach(([col, name]) => { labelArr[col] = name; });

  const labelsHtml = labelArr.map(l => `<div class="hm-month">${l}</div>`).join('');
  const cellsHtml = cells
    .map(c => `<div class="hm-cell ${c.level < 0 ? 'empty' : 'level-' + c.level}"></div>`)
    .join('');

  return `
    <div class="heatmap-wrap">
      <div class="hm-inner">
        <div class="hm-months" style="grid-auto-columns:14px">${labelsHtml}</div>
        <div class="hm-grid">${cellsHtml}</div>
      </div>
      <div class="hm-legend">
        <span class="legend-label">Menos</span>
        <div class="hm-cell level-0"></div>
        <div class="hm-cell level-1"></div>
        <div class="hm-cell level-2"></div>
        <div class="hm-cell level-3"></div>
        <div class="hm-cell level-4"></div>
        <span class="legend-label">Más</span>
      </div>
    </div>`;
}

// ─── Progress Chart ───────────────────────────────────────────
function renderProgressChart(exerciseId) {
  const exercises = DB.getExercises();
  const exercise = exercises.find(e => e.id === exerciseId);
  if (!exercise) return '<p class="empty-state">Seleccioná un ejercicio.</p>';

  const isCardio = exercise.type === 'cardio';
  const sessions = DB.getSessions();

  const data = sessions
    .filter(s => s.exercises.some(e => e.exerciseId === exerciseId))
    .map(s => {
      const ex = s.exercises.find(e => e.exerciseId === exerciseId);
      if (isCardio) {
        const totalKm  = ex.entries.reduce((a, e) => a + (e.km  || 0), 0);
        const totalMin = ex.entries.reduce((a, e) => a + (e.min || 0), 0);
        return { date: s.date, primary: totalKm, secondary: totalMin };
      } else {
        const total = ex.sets.reduce((a, set) => a + set.reps, 0);
        const best  = Math.max(...ex.sets.map(set => set.reps));
        return { date: s.date, primary: total, best };
      }
    })
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-20);

  if (!data.length) {
    return `<p class="empty-state">Sin registros de ${exercise.name} todavía.</p>`;
  }

  const maxVal = Math.max(...data.map(d => d.primary), 1);
  const W = 340, H = 180;
  const PAD = { top: 20, right: 12, bottom: 44, left: 36 };
  const cW = W - PAD.left - PAD.right;
  const cH = H - PAD.top - PAD.bottom;
  const n = data.length;
  const barW = Math.max(8, Math.min(24, cW / n - 4));

  const gridLines = [0.25, 0.5, 0.75, 1].map(r => {
    const y = PAD.top + cH - r * cH;
    const label = isCardio
      ? (maxVal * r).toFixed(1)
      : Math.round(maxVal * r);
    return `<line x1="${PAD.left}" y1="${y}" x2="${W - PAD.right}" y2="${y}"
              stroke="#1E1E1E" stroke-width="1"/>
            <text x="${PAD.left - 6}" y="${y + 4}" text-anchor="end"
              font-size="9" fill="#555" font-family="Space Mono, monospace">${label}</text>`;
  }).join('');

  const bars = data.map((d, i) => {
    const x = PAD.left + (n === 1 ? cW / 2 : (i / (n - 1)) * cW);
    const bH = Math.max(4, (d.primary / maxVal) * cH);
    const y = PAD.top + cH - bH;
    const isMax = d.primary === maxVal;
    const dateParts = d.date.slice(5).replace('-', '/');
    const label = isCardio ? d.primary.toFixed(1) : d.primary;
    return `
      <rect x="${x - barW / 2}" y="${y}" width="${barW}" height="${bH}"
            rx="4" fill="${isMax ? '#C6FF00' : '#3A5C00'}"/>
      <text x="${x}" y="${H - PAD.bottom + 14}" text-anchor="middle"
            font-size="9" fill="#555" font-family="Space Mono, monospace">${dateParts}</text>
      <text x="${x}" y="${y - 5}" text-anchor="middle"
            font-size="9" fill="${isMax ? '#C6FF00' : '#666'}" font-family="Space Mono, monospace">${label}</text>`;
  }).join('');

  // Stats
  let statsHtml;
  if (isCardio) {
    const bestKm  = Math.max(...data.map(d => d.primary));
    const totalKm = data.reduce((a, d) => a + d.primary, 0);
    const avgKm   = totalKm / data.length;
    const totalMin = data.reduce((a, d) => a + (d.secondary || 0), 0);
    statsHtml = `
      <div class="stat-pill"><span class="stat-label">Mejor salida</span><span class="stat-val">${bestKm.toFixed(1)} km</span></div>
      <div class="stat-pill"><span class="stat-label">Total km</span><span class="stat-val">${totalKm.toFixed(1)}</span></div>
      <div class="stat-pill"><span class="stat-label">Promedio</span><span class="stat-val">${avgKm.toFixed(1)} km</span></div>
      <div class="stat-pill"><span class="stat-label">Tiempo total</span><span class="stat-val">${totalMin} min</span></div>`;
  } else {
    const bestSession = Math.max(...data.map(d => d.primary));
    const bestSet = Math.max(...data.map(d => d.best || 0));
    const avg = Math.round(data.reduce((a, d) => a + d.primary, 0) / data.length);
    statsHtml = `
      <div class="stat-pill"><span class="stat-label">Mejor sesión</span><span class="stat-val">${bestSession}</span></div>
      <div class="stat-pill"><span class="stat-label">Mejor serie</span><span class="stat-val">${bestSet}</span></div>
      <div class="stat-pill"><span class="stat-label">Promedio</span><span class="stat-val">${avg}</span></div>
      <div class="stat-pill"><span class="stat-label">Sesiones</span><span class="stat-val">${data.length}</span></div>`;
  }

  const chartTitle = isCardio
    ? `${exercise.name.toUpperCase()} — km por salida`
    : `${exercise.name.toUpperCase()} — reps por sesión`;

  return `
    <div class="chart-wrap">
      <p class="chart-title">${chartTitle}</p>
      <svg viewBox="0 0 ${W} ${H}" class="chart-svg">
        ${gridLines}${bars}
      </svg>
      <div class="chart-stats">${statsHtml}</div>
    </div>`;
}

// ─── Views ────────────────────────────────────────────────────
function viewHome() {
  const sessions = DB.getSessions();
  const streak = getStreak();
  const totalReps = sessions.reduce((a, s) => a + sessionRepTotal(s), 0);

  const recent = [...sessions]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 3);

  const exercises = DB.getExercises();
  const recentHtml = recent.length
    ? recent.map(s => {
        const names = s.exercises
          .map(e => exercises.find(x => x.id === e.exerciseId)?.name)
          .filter(Boolean).join(' · ');
        const vol = sessionRepTotal(s);
        const cardioEx = s.exercises.find(e => e.type === 'cardio');
        const parts = [];
        if (vol > 0) parts.push(vol + ' reps');
        if (cardioEx) parts.push(cardioEx.entries.reduce((a, e) => a + (e.km || 0), 0).toFixed(1) + ' km');
        const volStr = parts.join(' · ') || '—';
        return `
          <div class="session-card mini">
            <div>
              <div class="sc-date">${fmtDate(s.date)}</div>
              <div class="sc-exercises">${names}</div>
            </div>
            <div class="sc-reps">${volStr}</div>
          </div>`;
      }).join('')
    : '<p class="empty-state">Todavía no hay sesiones.<br>¡Empezá hoy!</p>';

  return `
    <div class="view home-view">
      <header class="home-header">
        <span class="logo-text">OUTWORK</span>
        <div class="streak-badge ${streak > 0 ? 'active' : ''}">
          <span class="streak-icon">🔥</span>
          <span class="streak-num">${streak}</span>
          <span class="streak-label">días</span>
        </div>
      </header>

      <section class="stats-row">
        <div class="stat-card">
          <span class="stat-big">${sessions.length}</span>
          <span class="stat-name">Sesiones</span>
        </div>
        <div class="stat-card">
          <span class="stat-big">${totalReps >= 1000 ? (totalReps / 1000).toFixed(1) + 'k' : totalReps}</span>
          <span class="stat-name">Reps totales</span>
        </div>
        <div class="stat-card">
          <span class="stat-big">${streak}</span>
          <span class="stat-name">Racha</span>
        </div>
      </section>

      <section class="heatmap-section">
        <h2 class="section-title">ACTIVIDAD <span class="subtitle">últimos 4 meses</span></h2>
        ${renderHeatMap()}
      </section>

      <button class="cta-btn" onclick="openSession()">
        <span>INICIAR SESIÓN</span>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0A0A0A" stroke-width="2.5"><polyline points="9,18 15,12 9,6"/></svg>
      </button>

      <section class="recent-section">
        <h2 class="section-title">RECIENTES</h2>
        ${recentHtml}
      </section>
    </div>`;
}

function viewHistory() {
  const sessions = [...DB.getSessions()].sort((a, b) => b.date.localeCompare(a.date));
  const exercises = DB.getExercises();

  if (!sessions.length) {
    return `<div class="view"><h1 class="view-title">HISTORIAL</h1>
      <p class="empty-state">No hay sesiones todavía.<br>¡Empezá hoy!</p></div>`;
  }

  const html = sessions.map(s => {
    const exRows = s.exercises.map(ex => {
      const info = exercises.find(e => e.id === ex.exerciseId);
      if (!info) return '';
      if (ex.type === 'cardio') {
        const totalKm  = ex.entries.reduce((a, e) => a + (e.km  || 0), 0).toFixed(1);
        const totalMin = ex.entries.reduce((a, e) => a + (e.min || 0), 0);
        return `<div class="ex-row">
          <span class="ex-name">${info.name}</span>
          <span class="ex-sets"><em>${totalKm} km · ${totalMin} min</em></span>
        </div>`;
      }
      const total = ex.sets.reduce((a, set) => a + set.reps, 0);
      const setsStr = ex.sets.map((set, i) => `S${i + 1}:${set.reps}`).join('  ');
      return `<div class="ex-row">
        <span class="ex-name">${info.name}</span>
        <span class="ex-sets">${setsStr} <em>(${total})</em></span>
      </div>`;
    }).filter(Boolean).join('');

    const reps = sessionRepTotal(s);
    const cardioEx = s.exercises.find(e => e.type === 'cardio');
    const summary = [
      reps > 0 ? `${reps} reps` : '',
      cardioEx ? cardioEx.entries.reduce((a, e) => a + (e.km || 0), 0).toFixed(1) + ' km' : ''
    ].filter(Boolean).join(' · ');

    return `
      <div class="session-card">
        <div class="sc-header">
          <div>
            <div class="sc-date">${fmtDate(s.date)}</div>
            <div class="sc-total">${summary}</div>
          </div>
          <button class="delete-btn" onclick="deleteSession('${s.id}')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3,6 5,6 21,6"/>
              <path d="M19,6l-1,14a2,2,0,0,1-2,2H8a2,2,0,0,1-2-2L5,6"/>
              <path d="M10,11v6"/><path d="M14,11v6"/>
            </svg>
          </button>
        </div>
        <div class="sc-exercises-detail">${exRows}</div>
      </div>`;
  }).join('');

  return `<div class="view history-view">
    <h1 class="view-title">HISTORIAL</h1>
    <div class="sessions-list">${html}</div>
  </div>`;
}

function viewProgress() {
  const exercises = DB.getExercises();
  const sessions = DB.getSessions();
  const usedIds = new Set(sessions.flatMap(s => s.exercises.map(e => e.exerciseId)));
  const used = exercises.filter(e => usedIds.has(e.id));
  const currentId = state.progressExercise || used[0]?.id || null;

  if (!used.length) {
    return `<div class="view progress-view">
      <h1 class="view-title">PROGRESO</h1>
      <p class="empty-state">Completá algunas sesiones para ver tu progreso.</p>
    </div>`;
  }

  const opts = used.map(e =>
    `<option value="${e.id}" ${e.id === currentId ? 'selected' : ''}>${e.name}</option>`
  ).join('');

  return `<div class="view progress-view">
    <h1 class="view-title">PROGRESO</h1>
    <div class="select-wrap">
      <select class="ex-select" onchange="changeProgress(this.value)">${opts}</select>
    </div>
    ${renderProgressChart(currentId)}
  </div>`;
}

function viewExercises() {
  const exercises = DB.getExercises();
  const byMuscle = {};
  exercises.forEach(e => {
    if (!byMuscle[e.muscle]) byMuscle[e.muscle] = [];
    byMuscle[e.muscle].push(e);
  });

  const groups = Object.entries(byMuscle).map(([muscle, exs]) => `
    <div class="muscle-group">
      <h3 class="muscle-name">${muscle}</h3>
      <div class="ex-list">
        ${exs.map(e => `
          <div class="ex-item">
            <span>${e.name}</span>
            <span class="ex-item-type">${e.type === 'cardio' ? 'km/min' : 'reps'}</span>
            ${e.custom ? `<button class="delete-ex-btn" onclick="removeExercise('${e.id}')">✕</button>` : ''}
          </div>`).join('')}
      </div>
    </div>`).join('');

  const t = state.newExType;
  return `<div class="view exercises-view">
    <h1 class="view-title">EJERCICIOS</h1>
    <div style="padding:0 20px">${groups}</div>

    <div class="add-exercise-form">
      <h3>AGREGAR EJERCICIO</h3>
      <input id="new-name" class="text-input" type="text" placeholder="Nombre del ejercicio">
      <input id="new-muscle" class="text-input" type="text" placeholder="Grupo muscular (ej: Piernas)">
      <div class="type-toggle">
        <button class="type-btn ${t === 'reps' ? 'active' : ''}" onclick="setNewExType('reps')">Repeticiones</button>
        <button class="type-btn ${t === 'cardio' ? 'active' : ''}" onclick="setNewExType('cardio')">Cardio (km/min)</button>
      </div>
      <button class="secondary-btn" onclick="addExercise()">+ AGREGAR</button>
    </div>

    <div class="export-section">
      <h3>MIS DATOS</h3>
      <div class="export-btns">
        <button class="secondary-btn" onclick="exportData()">⬇ Exportar JSON</button>
        <button class="secondary-btn" onclick="document.getElementById('imp').click()">⬆ Importar JSON</button>
        <input type="file" id="imp" accept=".json" style="display:none" onchange="importData(event)">
      </div>
    </div>
  </div>`;
}

// ─── Session Overlay ──────────────────────────────────────────
function openSession() {
  state.session = { id: uid(), date: todayStr(), exercises: [] };
  state.sessionStep = 'select';
  state.selectedIds = [];
  document.getElementById('session-overlay').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  renderSession();
}

function closeSession() {
  document.getElementById('session-overlay').classList.add('hidden');
  document.body.style.overflow = '';
  state.session = null;
}

function renderSession() {
  document.getElementById('session-content').innerHTML =
    state.sessionStep === 'select' ? renderSelectStep() : renderLogStep();
}

function renderSelectStep() {
  const exercises = DB.getExercises();
  const byMuscle = {};
  exercises.forEach(e => {
    if (!byMuscle[e.muscle]) byMuscle[e.muscle] = [];
    byMuscle[e.muscle].push(e);
  });

  const groups = Object.entries(byMuscle).map(([muscle, exs]) => `
    <div class="sess-muscle-group">
      <h4 class="sess-muscle-name">${muscle}</h4>
      ${exs.map(e => {
        const sel = state.selectedIds.includes(e.id);
        return `<div class="ex-checkbox ${sel ? 'checked' : ''}" onclick="toggleEx('${e.id}')">
          <span>${e.name}</span>
          <div class="check-mark">${sel ? '✓' : ''}</div>
        </div>`;
      }).join('')}
    </div>`).join('');

  const canProceed = state.selectedIds.length > 0;
  return `<div class="session-panel">
    <div class="session-nav">
      <button class="icon-btn" onclick="closeSession()">✕</button>
      <span class="session-title">ELEGÍ EJERCICIOS</span>
      <button class="next-btn ${canProceed ? '' : 'disabled'}" onclick="${canProceed ? 'goLog()' : ''}">
        LISTO →
      </button>
    </div>
    <div class="session-body">${groups}</div>
  </div>`;
}

function renderLogStep() {
  const exercises = DB.getExercises();

  if (!state.session.exercises.length) {
    state.session.exercises = state.selectedIds.map(id => {
      const ex = exercises.find(e => e.id === id);
      if (ex?.type === 'cardio') {
        return { exerciseId: id, type: 'cardio', entries: [{ km: 3.0, min: 20 }] };
      }
      return { exerciseId: id, type: 'reps', sets: [{ reps: 10 }, { reps: 10 }, { reps: 10 }] };
    });
  }

  const logHtml = state.session.exercises.map((ex, ei) => {
    const info = exercises.find(e => e.id === ex.exerciseId);

    if (ex.type === 'cardio') {
      return renderCardioLog(ex, ei, info);
    }

    const total = ex.sets.reduce((a, s) => a + s.reps, 0);
    const setsHtml = ex.sets.map((set, si) => `
      <div class="set-row">
        <span class="set-label">S${si + 1}</span>
        <button class="rep-btn minus" onclick="chgRep(${ei},${si},-1)">−</button>
        <span class="rep-count">${set.reps}</span>
        <button class="rep-btn plus" onclick="chgRep(${ei},${si},1)">+</button>
        ${ex.sets.length > 1
          ? `<button class="remove-set-btn" onclick="rmSet(${ei},${si})">✕</button>`
          : '<div style="width:28px"></div>'}
      </div>`).join('');

    return `<div class="log-exercise">
      <div class="log-ex-header">
        <span class="log-ex-name">${info?.name || ex.exerciseId}</span>
        <span class="log-ex-total">${total} reps</span>
      </div>
      <div class="sets-container">${setsHtml}</div>
      <button class="add-set-btn" onclick="addSet(${ei})">+ SERIE</button>
    </div>`;
  }).join('');

  return `<div class="session-panel">
    <div class="session-nav">
      <button class="icon-btn" onclick="backToSelect()">←</button>
      <span class="session-title">REGISTRÁ</span>
      <button class="next-btn" onclick="finishSession()">GUARDAR ✓</button>
    </div>
    <div class="session-body">${logHtml}</div>
  </div>`;
}

function renderCardioLog(ex, ei, info) {
  const entriesHtml = ex.entries.map((entry, eni) => {
    const pace = entry.km > 0 && entry.min > 0
      ? (entry.min / entry.km).toFixed(1) + ' min/km'
      : '—';
    return `<div class="cardio-entry">
      <div class="cardio-entry-header">
        <span>Salida ${eni + 1}</span>
        ${ex.entries.length > 1
          ? `<button class="remove-set-btn" onclick="rmCardioEntry(${ei},${eni})">✕</button>`
          : ''}
      </div>
      <div class="cardio-fields">
        <div class="cardio-field">
          <span class="cardio-label">Distancia</span>
          <div class="cardio-num-wrap">
            <button class="cardio-btn" onclick="chgCardio(${ei},${eni},'km',-0.5)">−</button>
            <span class="cardio-val">${entry.km.toFixed(1)}</span>
            <button class="cardio-btn" onclick="chgCardio(${ei},${eni},'km',0.5)">+</button>
          </div>
          <span class="cardio-unit">km</span>
        </div>
        <div class="cardio-field">
          <span class="cardio-label">Tiempo</span>
          <div class="cardio-num-wrap">
            <button class="cardio-btn" onclick="chgCardio(${ei},${eni},'min',-5)">−</button>
            <span class="cardio-val">${entry.min}</span>
            <button class="cardio-btn" onclick="chgCardio(${ei},${eni},'min',5)">+</button>
          </div>
          <span class="cardio-unit">min</span>
        </div>
      </div>
      <div class="cardio-total">Ritmo: ${pace}</div>
    </div>`;
  }).join('');

  const totalKm  = ex.entries.reduce((a, e) => a + e.km, 0).toFixed(1);
  const totalMin = ex.entries.reduce((a, e) => a + e.min, 0);

  return `<div class="log-exercise">
    <div class="log-ex-header">
      <span class="log-ex-name">${info?.name || 'Cardio'}</span>
      <span class="log-ex-total">${totalKm} km · ${totalMin} min</span>
    </div>
    <div class="cardio-log">${entriesHtml}</div>
    <button class="add-set-btn" onclick="addCardioEntry(${ei})">+ SALIDA</button>
  </div>`;
}

// ─── Session Actions ──────────────────────────────────────────
function toggleEx(id) {
  const idx = state.selectedIds.indexOf(id);
  idx >= 0 ? state.selectedIds.splice(idx, 1) : state.selectedIds.push(id);
  renderSession();
}

function goLog() {
  state.sessionStep = 'log';
  state.session.exercises = [];
  renderSession();
}

function backToSelect() {
  state.sessionStep = 'select';
  renderSession();
}

function addSet(ei) {
  const lastReps = state.session.exercises[ei].sets.slice(-1)[0]?.reps || 10;
  state.session.exercises[ei].sets.push({ reps: lastReps });
  renderSession();
}

function rmSet(ei, si) {
  state.session.exercises[ei].sets.splice(si, 1);
  renderSession();
}

function chgRep(ei, si, delta) {
  const cur = state.session.exercises[ei].sets[si].reps;
  state.session.exercises[ei].sets[si].reps = Math.max(1, cur + delta);
  renderSession();
}

function addCardioEntry(ei) {
  const last = state.session.exercises[ei].entries.slice(-1)[0] || { km: 3.0, min: 20 };
  state.session.exercises[ei].entries.push({ km: last.km, min: last.min });
  renderSession();
}

function rmCardioEntry(ei, eni) {
  state.session.exercises[ei].entries.splice(eni, 1);
  renderSession();
}

function chgCardio(ei, eni, field, delta) {
  const cur = state.session.exercises[ei].entries[eni][field];
  if (field === 'km') {
    state.session.exercises[ei].entries[eni].km =
      Math.max(0.5, Math.round((cur + delta) * 10) / 10);
  } else {
    state.session.exercises[ei].entries[eni].min =
      Math.max(5, cur + delta);
  }
  renderSession();
}

function finishSession() {
  if (!state.session.exercises.length) return;
  DB.addSession(state.session);
  closeSession();
  navigate('home');
}

// ─── Global Actions ───────────────────────────────────────────
function deleteSession(id) {
  if (confirm('¿Eliminás esta sesión?')) {
    DB.deleteSession(id);
    render();
  }
}

function changeProgress(id) {
  state.progressExercise = id;
  render();
}

function setNewExType(t) {
  state.newExType = t;
  render();
}

function addExercise() {
  const name   = document.getElementById('new-name').value.trim();
  const muscle = document.getElementById('new-muscle').value.trim();
  if (!name || !muscle) { alert('Completá nombre y grupo muscular.'); return; }
  DB.addExercise({ id: uid(), name, muscle, type: state.newExType, custom: true });
  render();
}

function removeExercise(id) {
  if (confirm('¿Eliminar este ejercicio?')) {
    DB.deleteExercise(id);
    render();
  }
}

function exportData() {
  const payload = {
    sessions: DB.getSessions(),
    customExercises: DB.getExercises().filter(e => e.custom),
    exportedAt: new Date().toISOString(),
    app: 'OUTWORK v1',
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `outwork-backup-${todayStr()}.json`;
  a.click(); URL.revokeObjectURL(url);
}

function importData(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      if (data.sessions) {
        // Merge: keep existing sessions, add imported ones that aren't already present
        const existing = DB.getSessions();
        const existingIds = new Set(existing.map(s => s.id));
        const merged = [...existing, ...data.sessions.filter(s => !existingIds.has(s.id))];
        merged.sort((a, b) => a.date.localeCompare(b.date));
        DB.saveSessions(merged);
      }
      if (data.customExercises) {
        data.customExercises.forEach(ex => {
          const existing = DB.getExercises();
          if (!existing.find(e => e.id === ex.id)) DB.addExercise(ex);
        });
      }
      render();
      const count = data.sessions?.length || 0;
      alert(`¡Importación exitosa! ${count} sesiones procesadas.`);
    } catch { alert('El archivo no es válido.'); }
  };
  reader.readAsText(file);
  event.target.value = '';
}

// ─── Navigation ───────────────────────────────────────────────
function navigate(view) {
  state.view = view;
  if (view !== 'progress') state.progressExercise = null;
  render();
}

function render() {
  const views = { home: viewHome, history: viewHistory, progress: viewProgress, exercises: viewExercises, timer: viewTimer };
  document.getElementById('app').innerHTML = views[state.view]();
  window.scrollTo(0, 0);
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === state.view);
  });
}

// ─── PWA ──────────────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').catch(console.error);
  });
}

// ─── Boot ─────────────────────────────────────────────────────
render();

// ============================================================
// TIMER MODULE
// ============================================================

// ─── Timer Storage ────────────────────────────────────────────
const TimerDB = {
  K: 'outwork_timer_profiles',
  get() {
    try { return JSON.parse(localStorage.getItem(this.K) || '[]'); } catch { return []; }
  },
  save(profiles) {
    try { localStorage.setItem(this.K, JSON.stringify(profiles)); } catch {}
  },
  add(p)     { const all = this.get(); all.push(p); this.save(all); },
  delete(id) { this.save(this.get().filter(p => p.id !== id)); },
  update(p)  { this.save(this.get().map(x => x.id === p.id ? p : x)); },
};

// ─── Timer State ──────────────────────────────────────────────
const T = {
  form: { name: 'Mi rutina', sets: 4, workSecs: 40, restSecs: 20, prepSecs: 5 },
  editingId: null,

  // runtime — persists while navigating away
  phase: 'idle',   // 'idle' | 'prep' | 'work' | 'rest' | 'done'
  currentSet: 0,
  secondsLeft: 0,
  totalSecs: 0,
  running: false,
  interval: null,
  profile: null,
  wakeLock: null,

  get active() { return this.profile !== null && this.phase !== 'idle'; },
};

// ─── Web Audio ────────────────────────────────────────────────
let AC = null;
function getAC() {
  if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)();
  if (AC.state === 'suspended') AC.resume();
  return AC;
}
function beep(freq, dur, type = 'sine', vol = 0.35, startDelay = 0) {
  try {
    const ac = getAC();
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.connect(gain); gain.connect(ac.destination);
    osc.type = type; osc.frequency.value = freq;
    const t = ac.currentTime + startDelay;
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.start(t); osc.stop(t + dur + 0.05);
  } catch {}
}
function soundTick()  { beep(880, 0.08, 'sine',   0.25); }
function soundStart() { beep(660, 0.10, 'square', 0.28, 0); beep(990, 0.15, 'square', 0.32, 0.13); }
function soundRest()  { beep(660, 0.12, 'sine',   0.30, 0); beep(440, 0.25, 'sine',   0.22, 0.14); }
function soundDone()  { beep(660, 0.10, 'square', 0.28, 0); beep(880, 0.10, 'square', 0.30, 0.14); beep(1100, 0.22, 'square', 0.28, 0.28); }

// ─── WakeLock ─────────────────────────────────────────────────
async function acquireWakeLock() {
  if (!('wakeLock' in navigator)) return;
  try { T.wakeLock = await navigator.wakeLock.request('screen'); } catch {}
}
function releaseWakeLock() {
  if (T.wakeLock) { T.wakeLock.release().catch(() => {}); T.wakeLock = null; }
}

// ─── Timer View ───────────────────────────────────────────────
function viewTimer() {
  const profiles  = TimerDB.get();
  const f         = T.form;
  const isEditing = T.editingId !== null;

  // If there's an active timer, show a resume banner at the top
  const resumeBanner = T.active ? `
    <div class="resume-banner" onclick="openTimerOverlay()">
      <div class="resume-info">
        <div class="resume-dot ${T.running ? 'pulsing' : ''}"></div>
        <div>
          <div class="resume-name">${T.profile.name}</div>
          <div class="resume-meta">
            ${T.phase === 'prep' ? 'PREPARANDO' : T.phase === 'work' ? `SERIE ${T.currentSet}/${T.profile.sets}` : T.phase === 'rest' ? 'DESCANSO' : ''}
            · ${T.running ? 'corriendo' : 'pausado'}
          </div>
        </div>
      </div>
      <div class="resume-time">${fmtSecs(T.secondsLeft)}</div>
    </div>` : '';

  const profilesHtml = profiles.length
    ? profiles.map(p => `
        <div class="profile-card">
          <div class="profile-info" onclick="openProfileTimer('${p.id}')">
            <div class="profile-name">${p.name}</div>
            <div class="profile-meta">${p.sets} series · ${p.workSecs}s trabajo · ${p.restSecs}s descanso · prep ${p.prepSecs}s</div>
          </div>
          <div class="profile-actions">
            <button class="delete-btn" onclick="editProfile('${p.id}')">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
            <button class="delete-btn" onclick="deleteProfile('${p.id}')">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3,6 5,6 21,6"/>
                <path d="M19,6l-1,14a2,2,0,0,1-2,2H8a2,2,0,0,1-2-2L5,6"/>
              </svg>
            </button>
            <button class="play-btn" onclick="startTimerAutoplay('${p.id}')">
              <svg width="18" height="18" viewBox="0 0 24 24">
                <polygon points="5,3 19,12 5,21" fill="#0A0A0A"/>
              </svg>
            </button>
          </div>
        </div>`)
      .join('')
    : '<p class="empty-state" style="padding:20px 0">No hay perfiles todavía.<br>Creá uno abajo.</p>';

  // num field: +/- buttons + editable input in the middle
  const numField = (label, key, min, max, unit = '') => `
    <div class="form-field">
      <span class="form-label">${label}${unit ? ' (' + unit + ')' : ''}</span>
      <div class="num-input-wrap">
        <button class="num-input-btn" onclick="tFormChg('${key}',-1,${min},${max})">−</button>
        <input class="num-input-text" type="number" id="tf-${key}" value="${f[key]}"
          min="${min}" max="${max}"
          onchange="tFormSet('${key}',this.value,${min},${max})"
          oninput="tFormSet('${key}',this.value,${min},${max})">
        <button class="num-input-btn" onclick="tFormChg('${key}',1,${min},${max})">+</button>
      </div>
    </div>`;

  return `<div class="view timer-view">
    <h1 class="view-title">TIMER</h1>
    ${resumeBanner}
    <div class="timer-profiles">${profilesHtml}</div>
    <div class="profile-form-wrap">
      <h3>${isEditing ? 'EDITAR PERFIL' : 'NUEVO PERFIL'}</h3>
      <div class="form-row full">
        <div class="form-field">
          <span class="form-label">Nombre</span>
          <input id="tf-name" class="text-input" type="text" value="${f.name}"
            oninput="T.form.name=this.value" placeholder="Mi rutina">
        </div>
      </div>
      <div class="form-row">
        ${numField('Series', 'sets', 1, 30)}
        ${numField('Preparación', 'prepSecs', 0, 60, 'seg')}
      </div>
      <div class="form-row">
        ${numField('Trabajo', 'workSecs', 5, 3600, 'seg')}
        ${numField('Descanso', 'restSecs', 0, 3600, 'seg')}
      </div>
      <div style="display:flex;gap:8px;margin-top:4px">
        ${isEditing ? `<button class="secondary-btn" style="flex:1" onclick="cancelEditProfile()">Cancelar</button>` : ''}
        <button class="secondary-btn" style="flex:2;border-color:rgba(198,255,0,0.4);color:var(--accent)"
          onclick="saveProfile()">${isEditing ? 'GUARDAR CAMBIOS' : '+ GUARDAR PERFIL'}</button>
      </div>
    </div>
  </div>`;
}

// ─── Timer Form Actions ───────────────────────────────────────
function tFormChg(key, delta, min, max) {
  T.form[key] = Math.max(min, Math.min(max, T.form[key] + delta));
  const el = document.getElementById('tf-' + key);
  if (el) el.value = T.form[key];
}
function tFormSet(key, val, min, max) {
  const n = parseInt(val, 10);
  if (!isNaN(n)) T.form[key] = Math.max(min, Math.min(max, n));
}

function saveProfile() {
  // Sync all num inputs before saving (user might have typed without blur)
  ['sets','prepSecs','workSecs','restSecs'].forEach(k => {
    const el = document.getElementById('tf-' + k);
    if (el) tFormSet(k, el.value, k === 'sets' ? 1 : 0, k === 'sets' ? 30 : 3600);
  });
  const name = (document.getElementById('tf-name')?.value || T.form.name).trim();
  if (!name) { alert('Poné un nombre al perfil.'); return; }
  T.form.name = name;
  if (T.form.workSecs < 5) { alert('El tiempo de trabajo debe ser al menos 5 segundos.'); return; }

  if (T.editingId) {
    TimerDB.update({ id: T.editingId, ...T.form });
    T.editingId = null;
  } else {
    TimerDB.add({ id: uid(), ...T.form });
  }
  T.form = { name: 'Mi rutina', sets: 4, workSecs: 40, restSecs: 20, prepSecs: 5 };
  render();
}

function editProfile(id) {
  const p = TimerDB.get().find(x => x.id === id);
  if (!p) return;
  T.form = { name: p.name, sets: p.sets, workSecs: p.workSecs, restSecs: p.restSecs, prepSecs: p.prepSecs };
  T.editingId = id;
  render();
  setTimeout(() => document.querySelector('.profile-form-wrap')?.scrollIntoView({ behavior: 'smooth' }), 50);
}

function cancelEditProfile() {
  T.editingId = null;
  T.form = { name: 'Mi rutina', sets: 4, workSecs: 40, restSecs: 20, prepSecs: 5 };
  render();
}

function deleteProfile(id) {
  if (confirm('¿Eliminar este perfil?')) { TimerDB.delete(id); render(); }
}

// ─── Two entry modes ──────────────────────────────────────────
// Tap on card → load profile, open overlay PAUSED (user hits play)
function openProfileTimer(id) {
  // If same profile already active, just re-open overlay
  if (T.active && T.profile?.id === id) { openTimerOverlay(); return; }
  const p = TimerDB.get().find(x => x.id === id);
  if (!p) return;
  loadTimerProfile(p, false);
  openTimerOverlay();
}

// Tap on ▶ button → load and AUTOPLAY
function startTimerAutoplay(id) {
  const p = TimerDB.get().find(x => x.id === id);
  if (!p) return;
  loadTimerProfile(p, true);
  openTimerOverlay();
}

function loadTimerProfile(p, autoplay) {
  // Stop any running timer first
  if (T.interval) { clearInterval(T.interval); T.interval = null; }
  releaseWakeLock();

  T.profile    = p;
  T.currentSet = 1;
  T.running    = false;

  if (p.prepSecs > 0) {
    T.phase = 'prep'; T.secondsLeft = p.prepSecs; T.totalSecs = p.prepSecs;
  } else {
    T.phase = 'work'; T.secondsLeft = p.workSecs; T.totalSecs = p.workSecs;
  }

  if (autoplay) timerPlay();
}

// ─── Overlay open/close (non-destructive) ─────────────────────
function openTimerOverlay() {
  document.getElementById('timer-overlay').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  renderTimerOverlay();
}

// ← back: hides overlay but keeps timer running in background
function hideTimerOverlay() {
  document.getElementById('timer-overlay').classList.add('hidden');
  document.body.style.overflow = '';
  // Re-render the timer tab so the resume banner updates
  if (state.view === 'timer') render();
}

// ✕ cancel: stops timer completely
function cancelTimer() {
  timerStop();
  T.profile = null;
  T.phase   = 'idle';
  document.getElementById('timer-overlay').classList.add('hidden');
  document.body.style.overflow = '';
  if (state.view === 'timer') render();
}

// ─── Timer Execution ──────────────────────────────────────────
function timerPlay() {
  if (T.running) return;
  T.running = true;
  acquireWakeLock();
  try { getAC(); } catch {}
  T.interval = setInterval(timerTick, 1000);
  renderTimerOverlay();
  // Also refresh nav dot
  updateNavDot();
}

function timerStop() {
  if (T.interval) { clearInterval(T.interval); T.interval = null; }
  T.running = false;
  releaseWakeLock();
}

function timerPause() {
  timerStop();
  renderTimerOverlay();
  updateNavDot();
}

function timerToggle() {
  T.running ? timerPause() : timerPlay();
}

function timerRestart() {
  timerStop();
  const p = T.profile;
  T.currentSet = 1;
  if (p.prepSecs > 0) {
    T.phase = 'prep'; T.secondsLeft = p.prepSecs; T.totalSecs = p.prepSecs;
  } else {
    T.phase = 'work'; T.secondsLeft = p.workSecs; T.totalSecs = p.workSecs;
  }
  renderTimerOverlay();
}

function timerSkip() {
  timerAdvancePhase();
  const overlayHidden = document.getElementById('timer-overlay').classList.contains('hidden');
  if (!overlayHidden) renderTimerOverlay();
  else if (state.view === 'timer') render();
}

function timerTick() {
  T.secondsLeft--;
  if (T.secondsLeft > 0 && T.secondsLeft <= 3) soundTick();
  if (T.secondsLeft <= 0) timerAdvancePhase();

  const overlayHidden = document.getElementById('timer-overlay').classList.contains('hidden');
  if (!overlayHidden) {
    renderTimerOverlay();
  } else {
    // Patch only the live elements in the banner — no full re-render
    const timeEl = document.querySelector('.resume-time');
    const metaEl = document.querySelector('.resume-meta');
    if (timeEl) timeEl.textContent = fmtSecs(T.secondsLeft);
    if (metaEl) {
      const phaseStr = T.phase === 'prep' ? 'PREPARANDO'
        : T.phase === 'work' ? `SERIE ${T.currentSet}/${T.profile.sets}`
        : T.phase === 'rest' ? 'DESCANSO' : '';
      metaEl.textContent = `${phaseStr} · ${T.running ? 'corriendo' : 'pausado'}`;
    }
  }
  updateNavDot();
}

function timerAdvancePhase() {
  const p = T.profile;
  if (T.phase === 'prep') {
    T.phase = 'work'; T.secondsLeft = p.workSecs; T.totalSecs = p.workSecs;
    soundStart();
  } else if (T.phase === 'work') {
    if (p.restSecs > 0) {
      T.phase = 'rest'; T.secondsLeft = p.restSecs; T.totalSecs = p.restSecs;
      soundRest();
    } else {
      if (T.currentSet >= p.sets) { timerFinish(); return; }
      T.currentSet++;
      T.phase = 'work'; T.secondsLeft = p.workSecs; T.totalSecs = p.workSecs;
      soundStart();
    }
  } else if (T.phase === 'rest') {
    if (T.currentSet >= p.sets) { timerFinish(); return; }
    T.currentSet++;
    T.phase = 'work'; T.secondsLeft = p.workSecs; T.totalSecs = p.workSecs;
    soundStart();
  }
  // If overlay hidden and on timer view, refresh the banner so phase label updates
  const overlayHidden = document.getElementById('timer-overlay').classList.contains('hidden');
  if (overlayHidden && state.view === 'timer') render();
}

function timerFinish() {
  timerStop();
  T.phase = 'done';
  soundDone();
  updateNavDot();
}

// ─── Nav dot indicator ────────────────────────────────────────
function updateNavDot() {
  const btn = document.querySelector('.nav-btn[data-view="timer"]');
  if (!btn) return;
  let dot = btn.querySelector('.nav-active-dot');
  if (T.active && T.phase !== 'done') {
    if (!dot) {
      dot = document.createElement('div');
      dot.className = 'nav-active-dot';
      btn.appendChild(dot);
    }
    dot.classList.toggle('pulsing', T.running);
  } else {
    dot?.remove();
  }
}

// ─── Timer Overlay Render ─────────────────────────────────────
function fmtSecs(s) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0 ? `${m}:${String(sec).padStart(2, '0')}` : String(s);
}

function renderTimerOverlay() {
  const el = document.getElementById('timer-content');
  if (!el) return;
  el.innerHTML = buildTimerPanel();
}

function buildTimerPanel() {
  const p = T.profile;
  if (!p) return '';

  const phase    = T.phase;
  const isDone   = phase === 'done';
  const sLeft    = T.secondsLeft;
  const total    = T.totalSecs || 1;
  const progress = isDone ? 1 : Math.max(0, 1 - (sLeft / total));

  const R     = 108;
  const circ  = 2 * Math.PI * R;
  const offset = circ * (1 - progress);

  const phaseLabel = { prep: 'PREPARATE', work: 'SERIE', rest: 'DESCANSO', done: '¡LISTO!' }[phase] || '';
  const phaseClass = { prep: 'prep', work: 'work', rest: 'rest', done: 'done' }[phase] || '';

  const dotsHtml = Array.from({ length: p.sets }, (_, i) => {
    const setN = i + 1;
    let cls = '';
    if (isDone || setN < T.currentSet) cls = 'done-set';
    else if (setN === T.currentSet && phase !== 'prep') cls = 'active-set';
    return `<div class="timer-dot ${cls}"></div>`;
  }).join('');

  let controls;
  if (isDone) {
    controls = `
      <div style="text-align:center;padding:0 20px 40px">
        <div class="timer-done-msg">¡COMPLETASTE ${p.sets} ${p.sets === 1 ? 'SERIE' : 'SERIES'}!</div>
        <div class="timer-done-sub">${fmtSecs(p.workSecs)} trabajo · ${p.restSecs > 0 ? fmtSecs(p.restSecs) + ' descanso' : 'sin descanso'}</div>
        <button class="cta-btn" onclick="timerRestart();timerPlay()" style="margin:0 auto">REPETIR</button>
        <button class="secondary-btn" onclick="cancelTimer()" style="margin-top:12px">CERRAR</button>
      </div>`;
  } else {
    const playIcon = T.running
      ? `<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>`
      : `<polygon points="5,3 19,12 5,21" fill="#0A0A0A" stroke="none"/>`;
    controls = `
      <div class="timer-controls">
        <button class="ctrl-btn" onclick="timerRestart()" title="Reiniciar">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <polyline points="1,4 1,10 7,10"/>
            <path d="M3.51 15a9 9 0 1 0 .49-4.95"/>
          </svg>
        </button>
        <button class="ctrl-btn primary" onclick="timerToggle()">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#0A0A0A" stroke-width="2" stroke-linecap="round">${playIcon}</svg>
        </button>
        <button class="ctrl-btn" onclick="timerSkip()" title="Saltar fase">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <polygon points="5,4 15,12 5,20"/><line x1="19" y1="5" x2="19" y2="19"/>
          </svg>
        </button>
      </div>`;
  }

  return `<div class="timer-panel">
    <div class="timer-panel-nav">
      <button class="icon-btn" onclick="hideTimerOverlay()" title="Volver">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="15,18 9,12 15,6"/>
        </svg>
      </button>
      <span class="timer-panel-title">${p.name.toUpperCase()}</span>
      <button class="icon-btn" onclick="cancelTimer()" title="Cancelar rutina" style="font-size:13px">✕</button>
    </div>

    <div class="timer-clock-area">
      <div class="timer-phase-label ${phaseClass}">${phaseLabel}</div>
      <div class="timer-ring-wrap">
        <svg class="timer-ring-svg" viewBox="0 0 240 240">
          <circle class="timer-ring-bg" cx="120" cy="120" r="${R}"/>
          <circle class="timer-ring-progress ${phaseClass}" cx="120" cy="120" r="${R}"
            stroke-dasharray="${circ}" stroke-dashoffset="${offset}"/>
        </svg>
        <div class="timer-time">
          <div class="timer-digits">${isDone ? '✓' : fmtSecs(sLeft)}</div>
          <div class="timer-set-info">
            ${isDone ? '' : phase === 'prep' ? 'ARRANCANDO' : `SERIE ${T.currentSet} / ${p.sets}`}
          </div>
        </div>
      </div>
      <div class="timer-dots">${dotsHtml}</div>
    </div>

    ${controls}
  </div>`;
}

