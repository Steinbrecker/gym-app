/* Gym-App – Oberfläche */
(function () {
  'use strict';
  const L = window.Logic;
  const KEY = 'gymapp.v1';
  const RPES = [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10];
  const REST = { power: { H: 180, A: 120, I: 90 }, hyp: { H: 120, A: 90, I: 60 } };

  // ---------- Zustand ----------
  let S = load();
  let view = 'train';
  let statEx = null;
  let statRange = 90;

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
  const ex = id => S.plan.exercises[id];
  const dayById = id => S.plan.days.find(d => d.id === id);
  const dateDE = iso => new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
  const typeLabel = { H: 'Haupt', A: 'Assistenz', I: 'Isolation' };

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2600);
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
        sets: Array.from({ length: nSets }, (_, i) => ({ w: w, r: tr[i] || e.lo, rpe: e.rpe, done: false })),
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
    S.active.timer = { end: Date.now() + secs * 1000, total: secs, name: e.name, beeped: false };
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
    if (!t) { el.classList.remove('show', 'done'); return; }
    const left = Math.round((t.end - Date.now()) / 1000);
    const done = left <= 0;
    const a = Math.abs(left);
    el.classList.add('show'); el.classList.toggle('done', done);
    el.querySelector('.t-time').textContent = (done ? '+' : '') + Math.floor(a / 60) + ':' + String(a % 60).padStart(2, '0');
    el.querySelector('.t-label').textContent = done ? 'Pause vorbei – los geht\'s!' : 'Pause · ' + t.name;
    el.querySelector('.t-bar').style.width = Math.max(0, Math.min(100, (left / t.total) * 100)) + '%';
    if (done && !t.beeped) { t.beeped = true; beep(); save(); }
  }
  setInterval(renderTimer, 250);

  // ---------- Bildschirm anlassen ----------
  let wake = null;
  async function requestWake() {
    try { if ('wakeLock' in navigator && S.active && !wake) { wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => (wake = null)); } } catch (e) { wake = null; }
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { requestWake(); renderTimer(); } });

  // ---------- Training beenden ----------
  function finishWorkout() {
    const A = S.active;
    const items = A.order.map((id, pos) => {
      const e = ex(id); const ent = A.entries[id];
      const done = ent.sets.filter(s => s.done);
      if (!done.length) return { id, skipped: true, name: e.name, oldW: e.weight, newW: e.weight };
      if (A.deload) return { id, name: e.name, oldW: e.weight, newW: e.weight, note: 'Deload – zählt nicht für die Progression' };
      const tmp = Object.assign({}, e, { weight: e.weight || done[0].w });
      const r = L.evaluate(tmp, ent.sets, pos);
      return { id, name: e.name, oldW: e.weight || done[0].w, newW: r.newWeight, note: r.note, result: r.result, misses: r.misses };
    });
    S.summary = { items };
    A.timer = null;
    save(); render(); window.scrollTo(0, 0);
  }
  function saveSummary() {
    const A = S.active; const now = new Date().toISOString();
    S.summary.items.forEach(it => {
      if (it.skipped) return;
      const e = ex(it.id);
      if (A.deload) return;
      L.apply(e, { newWeight: it.newW, misses: it.misses, result: it.result }, now);
    });
    S.sessions.push({
      id: 's' + Date.now(), dayId: A.dayId, pass: A.pass, deload: A.deload, date: A.startedAt, end: now,
      entries: A.order.map((id, pos) => ({ exId: id, name: ex(id).name, pos, sets: A.entries[id].sets.filter(s => s.done).map(s => ({ w: s.w, r: s.r, rpe: s.rpe, done: true })) })).filter(e => e.sets.length),
    });
    if (A.deload) S.settings.lastDeload = now;
    S.counters[A.dayId] = (S.counters[A.dayId] || 0) + 1;
    S.lastDayId = A.dayId;
    S.active = null; S.summary = null;
    if (wake) { wake.release().catch(() => {}); wake = null; }
    save(); toast('Training gespeichert 💪'); render();
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
    const backupDue = !S.settings.lastBackup || Date.now() - new Date(S.settings.lastBackup) > 14 * 864e5;
    return `
      <section class="hero">
        <div class="eyebrow">Nächstes Training</div>
        <h1>${esc(day.name)}</h1>
        <div class="muted">Durchgang ${pass + 1} · ${day.kind === 'power' ? 'Kraft' : 'Hypertrophie'}</div>
      </section>
      ${hint ? `<div class="note warn">${esc(hint)}</div>` : ''}
      ${backupDue && (S.sessions.length || S.hevy.length) ? `<div class="note">Zeit für ein Backup. <button class="link" data-act="export">Jetzt sichern</button></div>` : ''}
      <ol class="preview">
        ${order.map((id, i) => { const e = ex(id); return `<li><span class="tag t${e.type}">${e.type}</span><span class="pname">${esc(e.name)}${e.stalled ? ' <span class="stall">stagniert</span>' : ''}</span><span class="pw">${e.weight ? fmt(e.weight) + ' kg' : 'testen'}</span><span class="psets">${e.sets}×${e.lo}–${e.hi}</span></li>`; }).join('')}
      </ol>
      <button class="btn primary big" data-act="start" data-day="${nid}">Training starten</button>
      <button class="btn ghost" data-act="start" data-day="${nid}" data-deload="1">Als Deload starten (90 %, halbe Sätze)</button>
      <details class="other">
        <summary>Anderen Tag wählen</summary>
        ${S.plan.days.filter(d => d.id !== nid).map(d => `<button class="btn ghost" data-act="start" data-day="${d.id}">${esc(d.name)} · Durchgang ${(S.counters[d.id] || 0) + 1}</button>`).join('')}
      </details>`;
  }

  function renderActive() {
    const A = S.active; const day = dayById(A.dayId);
    const mins = Math.floor((Date.now() - new Date(A.startedAt)) / 60000);
    const total = A.order.reduce((a, id) => a + A.entries[id].sets.length, 0);
    const doneN = A.order.reduce((a, id) => a + A.entries[id].sets.filter(s => s.done).length, 0);
    return `
      <section class="hero small">
        <div class="eyebrow">${A.deload ? 'Deload · ' : ''}Durchgang ${A.pass + 1} · ${mins} min</div>
        <h1>${esc(day.name)}</h1>
        <div class="progress"><div style="width:${total ? (doneN / total) * 100 : 0}%"></div></div>
      </section>
      ${A.order.map((id, pos) => renderExCard(id, pos)).join('')}
      <button class="btn primary big" data-act="finish">Training beenden</button>
      <button class="btn ghost danger" data-act="cancel">Training verwerfen</button>`;
  }

  function renderExCard(id, pos) {
    const e = ex(id); const ent = S.active.entries[id];
    const last = lastAny(id);
    const allDone = ent.sets.every(s => s.done);
    const rpeTxt = e.type === 'I' || e.failLast ? `RPE ${fmt(e.rpe)}, letzter Satz bis Versagen` : `RPE ${fmt(e.rpe)}`;
    const posNote = e.type === 'H' && pos >= 1 ? '<div class="hint">An 2. Position: 1 Wdh weniger ist okay.</div>' : '';
    return `
      <article class="card ${allDone ? 'complete' : ''}" id="card-${id}">
        <header>
          <span class="tag t${e.type}">${e.type}</span>
          <div class="ctitle"><h2>${esc(e.name)}</h2>
            <div class="muted">${e.sets} × ${e.lo}–${e.hi} · ${rpeTxt}${e.kind === 'kh' ? ' · kg pro Hantel' : ''}</div></div>
        </header>
        ${last ? `<div class="last">Letztes Mal${last.hevy ? ' (Hevy)' : ''}, ${dateDE(last.date)}: ${esc(setsText(last.sets))}</div>` : '<div class="last">Neu: Gewicht wählen, ersten Satz machen, RPE ehrlich eintragen.</div>'}
        ${posNote}
        ${ent.warm.length ? `
          <button class="warmtoggle" data-act="togglewarm" data-ex="${id}">${ent.showWarm ? '▾' : '▸'} Aufwärmen (${ent.warm.filter(w => w.done).length}/${ent.warm.length})</button>
          ${ent.showWarm ? `<div class="warm">${ent.warm.map((w, i) => `<button class="wchip ${w.done ? 'on' : ''}" data-act="warm" data-ex="${id}" data-i="${i}">${fmt(w.w)} × ${w.r}</button>`).join('')}</div>` : ''}` : ''}
        ${ent.intra ? `<div class="note warn">Erster Satz war zu schwer. Restliche Sätze mit ${fmt(ent.intra)} kg? <button class="link" data-act="intra" data-ex="${id}">Übernehmen</button> <button class="link muted" data-act="intrano" data-ex="${id}">Nein</button></div>` : ''}
        <div class="sets">
          ${ent.sets.map((s, i) => renderSet(id, s, i)).join('')}
        </div>
      </article>`;
  }

  function renderSet(id, s, i) {
    const e = ex(id);
    return `
      <div class="set ${s.done ? 'done' : ''}">
        <div class="sn">${i + 1}</div>
        <div class="stepper">
          <button data-act="w" data-ex="${id}" data-i="${i}" data-d="-1" aria-label="weniger Gewicht">−</button>
          <input inputmode="decimal" data-field="w" data-ex="${id}" data-i="${i}" value="${s.w == null ? '' : fmt(s.w)}" placeholder="kg">
          <button data-act="w" data-ex="${id}" data-i="${i}" data-d="1" aria-label="mehr Gewicht">+</button>
        </div>
        <div class="stepper reps">
          <button data-act="r" data-ex="${id}" data-i="${i}" data-d="-1" aria-label="weniger Wdh">−</button>
          <input inputmode="numeric" data-field="r" data-ex="${id}" data-i="${i}" value="${s.r == null ? '' : s.r}">
          <button data-act="r" data-ex="${id}" data-i="${i}" data-d="1" aria-label="mehr Wdh">+</button>
        </div>
        <select data-field="rpe" data-ex="${id}" data-i="${i}" aria-label="RPE">
          ${RPES.map(r => `<option value="${r}" ${s.rpe === r ? 'selected' : ''}>@${fmt(r)}</option>`).join('')}
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
          <div><div class="sname">${esc(x.name)}</div><div class="muted small">${x.skipped ? 'Nicht gemacht – unverändert' : esc(x.note || '')}</div></div>
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
    const buckets = Array.from({ length: weeks }, (_, i) => ({ from: new Date(start.getTime() + i * 7 * 864e5), n: 0, byMuscle: {} }));
    const add = (dateISO, entries) => {
      const t = new Date(dateISO).getTime(); const i = Math.floor((t - start.getTime()) / (7 * 864e5));
      if (i < 0 || i >= weeks) return;
      buckets[i].n++;
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
  function barChart(buckets) {
    const W = 340, H = 150, P = { l: 24, r: 6, t: 10, b: 22 };
    const max = Math.max(4, ...buckets.map(b => Object.values(b.byMuscle).reduce((a, x) => a + x, 0)));
    const bw = (W - P.l - P.r) / buckets.length;
    return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Harte Sätze pro Woche">
      <line x1="${P.l}" x2="${W - P.r}" y1="${H - P.b}" y2="${H - P.b}" class="grid"/>
      <text x="${P.l - 4}" y="${P.t + 8}" class="axis" text-anchor="end">${max}</text>
      ${buckets.map((b, i) => { const n = Object.values(b.byMuscle).reduce((a, x) => a + x, 0); const h = (n / max) * (H - P.t - P.b); return `<rect x="${(P.l + i * bw + 2).toFixed(1)}" y="${(H - P.b - h).toFixed(1)}" width="${(bw - 4).toFixed(1)}" height="${h.toFixed(1)}" rx="3" class="bar"/>${i % 3 === 0 ? `<text x="${(P.l + i * bw + bw / 2).toFixed(1)}" y="${H - 6}" class="axis" text-anchor="middle">${b.from.getDate()}.${b.from.getMonth() + 1}.</text>` : ''}`; }).join('')}
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
    const histRows = [...S.sessions.map(s => ({ date: s.date, title: (dayById(s.dayId) || {}).name + (s.deload ? ' (Deload)' : ''), n: s.entries.length })), ...S.hevy.map(s => ({ date: s.date, title: s.title + ' (Hevy)', n: s.entries.length }))].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 15);
    return `
      <section class="hero small"><div class="eyebrow">Statistik</div><h1>Fortschritt</h1></section>
      <div class="card">
        <select class="full" data-act="statex">${names.map(n => `<option ${n === statEx ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>
        <div class="kpis">
          <div><div class="k">${lastP ? fmt(Math.round(lastP.y * 2) / 2) : '–'}</div><div class="muted small">e1RM zuletzt (kg)</div></div>
          <div><div class="k">${best ? fmt(Math.round(best.y * 2) / 2) : '–'}</div><div class="muted small">bestes e1RM</div></div>
          <div><div class="k small">${best && best.top ? fmt(best.top.w) + '×' + best.top.r : '–'}</div><div class="muted small">bester Satz</div></div>
        </div>
        <div class="seg">${[[30, '1 M'], [90, '3 M'], [365, '1 J'], [0, 'Alles']].map(([d, l]) => `<button data-act="range" data-d="${d}" class="${statRange === d ? 'on' : ''}">${l}</button>`).join('')}</div>
        ${lineChart(pts)}
        <div class="muted small">Geschätztes 1RM (bester Satz je Einheit). Helle Punkte = Hevy-Historie.</div>
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
    return `
      <section class="hero small"><div class="eyebrow">Einstellungen</div><h1>Plan & Daten</h1></section>
      <div class="card">
        <h2>Daten</h2>
        <button class="btn" data-act="export">Backup exportieren</button>
        <label class="btn">Backup importieren<input type="file" accept=".json,application/json" data-file="backup" hidden></label>
        <label class="btn">Hevy-CSV importieren<input type="file" accept=".csv,text/csv" data-file="hevy" hidden></label>
        <div class="muted small">${S.hevy.length ? S.hevy.length + ' Hevy-Einheiten importiert. ' : ''}Letztes Backup: ${S.settings.lastBackup ? dateDE(S.settings.lastBackup) : 'noch nie'}. Daten liegen nur auf diesem Gerät.</div>
      </div>
      ${S.plan.days.map(d => `
        <div class="card">
          <h2>${esc(d.name)}</h2>
          ${d.ex.map(id => { const e = ex(id); return `
            <div class="erow">
              <div class="ename"><span class="tag t${e.type}">${e.type}</span> ${esc(e.name)}</div>
              <div class="egrid">
                <label>kg<input inputmode="decimal" data-plan="weight" data-ex="${id}" value="${e.weight == null ? '' : fmt(e.weight)}"></label>
                <label>Sätze<input inputmode="numeric" data-plan="sets" data-ex="${id}" value="${e.sets}"></label>
                <label>Wdh von<input inputmode="numeric" data-plan="lo" data-ex="${id}" value="${e.lo}"></label>
                <label>bis<input inputmode="numeric" data-plan="hi" data-ex="${id}" value="${e.hi}"></label>
                <label>RPE<input inputmode="decimal" data-plan="rpe" data-ex="${id}" value="${fmt(e.rpe)}"></label>
                <label>Schritt<input inputmode="decimal" data-plan="step" data-ex="${id}" value="${fmt(L.stepOf(e))}"></label>
              </div>
            </div>`; }).join('')}
        </div>`).join('')}
      <div class="card">
        <h2>Zurücksetzen</h2>
        <button class="btn ghost danger" data-act="reset">Alle Daten löschen</button>
      </div>
      <div class="muted small center">Gym-App v1 · Daten nur lokal gespeichert</div>`;
  }

  // ---------- Render ----------
  function render() {
    const main = $('#main');
    main.innerHTML = view === 'train' ? renderTrain() : view === 'stats' ? renderStats() : renderSettings();
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
    const b = ev.target.closest('[data-act],[data-view]');
    if (!b) return;
    if (b.dataset.view) { view = b.dataset.view; render(); window.scrollTo(0, 0); return; }
    const act = b.dataset.act; const id = b.dataset.ex; const i = +b.dataset.i;
    const A = S.active;
    switch (act) {
      case 'start': startWorkout(b.dataset.day, !!b.dataset.deload); window.scrollTo(0, 0); break;
      case 'w': case 'r': {
        const s = A.entries[id].sets[i]; const e = ex(id); const d = +b.dataset.d;
        if (act === 'w') s.w = s.w == null ? (e.weight || 0) : L.addSteps(e, s.w, d);
        else s.r = Math.max(0, (s.r || 0) + d);
        save(); render(); break;
      }
      case 'done': {
        const ent = A.entries[id]; const s = ent.sets[i];
        if (s.done) { s.done = false; save(); render(); break; }
        if (s.w == null || s.w === '' || isNaN(s.w)) { toast('Bitte Gewicht eintragen'); break; }
        s.done = true;
        const e = ex(id);
        if (!e.weight) { e.weight = s.w; ent.sets.forEach(x => { if (!x.done && x.w == null) x.w = s.w; }); }
        // folgende Sätze mit gleichem Gewicht vorbelegen
        ent.sets.forEach((x, j) => { if (j > i && !x.done) x.w = s.w; });
        const firstIdx = ent.sets.findIndex(x => x.done);
        if (firstIdx === i && !A.deload && ent.intra === null) {
          const sug = L.intraSuggest(e, s, A.order.indexOf(id));
          if (sug != null && sug < s.w && ent.sets.some(x => !x.done)) ent.intra = sug;
        }
        const isLastOverall = A.order.every(oid => A.entries[oid].sets.every(x => x.done));
        if (!isLastOverall) startTimer(id); else stopTimer();
        save(); render(); break;
      }
      case 'warm': { const w = A.entries[id].warm[i]; w.done = !w.done; save(); render(); break; }
      case 'togglewarm': { A.entries[id].showWarm = !A.entries[id].showWarm; save(); render(); break; }
      case 'intra': { const ent = A.entries[id]; ent.sets.forEach(x => { if (!x.done) x.w = ent.intra; }); ent.intra = false; save(); render(); break; }
      case 'intrano': { A.entries[id].intra = false; save(); render(); break; }
      case 'finish': {
        const any = A.order.some(oid => A.entries[oid].sets.some(x => x.done));
        if (!any) { toast('Noch kein Satz erledigt'); break; }
        finishWorkout(); break;
      }
      case 'cancel': if (confirm('Training verwerfen? Nichts wird gespeichert.')) { S.active = null; S.summary = null; save(); render(); } break;
      case 'savesum': saveSummary(); window.scrollTo(0, 0); break;
      case 'backtowork': S.summary = null; save(); render(); break;
      case 't-minus': adjustTimer(-15); break;
      case 't-plus': adjustTimer(15); break;
      case 't-skip': stopTimer(); break;
      case 'range': statRange = +b.dataset.d; render(); break;
      case 'export': exportBackup(); break;
      case 'reset': if (confirm('Wirklich alle Daten löschen? Vorher ein Backup machen!')) { S = fresh(); save(); render(); } break;
    }
  });
  document.addEventListener('change', ev => {
    const t = ev.target;
    if (t.dataset.act === 'statex') { statEx = t.value; render(); return; }
    if (t.dataset.field && S.active) {
      const s = S.active.entries[t.dataset.ex].sets[+t.dataset.i];
      const v = parseFloat(String(t.value).replace(',', '.'));
      if (t.dataset.field === 'rpe') s.rpe = v;
      else if (t.dataset.field === 'w') s.w = isNaN(v) ? null : v;
      else s.r = isNaN(v) ? 0 : Math.round(v);
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
        const sess = L.hevyToSessions(txt, S.plan);
        const have = new Set(S.hevy.map(s => s.id)); let n = 0;
        sess.forEach(s => { if (!have.has(s.id)) { S.hevy.push(s); n++; } });
        S.hevy.sort((a, b) => a.date.localeCompare(b.date));
        save(); toast(n + ' Hevy-Einheiten importiert'); render();
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
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
  if (S.active) requestWake();
  render();
  window.__gym = { get state() { return S; }, render };
})();
