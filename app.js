'use strict';
/* FORGE — gym module. Everything is stored on-device in localStorage.
   Weights are stored in kg internally and converted for display. */

// ---------- data ----------
const KEY = 'gympet.v1'; // key kept so existing data survives the redesign
const GROUPS = ['Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Legs', 'Glutes', 'Core'];
const CATS = {
  STR: { label: 'Push', groups: ['Chest', 'Shoulders', 'Triceps'], k: 50000 },
  PUL: { label: 'Pull', groups: ['Back', 'Biceps'], k: 40000 },
  LEG: { label: 'Legs', groups: ['Legs', 'Glutes'], k: 60000 },
  COR: { label: 'Core', groups: ['Core'], k: 20000 },
};
const LIB = {
  Chest: ['Bench Press', 'Incline Bench Press', 'Dumbbell Bench Press', 'Incline Dumbbell Press', 'Chest Fly', 'Cable Crossover', 'Push-Up', 'Dips', 'Machine Chest Press'],
  Back: ['Deadlift', 'Pull-Up', 'Chin-Up', 'Barbell Row', 'Dumbbell Row', 'Lat Pulldown', 'Seated Cable Row', 'T-Bar Row', 'Face Pull'],
  Shoulders: ['Overhead Press', 'Dumbbell Shoulder Press', 'Lateral Raise', 'Rear Delt Fly', 'Arnold Press', 'Upright Row', 'Shrug'],
  Biceps: ['Barbell Curl', 'Dumbbell Curl', 'Hammer Curl', 'Preacher Curl', 'Cable Curl'],
  Triceps: ['Tricep Pushdown', 'Skull Crusher', 'Overhead Tricep Extension', 'Close-Grip Bench Press'],
  Legs: ['Squat', 'Front Squat', 'Leg Press', 'Romanian Deadlift', 'Lunge', 'Bulgarian Split Squat', 'Leg Extension', 'Leg Curl', 'Calf Raise'],
  Glutes: ['Hip Thrust', 'Glute Bridge', 'Cable Kickback'],
  Core: ['Plank', 'Crunch', 'Hanging Leg Raise', 'Cable Crunch', 'Russian Twist', 'Ab Wheel'],
};
const uid = () => Math.random().toString(36).slice(2, 10);
const defaultChar = () => ({ created: false, name: '', sex: 'm', goal: 'muscle' });
const defaultState = () => ({
  v: 1,
  settings: { unit: 'kg', weekly: 3, bw: 80 },
  char: defaultChar(),
  exercises: Object.entries(LIB).flatMap(([g, ns]) => ns.map(n => ({ id: 'lib-' + n.toLowerCase().replace(/\W+/g, '-'), name: n, group: g }))),
  workouts: [],   // finished: {id,start,end,entries:[{ex,sets:[{w,r}]}]}
  active: null,   // same shape, sets also carry {done}
});
let S = load();
function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY));
    if (raw && raw.v === 1) return migrate(raw);
  } catch (e) {}
  return defaultState();
}
function migrate(raw) {
  const d = defaultState();
  const s = Object.assign({}, d.settings, raw.settings || {});
  if (raw.settings && raw.settings.goal && !raw.settings.weekly) s.weekly = raw.settings.goal;
  delete s.goal; delete s.petName;
  const ch = Object.assign(d.char, raw.char || {});
  if (ch.name === 'PLAYER') ch.name = '';                       // old default from the pixel-character version
  if (!GOALS[ch.goal]) ch.goal = 'muscle';
  return Object.assign(d, raw, { settings: s, char: ch });
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { toast('Storage full or blocked!'); } }
const exById = id => S.exercises.find(e => e.id === id) || { id, name: '(deleted)', group: 'Core' };

// ---------- units & formatting ----------
const KG_LB = 2.20462;
const unit = () => S.settings.unit;
const toDisp = kg => unit() === 'lb' ? kg * KG_LB : kg;
const fromDisp = v => unit() === 'lb' ? v / KG_LB : v;
const num = v => String(Math.round(v * 10) / 10);
const fmtW = kg => num(toDisp(kg));
function fmtVol(kg) {
  const v = toDisp(kg);
  return (v >= 10000 ? (v / 1000).toFixed(1) + 'k' : Math.round(v).toLocaleString()) + ' ' + unit();
}
function fmtDur(ms) {
  const s = Math.max(0, Math.round(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), ss = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : `${m}:${String(ss).padStart(2, '0')}`;
}
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const fmtMin = ms => Math.round(ms / 60000) + ' min';
const day = t => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- maths ----------
// Bodyweight sets (weight 0: push-ups, pull-ups, planks...) count as 60% of bodyweight so they still build the figure.
// Reps are capped at 30 for bodyweight sets so timed holds (plank seconds) don't inflate volume.
const setVol = s => s.w > 0 ? s.w * (s.r || 0) : S.settings.bw * 0.6 * Math.min(s.r || 0, 30);
const doneSets = w => w.entries.flatMap(e => e.sets.filter(s => s.done !== false && s.r > 0));
const wVolume = w => doneSets(w).reduce((a, s) => a + setVol(s), 0);
const wDur = w => (w.end || Date.now()) - w.start;
const e1rm = s => s.r <= 0 ? 0 : (s.r === 1 ? s.w : s.w * (1 + s.r / 30)); // Epley
const bestE1 = sets => sets.reduce((a, s) => Math.max(a, e1rm(s)), 0);
const weekStart = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getTime(); };
const WEEK = 7 * 864e5;
const weeksBack = (ws, n) => weekStart(ws - n * WEEK + 6 * 3600e3);   // DST-safe: a week isn't always exactly 7×24h
const lastSessionFor = exId => {
  for (let i = S.workouts.length - 1; i >= 0; i--) {
    const e = S.workouts[i].entries.find(x => x.ex === exId);
    if (e && e.sets.length) return e.sets;
  }
  return null;
};
function bestBefore(exId, beforeTs) {
  let b = 0;
  S.workouts.forEach(w => { if (w.start < beforeTs) w.entries.forEach(e => { if (e.ex === exId) b = Math.max(b, bestE1(e.sets)); }); });
  return b;
}
function volumeByGroup(since) {
  const out = {}; GROUPS.forEach(g => out[g] = 0);
  S.workouts.forEach(w => { if (w.start >= since) w.entries.forEach(e => { out[exById(e.ex).group] += e.sets.reduce((a, s) => a + setVol(s), 0); }); });
  return out;
}

// ---------- character progression ----------
// Each attribute is a 0..1 score from recent volume with a 60-day half-life,
// so the figure grows while you train and slowly shrinks if you stop.
function scores(at) {
  const now = at || Date.now(), out = { STR: 0, PUL: 0, LEG: 0, COR: 0 }, catOf = {};
  Object.entries(CATS).forEach(([k, c]) => c.groups.forEach(g => catOf[g] = k));
  S.workouts.forEach(w => {
    if (w.start > now) return;
    const f = Math.pow(.5, (now - w.start) / 864e5 / 60);
    w.entries.forEach(e => { out[catOf[exById(e.ex).group]] += e.sets.reduce((a, s) => a + setVol(s), 0) * f; });
  });
  Object.keys(out).forEach(k => out[k] = 1 - Math.exp(-out[k] / CATS[k].k));
  return out;
}
function daysSince() {
  if (!S.workouts.length) return null;
  return Math.floor((Date.now() - new Date(S.workouts[S.workouts.length - 1].start).setHours(0, 0, 0, 0)) / 864e5);
}
const condition = () => { const d = daysSince(); return d === null ? 1 : Math.max(0, Math.min(1, 1 - (d - 1) / 9)); };
function lastLine() {
  const d = daysSince();
  if (S.active) return 'Session in progress';
  if (d === null) return 'No sessions yet';
  return d === 0 ? 'Trained today' : d === 1 ? 'Last session yesterday' : `Last session ${d} days ago`;
}
function weekStreak() {
  const goal = S.settings.weekly, now = weekStart(Date.now());
  const cnt = ws => S.workouts.filter(w => weekStart(w.start) === ws).length;
  let streak = 0, ws = now;
  if (cnt(ws) >= goal) streak++;
  ws = weeksBack(ws, 1);
  while (cnt(ws) >= goal) { streak++; ws = weeksBack(ws, 1); }
  return streak;
}

// ---------- UI plumbing ----------
let tab = 'status', selEx = null, restStart = null, prevPct = 0, heatRange = 7, bodyView = 'front';

// ---------- muscle heat map ----------
// Heat = how much a muscle group has been worked in the window (0..1). Low heat shows red on the body map.
const HEAT_K = { Chest: 5000, Back: 6000, Shoulders: 3500, Biceps: 2500, Triceps: 2500, Legs: 9000, Glutes: 4000, Core: 2500 }; // weekly volume that reads as ~63% heat
function heatData(days) {
  const since = Date.now() - days * 864e5, out = {};
  GROUPS.forEach(g => out[g] = { vol: 0, sets: 0, last: null, heat: 0 });
  S.workouts.forEach(w => w.entries.forEach(e => {
    const o = out[exById(e.ex).group];
    if (!o.last || w.start > o.last) o.last = w.start;
    if (w.start >= since) { o.vol += e.sets.reduce((a, s) => a + setVol(s), 0); o.sets += e.sets.length; }
  }));
  GROUPS.forEach(g => { out[g].heat = 1 - Math.exp(-out[g].vol / (HEAT_K[g] * days / 7)); });
  return out;
}
const heatValues = days => { const d = heatData(days), o = {}; GROUPS.forEach(g => o[g] = d[g].heat); return o; };
const daysAgo = t => t == null ? null : Math.floor((Date.now() - new Date(t).setHours(0, 0, 0, 0)) / 864e5);
const rangeSeg = () => `<div class="seg">${[7, 30].map(n => `<button class="${heatRange === n ? 'on' : ''}" data-act="range" data-n="${n}">${n}D</button>`).join('')}</div>`;
function heatCard() {
  const d = heatData(heatRange);
  const rows = GROUPS.map(g => {
    const o = d[g], ago = daysAgo(o.last), bad = damageOf(o.heat) > .35;
    const note = bad ? (ago == null ? 'Not trained' : `${ago}d ago`) : `${o.sets} sets`;
    return `<div class="stat heat"><span>${g}</span>${segBar(Math.max(2, o.heat * 100), heatCss(o.heat))}<span style="${bad ? 'color:var(--bad)' : ''}">${note}</span></div>`;
  }).join('');
  return `<div class="card"><div class="row sp" style="margin-bottom:6px"><span class="small mute">Volume per muscle group</span>${rangeSeg()}</div>${rows}</div>`;
}
const view = document.getElementById('view'), sheet = document.getElementById('sheet');
function toast(msg) {
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t);
  setTimeout(() => t.remove(), 2200);
}
function openSheet(html) { sheet.innerHTML = `<div class="panel">${html}</div>`; sheet.hidden = false; }
function closeSheet() { sheet.hidden = true; sheet.innerHTML = ''; }
sheet.addEventListener('click', e => { if (e.target === sheet && S.char.created) closeSheet(); });
document.getElementById('tabs').addEventListener('click', e => {
  const b = e.target.closest('button'); if (b) { tab = b.dataset.tab; render(); view.scrollTop = 0; }
});
function render() {
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  view.innerHTML = ({ status: vStatus, workout: vWorkout, progress: vProgress, more: vMore }[tab])();
}
const segBar = (pct, color) => `<div class="bar" ${color ? `style="--c:${color}"` : ''}><i style="width:${Math.max(0, Math.min(100, pct))}%"></i></div>`;

// ---------- views ----------
function greeting() {
  const h = new Date().getHours(), n = S.char.name ? ', ' + esc(S.char.name) : '';
  return (h < 5 ? 'Good evening' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening') + n;
}
function sparkline(vals) {
  const W = 110, H = 36, p = 3, mx = Math.max(...vals), mn = Math.min(...vals), rg = mx - mn || 1;
  const pts = vals.map((v, i) => [p + i / (vals.length - 1) * (W - 2 * p), H - p - (v - mn) / rg * (H - 2 * p)]);
  const last = pts[pts.length - 1];
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><polyline points="${pts.map(q => q.map(n => n.toFixed(1)).join(',')).join(' ')}" fill="none" stroke="#ecebe7" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/><circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="2.5" fill="#ecebe7"/></svg>`;
}
function vStatus() {
  const c = S.char, sc = scores(), info = physiqueInfo(c, sc), streak = weekStreak();
  const ws = weekStart(Date.now()), thisWeek = S.workouts.filter(w => w.start >= ws);
  const today = (new Date().getDay() + 6) % 7;
  const daysOn = new Set(thisWeek.map(w => (new Date(w.start).getDay() + 6) % 7));
  const d = heatData(heatRange), heat = {}; GROUPS.forEach(g => heat[g] = d[g].heat);
  const groups = GROUPS.map(g => {
    const o = d[g], bad = damageOf(o.heat) > .35, ago = daysAgo(o.last);
    return `<div class="${bad ? 'bad' : ''}"><span>${g}</span><span>${bad ? (ago == null ? 'Not trained' : ago + 'd ago') : o.sets + ' sets'}</span></div>`;
  }).join('');
  const trend = Array.from({ length: 9 }, (_, k) => { const s = scores(Date.now() - (8 - k) * WEEK); return (s.STR + s.PUL + s.LEG + s.COR) / 4; });
  const attrs = Object.entries(CATS).map(([k, a]) =>
    `<div class="stat"><span>${a.label}</span>${segBar(sc[k] * 100, damageOf(sc[k] * 1.8) > .35 ? 'var(--bad)' : '')}<span>${Math.round(sc[k] * 100)}%</span></div>`).join('');
  return `
  <div class="date">${new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' })}</div>
  <h1>${greeting()}</h1>
  <div class="small mute">${lastLine()}</div>
  <div class="card" style="margin-top:18px">
    <div class="row sp" style="align-items:flex-start"><div><div class="small mute">This week</div><div class="big" style="margin-top:6px">${thisWeek.length} <small>/ ${S.settings.weekly} sessions</small></div></div>
      <div style="text-align:right"><div class="small mute">Streak</div><div style="font-size:20px;font-weight:600;margin-top:4px">${streak} ${streak === 1 ? 'wk' : 'wks'}</div></div></div>
    <div class="wk">${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((n, i) => `<div class="${i === today ? 'today' : ''}"><b class="${daysOn.has(i) ? 'on' : ''}"></b>${n}</div>`).join('')}</div>
  </div>
  <div class="row sp" style="margin:26px 0 10px"><h2 style="margin:0">Muscle balance</h2>${rangeSeg()}</div>
  <div class="card">
    <div class="bodies">${bodySVG('front', { heat, ch: c, sc, width: 104 })}${bodySVG('back', { heat, ch: c, sc, width: 104 })}</div>
    <div class="legend"><span><i style="background:#3a3d44"></i>On track</span><span><i style="background:var(--bad)"></i>Needs work</span></div>
    <div class="mg">${groups}</div>
  </div>
  <h2>Physique</h2>
  <div class="card">
    <div class="row sp"><div><div style="font-size:18px;font-weight:600">${info.tier}</div><div class="small mute">${GOALS[c.goal].label} · ${Math.round(info.overall * 100)}% of goal</div></div>${S.workouts.length ? sparkline(trend) : ''}</div>
    <div style="margin-top:12px">${attrs}</div>
    <div class="tiny mute" style="margin-top:8px">Based on your last ~2 months of training. Time off lowers it gradually.</div>
  </div>
  <button class="btn" style="margin-top:20px" data-act="goWorkout">${S.active ? 'Resume workout' : 'Start workout'}</button>`;
}

function vWorkout() {
  const a = S.active;
  if (!a) {
    const recent = S.workouts.slice(-3).reverse();
    return `<h1>Train</h1><p class="mute small" style="margin:0 0 18px">Log each set as you go. Weights prefill from last time.</p>
    <button class="btn" data-act="startEmpty">Start empty workout</button>
    ${recent.length ? `<h2>Repeat a recent workout</h2>` + recent.map(w =>
      `<div class="card row sp"><div class="grow"><b>${day(w.start)}</b><div class="small mute">${w.entries.map(e => esc(exById(e.ex).name)).join(', ')}</div></div><button class="btn sm sec" data-act="repeat" data-id="${w.id}">Repeat</button></div>`).join('') : ''}`;
  }
  const rest = restStart ? `<span id="rest" class="chip on">Rest ${fmtDur(Date.now() - restStart)}</span>` : `<span id="rest"></span>`;
  return `
  <div class="card"><div class="row sp"><div><div class="timer" id="timer">${fmtDur(Date.now() - a.start)}</div><div class="small mute" id="live">${fmtVol(wVolume(a))} · ${plural(doneSets(a).length, 'set')}</div></div>${rest}</div></div>
  ${a.entries.map((e, i) => exCard(e, i)).join('')}
  <button class="btn sec" data-act="addEx">+ Add exercise</button>
  <div class="row" style="margin-top:14px"><button class="btn danger" data-act="discard">Discard</button><button class="btn" data-act="finish">Finish</button></div>`;
}
function exCard(e, i) {
  const ex = exById(e.ex), last = lastSessionFor(e.ex);
  return `<div class="ex">
    <div class="row sp"><div><b>${esc(ex.name)}</b> <span class="chip">${ex.group}</span>
      <div class="prev">${last ? 'Last: ' + last.map(s => `${fmtW(s.w)}×${s.r}`).join(', ') : 'First time'}</div></div>
      <button class="link" data-act="rmEx" data-i="${i}">✕</button></div>
    <div class="hdr" style="margin-top:8px"><span>Set</span><span>${unit()}</span><span>Reps</span><span></span></div>
    ${e.sets.map((s, j) => `<div class="setrow ${s.done ? 'done' : ''}">
      <span class="n">${j + 1}</span>
      <input inputmode="decimal" value="${s.w ? fmtW(s.w) : ''}" placeholder="0" data-f="w" data-i="${i}" data-j="${j}">
      <input inputmode="numeric" value="${s.r || ''}" placeholder="0" data-f="r" data-i="${i}" data-j="${j}">
      <button class="chk" data-act="chk" data-i="${i}" data-j="${j}">✓</button></div>`).join('')}
    <div class="row"><button class="link" data-act="addSet" data-i="${i}">+ Add set</button>${e.sets.length > 1 ? `<button class="link" style="color:var(--mute)" data-act="rmSet" data-i="${i}">− Remove last</button>` : ''}</div>
  </div>`;
}

function vProgress() {
  const W = S.workouts;
  if (!W.length) return `<h1>Progress</h1><div class="card mute">Finish your first session and the numbers show up here.</div>`;
  const ws = weekStart(Date.now());
  const wk = W.filter(w => w.start >= ws);
  const vol = a => a.reduce((x, w) => x + wVolume(w), 0), dur = a => a.reduce((x, w) => x + wDur(w), 0);
  const weeks = Array.from({ length: 8 }, (_, k) => weeksBack(ws, 7 - k));
  const wv = weeks.map(t => vol(W.filter(w => weekStart(w.start) === t)));
  const gv = volumeByGroup(Date.now() - 30 * 864e5), gmax = Math.max(1, ...Object.values(gv));
  const hist = {};
  W.forEach(w => w.entries.forEach(e => { if (e.sets.length) (hist[e.ex] = hist[e.ex] || []).push({ t: w.start, sets: e.sets }); }));
  const exIds = Object.keys(hist).sort((a, b) => hist[b].length - hist[a].length);
  if (!selEx || !hist[selEx]) selEx = exIds[0];
  const pts = hist[selEx].map(h => ({ x: h.t, y: toDisp(bestE1(h.sets)) }));
  const first = pts[0].y, lastY = pts[pts.length - 1].y, best = Math.max(...pts.map(p => p.y));
  const chg = first ? Math.round((lastY - first) / first * 100) : 0;
  return `<h1>Progress</h1>
  <div class="grid" style="margin-top:10px">
    <div class="tile"><b>${wk.length}</b><span>Sessions this week</span></div>
    <div class="tile"><b>${fmtVol(vol(wk))}</b><span>Volume this week</span></div>
    <div class="tile"><b>${fmtMin(dur(wk))}</b><span>Time this week</span></div>
    <div class="tile"><b>${fmtVol(vol(W))}</b><span>All time · ${W.length} sessions</span></div>
  </div>
  <h2>Weekly volume</h2><div class="card">${bars(wv.map(v => toDisp(v)), weeks.map(t => day(t)))}</div>
  <h2>Muscle balance</h2>${heatCard()}
  <h2>Exercise progress</h2>
  <select data-act="selEx">${exIds.map(id => `<option value="${id}" ${id === selEx ? 'selected' : ''}>${esc(exById(id).name)} (${hist[id].length})</option>`).join('')}</select>
  <div class="card" style="margin-top:10px">
    <div class="row sp small"><span class="mute">Est. 1-rep max (${unit()})</span><span class="${chg >= 0 ? 'pr' : 'mute'}">${pts.length > 1 ? (chg >= 0 ? '+' : '−') + Math.abs(chg) + '% since first' : 'One session so far'}</span></div>
    ${line(pts)}
    <div class="small mute">Best <span style="color:var(--text)">${num(best)} ${unit()}</span> · Last ${num(lastY)} ${unit()}</div>
  </div>
  <h2>History</h2>
  ${W.slice().reverse().map(w => `<div class="card row sp" data-act="detail" data-id="${w.id}" style="cursor:pointer"><div class="grow"><b>${new Date(w.start).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</b><div class="small mute">${w.entries.map(e => esc(exById(e.ex).name)).join(', ')}</div></div><div style="text-align:right" class="small"><b>${fmtVol(wVolume(w))}</b><div class="mute">${fmtMin(wDur(w))}</div></div></div>`).join('')}`;
}

function vMore() {
  const s = S.settings;
  return `<h1>Profile</h1>
  <h2>You</h2><div class="card"><div class="row sp"><div><b>${esc(S.char.name || 'No name')}</b><div class="small mute">${S.char.sex === 'f' ? 'Female' : 'Male'} · ${GOALS[S.char.goal].label}</div></div><button class="btn sm sec" data-act="editChar">Edit</button></div></div>
  <h2>Settings</h2><div class="card">
    <label>Units</label>
    <div><button class="pill ${s.unit === 'kg' ? 'on' : ''}" data-act="unit" data-u="kg">kg</button><button class="pill ${s.unit === 'lb' ? 'on' : ''}" data-act="unit" data-u="lb">lb</button></div>
    <label>Weekly goal (sessions)</label>
    <div>${[1, 2, 3, 4, 5, 6].map(n => `<button class="pill ${s.weekly === n ? 'on' : ''}" data-act="weekly" data-n="${n}">${n}</button>`).join('')}</div>
    <label>Bodyweight (${unit()}) · used for push-ups, pull-ups and planks</label>
    <input inputmode="decimal" value="${fmtW(s.bw)}" data-set="bw">
  </div>
  <h2>Your data</h2><div class="card">
    <p class="small mute" style="margin-top:0">Data lives only on this device. Export a backup now and then, especially before clearing browser data.</p>
    <div class="row"><button class="btn sec sm grow" data-act="export">Export backup</button><button class="btn sec sm grow" data-act="import">Import</button></div>
    <input type="file" id="file" accept="application/json" hidden>
  </div>
  <h2>Exercise library</h2><div class="card"><button class="btn sec sm" data-act="newEx">+ Create custom exercise</button></div>
  <h2>Danger zone</h2><button class="btn danger" data-act="reset">Erase all data</button>
  <p class="tiny mute" style="text-align:center;margin-top:20px">FORGE</p>`;
}

// ---------- character creator ----------
function creator() {
  const c = S.char;
  const pills = (opts, k) => opts.map(([v, l]) => `<button class="pill ${c[k] === v ? 'on' : ''}" data-act="cc" data-k="${k}" data-v="${v}">${l}</button>`).join('');
  openSheet(`<h1>${c.created ? 'Edit profile' : 'Set up your profile'}</h1>
    <p class="small mute" style="margin:0 0 6px">The body map follows your training. Drag to preview how it develops toward your goal.</p>
    <div class="preview" id="pcv"></div>
    <label id="pvl"></label>
    <input type="range" id="pv" min="0" max="100" value="${prevPct}" class="range">
    <label>Name</label><input id="cname" value="${esc(c.name)}" maxlength="20" autocomplete="off" placeholder="Your name">
    <label>Body</label><div>${pills([['m', 'Male'], ['f', 'Female']], 'sex')}</div>
    <label>Goal</label>
    ${Object.entries(GOALS).map(([k, g]) => `<button class="goal ${c.goal === k ? 'on' : ''}" data-act="cc" data-k="goal" data-v="${k}"><b>${g.label}</b><span>${g.desc}</span></button>`).join('')}
    <div style="height:14px"></div><button class="btn" data-act="saveChar">${c.created ? 'Save' : 'Get started'}</button>`);
  drawPreview();
}
function drawPreview() {
  const el = document.getElementById('pcv'); if (!el) return;
  const p = prevPct / 100, sc = prevPct > 0 ? { STR: p, PUL: p, LEG: p, COR: p } : scores();
  el.innerHTML = bodySVG('front', { ch: S.char, sc, width: 92 }) + bodySVG('back', { ch: S.char, sc, width: 92 });
  document.getElementById('pvl').textContent = prevPct > 0 ? `Preview: ${prevPct}% of goal` : 'Preview: you right now';
}

// ---------- charts ----------
function bars(vals, labels) {
  const max = Math.max(1, ...vals), W = 320, H = 110, bw = W / vals.length;
  return `<svg viewBox="0 0 ${W} ${H + 16}" width="100%">${vals.map((v, i) => {
    const h = v / max * H;
    return `<rect x="${i * bw + 5}" y="${H - h}" width="${bw - 10}" height="${Math.max(h, 1)}" rx="3" fill="${i === vals.length - 1 ? '#ecebe7' : '#3a3d44'}" opacity="${v ? 1 : .4}"/><text x="${i * bw + bw / 2}" y="${H + 12}" text-anchor="middle">${labels[i]}</text>`;
  }).join('')}</svg>`;
}
function line(pts) {
  const W = 320, H = 120, p = 14;
  if (pts.length === 1) return `<svg viewBox="0 0 ${W} ${H}" width="100%"><rect x="${W / 2 - 5}" y="${H / 2 - 5}" width="10" height="10" rx="5" fill="#ecebe7"/></svg>`;
  const xs = pts.map(q => q.x), ys = pts.map(q => q.y), x0 = Math.min(...xs), x1 = Math.max(...xs);
  const y0 = Math.min(...ys) * .95, y1 = Math.max(...ys) * 1.02 || 1;
  const X = x => p + (x - x0) / (x1 - x0 || 1) * (W - 2 * p), Y = y => H - p - (y - y0) / (y1 - y0 || 1) * (H - 2 * p);
  const d = pts.map((q, i) => (i ? 'L' : 'M') + X(q.x).toFixed(1) + ' ' + Y(q.y).toFixed(1)).join(' ');
  return `<svg viewBox="0 0 ${W} ${H}" width="100%"><path d="${d}" fill="none" stroke="#ecebe7" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>${pts.map(q => `<circle cx="${X(q.x)}" cy="${Y(q.y)}" r="3" fill="var(--bg)" stroke="#ecebe7" stroke-width="1.5"/>`).join('')}</svg>`;
}

// ---------- actions ----------
function newSet(exId, j) {
  const last = lastSessionFor(exId);
  const src = last ? (last[j] || last[last.length - 1]) : null;
  return { w: src ? src.w : 0, r: src ? src.r : 0, done: false };
}
function addEntry(exId) {
  const last = lastSessionFor(exId), n = last ? Math.min(last.length, 5) : 3;
  S.active.entries.push({ ex: exId, sets: Array.from({ length: n }, (_, j) => newSet(exId, j)) });
}
function start(entries) { S.active = { id: uid(), start: Date.now(), entries: entries || [] }; restStart = null; save(); tab = 'workout'; render(); }
function exPicker() {
  const used = new Set(S.active.entries.map(e => e.ex));
  const list = q => S.exercises.filter(e => !used.has(e.id) && e.name.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name))
    .map(e => `<div class="item" data-act="pick" data-id="${e.id}"><span>${esc(e.name)}</span><span class="chip">${e.group}</span></div>`).join('') || '<p class="mute">No match — create it below.</p>';
  openSheet(`<h1>Add exercise</h1><input id="q" placeholder="Search…" autocomplete="off"><div id="list" style="margin:8px 0">${list('')}</div>
    <button class="btn sec" data-act="newEx">+ Create custom exercise</button>`);
  document.getElementById('q').addEventListener('input', ev => { document.getElementById('list').innerHTML = list(ev.target.value); });
}
function newExSheet() {
  openSheet(`<h1>New exercise</h1><input id="nn" placeholder="Name" maxlength="40"><div style="height:10px"></div>
    <select id="ng">${GROUPS.map(g => `<option>${g}</option>`).join('')}</select><div style="height:14px"></div>
    <button class="btn" data-act="saveEx">Save</button>`);
}
function finishWorkout() {
  const a = S.active;
  a.entries.forEach(e => { e.sets = e.sets.filter(s => s.done && s.r > 0).map(s => ({ w: s.w || 0, r: s.r })); });
  a.entries = a.entries.filter(e => e.sets.length);
  if (!a.entries.length) { if (confirm('No completed sets. Discard this session?')) { S.active = null; restStart = null; save(); render(); } return; }
  const tierBefore = physiqueInfo(S.char, scores()).tier;
  a.end = Date.now();
  const prs = a.entries.filter(e => { const b = bestBefore(e.ex, a.start); return b > 0 && bestE1(e.sets) > b + 0.01; }).map(e => exById(e.ex).name);
  S.workouts.push(a); S.active = null; restStart = null; save();
  const tierAfter = physiqueInfo(S.char, scores()).tier;
  openSheet(`<h1>Workout complete</h1><p class="small mute" style="margin:0 0 14px">${new Date(a.start).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</p>
    <div class="grid"><div class="tile"><b>${fmtMin(wDur(a))}</b><span>Duration</span></div><div class="tile"><b>${fmtVol(wVolume(a))}</b><span>Volume</span></div>
    <div class="tile"><b>${doneSets(a).length}</b><span>Sets</span></div><div class="tile"><b>${a.entries.length}</b><span>Exercises</span></div></div>
    ${prs.length ? `<div class="card"><span class="pr">New personal best</span><div class="small mute">${prs.map(esc).join(', ')}</div></div>` : ''}
    ${tierAfter !== tierBefore ? `<div class="card"><span class="small mute">Physique</span><div style="font-weight:600">${tierAfter}</div></div>` : ''}
    <button class="btn" style="margin-top:8px" data-act="doneSummary">Done</button>`);
}
function detailSheet(id) {
  const w = S.workouts.find(x => x.id === id); if (!w) return;
  openSheet(`<h1>${new Date(w.start).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</h1>
    <p class="mute small">${fmtMin(wDur(w))} · ${fmtVol(wVolume(w))} · ${doneSets(w).length} sets</p>
    ${w.entries.map(e => `<div class="card"><b>${esc(exById(e.ex).name)}</b><div class="small mute">${e.sets.map(s => `${fmtW(s.w)}×${s.r}`).join(' · ')}</div></div>`).join('')}
    <button class="btn danger" data-act="delW" data-id="${id}">Delete session</button>`);
}

document.addEventListener('click', ev => {
  const t = ev.target.closest('[data-act]'); if (!t || t.tagName === 'SELECT') return;
  const d = t.dataset, i = +d.i, j = +d.j, a = S.active;
  switch (d.act) {
    case 'goWorkout': tab = 'workout'; render(); break;
    case 'range': heatRange = +d.n; render(); break;
    case 'startEmpty': start(); break;
    case 'repeat': { const w = S.workouts.find(x => x.id === d.id); start([]); w.entries.forEach(e => addEntry(e.ex)); save(); render(); break; }
    case 'addEx': exPicker(); break;
    case 'pick': addEntry(d.id); save(); closeSheet(); render(); break;
    case 'newEx': newExSheet(); break;
    case 'saveEx': {
      const name = document.getElementById('nn').value.trim(); if (!name) return;
      const ex = { id: 'c-' + uid(), name, group: document.getElementById('ng').value, custom: true };
      S.exercises.push(ex); save(); closeSheet();
      if (S.active) { addEntry(ex.id); save(); } toast('Added ' + name); render(); break;
    }
    case 'rmEx': a.entries.splice(i, 1); save(); render(); break;
    case 'addSet': a.entries[i].sets.push(newSet(a.entries[i].ex, a.entries[i].sets.length)); save(); render(); break;
    case 'rmSet': a.entries[i].sets.pop(); save(); render(); break;
    case 'chk': {
      const e = a.entries[i], s = e.sets[j];
      if (!s.done && !(s.r > 0)) { toast('Enter reps first'); break; }
      s.done = !s.done; save();
      if (s.done) {
        restStart = Date.now();
        const prev = Math.max(bestBefore(e.ex, a.start + 1), bestE1(e.sets.filter((x, k) => x.done && k !== j)));
        if (prev > 0 && e1rm(s) > prev + 0.01) toast('New personal best · ' + exById(e.ex).name);
      }
      render(); break;
    }
    case 'discard': if (confirm('Discard this session?')) { S.active = null; restStart = null; save(); render(); } break;
    case 'finish': finishWorkout(); break;
    case 'doneSummary': closeSheet(); tab = 'status'; render(); break;
    case 'detail': detailSheet(d.id); break;
    case 'delW': if (confirm('Delete this session permanently?')) { S.workouts = S.workouts.filter(x => x.id !== d.id); save(); closeSheet(); render(); } break;
    case 'unit': S.settings.unit = d.u; save(); render(); break;
    case 'weekly': S.settings.weekly = +d.n; save(); render(); break;
    case 'editChar': creator(); break;
    case 'cc': {
      const k = d.k, v = d.v;
      const nm = document.getElementById('cname'); if (nm) S.char.name = nm.value.trim();
      S.char[k] = v; save(); creator(); break;
    }
    case 'saveChar': {
      S.char.name = document.getElementById('cname').value.trim();
      S.char.created = true; save(); closeSheet(); render(); break;
    }
    case 'export': {
      const blob = new Blob([JSON.stringify(S, null, 1)], { type: 'application/json' });
      const l = document.createElement('a'); l.href = URL.createObjectURL(blob); l.download = `forge-backup-${new Date().toISOString().slice(0, 10)}.json`; l.click(); break;
    }
    case 'import': document.getElementById('file').click(); break;
    case 'reset': if (confirm('Erase ALL sessions and settings? This cannot be undone.') && confirm('Really erase everything?')) { S = defaultState(); save(); render(); creator(); } break;
  }
});
document.addEventListener('input', ev => {
  if (ev.target.id === 'pv') { prevPct = +ev.target.value; drawPreview(); }
});
document.addEventListener('change', ev => {
  const t = ev.target;
  if (t.dataset.act === 'selEx') { selEx = t.value; render(); return; }
  if (t.dataset.set === 'bw') { const v = parseFloat(String(t.value).replace(',', '.')); if (v > 0) { S.settings.bw = Math.round(fromDisp(v) * 10) / 10; save(); } return; }
  if (t.id === 'file') {
    const f = t.files[0]; if (!f) return;
    f.text().then(txt => {
      try { const o = JSON.parse(txt); if (o.v !== 1 || !Array.isArray(o.workouts)) throw 0;
        if (confirm(`Replace current data with backup (${o.workouts.length} sessions)?`)) { S = migrate(o); save(); render(); toast('Backup restored'); }
      } catch (e) { toast('Not a valid backup file'); }
    });
    return;
  }
  if (t.dataset.f && S.active) { // set inputs: update state without re-rendering (keeps keyboard open)
    const s = S.active.entries[+t.dataset.i].sets[+t.dataset.j], v = parseFloat(String(t.value).replace(',', '.')) || 0;
    if (t.dataset.f === 'w') s.w = Math.round(fromDisp(v) * 1000) / 1000; else s.r = Math.max(0, Math.round(v));
    save(); document.getElementById('live').textContent = `${fmtVol(wVolume(S.active))} · ${plural(doneSets(S.active).length, 'set')}`;
  }
});
setInterval(() => {
  if (tab !== 'workout' || !S.active) return;
  const tm = document.getElementById('timer'); if (tm) tm.textContent = fmtDur(Date.now() - S.active.start);
  const r = document.getElementById('rest');
  if (r && restStart) { r.className = 'chip on'; r.textContent = 'Rest ' + fmtDur(Date.now() - restStart); }
}, 1000);

render();
if (!S.char.created) creator();
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
