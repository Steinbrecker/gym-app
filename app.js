/* Gym-App – Oberfläche */
(function () {
  'use strict';
  const L = window.Logic;
  const KEY = 'gymapp.v1';
  const APP_VERSION = 10;
  const RPES = [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10];
  const REST = { power: { H: 180, A: 120, I: 90 }, hyp: { H: 120, A: 90, I: 60 } };
  // Ausweich-Übungen, wenn eine Maschine besetzt oder defekt ist
  const ALTS = {
    bench: ['Bankdrücken Multipresse', 'Kurzhantel-Bankdrücken', 'Brustpresse (Maschine)'],
    tbar: ['Isolaterales Rudern', 'Kabelrudern sitzend', 'Kurzhantelrudern'],
    inclinedb: ['Isolaterale Schrägbank-Brustpresse', 'Schrägbankdrücken Multipresse'],
    pulldown: ['Klimmzug (unterstützt)', 'Isolaterales Rudern von oben'],
    ohp: ['Kurzhantel-Schulterdrücken', 'Schulterpresse (Maschine)'],
    bbcurl: ['SZ-Curls', 'Kurzhantel-Curls', 'Kabel-Curls'],
    ohtri: ['Überkopf-Trizepsstrecken (Kabel)', 'Trizepsdrücken Kabel'],
    squat: ['Kniebeuge Multipresse', 'Hackenschmidt-Kniebeuge', 'Beinpresse'],
    deadlift: ['Rumänisches Kreuzheben', 'Kreuzheben Trap Bar'],
    legpress: ['Hackenschmidt-Kniebeuge', 'Kniebeuge Multipresse'],
    legcurl_p: ['Beinbeuger stehend (einbeinig)'],
    calfseat: ['Wadendrücken an der Beinpresse', 'Wadenheben stehend'],
    inclinepress: ['Schrägbankdrücken Multipresse', 'Schrägbank KH-Drücken'],
    isorow: ['Kabelrudern sitzend', 'Brustgestütztes T-Bar-Rudern', 'Kurzhantelrudern'],
    butterfly: ['Fliegende am Kabel', 'Kurzhantel-Fliegende'],
    highrow: ['Latzug', 'Klimmzug (unterstützt)'],
    lateral: ['Seitheben am Kabel', 'Seitheben (Maschine)'],
    inclinecurl: ['Kurzhantel-Curls', 'Kabel-Curls'],
    pushdown: ['Überkopf-Trizepsstrecken (Kabel)', 'Dip-Maschine'],
    hack: ['Beinpresse', 'Kniebeuge Multipresse'],
    legcurl_h: ['Beinbeuger stehend (einbeinig)'],
    backext: ['Rumänisches Kreuzheben (Kurzhantel)'],
    legext: ['Beinpresse (enge Fußstellung)'],
    adductor: ['Adduktion am Kabel'],
    abductor: ['Abduktion am Kabel'],
    calfpress: ['Wadenheben stehend', 'Wadenheben sitzend'],
  };
  const altsFor = id => (S.plan.exercises[id] && S.plan.exercises[id].alts) || ALTS[id] || [];

  // ---------- Zustand ----------
  let S = load();
  let view = 'train';
  let statEx = null;
  let statRange = 0;

  function fresh() {
    return { v: 1, plan: L.defaultPlan(), sessions: [], hevy: [], active: null, summary: null, counters: {}, lastDayId: null, settings: { lastBackup: null, lastDeload: null, created: new Date().toISOString() } };
  }
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) { const s = JSON.parse(raw); if (s && s.plan) return s; }
    } catch (e) { /* leer */ }
    return fresh();
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { toast('Speichern fehlgeschlagen: ' + e.message); }
  }
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

  // ---------- Helfer ----------
  const $ = sel => document.querySelector(sel);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = w => (w == null || w === '' ? '–' : (+w).toLocaleString('de-DE', { maximumFractionDigits: 2 }));
  const ex = id => S.plan.exercises[id] || (S.active && S.active.extra && S.active.extra[id]);
  const dayById = id => S.plan.days.find(d => d.id === id);
  const dateDE = iso => new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
  const typeLabel = { H: 'Haupt', A: 'Assistenz', I: 'Isolation' };

  function toTop() { const m = document.getElementById('main'); if (m) m.scrollTop = 0; window.scrollTo(0, 0); }
  let undoFn = null;
  function toast(msg, undo) {
    const t = $('#toast');
    undoFn = undo || null;
    t.innerHTML = esc(msg) + (undo ? ' <button class="link" data-act="undo">Rückgängig</button>' : '');
    t.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(() => { t.classList.remove('show'); undoFn = null; }, undo ? 3000 : 2600);
  }


  function nextDayId() {
    const ids = S.plan.days.map(d => d.id);
    if (!S.lastDayId) return ids[0];
    return ids[(ids.indexOf(S.lastDayId) + 1) % ids.length];
  }

  // Letzte eigene Einheit mit dieser Übung (für "Letztes Mal" und Ziel-Wdh)
  function lastOwn(exId) {
    for (let i = S.sessions.length - 1; i >= 0; i--) {
      const e = S.sessions[i].entries.find(x => x.exId === exId);
      if (e && !S.sessions[i].deload) return { session: S.sessions[i], entry: e };
    }
    return null;
  }
  function lastAny(exId) {
    const own = lastOwn(exId);
    if (own) return { date: own.session.date, sets: own.entry.sets.filter(s => !s.warmup && s.done) };
    const name = ex(exId).name;
    for (let i = S.hevy.length - 1; i >= 0; i--) {
      const e = S.hevy[i].entries.find(x => x.name === name);
      if (e) return { date: S.hevy[i].date, sets: e.sets.filter(s => !s.warmup), hevy: true };
    }
    return null;
  }
  function lastByName(name) {
    for (let i = S.sessions.length - 1; i >= 0; i--) {
      const e = S.sessions[i].entries.find(x => x.name === name);
      if (e) return { date: S.sessions[i].date, sets: e.sets };
    }
    for (let i = S.hevy.length - 1; i >= 0; i--) {
      const e = S.hevy[i].entries.find(x => x.name === name);
      if (e) return { date: S.hevy[i].date, sets: e.sets.filter(s => !s.warmup), hevy: true };
    }
    return null;
  }
  function setSub(id, name) {
    const ent = S.active.entries[id]; const e = ex(id);
    S.subWeights = S.subWeights || {};
    const last = lastByName(name);
    const w = S.subWeights[name] != null ? S.subWeights[name] : (last && last.sets.length ? last.sets[0].w : null);
    ent.orig = ent.orig || ent.sets.map(s => Object.assign({}, s));
    ent.sub = name ? { name } : null;
    ent.subOpen = false; ent.menu = false; ent.intra = false;
    ent.sets = name ? ent.orig.map(() => ({ w, r: e.lo, rpe: e.rpe, done: false })) : ent.orig.map(s => Object.assign({}, s));
    save(); render();
  }
  function setsText(sets) {
    if (!sets || !sets.length) return '';
    const sameW = sets.every(s => s.w === sets[0].w);
    if (sameW) return fmt(sets[0].w) + ' kg × ' + sets.map(s => s.r).join(', ') + (sets.some(s => s.rpe) ? ' @ ' + sets.map(s => s.rpe ? fmt(s.rpe) : '–').join('/') : '');
    return sets.map(s => fmt(s.w) + '×' + s.r + (s.rpe ? '@' + fmt(s.rpe) : '')).join(', ');
  }

  // ---------- Deload-Vorschlag ----------
  function deloadHint() {
    const stalledH = Object.values(S.plan.exercises).filter(e => e.type === 'H' && e.stalled).length;
    const since = S.settings.lastDeload || (S.sessions[0] && S.sessions[0].date);
    const weeks = since ? (Date.now() - new Date(since)) / (7 * 864e5) : 0;
    if (stalledH >= 3) return stalledH + ' Hauptübungen stagnieren – Deload-Woche empfohlen.';
    if (weeks >= 7) return Math.floor(weeks) + ' Wochen seit dem letzten Deload – Deload-Woche empfohlen.';
    return null;
  }

  // ---------- Training starten ----------
  function startWorkout(dayId, deload) {
    const day = dayById(dayId);
    const pass = S.counters[dayId] || 0;
    const order = L.orderFor(day, S.plan, pass);
    const entries = {};
    let machineWarmDone = false;
    order.forEach((id, pos) => {
      const e = ex(id);
      const last = lastOwn(id);
      const lastSets = last ? last.entry.sets.filter(s => !s.warmup && s.done) : null;
      const lastW = lastSets && lastSets.length ? lastSets[0].w : null;
      const tr = L.targetReps(e, lastSets, lastW);
      let w = e.weight;
      let nSets = e.sets;
      if (deload && w) { w = L.roundDown(e, w * 0.9); nSets = Math.max(1, Math.ceil(e.sets / 2)); }
      const firstMachine = pos === 0 && e.type !== 'H' && !machineWarmDone;
      const warm = L.warmups(Object.assign({}, e, { weight: w }), day.kind, firstMachine).map(x => ({ w: x.w, r: x.r, done: false }));
      entries[id] = {
        sets: Array.from({ length: nSets }, (_, i) => ({ w: w, r: tr[i] || e.lo, rpe: (e.type === 'I' || e.failLast) && i === nSets - 1 && !deload ? 10 : e.rpe, done: false })),
        warm, showWarm: warm.length > 0, intra: null,
      };
    });
    S.active = { dayId, pass, deload: !!deload, startedAt: new Date().toISOString(), order, entries, timer: null };
    save(); requestWake(); render();
  }

  // ---------- Pausentimer ----------
  function startTimer(exId) {
    const e = ex(exId); const day = dayById(S.active.dayId);
    const secs = (e.rest && e.rest[day.kind]) || REST[day.kind][e.type];
    const sub = S.active.entries[exId].sub;
    S.active.timer = { end: Date.now() + secs * 1000, total: secs, name: sub ? sub.name : e.name, beeped: false };
    save(); renderTimer();
  }
  function adjustTimer(d) { if (S.active && S.active.timer) { S.active.timer.end += d * 1000; S.active.timer.beeped = false; save(); renderTimer(); } }
  function stopTimer() { if (S.active) { S.active.timer = null; save(); renderTimer(); } }

  let audioCtx = null;
  function unlockAudio() {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
    } catch (e) { /* kein Audio */ }
  }
  function beep() {
    if (!audioCtx) return;
    [0, 0.35, 0.7].forEach(t => {
      const o = audioCtx.createOscillator(); const g = audioCtx.createGain();
      o.frequency.value = 880; o.connect(g); g.connect(audioCtx.destination);
      const at = audioCtx.currentTime + t;
      g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(0.4, at + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.25);
      o.start(at); o.stop(at + 0.3);
    });
  }
  function renderTimer() {
    const el = $('#timer');
    const t = S.active && S.active.timer;
    document.body.classList.toggle('timer-on', !!t);
    if (!t) { el.classList.remove('show', 'done'); return; }
    const left = Math.round((t.end - Date.now()) / 1000);
    const done = left <= 0;
    const a = Math.abs(left);
    el.classList.add('show'); el.classList.toggle('done', done);
    el.querySelector('.t-time').textContent = (done ? '+' : '') + Math.floor(a / 60) + ':' + String(a % 60).padStart(2, '0');
    el.querySelector('.t-bar').style.width = Math.max(0, Math.min(100, (left / t.total) * 100)) + '%';
    if (done && !t.beeped) { t.beeped = true; beep(); save(); }
  }
  setInterval(renderTimer, 250);
  // Wenn die iOS-Tastatur offen ist, Timer direkt darüber anzeigen
  // Tastatur: untere Leiste ausblenden (bleibt "hinter" der Tastatur), Pausentimer direkt darüber
  let baseH = window.innerHeight;
  const typing = () => { const a = document.activeElement; return !!a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA'); };
  function placeTimer() {
    const vv = window.visualViewport; const el = $('#timer');
    if (!typing()) baseH = Math.max(window.innerHeight, vv ? vv.height : 0);
    const open = typing();
    document.body.classList.toggle('kb', open);
    if (!el) return;
    if (open && vv) {
      // Abstand vom unteren Rand des Layouts bis zur Oberkante der Tastatur
      const gap = Math.max(0, window.innerHeight - (vv.height + vv.offsetTop));
      el.style.bottom = (gap + 8) + 'px';
    } else el.style.bottom = '';
  }
  if (window.visualViewport) { visualViewport.addEventListener('resize', placeTimer); visualViewport.addEventListener('scroll', placeTimer); }
  document.addEventListener('focusin', () => { placeTimer(); setTimeout(placeTimer, 350); });
  document.addEventListener('focusout', () => setTimeout(placeTimer, 50));

  // ---------- Bildschirm anlassen ----------
  let wake = null;
  async function requestWake() {
    try { if ('wakeLock' in navigator && S.active && !wake) { wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => (wake = null)); } } catch (e) { wake = null; }
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { requestWake(); renderTimer(); } });

  // ---------- Training beenden ----------
  function finishWorkout() {
    const A = S.active;
    const items = A.order.filter(id => !ex(id).extra).map((id, pos) => {
      const e = ex(id); const ent = A.entries[id];
      const done = ent.sets.filter(s => s.done);
      if (ent.sub) return { id, skipped: true, name: e.name, oldW: e.weight, newW: e.weight, note: 'Ersetzt durch ' + ent.sub.name + ' – Progression unverändert' };
      if (!done.length) return { id, skipped: true, name: e.name, oldW: e.weight, newW: e.weight };
      if (A.deload) return { id, name: e.name, oldW: e.weight, newW: e.weight, note: 'Deload – zählt nicht für die Progression' };
      const tmp = Object.assign({}, e, { weight: e.weight || done[0].w });
      const r = L.evaluate(tmp, ent.sets, pos);
      return { id, name: e.name, oldW: e.weight || done[0].w, newW: r.newWeight, note: r.note, result: r.result, misses: r.misses };
    });
    S.summary = { items };
    A.timer = null;
    save(); render(); toTop();
  }
  function saveSummary() {
    const A = S.active; const now = isStale() ? (A.lastActivity || A.startedAt) : new Date().toISOString();
    S.summary.items.forEach(it => {
      if (it.skipped) return;
      const e = ex(it.id);
      if (A.deload) return;
      L.apply(e, { newWeight: it.newW, misses: it.misses, result: it.result }, now);
    });
    S.sessions.push({
      id: 's' + Date.now(), dayId: A.dayId, pass: A.pass, deload: A.deload, date: A.startedAt, end: now,
      entries: A.order.map((id, pos) => {
        const ent = A.entries[id];
        const isX = ex(id).extra; return { exId: ent.sub || isX ? null : id, subFor: ent.sub ? id : undefined, name: ent.sub ? ent.sub.name : ex(id).name, pos, sets: ent.sets.filter(s => s.done).map(s => ({ w: s.w, r: s.r, rpe: s.rpe, done: true })) };
      }).filter(e => e.sets.length),
    });
    S.sessions[S.sessions.length - 1].results = S.summary.items.filter(it => !it.skipped && !A.deload).map(it => ({ id: it.id, name: it.name, oldW: it.oldW, newW: it.newW, result: it.result }));
    S.subWeights = S.subWeights || {};
    A.order.forEach(id => { const ent = A.entries[id]; const nm = ent.sub ? ent.sub.name : ex(id).extra ? ex(id).name : null; const d = nm && ent.sets.filter(s => s.done); if (d && d.length) S.subWeights[nm] = d[d.length - 1].w; });
    if (A.deload) S.settings.lastDeload = now;
    S.counters[A.dayId] = (S.counters[A.dayId] || 0) + 1;
    S.lastDayId = A.dayId;
    S.active = null; S.summary = null;
    if (wake) { wake.release().catch(() => {}); wake = null; }
    save(); toast(backupDue() ? 'Gespeichert 💪 – denk ans Backup!' : 'Training gespeichert 💪'); render();
  }

  function backupDue() {
    return (S.sessions.length || S.hevy.length) && (!S.settings.lastBackup || Date.now() - new Date(S.settings.lastBackup) > 7 * 864e5);
  }

  // ---------- Wochenrückblick ----------
  function weekStart(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; }
  function bestBefore(name, beforeISO) {
    let found = null;
    const scan = (list, own) => list.forEach(s => {
      if (s.date >= beforeISO || (own && s.deload)) return;
      const e = s.entries.find(x => x.name === name);
      if (e && (!found || s.date > found.date)) { const b = L.bestE1(e.sets); if (b.e1) found = { date: s.date, e1: b.e1 }; }
    });
    scan(S.hevy, false); scan(S.sessions, true);
    return found;
  }
  function weekReview() {
    const thisWeek = weekStart(new Date());
    const from = new Date(thisWeek.getTime() - 7 * 864e5);
    const key = from.toISOString().slice(0, 10);
    if (S.settings.reviewSeen === key) return null;
    const inWeek = S.sessions.filter(s => new Date(s.date) >= from && new Date(s.date) < thisWeek);
    if (!inWeek.length) return null;
    const better = [], worse = [], up = [], down = [];
    const seen = new Set();
    inWeek.forEach(s => {
      if (!s.deload) s.entries.forEach(e => {
        if (seen.has(e.name)) return; seen.add(e.name);
        const now = L.bestE1(e.sets).e1; const prev = bestBefore(e.name, s.date);
        if (!now || !prev) return;
        const pct = (now / prev.e1 - 1) * 100;
        if (pct >= 1) better.push([e.name, pct]); else if (pct <= -1) worse.push([e.name, pct]);
      });
      (s.results || []).forEach(r => { if (r.newW > r.oldW) up.push(r); else if (r.newW < r.oldW) down.push(r); });
    });
    const stalled = Object.values(S.plan.exercises).filter(e => e.stalled).map(e => ({ id: e.id, name: e.name, alt: altsFor(e.id)[0] }));
    return { key, from, n: inWeek.length, better, worse, up, down, stalled };
  }
  function renderReview(R) {
    const pct = p => (p > 0 ? '+' : '') + fmt(Math.round(p * 10) / 10) + ' %';
    const list = (arr, f) => arr.map(f).join('');
    return `<div class="card review">
      <div class="eyebrow">Wochenrückblick</div>
      <h2>${R.n} ${R.n === 1 ? 'Training' : 'Trainings'} letzte Woche</h2>
      ${R.better.length ? `<div class="rsec"><div class="rh good">Stärker geworden</div>${list(R.better, ([n, p]) => `<div class="rrow"><span>${esc(n)}</span><span class="good">${pct(p)}</span></div>`)}</div>` : ''}
      ${R.worse.length ? `<div class="rsec"><div class="rh bad">Schwächer als zuletzt</div>${list(R.worse, ([n, p]) => `<div class="rrow"><span>${esc(n)}</span><span class="bad">${pct(p)}</span></div>`)}</div>` : ''}
      ${R.up.length || R.down.length ? `<div class="rsec"><div class="rh">Neue Gewichte</div>${list(R.up.concat(R.down), r => `<div class="rrow"><span>${esc(r.name)}</span><span class="${r.newW > r.oldW ? 'good' : 'bad'}">${fmt(r.oldW)} → ${fmt(r.newW)} kg</span></div>`)}</div>` : ''}
      ${R.stalled.length ? `<div class="rsec"><div class="rh warn">Stagniert – Übung tauschen?</div>${list(R.stalled, s => `<div class="rrow"><span>${esc(s.name)}${s.alt ? ' → ' + esc(s.alt) : ''}</span>${s.alt ? `<button class="link" data-act="swapplan" data-ex="${s.id}" data-name="${esc(s.alt)}">Tauschen</button>` : ''}</div>`)}</div>` : ''}
      ${!R.better.length && !R.worse.length && !R.up.length && !R.down.length ? '<div class="muted small">Alles stabil – weiter so.</div>' : ''}
      ${backupDue() ? `<div class="rsec"><button class="btn" data-act="export">Backup sichern</button></div>` : ''}
      <button class="link muted" data-act="reviewok" data-key="${R.key}">Ausblenden</button>
    </div>`;
  }

  // ---------- Render: Training ----------
  function renderTrain() {
    if (S.summary) return renderSummary();
    if (S.active) return renderActive();
    const nid = nextDayId();
    const day = dayById(nid);
    const pass = S.counters[nid] || 0;
    const order = L.orderFor(day, S.plan, pass);
    const hint = deloadHint();
    const R = weekReview();
    return `
      <section class="hero">
        <div class="eyebrow">Nächstes Training</div>
        <h1>${esc(day.name)}</h1>
        <div class="muted">${day.kind === 'power' ? 'Kraft' : 'Hypertrophie'}</div>
      </section>
      ${R ? renderReview(R) : ''}
      ${hint ? `<div class="note warn">${esc(hint)}</div>` : ''}
      ${!R && backupDue() ? `<div class="note">Zeit für ein Backup. <button class="link" data-act="export">Jetzt sichern</button></div>` : ''}
      <ol class="preview">
        ${order.map((id, i) => { const e = ex(id); return `<li><span class="tag t${e.type}">${e.type}</span><span class="pname">${esc(e.name)}${e.stalled ? ' <span class="stall">stagniert</span>' : ''}</span><span class="pw">${e.weight ? fmt(e.weight) + ' kg' : 'testen'}</span><span class="psets">${e.sets}×${e.lo}–${e.hi}</span></li>`; }).join('')}
      </ol>
      <button class="btn primary big" data-act="start" data-day="${nid}">Training starten</button>
      <button class="btn ghost" data-act="start" data-day="${nid}" data-deload="1">Als Deload starten (90 %, halbe Sätze)</button>
      <details class="other">
        <summary>Anderen Tag wählen</summary>
        ${S.plan.days.filter(d => d.id !== nid).map(d => `<button class="btn ghost" data-act="start" data-day="${d.id}">${esc(d.name)}</button>`).join('')}
      </details>
      <div class="muted small center">Version ${APP_VERSION}</div>`;
  }

  const STALE = 2 * 3600e3; // 2 h ohne neuen Satz = vergessenes Training
  function isStale() {
    const A = S.active; if (!A) return false;
    const last = A.lastActivity || A.startedAt;
    return Date.now() - new Date(last) > STALE;
  }
  function elapsed() {
    const A = S.active; if (!A) return '';
    const end = isStale() ? new Date(A.lastActivity || A.startedAt).getTime() : Date.now();
    const t = Math.max(0, Math.floor((end - new Date(A.startedAt)) / 1000));
    const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), sec = t % 60;
    return (h ? h + ':' + String(m).padStart(2, '0') : String(m).padStart(2, '0')) + ':' + String(sec).padStart(2, '0');
  }
  setInterval(() => { const el = document.getElementById('stopwatch'); if (el) el.textContent = elapsed(); }, 1000);

  function renderActive() {
    const A = S.active;
    const total = A.order.reduce((a, id) => a + A.entries[id].sets.length, 0);
    const doneN = A.order.reduce((a, id) => a + A.entries[id].sets.filter(s => s.done).length, 0);
    const cur = currentEx(); const pos = A.order.indexOf(cur);
    const stale = isStale();
    return `
      <div class="topbar"><div class="tb-in">
        <button class="tb-btn" data-act="cancel" aria-label="Training verwerfen"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
        <div class="tb-time ${stale ? 'stale' : ''}" id="stopwatch">${elapsed()}</div>
        <button class="tb-btn ok" data-act="finish" aria-label="Training beenden"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></button>
      </div><div class="tb-prog"><div style="width:${total ? (doneN / total) * 100 : 0}%"></div></div></div>
      <div class="tb-space"></div>
      ${stale ? `<div class="note warn">Dieses Training vom ${dateDE(A.startedAt)} ist noch offen. <button class="link" data-act="finish">Speichern</button> <button class="link muted" data-act="cancel">Verwerfen</button></div>` : ''}
      ${renderExCard(cur, pos)}
      ${A.overview ? renderOverview() : ''}
      ${A.setMenu ? renderSetMenu() : ''}`;
  }
  function exName(id) { const ent = S.active.entries[id]; return ent.sub ? ent.sub.name : ex(id).name; }

  function renderOverview() {
    const A = S.active; const cur = currentEx();
    return `<div class="overlay" data-act="overviewclose"><div class="sheet" data-stop="1">
      <div class="sheet-title">Übersicht</div>
      <ul class="rlist" id="rlist">
        ${A.order.map(id => { const e = ex(id); const ent = A.entries[id]; const d = ent.sets.filter(s => s.done).length; const n = ent.sets.length;
          return `<li data-id="${id}" class="${id === cur ? 'rcur' : ''} ${d === n ? 'rdone' : ''}">
            <span class="tag t${e.type}">${e.type}</span>
            <button class="rname" data-act="jump" data-ex="${id}">${esc(exName(id))}</button>
            <span class="rstat">${d === n ? '<b class="good">✓</b>' : d + '/' + n}</span>
            <span class="handle" aria-label="Ziehen">☰</span></li>`; }).join('')}
      </ul>
      ${A.addOpen ? renderAddPicker() : '<button class="btn" data-act="addex">+ Übung hinzufügen</button>'}
      <button class="btn primary" data-act="overviewclose">Schließen</button>
    </div></div>`;
  }

  function renderSetMenu() {
    const m = S.active.setMenu;
    return `<div class="overlay" data-act="setmenuclose"><div class="sheet small" data-stop="1">
      <div class="sheet-title">Satz ${m.kind === 'warm' ? 'W' : m.i + 1}</div>
      <button class="btn ${m.kind === 'warm' ? 'primary' : ''}" data-act="settype" data-type="warm">Aufwärmsatz</button>
      <button class="btn ${m.kind === 'set' ? 'primary' : ''}" data-act="settype" data-type="set">Arbeitssatz</button>
      <button class="btn ghost" data-act="setmenuclose">Abbrechen</button>
    </div></div>`;
  }

  function renderAddPicker() {
    const A = S.active;
    const inWorkout = new Set(A.order.map(id => ex(id).name));
    const names = [];
    Object.values(S.plan.exercises).forEach(e => names.push(e.name));
    Object.values(ALTS).forEach(l => l.forEach(n => names.push(n)));
    const sugg = [...new Set(names)].filter(n => !inWorkout.has(n)).sort((a, b) => a.localeCompare(b, 'de'));
    return `<div class="card addpick">
      <h2>Übung hinzufügen</h2>
      <div class="muted small">Nur für dieses Training.</div>
      <div class="addrow"><input id="addname" class="cell left" placeholder="Eigene Übung eingeben"><button class="btn slim" data-act="addcustom">Hinzufügen</button></div>
      <div class="chips">${sugg.map(n => `<button class="wchip" data-act="addpick" data-name="${esc(n)}">${esc(n)}</button>`).join('')}</div>
      <button class="link muted" data-act="addclose">Abbrechen</button>
    </div>`;
  }
  function addExtra(name) {
    const A = S.active; A.extra = A.extra || {};
    const id = 'x' + Date.now();
    const tpl = Object.values(S.plan.exercises).find(e => e.name === name);
    const base = tpl ? { type: tpl.type, sets: tpl.sets, lo: tpl.lo, hi: tpl.hi, rpe: tpl.rpe, kind: tpl.kind, muscle: tpl.muscle, failLast: tpl.failLast } : { type: 'A', sets: 3, lo: 8, hi: 12, rpe: 9, kind: 'm' };
    const last = lastByName(name);
    const w = (S.subWeights || {})[name] != null ? S.subWeights[name] : (last && last.sets.length ? last.sets[0].w : (tpl ? tpl.weight : null));
    A.extra[id] = Object.assign({ id, name, extra: true, weight: null, misses: 0, reductions: [] }, base);
    A.entries[id] = { sets: Array.from({ length: base.sets }, () => ({ w, r: base.lo, rpe: base.rpe, done: false })), warm: [] };
    A.order.push(id); A.openId = id; A.addOpen = false; A.overview = false;
    save(); render(); toTop();
  }

  function noteKey(id) { const ent = S.active.entries[id]; return ent.sub ? ent.sub.name : ex(id).name; }

  // Aktuelle Übung: manuell geöffnete, sonst die erste mit offenen Sätzen
  function currentEx() {
    const A = S.active;
    if (A.openId && A.order.includes(A.openId)) return A.openId;
    return A.order.find(id => A.entries[id].sets.some(s => !s.done)) || A.order[A.order.length - 1];
  }
  function renderCollapsed(id) {
    const e = ex(id); const ent = S.active.entries[id];
    const done = ent.sets.filter(s => s.done).length; const n = ent.sets.length;
    const all = done === n;
    const info = all ? `${fmt(ent.sets[0].w)} kg · ${ent.sets.map(s => s.r).join(', ')}` : done ? `${done}/${n} Sätze` : (ent.sets[0].w != null ? `${n} × ${fmt(ent.sets[0].w)} kg` : `${n} Sätze`);
    return `<button class="card collapsed ${all ? 'complete' : ''}" data-act="open" data-ex="${id}">
      <span class="tag t${e.type}">${e.type}</span>
      <span class="cname">${esc(ent.sub ? ent.sub.name : e.name)}</span>
      <span class="cinfo">${all ? '<b class="good">✓</b> ' : ''}${esc(info)}</span>
    </button>`;
  }

  function renderExCard(id, pos) {
    const e = ex(id); const ent = S.active.entries[id];
    const sub = ent.sub;
    const last = sub ? lastByName(sub.name) : e.extra ? lastByName(e.name) : lastAny(id);
    const prev = last ? last.sets : [];
    const allDone = ent.sets.every(s => s.done);
    const anyDone = ent.sets.some(s => s.done);
    const alts = altsFor(id).filter(a => !sub || a !== sub.name);
    const note = (S.notes || {})[noteKey(id)];
    return `
      <article class="card focus ${allDone ? 'complete' : ''}" id="card-${id}">
        <div class="fnav">
          <button class="arrow" data-act="prevex" ${pos <= 0 ? 'disabled' : ''} aria-label="Vorherige Übung">‹</button>
          <button class="counter" data-act="overview" aria-label="Übersicht">${pos + 1} / ${S.active.order.length}</button>
          <button class="arrow" data-act="nextex" ${pos >= S.active.order.length - 1 ? 'disabled' : ''} aria-label="Nächste Übung">›</button>
        </div>
        <header>
          <span class="tag t${e.type}">${e.type}</span>
          <div class="ctitle"><h2>${esc(sub ? sub.name : e.name)}</h2>
            ${sub ? `<div class="muted small">statt ${esc(e.name)}</div>` : ''}
            ${note && !ent.noteEdit ? `<div class="cnote" data-act="noteedit" data-ex="${id}">${esc(note)}</div>` : ''}</div>
          <button class="more" data-act="menu" data-ex="${id}" aria-label="Optionen">⋯</button>
        </header>
        ${ent.menu ? `<div class="cactions">
          <button data-act="noteedit" data-ex="${id}">✎ Notiz</button>
          ${!anyDone ? `<button data-act="subopen" data-ex="${id}">⇄ ${sub ? 'Andere' : 'Ersetzen'}</button>` : ''}
          ${!anyDone && sub ? `<button data-act="subundo" data-ex="${id}">↺ Original</button>` : ''}
        </div>` : ''}
        ${ent.noteEdit ? `<div class="noteedit"><textarea data-note="${id}" rows="2" placeholder="z. B. Sitz Stufe 4, enger Griff">${esc(note || '')}</textarea><button class="link" data-act="notesave" data-ex="${id}">Fertig</button></div>` : ''}
        ${ent.subOpen ? `<div class="subpick">
          <div class="muted small">Ausweichen auf:</div>
          ${alts.map(a => `<button class="wchip" data-act="subset" data-ex="${id}" data-name="${esc(a)}">${esc(a)}</button>`).join('')}
          <button class="wchip" data-act="subcustom" data-ex="${id}">+ Eigene Übung</button>
          <button class="link muted" data-act="subclose" data-ex="${id}">Abbrechen</button>
        </div>` : ''}
        ${ent.intra ? `<div class="note warn">Zu schwer – Rest mit ${fmt(ent.intra)} kg? <button class="link" data-act="intra" data-ex="${id}">Übernehmen</button> <button class="link muted" data-act="intrano" data-ex="${id}">Nein</button></div>` : ''}
        <div class="sets">
          <div class="shead"><span>Satz</span><span>Vorher</span><span>kg</span><span>Wdh</span><span>RPE</span><span>✓</span></div>
          ${!sub ? ent.warm.map((w, i) => renderWarm(id, w, i)).join('') : ''}
          ${ent.sets.map((s, i) => renderSet(id, s, i, prev[i])).join('')}
        </div>
        <button class="addset" data-act="addset" data-ex="${id}">+ Satz hinzufügen</button>
      </article>`;
  }

  function prevCell(p) {
    if (!p) return '<span class="prev">–</span>';
    return `<span class="prev">${fmt(p.w)} × ${p.r}${p.rpe ? `<small>@${fmt(p.rpe)}</small>` : ''}</span>`;
  }

  function renderWarm(id, w, i) {
    return `
      <div class="set warmrow ${w.done ? 'done' : ''}" data-swipe="warm" data-ex="${id}" data-i="${i}">
        <button class="sn w" data-act="setmenu" data-kind="warm" data-ex="${id}" data-i="${i}">W</button>
        <span class="prev"></span>
        <input class="cell" inputmode="decimal" enterkeyhint="done" autocomplete="off" data-field="w" data-warm="1" data-ex="${id}" data-i="${i}" value="${w.we || w.done ? fmt(w.w) : ''}" placeholder="${fmt(w.w)}">
        <input class="cell" inputmode="numeric" pattern="[0-9]*" enterkeyhint="done" autocomplete="off" data-field="r" data-warm="1" data-ex="${id}" data-i="${i}" value="${w.re || w.done ? w.r : ''}" placeholder="${w.r}">
        <span></span>
        <button class="check" data-act="warm" data-ex="${id}" data-i="${i}" aria-label="Aufwärmsatz erledigt">✓</button>
      </div>`;
  }

  function renderSet(id, s, i, p) {
    return `
      <div class="set ${s.done ? 'done' : ''}" data-swipe="set" data-ex="${id}" data-i="${i}">
        <button class="sn" data-act="setmenu" data-kind="set" data-ex="${id}" data-i="${i}">${i + 1}</button>
        ${prevCell(p)}
        <input class="cell" inputmode="decimal" enterkeyhint="done" autocomplete="off" data-field="w" data-ex="${id}" data-i="${i}" value="${(s.we || s.done) && s.w != null ? fmt(s.w) : ''}" placeholder="${s.w == null ? 'kg' : fmt(s.w)}">
        <input class="cell" inputmode="numeric" pattern="[0-9]*" enterkeyhint="done" autocomplete="off" data-field="r" data-ex="${id}" data-i="${i}" value="${(s.re || s.done) && s.r != null ? s.r : ''}" placeholder="${s.r == null ? '' : s.r}">
        <select class="cell" data-field="rpe" data-ex="${id}" data-i="${i}" aria-label="RPE">
          ${RPES.map(r => `<option value="${r}" ${s.rpe === r ? 'selected' : ''}>${fmt(r)}</option>`).join('')}
        </select>
        <button class="check" data-act="done" data-ex="${id}" data-i="${i}" aria-label="Satz erledigt">✓</button>
      </div>`;
  }

  function renderSummary() {
    const it = S.summary.items;
    const cls = r => ({ up: 'up', up2: 'up', down: 'down', miss: 'miss' }[r] || '');
    return `
      <section class="hero small"><div class="eyebrow">Geschafft</div><h1>Nächstes Mal</h1>
      <div class="muted">Vorschläge nach den Regeln. Du kannst jedes Gewicht noch ändern.</div></section>
      ${it.map((x, i) => `
        <div class="sumrow ${cls(x.result)}">
          <div><div class="sname">${esc(x.name)}</div><div class="muted small">${x.skipped ? esc(x.note || 'Nicht gemacht – unverändert') : esc(x.note || '')}</div></div>
          ${x.skipped ? `<div class="sw">${fmt(x.newW)} kg</div>` : `<div class="sw"><span class="old">${fmt(x.oldW)} →</span> <input inputmode="decimal" data-sum="${i}" value="${fmt(x.newW)}"> kg</div>`}
        </div>`).join('')}
      <button class="btn primary big" data-act="savesum">Speichern</button>
      <button class="btn ghost" data-act="backtowork">Zurück zum Training</button>`;
  }

  // ---------- Render: Statistik ----------
  function statNames() {
    const names = [];
    S.plan.days.forEach(d => d.ex.forEach(id => { const n = ex(id).name; if (!names.includes(n)) names.push(n); }));
    return names;
  }
  function seriesFor(name) {
    const pts = [];
    S.hevy.forEach(s => s.entries.filter(e => e.name === name).forEach(e => { const b = L.bestE1(e.sets); if (b.e1) pts.push({ x: new Date(s.date), y: b.e1, top: b.top, src: 'hevy' }); }));
    S.sessions.forEach(s => { if (s.deload) return; s.entries.filter(e => e.name === name).forEach(e => { const b = L.bestE1(e.sets); if (b.e1) pts.push({ x: new Date(s.date), y: b.e1, top: b.top, src: 'app' }); }); });
    return pts.sort((a, b) => a.x - b.x);
  }
  function muscleOf(name) {
    const e = Object.values(S.plan.exercises).find(x => x.name === name);
    return e ? e.muscle : null;
  }
  function weeklySets(weeks) {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const day = (start.getDay() + 6) % 7; start.setDate(start.getDate() - day - (weeks - 1) * 7);
    const buckets = Array.from({ length: weeks }, (_, i) => ({ from: new Date(start.getTime() + i * 7 * 864e5), n: 0, byMuscle: {}, vol: 0 }));
    const add = (dateISO, entries) => {
      const t = new Date(dateISO).getTime(); const i = Math.floor((t - start.getTime()) / (7 * 864e5));
      if (i < 0 || i >= weeks) return;
      buckets[i].n++;
      entries.forEach(e => e.sets.forEach(s => { if (!s.warmup && s.w && s.r) buckets[i].vol += s.w * s.r; }));
      entries.forEach(e => { const m = muscleOf(e.name); if (!m) return; const hard = e.sets.filter(s => !s.warmup && (s.rpe == null || s.rpe >= 7)).length; buckets[i].byMuscle[m] = (buckets[i].byMuscle[m] || 0) + hard; });
    };
    S.hevy.forEach(s => add(s.date, s.entries));
    S.sessions.forEach(s => add(s.date, s.entries));
    return buckets;
  }

  function lineChart(pts, unit) {
    if (pts.length < 2) return '<div class="empty">Noch zu wenig Daten für einen Graphen.</div>';
    const W = 340, H = 180, P = { l: 34, r: 10, t: 12, b: 24 };
    const xs = pts.map(p => p.x.getTime()); const ys = pts.map(p => p.y);
    const x0 = Math.min(...xs), x1 = Math.max(...xs);
    let y0 = Math.min(...ys), y1 = Math.max(...ys); const pad = Math.max(2, (y1 - y0) * 0.15); y0 = Math.floor(y0 - pad); y1 = Math.ceil(y1 + pad);
    const X = x => P.l + ((x - x0) / Math.max(1, x1 - x0)) * (W - P.l - P.r);
    const Y = y => P.t + (1 - (y - y0) / Math.max(1, y1 - y0)) * (H - P.t - P.b);
    const ticks = [y0, Math.round((y0 + y1) / 2), y1];
    const path = pts.map((p, i) => (i ? 'L' : 'M') + X(p.x.getTime()).toFixed(1) + ' ' + Y(p.y).toFixed(1)).join(' ');
    return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Verlauf">
      ${ticks.map(t => `<line x1="${P.l}" x2="${W - P.r}" y1="${Y(t)}" y2="${Y(t)}" class="grid"/><text x="${P.l - 6}" y="${Y(t) + 4}" class="axis" text-anchor="end">${t}</text>`).join('')}
      <text x="${P.l}" y="${H - 6}" class="axis">${dateDE(new Date(x0).toISOString())}</text>
      <text x="${W - P.r}" y="${H - 6}" class="axis" text-anchor="end">${dateDE(new Date(x1).toISOString())}</text>
      <path d="${path}" class="line"/>
      ${pts.map(p => `<circle cx="${X(p.x.getTime()).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="3.2" class="${p.src === 'hevy' ? 'pt hevy' : 'pt'}"/>`).join('')}
    </svg>`;
  }
  function barChart(buckets, val, maxLabel) {
    val = val || (b => Object.values(b.byMuscle).reduce((a, x) => a + x, 0));
    const W = 340, H = 150, P = { l: 28, r: 6, t: 10, b: 22 };
    const max = Math.max(4, ...buckets.map(val));
    const bw = (W - P.l - P.r) / buckets.length;
    return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Wochenwerte">
      <line x1="${P.l}" x2="${W - P.r}" y1="${H - P.b}" y2="${H - P.b}" class="grid"/>
      <text x="${P.l - 4}" y="${P.t + 8}" class="axis" text-anchor="end">${maxLabel ? maxLabel(max) : max}</text>
      ${buckets.map((b, i) => { const n = val(b); const h = (n / max) * (H - P.t - P.b); return `<rect x="${(P.l + i * bw + 2).toFixed(1)}" y="${(H - P.b - h).toFixed(1)}" width="${(bw - 4).toFixed(1)}" height="${h.toFixed(1)}" rx="3" class="bar"/>${i % 3 === 0 ? `<text x="${(P.l + i * bw + bw / 2).toFixed(1)}" y="${H - 6}" class="axis" text-anchor="middle">${b.from.getDate()}.${b.from.getMonth() + 1}.</text>` : ''}`; }).join('')}
    </svg>`;
  }

  function renderStats() {
    const names = statNames();
    if (!statEx) statEx = names[0];
    const all = seriesFor(statEx);
    const cutoff = statRange ? Date.now() - statRange * 864e5 : 0;
    const pts = all.filter(p => p.x.getTime() >= cutoff);
    const best = all.reduce((a, p) => (p.y > (a ? a.y : 0) ? p : a), null);
    const lastP = all[all.length - 1];
    const buckets = weeklySets(12);
    const lastFull = buckets[buckets.length - 2] || buckets[0];
    const muscles = {};
    buckets.slice(-5, -1).forEach(b => Object.entries(b.byMuscle).forEach(([m, n]) => (muscles[m] = (muscles[m] || 0) + n / 4)));
    // Kraft-Index: Ø aller Plan-Übungen, bestes e1RM der Woche relativ zum ersten Wert (= 100)
    const idxPts = [];
    const series = statNames().map(n => seriesFor(n)).filter(s => s.length);
    const firstT = Math.min(Date.now(), ...series.map(s => s[0].x.getTime()));
    const idxWeeks = Math.min(104, Math.max(12, Math.ceil((Date.now() - firstT) / (7 * 864e5)) + 1));
    weeklySets(idxWeeks).forEach(bk => {
      const to = bk.from.getTime() + 7 * 864e5; const ratios = [];
      series.forEach(s => {
        const upto = s.filter(p => p.x.getTime() < to);
        if (!upto.length) return;
        const latest = upto[upto.length - 1];
        if (to - latest.x.getTime() > 28 * 864e5) return;
        ratios.push(latest.y / s[0].y);
      });
      if (ratios.length >= 3) idxPts.push({ x: bk.from, y: Math.round((ratios.reduce((a, r) => a + r, 0) / ratios.length) * 1000) / 10 });
    });
    const lastIdx = idxPts[idxPts.length - 1];
    const volNow = lastFull.vol;
    const histRows = [...S.sessions.map(s => ({ date: s.date, title: (dayById(s.dayId) || {}).name + (s.deload ? ' (Deload)' : ''), n: s.entries.length })), ...S.hevy.map(s => ({ date: s.date, title: s.title + (s.source === 'lifto' ? ' (Liftosaur)' : ' (Hevy)'), n: s.entries.length }))].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 15);
    return `
      <section class="hero small"><div class="eyebrow">Statistik</div><h1>Fortschritt</h1></section>
      <div class="card">
        <h2>Gesamt</h2>
        <div class="kpis two">
          <div><div class="k">${lastIdx ? (lastIdx.y >= 100 ? '+' : '') + fmt(Math.round((lastIdx.y - 100) * 10) / 10) + ' %' : '–'}</div><div class="muted small">Kraft seit Beginn</div></div>
          <div><div class="k">${volNow ? fmt(Math.round(volNow / 100) / 10) + ' t' : '–'}</div><div class="muted small">bewegt letzte Woche</div></div>
        </div>
        ${lineChart(idxPts)}
        <div class="muted small">Kraft-Index: Durchschnitt aller Übungen, Startwert = 100.</div>
        ${barChart(buckets, b => Math.round(b.vol / 1000), m => m + ' t')}
        <div class="muted small">Bewegtes Gewicht pro Woche (Gewicht × Wdh, Kurzhantel pro Hand).</div>
      </div>
      <div class="card">
        <select class="full" data-act="statex">${names.map(n => `<option ${n === statEx ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>
        <div class="kpis">
          <div><div class="k">${lastP ? fmt(Math.round(lastP.y * 2) / 2) : '–'}</div><div class="muted small">e1RM zuletzt (kg)</div></div>
          <div><div class="k">${best ? fmt(Math.round(best.y * 2) / 2) : '–'}</div><div class="muted small">bestes e1RM</div></div>
          <div><div class="k small">${best && best.top ? fmt(best.top.w) + '×' + best.top.r : '–'}</div><div class="muted small">bester Satz</div></div>
        </div>
        <div class="seg">${[[30, '1 M'], [90, '3 M'], [365, '1 J'], [0, 'Alles']].map(([d, l]) => `<button data-act="range" data-d="${d}" class="${statRange === d ? 'on' : ''}">${l}</button>`).join('')}</div>
        ${lineChart(pts)}
        <div class="muted small">Geschätztes 1RM (bester Satz je Einheit). Helle Punkte = importierte Historie (Hevy, Liftosaur).</div>
      </div>
      <div class="card">
        <h2>Harte Sätze pro Woche</h2>
        ${barChart(buckets)}
        <div class="muted small">Letzte volle Woche: ${lastFull.n} Einheiten. Sätze ab RPE 7, nur Übungen aus dem Plan.</div>
        <div class="mtable">${Object.entries(muscles).sort((a, b) => b[1] - a[1]).map(([m, n]) => `<div><span>${esc(m)}</span><span>${fmt(Math.round(n * 10) / 10)} / Woche</span></div>`).join('') || '<div class="muted small">Noch keine Daten.</div>'}</div>
        <div class="muted small">Durchschnitt der letzten 4 vollen Wochen.</div>
      </div>
      <div class="card">
        <h2>Verlauf</h2>
        ${histRows.map(h => `<div class="hrow"><span>${dateDE(h.date)}</span><span>${esc(h.title)}</span><span class="muted">${h.n} Üb.</span></div>`).join('') || '<div class="muted small">Noch keine Trainings.</div>'}
      </div>`;
  }

  // ---------- Render: Einstellungen ----------
  function renderSettings() {
    const BLOCK = 12, DELOAD_EVERY = 7;
    const own = S.sessions;
    const start = S.settings.planStart || (own[0] && own[0].date) || null;
    const week = start ? Math.floor((Date.now() - new Date(start)) / (7 * 864e5)) + 1 : 0;
    const since = S.settings.lastDeload || start;
    const wSince = since ? Math.floor((Date.now() - new Date(since)) / (7 * 864e5)) : 0;
    const toDeload = Math.max(0, DELOAD_EVERY - wSince);
    const planName = S.plan.name || 'PHUL – Power Hypertrophy Upper Lower';
    return `
      <section class="hero small"><h1>Einstellungen</h1></section>
      <div class="card">
        <div class="eyebrow">Aktueller Plan</div>
        <h2 class="planname">${esc(planName)}</h2>
        <div class="muted small">4 Tage · Upper/Lower · Kraft + Hypertrophie${start ? ' · seit ' + dateDE(start) : ''}</div>
        ${start ? `
          <div class="pbar-label"><span>Woche ${Math.min(week, BLOCK)} von ${BLOCK}</span><span class="muted">${own.length} ${own.length === 1 ? 'Training' : 'Trainings'}</span></div>
          <div class="pbar"><div style="width:${Math.min(100, (week / BLOCK) * 100)}%"></div></div>
          <div class="muted small">${week > BLOCK ? 'Block geschafft – Zeit für eine Bilanz. Schreib mir, dann planen wir den nächsten Block.' : `Nach ${BLOCK} Wochen ziehen wir Bilanz und passen Übungen oder Plan an.`}</div>
          <div class="pbar-label"><span>Deload</span><span class="muted">${toDeload ? 'in ' + toDeload + (toDeload === 1 ? ' Woche' : ' Wochen') : 'jetzt empfohlen'}</span></div>
          <div class="pbar alt"><div style="width:${Math.min(100, (wSince / DELOAD_EVERY) * 100)}%"></div></div>
          <div class="muted small">Alle ${DELOAD_EVERY} Wochen geplant, früher wenn 3 Hauptübungen stagnieren.</div>`
          : '<div class="muted small pmt">Der Fortschritt startet mit deinem ersten Training.</div>'}
      </div>
      <details class="card howto">
        <summary><h2>So funktioniert die App</h2><span class="muted">▾</span></summary>
        <ul>
          <li><b>Gewichte:</b> Nach jedem Training rechnet die App aus Gewicht, Wiederholungen und RPE das Gewicht fürs nächste Mal. Alle Sätze oben im Wdh-Bereich bei passendem RPE → mehr Gewicht. Zweimal hintereinander unter dem Bereich → weniger.</li>
          <li><b>Zu schwer gestartet:</b> Ist der erste Satz klar daneben, schlägt die App für die restlichen Sätze sofort weniger Gewicht vor.</li>
          <li><b>Rotation:</b> Die Hauptübungen eines Tages wechseln sich jedes Mal an erster Stelle ab. An zweiter Stelle ist 1 Wdh weniger okay.</li>
          <li><b>RPE:</b> Grundübungen bei RPE 8 (2 Wdh Reserve). Bei Isolation und Maschinen darf der letzte Satz bis zum Versagen gehen – das zählt nicht als Fehlversuch.</li>
          <li><b>Aufwärmen:</b> Vor Hauptübungen werden Aufwärmsätze berechnet. Sie zählen nicht für Progression und Statistik.</li>
          <li><b>Pausen:</b> Der Timer startet nach jedem Satz automatisch, je nach Übung 1–3 Minuten.</li>
          <li><b>Stagnation & Deload:</b> Wird eine Übung zweimal in 6 Wochen reduziert, schlägt der Wochenrückblick einen Tausch vor. Alle 7 Wochen gibt es eine Deload-Woche (90 % Gewicht, halbe Sätze).</li>
          <li><b>Daten:</b> Alles bleibt auf diesem iPhone. Sichere regelmäßig ein Backup.</li>
        </ul>
      </details>
      <div class="card">
        <h2>Backup</h2>
        <button class="btn" data-act="export">Backup exportieren</button>
        <label class="btn">Backup importieren<input type="file" accept=".json,application/json" data-file="backup" hidden></label>
        <div class="muted small pmt">Letztes Backup: ${S.settings.lastBackup ? dateDE(S.settings.lastBackup) : 'noch nie'}</div>
      </div>
      <details class="planedit"><summary class="btn">Plan bearbeiten</summary>
      <div class="muted small pe-hint">Nur nötig, wenn du ohne Rückfrage etwas ändern willst: Gewicht korrigieren, Sätze, Wdh-Bereich, RPE-Ziel oder Gewichtsschritt einer Maschine.</div>
      ${S.plan.days.map(d => `
        <div class="card">
          <h2>${esc(d.name)}</h2>
          ${d.ex.map(id => { const e = ex(id); return `
            <details class="erow">
              <summary class="ename"><span class="tag t${e.type}">${e.type}</span><span class="en">${esc(e.name)}</span><span class="ew">${e.weight ? fmt(e.weight) + ' kg' : '–'}</span></summary>
              <div class="egrid">
                <label>kg<input inputmode="decimal" data-plan="weight" data-ex="${id}" value="${e.weight == null ? '' : fmt(e.weight)}"></label>
                <label>Sätze<input inputmode="numeric" data-plan="sets" data-ex="${id}" value="${e.sets}"></label>
                <label>Wdh von<input inputmode="numeric" data-plan="lo" data-ex="${id}" value="${e.lo}"></label>
                <label>bis<input inputmode="numeric" data-plan="hi" data-ex="${id}" value="${e.hi}"></label>
                <label>RPE<input inputmode="decimal" data-plan="rpe" data-ex="${id}" value="${fmt(e.rpe)}"></label>
                <label>Schritt<input inputmode="decimal" data-plan="step" data-ex="${id}" value="${fmt(L.stepOf(e))}"></label>
              </div>
            </details>`; }).join('')}
        </div>`).join('')}
      </details>
      <div class="muted small center">Version ${APP_VERSION} · Daten nur lokal gespeichert</div>`;
  }

  // ---------- Render ----------
  function render() {
    const main = $('#main');
    main.innerHTML = view === 'train' ? renderTrain() : view === 'stats' ? renderStats() : renderSettings();
    document.body.classList.toggle('in-workout', view === 'train' && !!S.active && !S.summary);
    document.querySelectorAll('nav button').forEach(b => b.classList.toggle('on', b.dataset.view === view));
    renderTimer();
  }

  // ---------- Export / Import ----------
  function exportBackup() {
    const blob = new Blob([JSON.stringify(S)], { type: 'application/json' });
    const name = 'gym-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    const file = new File([blob], name, { type: 'application/json' });
    const done = () => { S.settings.lastBackup = new Date().toISOString(); save(); render(); };
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title: 'Gym-Backup' }).then(done).catch(() => {});
    } else {
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000); done();
    }
  }
  function readFile(input, cb) {
    const f = input.files && input.files[0]; if (!f) return;
    const r = new FileReader(); r.onload = () => cb(String(r.result)); r.readAsText(f); input.value = '';
  }

  // ---------- Events ----------
  document.addEventListener('touchstart', unlockAudio, { passive: true });
  document.addEventListener('click', ev => {
    unlockAudio();
    if (Date.now() - lastSwipe < 400) return;
    const b = ev.target.closest('[data-act],[data-view]');
    if (!b) return;
    if (b.dataset.view) { view = b.dataset.view; render(); toTop(); return; }
    const act = b.dataset.act; const id = b.dataset.ex; const i = +b.dataset.i;
    const A = S.active;
    switch (act) {
      case 'start': startWorkout(b.dataset.day, !!b.dataset.deload); toTop(); break;
      case 'w': case 'r': {
        const s = A.entries[id].sets[i]; const e = ex(id); const d = +b.dataset.d;
        if (act === 'w') s.w = s.w == null ? ((!A.entries[id].sub && e.weight) || 0) : L.addSteps(e, s.w, d);
        else s.r = Math.max(0, (s.r || 0) + d);
        save(); render(); break;
      }
      case 'done': {
        const ent = A.entries[id]; const s = ent.sets[i];
        if (s.done) { s.done = false; save(); render(); break; }
        if (s.w == null || s.w === '' || isNaN(s.w)) { toast('Bitte Gewicht eintragen'); break; }
        s.done = true; A.lastActivity = new Date().toISOString();
        const e = ex(id);
        if (!e.weight && !ent.sub) e.weight = s.w;
        // folgende Sätze mit gleichem Gewicht vorbelegen
        ent.sets.forEach((x, j) => { if (j > i && !x.done) x.w = s.w; });
        const firstIdx = ent.sets.findIndex(x => x.done);
        if (firstIdx === i && !A.deload && !ent.sub && !e.extra && (ent.intra === null || ent.intra === undefined)) {
          const sug = L.intraSuggest(e, s, A.order.indexOf(id));
          if (sug != null && sug < s.w && ent.sets.some(x => !x.done)) ent.intra = sug;
        }
        const isLastOverall = A.order.every(oid => A.entries[oid].sets.every(x => x.done));
        if (!isLastOverall) startTimer(id); else stopTimer();
        const before = currentEx();
        if (ent.sets.every(x => x.done) && A.openId === id) A.openId = null;
        save(); render();
        const after = currentEx();
        if (after !== before) toTop();
        break;
      }
      case 'open': A.openId = id; save(); render(); { const c = document.getElementById('card-' + id); if (c) c.scrollIntoView({ block: 'start', behavior: 'smooth' }); } break;
      case 'prevex': case 'nextex': {
        const cur = currentEx(); const k = A.order.indexOf(cur) + (act === 'nextex' ? 1 : -1);
        if (k >= 0 && k < A.order.length) { A.openId = A.order[k]; save(); render(); toTop(); }
        break;
      }
      case 'overview': A.overview = true; A.addOpen = false; save(); render(); break;
      case 'overviewclose': if (ev.target.closest('[data-stop]') && b.dataset.act === 'overviewclose' && b.classList.contains('overlay')) break; A.overview = false; A.addOpen = false; save(); render(); break;
      case 'jump': A.openId = id; A.overview = false; save(); render(); toTop(); break;
      case 'setmenu': A.setMenu = { ex: id, kind: b.dataset.kind, i }; save(); render(); break;
      case 'setmenuclose': if (ev.target.closest('[data-stop]') && b.classList.contains('overlay')) break; A.setMenu = null; save(); render(); break;
      case 'settype': {
        const m = A.setMenu; const ent = A.entries[m.ex]; const e = ex(m.ex);
        if (b.dataset.type !== m.kind) {
          if (m.kind === 'set') { const s0 = ent.sets.splice(m.i, 1)[0]; ent.warm.push({ w: s0.w, r: s0.r, done: s0.done, we: s0.we, re: s0.re }); }
          else { const w0 = ent.warm.splice(m.i, 1)[0]; ent.sets.unshift({ w: w0.w, r: w0.r, rpe: e.rpe, done: w0.done, we: w0.we, re: w0.re }); }
        }
        A.setMenu = null; save(); render(); break;
      }
      case 'addset': {
        const ent = A.entries[id]; const e = ex(id);
        const last = ent.sets[ent.sets.length - 1] || { w: e.weight, r: e.lo, rpe: e.rpe };
        ent.sets.push({ w: last.w, r: last.r, rpe: last.rpe, done: false });
        A.openId = id; save(); render(); break;
      }
      case 'addex': A.addOpen = true; save(); render(); break;
      case 'addclose': A.addOpen = false; save(); render(); break;
      case 'addpick': addExtra(b.dataset.name); break;
      case 'addcustom': { const n = ($('#addname').value || '').trim(); if (n) addExtra(n); else toast('Bitte Namen eingeben'); break; }
      case 'undo': { const f = undoFn; undoFn = null; $('#toast').classList.remove('show'); if (f) f(); break; }
      case 'reviewok': S.settings.reviewSeen = b.dataset.key; save(); render(); break;
      case 'swapplan': {
        const e = ex(id); const old = e.name; const n = b.dataset.name;
        if (!confirm(old + ' dauerhaft durch ' + n + ' ersetzen? Das Startgewicht testest du im nächsten Training.')) break;
        const last = lastByName(n);
        Object.assign(e, { name: n, weight: last && last.sets.length ? last.sets[0].w : null, misses: 0, reductions: [], stalled: false, hevy: [] });
        e.alts = [old].concat(altsFor(id).filter(a => a !== n));
        save(); toast(old + ' → ' + n); render(); break;
      }
      case 'later': {
        const k = A.order.indexOf(id);
        A.order.splice(k, 1); A.order.push(id);
        save(); render(); toast(ex(id).name + ' ans Ende verschoben'); break;
      }
      case 'menu': A.entries[id].menu = !A.entries[id].menu; if (!A.entries[id].menu) A.entries[id].subOpen = false; save(); render(); break;
      case 'noteedit': A.entries[id].noteEdit = true; A.entries[id].menu = false; save(); render(); { const ta = document.querySelector(`[data-note="${id}"]`); if (ta) ta.focus(); } break;
      case 'notesave': {
        const ta = document.querySelector(`[data-note="${id}"]`);
        if (ta) { S.notes = S.notes || {}; const k = noteKey(id); const v = ta.value.trim(); if (v) S.notes[k] = v; else delete S.notes[k]; }
        A.entries[id].noteEdit = false; save(); render(); break;
      }
      case 'reorder': A.reorder = true; A.entries[id].menu = false; save(); render(); break;
      case 'reorderdone': {
        const ids = [...document.querySelectorAll('#rlist li')].map(li => li.dataset.id);
        if (ids.length === A.order.length) A.order = ids;
        A.reorder = false; save(); render(); break;
      }
      case 'subopen': A.entries[id].subOpen = true; save(); render(); break;
      case 'subclose': A.entries[id].subOpen = false; save(); render(); break;
      case 'subset': setSub(id, b.dataset.name); break;
      case 'subcustom': {
        const n = (prompt('Name der Ersatzübung:') || '').trim();
        if (n) setSub(id, n);
        break;
      }
      case 'subundo': setSub(id, null); break;
      case 'warm': { const w = A.entries[id].warm[i]; w.done = !w.done; A.lastActivity = new Date().toISOString(); save(); render(); break; }
      case 'togglewarm': { A.entries[id].showWarm = !A.entries[id].showWarm; save(); render(); break; }
      case 'intra': { const ent = A.entries[id]; ent.sets.forEach(x => { if (!x.done) x.w = ent.intra; }); ent.intra = false; save(); render(); break; }
      case 'intrano': { A.entries[id].intra = false; save(); render(); break; }
      case 'finish': {
        const any = A.order.some(oid => A.entries[oid].sets.some(x => x.done));
        if (!any) { toast('Noch kein Satz erledigt'); break; }
        const open = A.order.reduce((n, oid) => n + A.entries[oid].sets.filter(x => !x.done).length, 0);
        if (open && !confirm('Noch ' + open + (open === 1 ? ' Satz' : ' Sätze') + ' offen. Training trotzdem beenden? Offene Sätze werden nicht gespeichert.')) break;
        finishWorkout(); break;
      }
      case 'cancel': if (confirm('Training wirklich verwerfen? Es wird nicht gespeichert.')) { S.active = null; S.summary = null; save(); render(); } break;
      case 'savesum': saveSummary(); toTop(); break;
      case 'backtowork': S.summary = null; save(); render(); break;
      case 't-minus': adjustTimer(-15); break;
      case 't-plus': adjustTimer(15); break;
      case 't-skip': stopTimer(); break;
      case 'range': statRange = +b.dataset.d; render(); break;
      case 'export': exportBackup(); break;
      case 'reset': if (confirm('Wirklich alle Daten löschen? Vorher ein Backup machen!')) { S = fresh(); save(); render(); } break;
    }
  });
  // Wischen nach links löscht einen Satz
  let sw = null, lastSwipe = 0;
  document.addEventListener('pointerdown', ev => {
    const row = ev.target.closest('[data-swipe]'); if (!row || !S.active) return;
    sw = { row, x0: ev.clientX, y0: ev.clientY, id: ev.pointerId, dx: 0, on: false };
  });
  document.addEventListener('pointermove', ev => {
    if (!sw || ev.pointerId !== sw.id) return;
    const dx = ev.clientX - sw.x0, dy = ev.clientY - sw.y0;
    if (!sw.on) {
      if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.5 && dx < 0) { sw.on = true; try { sw.row.setPointerCapture(sw.id); } catch (e) {} if (document.activeElement) document.activeElement.blur(); }
      else if (Math.abs(dy) > 12) { sw = null; return; }
      else return;
    }
    ev.preventDefault();
    sw.dx = Math.min(0, dx);
    sw.row.style.transform = `translateX(${sw.dx}px)`;
    sw.row.classList.toggle('swdel', sw.dx < -90);
  }, { passive: false });
  const endSwipe = ev => {
    if (!sw || ev.pointerId !== sw.id) return;
    const { row, on, dx } = sw; sw = null;
    if (!on) return;
    lastSwipe = Date.now();
    if (dx < -90) {
      const ent = S.active.entries[row.dataset.ex]; const list = row.dataset.swipe === 'warm' ? ent.warm : ent.sets;
      const k = +row.dataset.i; const removed = list.splice(k, 1)[0];
      save(); render();
      toast('Satz gelöscht', () => { if (S.active && S.active.entries[row.dataset.ex]) { list.splice(k, 0, removed); save(); render(); } });
    } else { row.style.transform = ''; row.classList.remove('swdel'); }
  };
  document.addEventListener('pointerup', endSwipe);
  document.addEventListener('pointercancel', endSwipe);

  // Ziehen zum Sortieren (Reihenfolge ändern)
  let drag = null;
  document.addEventListener('pointerdown', ev => {
    const h = ev.target.closest('.handle'); if (!h) return;
    const li = h.closest('li'); ev.preventDefault();
    drag = { li, list: li.parentElement, id: ev.pointerId };
    li.classList.add('dragging');
    try { h.setPointerCapture(ev.pointerId); } catch (e) { /* egal */ }
  });
  document.addEventListener('pointermove', ev => {
    if (!drag || ev.pointerId !== drag.id) return;
    ev.preventDefault();
    const y = ev.clientY; const li = drag.li;
    const next = li.nextElementSibling, prev = li.previousElementSibling;
    if (next) { const r = next.getBoundingClientRect(); if (y > r.top + r.height / 2) { drag.list.insertBefore(next, li); return; } }
    if (prev) { const r = prev.getBoundingClientRect(); if (y < r.top + r.height / 2) drag.list.insertBefore(li, prev); }
  }, { passive: false });
  const endDrag = ev => {
    if (!drag || ev.pointerId !== drag.id) return;
    drag.li.classList.remove('dragging');
    const ids = [...drag.list.children].map(li => li.dataset.id);
    if (S.active && ids.length === S.active.order.length) { S.active.order = ids; save(); }
    drag = null;
  };
  document.addEventListener('pointerup', endDrag);
  document.addEventListener('pointercancel', endDrag);

  document.addEventListener('change', ev => {
    const t = ev.target;
    if (t.dataset.act === 'statex') { statEx = t.value; render(); return; }
    if (t.dataset.note && S.active) {
      S.notes = S.notes || {};
      const k = noteKey(t.dataset.note); const v = t.value.trim();
      if (v) S.notes[k] = v; else delete S.notes[k];
      save(); return;
    }
    if (t.dataset.field && S.active) {
      const ent = S.active.entries[t.dataset.ex];
      const s = t.dataset.warm ? ent.warm[+t.dataset.i] : ent.sets[+t.dataset.i];
      const v = parseFloat(String(t.value).replace(',', '.'));
      if (t.dataset.field === 'rpe') s.rpe = v;
      else if (t.dataset.field === 'w') { if (!isNaN(v)) { s.w = v; s.we = true; } else s.we = false; }
      else { if (!isNaN(v)) { s.r = Math.round(v); s.re = true; } else s.re = false; }
      save(); return;
    }
    if (t.dataset.sum != null && S.summary) {
      const v = parseFloat(String(t.value).replace(',', '.'));
      if (!isNaN(v)) { S.summary.items[+t.dataset.sum].newW = v; save(); }
      return;
    }
    if (t.dataset.plan) {
      const e = ex(t.dataset.ex); const f = t.dataset.plan;
      const v = parseFloat(String(t.value).replace(',', '.'));
      if (f === 'weight') e.weight = isNaN(v) ? null : v;
      else if (!isNaN(v)) e[f] = (f === 'sets' || f === 'lo' || f === 'hi') ? Math.round(v) : v;
      save(); toast('Gespeichert'); return;
    }
    if (t.dataset.file === 'hevy') readFile(t, txt => {
      try {
        const res = L.importCSV(txt, S.plan);
        const have = new Set(S.hevy.map(s => s.id));
        // gleiche Einheit aus anderer Quelle (±90 min) nicht doppelt zählen
        const times = S.hevy.concat(S.sessions).map(s => new Date(s.date).getTime());
        let n = 0, dup = 0;
        res.sessions.forEach(s => {
          if (have.has(s.id)) return;
          const t = new Date(s.date).getTime();
          if (times.some(x => Math.abs(x - t) < 90 * 60000)) { dup++; return; }
          S.hevy.push(s); n++;
        });
        S.hevy.sort((a, b) => a.date.localeCompare(b.date));
        save(); toast(n + ' ' + res.source + '-Einheiten importiert' + (dup ? ', ' + dup + ' doppelte übersprungen' : '')); render();
      } catch (e) { toast('Import fehlgeschlagen: ' + e.message); }
    });
    if (t.dataset.file === 'backup') readFile(t, txt => {
      try {
        const s = JSON.parse(txt); if (!s.plan) throw new Error('Keine Gym-App-Datei');
        if (!confirm('Backup einspielen? Aktuelle Daten werden ersetzt.')) return;
        S = s; save(); toast('Backup eingespielt'); render();
      } catch (e) { toast('Import fehlgeschlagen: ' + e.message); }
    });
  });

  // ---------- Start ----------
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    const hadController = !!navigator.serviceWorker.controller;
    let reloaded = false;
    // Neue Version aktiv -> einmal neu laden (Training bleibt gespeichert)
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController && !reloaded) { reloaded = true; save(); location.reload(); } });
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(reg => {
      reg.update().catch(() => {});
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
    }).catch(() => {});
  }
  if (S.active) requestWake();
  render();
  window.__gym = { get state() { return S; }, render };
})();
