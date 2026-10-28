// Gym-App – reine Logik (Plan, Progression, Rotation, Aufwärmen, e1RM, Hevy-Import)
// Läuft im Browser (window.Logic) und in Node (module.exports) für Tests.
(function (root) {
  'use strict';

  // ---------- Startplan (PHUL, Stand Konzept 28.10.2026) ----------
  // kind: lh = Langhantel, kh = Kurzhantel (Gewicht pro Hantel), m = Steckgewicht-Maschine/Kabel, mp = Maschine mit Scheiben
  // type: H = Hauptübung (rotiert), A = Assistenz, I = Isolation (letzter Satz bis Versagen erlaubt)
  const EX = (id, name, type, sets, lo, hi, rpe, kind, muscle, weight, hevy, extra) =>
    Object.assign({ id, name, type, sets, lo, hi, rpe, kind, muscle, weight, hevy: hevy || [], misses: 0, reductions: [] }, extra || {});

  function defaultPlan() {
    const exercises = [
      // Tag 1 – Upper Power
      EX('bench', 'Bankdrücken', 'H', 4, 3, 5, 8, 'lh', 'Brust', 75, ['Bankdrücken (Langhantel)']),
      EX('tbar', 'Brustgestütztes T-Bar-Rudern', 'H', 4, 3, 5, 8, 'mp', 'Rücken', 42.5, ['Brustgestütztes T-Bar Rudern', 'Chest Supported T Bar Row']),
      EX('inclinedb', 'Schrägbank KH-Drücken', 'A', 3, 6, 10, 8, 'kh', 'Brust', 28, ['Schrägbankdrücken (Kurzhantel)']),
      EX('pulldown', 'Latzug', 'A', 3, 6, 10, 8, 'm', 'Rücken', 70, ['Latzug (Kabelzug)', 'Latzug (Kabel)']),
      EX('ohp', 'Schulterdrücken', 'A', 3, 5, 8, 8, 'lh', 'Schultern', 42.5, ['Schulterdrücken (Langhantel)']),
      EX('bbcurl', 'Langhantel-Curls', 'I', 3, 6, 10, 9, 'lh', 'Bizeps', 30, ['Bizepscurl (Langhantel)']),
      EX('ohtri', 'Trizepsdrücken über Kopf, sitzend', 'I', 3, 6, 10, 9, 'kh', 'Trizeps', 24, ['Trizepsdrücken (Kurzhantel)']),
      // Tag 2 – Lower Power
      EX('squat', 'Kniebeuge', 'H', 4, 3, 5, 8, 'lh', 'Beine vorne', 60, ['Squat (Langhantel)']),
      EX('deadlift', 'Kreuzheben', 'H', 3, 3, 5, 8, 'lh', 'Beine hinten', 85, ['Kreuzheben (Langhantel)']),
      EX('legpress', 'Beinpresse', 'A', 3, 10, 15, 8, 'm', 'Beine vorne', null, []),
      EX('legcurl_p', 'Beinbeuger liegend', 'I', 3, 6, 10, 9, 'm', 'Beine hinten', 45, ['Liegendes Beinbeugen (Maschine)']),
      EX('calfseat', 'Wadenheben sitzend', 'I', 4, 6, 10, 9, 'm', 'Waden', 70, ['Wadenheben sitzend']),
      // Tag 3 – Upper Hypertrophie
      EX('inclinepress', 'Isolaterale Schrägbank-Brustpresse', 'H', 3, 8, 12, 9, 'mp', 'Brust', null, [], { failLast: true }),
      EX('isorow', 'Isolaterales Rudern', 'H', 3, 8, 12, 9, 'mp', 'Rücken', 50, ['Iso-Laterales Rudern (Maschine)'], { failLast: true }),
      EX('butterfly', 'Butterfly', 'A', 3, 8, 12, 9, 'm', 'Brust', 60, ['Fliegende (Maschine)']),
      EX('highrow', 'Isolaterales Rudern von oben', 'A', 3, 8, 12, 9, 'mp', 'Rücken', 65, ['Iso-Laterales Rudern von oben (Maschine)']),
      EX('lateral', 'Seitheben', 'I', 3, 10, 15, 9, 'kh', 'Schultern', 8, ['Seitheben (Kurzhantel)']),
      EX('inclinecurl', 'Schrägbank-Curls', 'I', 3, 8, 12, 9, 'kh', 'Bizeps', 14, ['Incline Curl sitzend (Kurzhantel)']),
      EX('pushdown', 'Trizepsdrücken Kabel', 'I', 3, 8, 12, 9, 'm', 'Trizeps', 60, ['Trizeps-Pushdown mit Seil (Kabelzug)', 'Trizeps-Pushdown (Kabelzug)']),
      // Tag 4 – Lower Hypertrophie
      EX('hack', 'Hackenschmidt-Kniebeuge', 'H', 3, 8, 12, 8, 'mp', 'Beine vorne', null, []),
      EX('legcurl_h', 'Beinbeuger liegend', 'H', 3, 10, 15, 9, 'm', 'Beine hinten', 40, [], { failLast: true }),
      EX('backext', 'Rückenstrecker 45° (mit Scheibe)', 'A', 3, 10, 15, 8, 'mp', 'Beine hinten', null, []),
      EX('legext', 'Beinstrecker', 'I', 3, 10, 15, 9, 'm', 'Beine vorne', null, []),
      EX('adductor', 'Adduktoren', 'I', 3, 12, 15, 9, 'm', 'Adduktoren', null, []),
      EX('abductor', 'Abduktoren', 'I', 2, 12, 15, 9, 'm', 'Po', null, []),
      EX('calfpress', 'Wadendrücken an der Beinpresse', 'I', 4, 10, 15, 9, 'm', 'Waden', null, []),
    ];
    const days = [
      { id: 'up', name: 'Upper Power', kind: 'power', ex: ['bench', 'tbar', 'inclinedb', 'pulldown', 'ohp', 'bbcurl', 'ohtri'] },
      { id: 'lp', name: 'Lower Power', kind: 'power', ex: ['squat', 'deadlift', 'legpress', 'legcurl_p', 'calfseat'] },
      { id: 'uh', name: 'Upper Hypertrophie', kind: 'hyp', ex: ['inclinepress', 'isorow', 'butterfly', 'highrow', 'lateral', 'inclinecurl', 'pushdown'] },
      { id: 'lh', name: 'Lower Hypertrophie', kind: 'hyp', ex: ['hack', 'legcurl_h', 'backext', 'legext', 'adductor', 'abductor', 'calfpress'] },
    ];
    const map = {};
    exercises.forEach(e => (map[e.id] = e));
    return { exercises: map, days };
  }

  // ---------- Gewichte ----------
  function stepOf(ex) {
    if (ex.step) return ex.step;
    return { lh: 2.5, kh: 2, m: 5, mp: 2.5 }[ex.kind] || 2.5;
  }
  function roundDown(ex, w) {
    const s = stepOf(ex);
    let r = Math.floor(w / s + 1e-9) * s;
    if (ex.kind === 'kh') r = Math.min(50, Math.max(6, r));
    return Math.max(0, +r.toFixed(2));
  }
  function roundNear(ex, w) {
    const s = stepOf(ex);
    let r = Math.round(w / s) * s;
    if (ex.kind === 'kh') r = Math.min(50, Math.max(6, r));
    return Math.max(0, +r.toFixed(2));
  }
  function addSteps(ex, w, n) {
    let r = +(w + n * stepOf(ex)).toFixed(2);
    if (ex.kind === 'kh') r = Math.min(50, Math.max(6, r));
    return Math.max(0, r);
  }

  // ---------- e1RM (Epley mit Reps in Reserve) ----------
  function e1rm(w, reps, rpe) {
    if (!w || !reps) return 0;
    const rir = rpe ? Math.max(0, 10 - rpe) : 0;
    return w * (1 + (reps + rir) / 30);
  }

  // ---------- Rotation ----------
  // Hauptübungen eines Tages rotieren pro Durchgang zyklisch, Rest bleibt in fester Reihenfolge.
  function orderFor(day, plan, pass) {
    const H = day.ex.filter(id => plan.exercises[id] && plan.exercises[id].type === 'H');
    const rest = day.ex.filter(id => plan.exercises[id] && plan.exercises[id].type !== 'H');
    const k = H.length ? pass % H.length : 0;
    return H.slice(k).concat(H.slice(0, k)).concat(rest);
  }

  // ---------- Aufwärmen ----------
  function warmups(ex, dayKind, isFirstMachine) {
    const w = ex.weight;
    if (!w) return [];
    let scheme;
    if (ex.type === 'H') {
      scheme = dayKind === 'power' ? [[0.4, 8], [0.6, 5], [0.75, 3], [0.85, 1]] : [[0.5, 8], [0.75, 4]];
    } else if (isFirstMachine) {
      scheme = [[0.6, 8]];
    } else return [];
    const out = [];
    scheme.forEach(([p, r]) => {
      let ww = roundNear(ex, w * p);
      if (ex.kind === 'lh') ww = Math.max(20, ww);
      if (ww >= w) return;
      if (out.length && out[out.length - 1].w === ww) return;
      out.push({ w: ww, r });
    });
    return out;
  }

  // ---------- Progression ----------
  // Bewertet die Arbeitssätze einer Übung nach der Einheit.
  // pos: 0-basierte Position im Training (Hauptübung an Pos >= 1 bekommt 1 Wdh Toleranz)
  function evaluate(ex, sets, pos) {
    const work = sets.filter(s => !s.warmup && s.done && s.r > 0);
    const res = { result: 'none', steps: 0, newWeight: ex.weight, misses: ex.misses || 0, note: '' };
    if (!work.length) { res.note = 'Keine Arbeitssätze'; return res; }
    const used = work[0].w; // Gewicht der Arbeitssätze (falls in der Einheit geändert: erstes)
    const tol = ex.type === 'H' && pos >= 1 ? 1 : 0;
    const loEff = ex.lo - tol;
    const allTop = work.every(s => s.r >= ex.hi);
    const failLastOk = ex.type === 'I' || ex.failLast;
    // RPE für Steigerung: bei Isolation den letzten Satz (Versagen erlaubt) ignorieren
    const rpeSets = failLastOk && work.length > 1 ? work.slice(0, -1) : work;
    const withRpe = rpeSets.filter(s => s.rpe);
    const avgRpe = withRpe.length ? withRpe.reduce((a, s) => a + s.rpe, 0) / withRpe.length : ex.rpe;
    const below = work.some(s => s.r < loEff);
    const rpeTooHigh = ex.type !== 'I' && rpeSets.some(s => s.rpe && s.rpe >= ex.rpe + 1.5 + tol * 0.5);
    const base = used || ex.weight || 0;

    if (allTop && avgRpe <= ex.rpe - 2) {
      res.result = 'up2'; res.steps = 2; res.newWeight = addSteps(ex, base, 2); res.misses = 0;
      res.note = 'Sehr leicht: +2 Schritte';
    } else if (allTop && avgRpe <= ex.rpe + 0.25) {
      res.result = 'up'; res.steps = 1; res.newWeight = addSteps(ex, base, 1); res.misses = 0;
      res.note = 'Oberes Ende erreicht: +1 Schritt';
    } else if (below || rpeTooHigh) {
      const m = (ex.misses || 0) + 1;
      if (m >= 2) {
        let nw;
        if (ex.type === 'H' && ex.kind === 'lh') {
          nw = roundDown(ex, base * 0.95);
          if (nw >= base) nw = addSteps(ex, base, -1);
        } else nw = addSteps(ex, base, -1);
        res.result = 'down'; res.newWeight = nw; res.misses = 0; res.steps = -1;
        res.note = '2. Fehlversuch in Folge: Gewicht runter';
      } else {
        res.result = 'miss'; res.newWeight = base; res.misses = m;
        res.note = 'Fehlversuch (1 von 2): Gewicht bleibt';
      }
    } else {
      res.result = allTop ? 'hold-rpe' : 'hold'; res.newWeight = base; res.misses = 0;
      res.note = allTop ? 'Oben angekommen, aber RPE zu hoch: Gewicht bleibt' : 'Im Bereich: Gewicht bleibt, +1 Wdh anpeilen';
    }
    return res;
  }

  // Wendet ein Ergebnis an (inkl. Stagnationserkennung)
  function apply(ex, res, dateISO) {
    ex.weight = res.newWeight;
    ex.misses = res.misses;
    if (res.result === 'down') {
      ex.reductions = (ex.reductions || []).concat(dateISO);
    }
    const cutoff = new Date(dateISO).getTime() - 42 * 864e5;
    const recent = (ex.reductions || []).filter(d => new Date(d).getTime() >= cutoff);
    ex.stalled = recent.length >= 2;
  }

  // Ziel-Wdh pro Satz für die nächste Einheit
  function targetReps(ex, lastSets, lastWeight) {
    const n = ex.sets;
    const out = [];
    for (let i = 0; i < n; i++) {
      if (!lastSets || !lastSets.length || lastWeight !== ex.weight) out.push(ex.lo);
      else {
        const s = lastSets[Math.min(i, lastSets.length - 1)];
        out.push(Math.min(ex.hi, Math.max(ex.lo, (s ? s.r : ex.lo) + 1)));
      }
    }
    return out;
  }

  // Korrektur während der Einheit: erster Arbeitssatz klar daneben?
  function intraSuggest(ex, firstSet, pos) {
    if (!firstSet || !firstSet.done) return null;
    const tol = ex.type === 'H' && pos >= 1 ? 1 : 0;
    const bad = firstSet.r <= ex.lo - 2 - tol || (ex.type !== 'I' && firstSet.rpe >= 10);
    if (!bad) return null;
    return addSteps(ex, firstSet.w, -1);
  }

  // ---------- Hevy-CSV ----------
  function parseCSV(text) {
    const rows = []; let row = []; let f = ''; let q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; }
        else f += c;
      } else if (c === '"') q = true;
      else if (c === ',') { row.push(f); f = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(f); rows.push(row); row = []; f = '';
      } else f += c;
    }
    if (f.length || row.length) { row.push(f); rows.push(row); }
    return rows.filter(r => r.length > 1);
  }
  const MONTHS = { 'jan': 1, 'feb': 2, 'mär': 3, 'märz': 3, 'mar': 3, 'apr': 4, 'mai': 5, 'may': 5, 'jun': 6, 'juni': 6, 'jul': 7, 'juli': 7, 'aug': 8, 'sep': 9, 'sept': 9, 'okt': 10, 'oct': 10, 'nov': 11, 'dez': 12, 'dec': 12 };
  function parseHevyDate(s) {
    // "26 Okt. 2026, 19:20" oder "26 Oct 2026, 19:20"
    const m = /(\d{1,2})\s+([A-Za-zÄÖÜäöü]+)\.?\s+(\d{4}),?\s+(\d{1,2}):(\d{2})/.exec(s || '');
    if (m) {
      const mon = MONTHS[m[2].toLowerCase()];
      if (mon) return new Date(+m[3], mon - 1, +m[1], +m[4], +m[5]).toISOString();
    }
    const d = new Date(s);
    return isNaN(d) ? null : d.toISOString();
  }
  function hevyToSessions(text, plan) {
    const rows = parseCSV(text);
    const head = rows.shift().map(h => h.trim());
    const ix = n => head.indexOf(n);
    const I = { title: ix('title'), start: ix('start_time'), ex: ix('exercise_title'), type: ix('set_type'), w: ix('weight_kg'), r: ix('reps'), rpe: ix('rpe') };
    if (I.start < 0 || I.ex < 0) throw new Error('Unbekanntes CSV-Format');
    const nameMap = {};
    Object.values(plan.exercises).forEach(e => (e.hevy || []).forEach(h => { if (!nameMap[h]) nameMap[h] = e.name; }));
    const sessions = {};
    rows.forEach(r => {
      const key = r[I.start] + '|' + r[I.title];
      const date = parseHevyDate(r[I.start]);
      if (!date) return;
      if (!sessions[key]) sessions[key] = { id: 'hevy-' + date + '-' + (r[I.title] || ''), source: 'hevy', title: r[I.title], date, entries: [] };
      const s = sessions[key];
      const name = nameMap[r[I.ex]] || r[I.ex];
      let e = s.entries.find(x => x.name === name);
      if (!e) { e = { name, hevyName: r[I.ex], sets: [] }; s.entries.push(e); }
      const w = parseFloat(r[I.w]); const reps = parseInt(r[I.r], 10); const rpe = parseFloat(r[I.rpe]);
      e.sets.push({ w: isNaN(w) ? 0 : w, r: isNaN(reps) ? 0 : reps, rpe: isNaN(rpe) ? null : rpe, warmup: r[I.type] === 'warmup', done: true });
    });
    return Object.values(sessions).sort((a, b) => a.date.localeCompare(b.date));
  }

  // ---------- Statistik ----------
  function bestE1(sets) {
    let best = 0, top = null;
    sets.filter(s => !s.warmup && s.done !== false).forEach(s => {
      const v = e1rm(s.w, s.r, s.rpe);
      if (v > best) { best = v; top = s; }
    });
    return { e1: best, top };
  }

  const api = { defaultPlan, stepOf, roundDown, roundNear, addSteps, e1rm, orderFor, warmups, evaluate, apply, targetReps, intraSuggest, parseCSV, parseHevyDate, hevyToSessions, bestE1 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Logic = api;
})(this);
