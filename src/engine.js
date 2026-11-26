// Game rules of Bottle Fill Jam (GDD sections 1.1, 1.2, 1.4, 1.5), boosters, a greedy bot, a solver and a level generator.
import {coverMap, MAX_TRAY, rng, shuffleArr, normalize, overlaps} from './format.js';

export const ST = {BOARD: 0, TRAY: 1, SPOT: 2, DONE: 3, REMOVED: 4};

/* ---------- state ---------- */
export function newGame(lv, seed = 1) {
  const n = lv.bottles.length;
  const s = {
    lv, cover: coverMap(lv.bottles), color: lv.bottles.map(b => b.color),
    st: new Int8Array(n), lock: Int16Array.from(lv.bottles.map(b => b.lock)), act: new Uint8Array(n),
    tubes: lv.tubes.map(t => t.sets.map((c, k) => ({c, h: t.hidden.includes(k)}))),
    pairs: lv.blockedPairs.map(p => ({t: p.tube, n: p.count, cnt: p.count, open: p.open, pend: false, stop: false})),
    tray: new Array(lv.traySlots).fill(-1), spots: lv.tubes.map(() => -1),
    sent: 0, used: {extra: 0, shuffle: 0, remove: 0, revive: 0}, seed: seed >>> 0 || 1, log: []
  };
  s.pairs.forEach(p => updatePair(s, p));
  reveal(s);
  for (let i = 0; i < n; i++) if (s.lock[i] > 0 && isFree(s, i)) s.act[i] = 1;
  return s;
}
export function clone(s) {
  return {...s, st: s.st.slice(), lock: s.lock.slice(), act: s.act.slice(), tubes: s.tubes.map(t => t.slice()), pairs: s.pairs.map(p => ({...p})),
    tray: s.tray.slice(), spots: s.spots.slice(), used: {...s.used}, log: s.log.slice()};
}
const nextRand = s => { const r = rng(s.seed); const v = r(); s.seed = (Math.floor(v * 4294967296) ^ 0x9E3779B9) >>> 0 || 7; return rng(s.seed); };

/* ---------- queries ---------- */
export const isFree = (s, i) => s.st[i] === ST.BOARD && s.cover[i].every(j => s.st[j] !== ST.BOARD);
export const isTappable = (s, i) => isFree(s, i) && s.lock[i] <= 0;
export function tubeOpen(s, t) {
  const p = s.pairs.find(p => p.t === t || p.t + 1 === t);
  if (!p) return true;
  if (p.stop) return s.tubes[t].length > 0;
  return (p.open === 0 ? p.t : p.t + 1) === t;
}
export const bottomColor = (s, t) => s.tubes[t].length ? s.tubes[t][0].c : 0;
export const busy = s => s.spots.some(b => b >= 0);
export const trayFree = s => s.tray.indexOf(-1);
// Where a bottle of color c would go now: {spot: t} or {tray: k} or null.
export function destination(s, c) {
  for (let t = 0; t < s.tubes.length; t++) if (tubeOpen(s, t) && s.spots[t] < 0 && bottomColor(s, t) === c) return {spot: t};
  const k = trayFree(s); return k >= 0 ? {tray: k} : null;
}
export const tappable = s => { const out = []; for (let i = 0; i < s.st.length; i++) if (isTappable(s, i)) out.push(i); return out; };

/* ---------- rules ---------- */
function reveal(s) { const ev = []; s.tubes.forEach((t, k) => { if (t.length && t[0].h) { t[0] = {c: t[0].c, h: false}; ev.push({reveal: k}); } }); return ev; }
function updatePair(s, p) {
  const a = s.tubes[p.t] ? s.tubes[p.t].length : 0, b = s.tubes[p.t + 1] ? s.tubes[p.t + 1].length : 0;
  if (!p.stop && (!a || !b)) { p.stop = true; p.pend = false; p.open = a ? 0 : 1; }
}
function swapPair(s, p) { p.open = 1 - p.open; p.cnt = p.n; p.pend = false; }
// Tray bottles go up on their own when their color reaches the bottom of an open tube with a free spot. Leftmost first.
function autoAdvance(s) {
  const moved = []; let again = true;
  while (again) {
    again = false;
    for (let k = 0; k < s.tray.length; k++) {
      const b = s.tray[k]; if (b < 0) continue;
      for (let t = 0; t < s.tubes.length; t++) if (tubeOpen(s, t) && s.spots[t] < 0 && bottomColor(s, t) === s.color[b]) {
        s.tray[k] = -1; s.spots[t] = b; s.st[b] = ST.SPOT; moved.push({bottle: b, from: k, spot: t}); again = true; break;
      }
    }
  }
  return moved;
}
function activateFreed(s) { for (let i = 0; i < s.st.length; i++) if (!s.act[i] && s.lock[i] > 0 && isFree(s, i)) s.act[i] = 1; }

// The player taps bottle i. Returns {ok, to: 'spot'|'tray', t|k, events} or {ok: false, why}.
export function tap(s, i) {
  if (s.st[i] !== ST.BOARD) return {ok: false, why: 'gone'};
  if (!isFree(s, i)) return {ok: false, why: 'covered'};
  if (s.lock[i] > 0) return {ok: false, why: 'locked'};
  const d = destination(s, s.color[i]);
  if (!d) return {ok: false, why: 'tray'};
  // Counters count every bottle sent from the board. A Locked Bottle counts only once it is free.
  for (let j = 0; j < s.st.length; j++) if (j !== i && s.act[j] && s.lock[j] > 0 && s.st[j] === ST.BOARD) s.lock[j]--;
  if (d.spot !== undefined) { s.spots[d.spot] = i; s.st[i] = ST.SPOT; } else { s.tray[d.tray] = i; s.st[i] = ST.TRAY; }
  s.sent++; s.log.push(i);
  const events = [];
  s.pairs.forEach((p, k) => {
    if (p.stop) return;
    p.cnt--;
    if (p.cnt <= 0) {
      const openT = p.open === 0 ? p.t : p.t + 1;
      if (s.spots[openT] >= 0) { p.pend = true; p.cnt = 0; } else { swapPair(s, p); events.push({swap: k}); }
    }
  });
  activateFreed(s);
  const moved = autoAdvance(s);
  return {ok: true, to: d.spot !== undefined ? 'spot' : 'tray', t: d.spot, k: d.tray, events, moved};
}
// The bottle in tube t's fill spot is full: it leaves, the column drops one set.
export function completeFill(s, t) {
  const b = s.spots[t]; if (b < 0) return null;
  s.st[b] = ST.DONE; s.spots[t] = -1; s.tubes[t].shift();
  const events = reveal(s);
  s.pairs.forEach((p, k) => {
    if (p.t !== t && p.t + 1 !== t) return;
    updatePair(s, p);
    if (p.pend && !p.stop) { swapPair(s, p); events.push({swap: k}); }
  });
  const moved = autoAdvance(s);
  return {bottle: b, events, moved};
}
export function settle(s) { let guard = 0; while (busy(s) && guard++ < 10000) for (let t = 0; t < s.spots.length; t++) if (s.spots[t] >= 0) completeFill(s, t); return s; }

// 'busy' | 'playing' | 'won' | 'lost' (tray full) | 'stuck' (fail-safe case: nothing can move)
export function outcome(s) {
  if (busy(s)) return 'busy';
  const left = s.st.some(v => v === ST.BOARD || v === ST.TRAY);
  const jam = s.tubes.some(t => t.length);
  if (!left && !jam) return 'won';
  if (!left) return 'stuck';
  const tp = tappable(s);
  if (tp.some(i => destination(s, s.color[i]))) return 'playing';
  return trayFree(s) < 0 ? 'lost' : 'stuck';
}

/* ---------- boosters ---------- */
export function extraTray(s) { if (s.tray.length >= MAX_TRAY) return false; s.tray.push(-1); s.used.extra++; return true; }

// Shuffle: mixes the order of all jam sets (each tube keeps its number of sets). Each open tube gets a bottom set
// with the color of a bottle the player can send now, as many as possible, at least 1.
export function shuffle(s) {
  const r = nextRand(s);
  const pool = shuffleArr(s.tubes.flat(), r), sizes = s.tubes.map(t => t.length);
  const want = new Set(); tappable(s).forEach(i => want.add(s.color[i])); s.tray.forEach(b => b >= 0 && want.add(s.color[b]));
  const open = s.tubes.map((_, t) => t).filter(t => sizes[t] && tubeOpen(s, t));
  const out = s.tubes.map(() => []);
  open.forEach(t => {
    let k = pool.findIndex(x => want.has(x.c));
    if (k >= 0) { want.delete(pool[k].c); out[t].push(pool.splice(k, 1)[0]); }
  });
  s.tubes.forEach((_, t) => { while (out[t].length < sizes[t]) out[t].push(pool.pop()); });
  s.tubes = out; s.used.shuffle++;
  const ev = reveal(s); const moved = autoAdvance(s);
  return {events: ev, moved};
}
// Remove a set of color c: the one farthest from a nozzle.
function dropSet(s, c) {
  let best = null;
  s.tubes.forEach((tb, t) => tb.forEach((x, k) => { if (x.c === c && (!best || k > best.k)) best = {t, k}; }));
  if (best) { s.tubes[best.t].splice(best.k, 1); s.pairs.forEach(p => updatePair(s, p)); }
  return best;
}
// Remove: 3 bottles from the board, top of the pile first, then lower layers, Locked Bottles last; random inside a group.
export function removeBooster(s, n = 3) {
  const r = nextRand(s), on = []; for (let i = 0; i < s.st.length; i++) if (s.st[i] === ST.BOARD) on.push(i);
  const g1 = shuffleArr(on.filter(i => s.lock[i] <= 0 && isFree(s, i)), r);
  const g2 = shuffleArr(on.filter(i => s.lock[i] <= 0 && !isFree(s, i)), r);
  const g3 = shuffleArr(on.filter(i => s.lock[i] > 0), r);
  const picked = [...g1, ...g2, ...g3].slice(0, n);
  picked.forEach(i => { s.st[i] = ST.REMOVED; s.lock[i] = 0; dropSet(s, s.color[i]); });
  s.used.remove++;
  activateFreed(s);
  const ev = reveal(s); const moved = autoAdvance(s);
  return {picked, events: ev, moved};
}
// Revive: a free Remove that takes 3 bottles from the waiting tray, with their sets.
export function revive(s) {
  const picked = [];
  for (let k = 0; k < s.tray.length && picked.length < 3; k++) if (s.tray[k] >= 0) { const b = s.tray[k]; picked.push(b); s.tray[k] = -1; s.st[b] = ST.REMOVED; dropSet(s, s.color[b]); }
  s.used.revive++;
  const ev = reveal(s); const moved = autoAdvance(s);
  return {picked, events: ev, moved};
}

/* ---------- bot ---------- */
// Depth of the nearest set of color c in an open tube (0 = at the bottom), Infinity if none.
function depthOf(s, c) {
  let d = Infinity;
  s.tubes.forEach((tb, t) => { const k = tb.findIndex(x => x.c === c); if (k >= 0) d = Math.min(d, k + (tubeOpen(s, t) ? 0 : 2)); });
  return d;
}
function frees(s, i) { let n = 0; for (let j = 0; j < s.st.length; j++) if (s.st[j] === ST.BOARD && s.cover[j].includes(i) && s.cover[j].every(o => o === i || s.st[o] !== ST.BOARD)) n++; return n; }
// Greedy choice: a bottle that fills now; else the one whose jam is nearest the bottom and that frees most bottles.
export function botChoice(s, r = Math.random) {
  const tp = tappable(s); if (!tp.length) return -1;
  const fill = tp.filter(i => { const d = destination(s, s.color[i]); return d && d.spot !== undefined; });
  if (fill.length) return fill.sort((a, b) => frees(s, b) - frees(s, a) || r() - .5)[0];
  if (trayFree(s) < 0) return -1;
  return tp.map(i => ({i, k: depthOf(s, s.color[i]) * 10 - frees(s, i) + r()})).sort((a, b) => a.k - b.k)[0].i;
}
// Plays n games without boosters. mode 'greedy' or 'random'. Returns win rate and average result.
export function estimate(lv, n = 200, mode = 'greedy', seed = 1) {
  const r = rng(seed); let wins = 0, stuck = 0, lost = 0, sent = 0;
  for (let g = 0; g < n; g++) {
    const s = newGame(lv, Math.floor(r() * 1e9)); let o = outcome(s), guard = 0;
    while (o === 'playing' && guard++ < 5000) {
      let i;
      if (mode === 'random') { const tp = tappable(s).filter(i => destination(s, s.color[i])); i = tp[Math.floor(r() * tp.length)]; }
      else i = botChoice(s, r);
      if (i === undefined || i < 0) break;
      tap(s, i); settle(s); o = outcome(s);
    }
    if (o === 'won') wins++; else if (o === 'lost') lost++; else stuck++;
    sent += s.sent;
  }
  return {n, wins, lost, stuck, rate: wins / n, avgSent: sent / n};
}

/* ---------- solver ---------- */
// Depth-first search over taps, no boosters, fills finish before the next tap (a patient player).
// The solver knows Hidden Jam colors. Returns {result: 'win'|'none'|'limit', moves, nodes}.
const keyOf = s => {
  const tr = []; s.tray.forEach(b => b >= 0 && tr.push(s.color[b])); tr.sort();
  let k = String.fromCharCode(...s.st.map(v => 48 + v)) + '|' + s.tubes.map(t => t.length).join(',') + '|' + tr.join('') + '|' + s.tray.length;
  for (let i = 0; i < s.lock.length; i++) if (s.lock[i] > 0) k += ',' + i + ':' + s.lock[i] + (s.act[i] ? 'a' : '');
  s.pairs.forEach(p => { k += `;${p.open}${p.cnt}${p.stop ? 's' : ''}`; });
  return k;
};
export function solve(lv, {limit = 60000, traySlots} = {}) {
  const start = newGame(traySlots ? {...lv, traySlots} : lv);
  const seen = new Set(); let nodes = 0;
  const coversAny = start.cover.reduce((acc, list) => { list.forEach(j => { acc[j] = true; }); return acc; }, []);
  const path = [];
  const dfs = s => {
    const o = outcome(s);
    if (o === 'won') return true;
    if (o !== 'playing') return false;
    if (++nodes > limit) throw 'limit';
    const k = keyOf(s); if (seen.has(k)) return false; seen.add(k);
    const tp = tappable(s).filter(i => destination(s, s.color[i]));
    // fills first, then by jam depth; same color + same freeing effect is tried once
    const tried = new Set();
    const order = tp.map(i => { const d = destination(s, s.color[i]); return {i, f: d.spot !== undefined ? 0 : 1, d: depthOf(s, s.color[i]), fr: frees(s, i)}; })
      .sort((a, b) => a.f - b.f || a.d - b.d || b.fr - a.fr);
    for (const m of order) {
      const sig = s.color[m.i] + ':' + (coversAny[m.i] ? m.i : 'x');
      if (tried.has(sig)) continue; tried.add(sig);
      const c = clone(s); tap(c, m.i); settle(c); path.push(m.i);
      if (dfs(c)) return true;
      path.pop();
    }
    return false;
  };
  try { return {result: dfs(start) ? 'win' : 'none', moves: path.slice(), nodes}; }
  catch (e) { if (e === 'limit') return {result: 'limit', moves: [], nodes}; throw e; }
}
export function fewestSlots(lv, limit = 40000) {
  for (let k = 1; k <= MAX_TRAY; k++) { const r = solve(lv, {limit, traySlots: k}); if (r.result === 'win') return {slots: k, unknown: false}; if (r.result === 'limit') return {slots: k, unknown: true}; }
  return {slots: 0, unknown: false};
}

/* ---------- generator ---------- */
// Pile shapes: 'pyramid' (each layer one smaller, offset half a bottle), 'stack' (layers right on top), 'rows' (one layer).
export function pilePositions(shape, cols, rows, count) {
  const out = [];
  for (let z = 0; out.length < count && z < 12; z++) {
    let cells = [];
    if (shape === 'rows') { if (z > 0) break; for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) cells.push({x, y, z}); }
    else if (shape === 'stack') { for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) cells.push({x, y, z}); }
    else { const c = cols - z, rr = rows - z; if (c < 1 || rr < 1) break; for (let y = 0; y < rr; y++) for (let x = 0; x < c; x++) cells.push({x: x + z * .5, y: y + z * .5, z}); }
    const need = count - out.length;
    if (cells.length > need) {
      // a partial layer: keep the cells nearest the center so it rests on the layer below
      const cx = cells.reduce((a, p) => a + p.x, 0) / cells.length, cy = cells.reduce((a, p) => a + p.y, 0) / cells.length;
      cells = cells.map(p => ({...p, d: Math.hypot(p.x - cx, (p.y - cy) * 1.01) })).sort((a, b) => a.d - b.d).slice(0, need).map(({x, y, z}) => ({x, y, z}));
    }
    out.push(...cells);
  }
  return out;
}
export function generate(opt) {
  const o = {colors: 3, perColor: 3, tubes: 2, shape: 'pyramid', cols: 4, rows: 3, traySlots: 1, hidden: 0, locked: 0, lockCount: 3, pair: false, pairCount: 3, seed: 1, tries: 60, minRate: 0, maxRate: 1, ...opt};
  const r = rng(o.seed);
  let best = null;
  for (let tr = 0; tr < o.tries; tr++) {
    const total = o.colors * o.perColor;
    const pos = pilePositions(o.shape, o.cols, o.rows, total);
    if (pos.length < total) return {error: `The pile shape holds only ${pos.length} bottles; ${total} are needed. Make it wider or taller.`};
    const colors = shuffleArr(Array.from({length: total}, (_, k) => 1 + (k % o.colors)), r);
    const bottles = pos.map((p, k) => ({x: p.x, y: p.y, z: p.z, color: colors[k], lock: 0}));
    // Locked Bottles go on the lower layers
    const lowFirst = bottles.map((b, k) => k).sort((a, b) => bottles[a].z - bottles[b].z || r() - .5);
    lowFirst.slice(0, o.locked).forEach(k => { bottles[k].lock = o.lockCount; });
    const sets = shuffleArr(Array.from({length: total}, (_, k) => 1 + (k % o.colors)), r);
    const tubes = Array.from({length: o.tubes}, () => ({sets: [], hidden: []}));
    sets.forEach((c, k) => tubes[k % o.tubes].sets.push(c));
    const slots = tubes.flatMap((t, ti) => t.sets.map((_, k) => ({ti, k}))).filter(x => x.k > 0);
    shuffleArr(slots, r).slice(0, o.hidden).forEach(x => tubes[x.ti].hidden.push(x.k));
    tubes.forEach(t => t.hidden.sort((a, b) => a - b));
    const blockedPairs = o.pair && o.tubes >= 2 ? [{tube: 0, count: o.pairCount, open: 0}] : [];
    const lv = normalize({id: o.id || 'generated', difficulty: o.difficulty || 0, traySlots: o.traySlots, tubes, blockedPairs, bottles});
    const sol = solve(lv, {limit: 30000});
    if (sol.result !== 'win') continue;
    const est = estimate(lv, 60, 'greedy', o.seed + tr);
    const cand = {level: lv, rate: est.rate, tries: tr + 1};
    if (est.rate >= o.minRate && est.rate <= o.maxRate) return cand;
    if (!best || Math.abs(est.rate - (o.minRate + o.maxRate) / 2) < Math.abs(best.rate - (o.minRate + o.maxRate) / 2)) best = cand;
  }
  return best ? {...best, offTarget: true} : {error: `No solvable level found in ${o.tries} tries. Add tray slots, tubes or fewer locks.`};
}
export {overlaps};

/* ---------- jam sets for a hand-made pile ---------- */
// Builds tube sets for the level's bottles so the level can be won: picks a random order the pile can be cleared in,
// deals it round-robin into the tubes (so every bottle could fill at once), then mixes the order by `mix` (0..1)
// and keeps the most mixed version the solver can still win with the level's tray slots.
export function buildSets(lv, {tubes, mix = 0.3, seed = 1, tries = 24} = {}) {
  const T = Math.max(1, tubes || lv.tubes.length || 1), n = lv.bottles.length, r = rng(seed);
  if (!n) return {error: 'Add bottles first.'};
  const cover = coverMap(lv.bottles);
  let best = null;
  for (let tr = 0; tr < tries; tr++) {
    // a clearing order: any free bottle; a Locked Bottle only after enough others went while it was free
    const gone = new Uint8Array(n), freeSince = new Int32Array(n).fill(-1), order = [];
    while (order.length < n) {
      const step = order.length;
      for (let i = 0; i < n; i++) if (!gone[i] && freeSince[i] < 0 && cover[i].every(j => gone[j])) freeSince[i] = step;
      const cand = [];
      for (let i = 0; i < n; i++) if (!gone[i] && freeSince[i] >= 0 && (lv.bottles[i].lock <= 0 || step - freeSince[i] >= lv.bottles[i].lock)) cand.push(i);
      if (!cand.length) break;
      const i = cand[Math.floor(r() * cand.length)]; gone[i] = 1; order.push(i);
    }
    if (order.length < n) return {error: 'The pile cannot be cleared: a Locked Bottle counter is too high.'};
    const sets = Array.from({length: T}, () => []);
    order.forEach((i, k) => sets[k % T].push(lv.bottles[i].color));
    const swaps = Math.round(mix * n * (0.6 + 0.8 * r()));
    for (let k = 0; k < swaps; k++) {
      const t = Math.floor(r() * T), u = r() < .5 ? t : Math.floor(r() * T), a = sets[t], b = sets[u];
      if (!a.length || !b.length) continue;
      const i = Math.floor(r() * a.length), j = Math.min(b.length - 1, Math.max(0, i + (t === u ? 1 : Math.floor(r() * 3) - 1)));
      [a[i], b[j]] = [b[j], a[i]];
    }
    const tubesOut = sets.map((s, t) => ({sets: s, hidden: (lv.tubes[t] ? lv.tubes[t].hidden : []).filter(h => h < s.length)}));
    const cand = normalize({...lv, tubes: tubesOut, blockedPairs: lv.blockedPairs.filter(p => p.tube + 1 < T)});
    const sol = solve(cand, {limit: 30000});
    if (sol.result === 'win') {
      const est = estimate(cand, 40, 'greedy', seed + tr);
      if (!best || swaps > best.swaps) best = {tubes: cand.tubes, blockedPairs: cand.blockedPairs, swaps, rate: est.rate};
      if (swaps >= mix * n) break;
    }
  }
  return best || {error: 'No solvable jam order found. Try less mixing, more tubes or more tray slots.'};
}
