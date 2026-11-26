// Designs the 40 levels of the first release: shaped layouts, the GDD element order, a sawtooth difficulty curve.
// Each level has one challenge picked first; the script then searches colors, jam order and element spots until
//   1. the solver wins it with the level's tray (1 slot in levels 1-10, 1-3 later) and no boosters, and
//   2. the bot's win rate lands in the band of the level's tier.
// Output: src/data/levels.json (the tool's built-in levels) and scripts/out/design-40.json (the design table).
import fs from 'node:fs';
import {solve, estimate, buildSets, fewestSlots, newGame, outcome, tappable, destination, botChoice, tap, settle} from '../src/engine.js';
import {normalize, serializeFile, check, rng, shuffleArr, coverMap} from '../src/format.js';
import {SPECS} from './specs-40.mjs';
import {pileIssues} from './piles.mjs';
export {SPECS};

// A casual player: plays like the greedy bot (careful, cannot see Hidden Jam) but makes a random tap 1 time in 4.
export function casual(lv, n = 200, seed = 1, slip = .25) {
  const r = rng(seed); let wins = 0;
  for (let g = 0; g < n; g++) {
    const s = newGame(lv, Math.floor(r() * 1e9)); let o = outcome(s), guard = 0;
    while (o === 'playing' && guard++ < 5000) {
      let i;
      if (r() < slip) { const tp = tappable(s).filter(i => destination(s, s.color[i])); i = tp[Math.floor(r() * tp.length)]; } else i = botChoice(s, r);
      if (i === undefined || i < 0) break;
      tap(s, i); settle(s); o = outcome(s);
    }
    if (o === 'won') wins++;
  }
  return wins / n;
}
// Win-rate bands of the casual player for each tier.
export const TIERS = {
  intro: {g: [.8, 1], label: 'Intro', diff: 0},
  easy: {g: [.65, 1], label: 'Easy', diff: 0},
  normal: {g: [.5, .75], label: 'Normal', diff: 0},
  rise: {g: [.35, .55], label: 'Normal+', diff: 0},
  hard: {g: [.15, .4], label: 'Hard', diff: 1},
  super: {g: [.03, .18], label: 'Super hard', diff: 2}
};

const ID = n => 'level_' + String(n).padStart(3, '0');

// Colors in runs along the build order (so the shape shows color bands), balanced counts, then a few random swaps.
function paint(n, colors, run, r, noise) {
  const pal = shuffleArr(Array.from({length: colors}, (_, k) => k + 1), r);
  const out = Array.from({length: n}, (_, i) => pal[Math.floor(i / run) % colors]);
  const sw = Math.round(n * noise);
  for (let k = 0; k < sw; k++) { const i = Math.floor(r() * n), j = Math.floor(r() * n); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}
function addHidden(tubes, k, r) {
  const slots = tubes.flatMap((t, ti) => t.sets.map((_, j) => ({ti, j}))).filter(x => x.j > 0);
  shuffleArr(slots, r).slice(0, k).forEach(x => tubes[x.ti].hidden.push(x.j));
  tubes.forEach(t => t.hidden.sort((a, b) => a - b));
}

export function design(sp, {tries = sp.tries || 60, games = 120} = {}) {
  const band = sp.band || TIERS[sp.tier].g, mid = (band[0] + band[1]) / 2;
  const base = sp.B().map(b => ({...b}));
  const iss = pileIssues(base); if (iss.length) throw new Error(ID(sp.n) + ': ' + iss.join('; '));
  // center the shape on the board (x 0..7, y 0..9)
  const xs = base.map(b => b.x), ys = base.map(b => b.y);
  const dx = Math.round((3.5 - (Math.min(...xs) + Math.max(...xs)) / 2) * 100) / 100, dy = Math.round((4.5 - (Math.min(...ys) + Math.max(...ys)) / 2) * 100) / 100;
  base.forEach(b => { b.x = Math.round((b.x + dx) * 100) / 100; b.y = Math.round((b.y + dy) * 100) / 100; });
  let best = null; const fails = {};
  for (let tr = 0; tr < tries; tr++) {
    const r = rng(sp.n * 1000 + tr * 7 + 1);
    // later tries nudge the mixing toward the band
    const mix = Math.max(0, Math.min(.95, sp.mix + (best ? (best.g > band[1] ? .05 : best.g < band[0] ? -.05 : 0) * Math.min(tr, 6) : 0)));
    const colors = sp.n === 1 ? [1, 2, 1, 2] : paint(base.length, sp.colors, sp.run || 1, r, sp.run ? .15 : .5);
    const bottles = base.map((b, i) => ({x: b.x, y: b.y, z: b.z, rot: b.rot, color: colors[i], lock: 0}));
    if (sp.locks) { const at = base.map((b, i) => b.mark ? i : -1).filter(i => i >= 0); at.forEach((i, k) => { bottles[i].lock = sp.locks[k]; }); }
    let lv = normalize({id: ID(sp.n), difficulty: TIERS[sp.tier].diff, traySlots: sp.tray || 1, tubes: [], blockedPairs: sp.pair ? [{tube: 0, count: sp.pair, open: 0}] : [], bottles});
    if (sp.n === 1) lv.tubes = [{sets: [1, 1, 2, 2], hidden: []}]; // the GDD FTUE
    else {
      const res = buildSets(lv, {tubes: sp.tubes, mix, seed: sp.n * 31 + tr, tries: 30});
      if (res.error) { fails.sets = (fails.sets || 0) + 1; continue; }
      lv.tubes = res.tubes; lv.blockedPairs = res.blockedPairs;
    }
    if (sp.hidden) addHidden(lv.tubes, sp.hidden, r);
    lv = normalize(lv);
    if (check(lv).some(i => i.level === 'bad')) { fails.check = (fails.check || 0) + 1; continue; }
    const sol = solve(lv, {limit: 150000});
    if (sol.result !== 'win') { fails[sol.result] = (fails[sol.result] || 0) + 1; continue; }
    // levels that teach the tray must not be winnable without it
    if (sp.needTray && solve({...lv, traySlots: 0}, {limit: 60000}).result !== 'none') { fails.noTray = (fails.noTray || 0) + 1; continue; }
    const g = casual(lv, games, 11 + tr);
    const cand = {lv, g, mix, tries: tr + 1, moves: sol.moves.length};
    const inBand = g >= band[0] && g <= band[1];
    if (!best || (inBand && !best.inBand) || (inBand === best.inBand && Math.abs(g - mid) < Math.abs(best.g - mid))) best = {...cand, inBand};
    if (inBand && tr >= 2) break;
  }
  if (!best) throw new Error(ID(sp.n) + ': no solvable version ' + JSON.stringify(fails));
  const lv = best.lv;
  const rnd = estimate(lv, 300, 'random', 5).rate, greedy = estimate(lv, 300, 'greedy', 7).rate, g2 = casual(lv, 400, 7);
  const slots = sp.n <= 2 ? {slots: 1} : fewestSlots(lv, 60000);
  const noTray = solve({...lv, traySlots: 0}, {limit: 60000}).result;
  return {spec: sp, level: lv, metrics: {casual: g2, greedy, random: rnd, band, inBand: g2 >= band[0] - .05 && g2 <= band[1] + .05, mix: best.mix, tries: best.tries, moves: best.moves, bottles: lv.bottles.length, layers: Math.max(...lv.bottles.map(b => b.z)) + 1, free: coverMap(lv.bottles).filter(c => !c.length).length, slots: slots.slots, noTray}};
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const only = process.argv[2] ? process.argv[2].split(',').map(Number) : null;
  const outPath = new URL('./out/design-40.json', import.meta.url);
  fs.mkdirSync(new URL('./out/', import.meta.url), {recursive: true});
  const prev = fs.existsSync(outPath) ? JSON.parse(fs.readFileSync(outPath, 'utf8')) : [];
  const rows = SPECS.map(sp => prev.find(p => p && p.spec.n === sp.n));
  SPECS.forEach((sp, k) => {
    if (only && !only.includes(sp.n)) return;
    const t0 = Date.now(); let d;
    try { d = design(sp); } catch (e) { console.log(String(e.message)); return; }
    rows[k] = d;
    fs.writeFileSync(outPath, JSON.stringify(rows, null, 1));
    const m = d.metrics;
    console.log(`${sp.n}\t${sp.tier}\t${sp.shape}\tt${d.level.traySlots} b${m.bottles} z${m.layers} free${m.free}\tcasual ${Math.round(m.casual * 100)}% greedy ${Math.round(m.greedy * 100)}% random ${Math.round(m.random * 100)}%\t${m.inBand ? 'ok' : 'OFF'}\tmix ${m.mix.toFixed(2)} tries ${m.tries} noTray ${m.noTray} min ${m.slots}\t${((Date.now() - t0) / 1000).toFixed(1)}s`);
  });
  if (rows.every(Boolean)) fs.writeFileSync(new URL('../src/data/levels.json', import.meta.url), serializeFile(rows.map(r => normalize(r.level))));
}
