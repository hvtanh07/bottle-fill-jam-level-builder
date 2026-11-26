// Builds src/data/levels.json: level 1 is the FTUE from the GDD, the rest come from the generator (each one solvable with 1 tray slot).
import fs from 'node:fs';
import {generate, solve, estimate, pilePositions, buildSets} from '../src/engine.js';
import {shapeBottles} from '../src/shapes.js';
import {rng, shuffleArr} from '../src/format.js';
import {normalize, serializeFile} from '../src/format.js';

const fit = (shape, need) => { let c = 1, r = 1; while (pilePositions(shape, c, r, 999).length < need) { if (c <= r) c++; else r++; } return {cols: c, rows: r}; };
const PLAN = [
  {colors: 2, perColor: 3, tubes: 1, shape: 'pyramid'},
  {colors: 3, perColor: 3, tubes: 2, shape: 'pyramid'},
  {colors: 3, perColor: 4, tubes: 2, shape: 'pyramid'},
  {colors: 4, perColor: 3, tubes: 2, shape: 'pyramid', hidden: 2},
  {colors: 4, perColor: 4, tubes: 2, shape: 'stack', cols: 4, rows: 2},
  {colors: 4, perColor: 4, tubes: 3, shape: 'pyramid', hidden: 3},
  {colors: 4, perColor: 4, tubes: 3, shape: 'pyramid', locked: 1, lockCount: 3},
  {colors: 5, perColor: 4, tubes: 3, shape: 'pyramid', hidden: 3, locked: 1, lockCount: 4},
  {colors: 4, perColor: 4, tubes: 3, shape: 'pyramid', pair: true, pairCount: 3},
  {colors: 5, perColor: 4, tubes: 3, shape: 'stack', cols: 5, rows: 2, difficulty: 1, maxRate: .7},
  {colors: 5, perColor: 5, tubes: 3, shape: 'pyramid', hidden: 4, locked: 2, lockCount: 4},
  {colors: 6, perColor: 4, tubes: 4, shape: 'pyramid', pair: true, pairCount: 4, hidden: 3},
  {colors: 6, perColor: 5, tubes: 4, shape: 'pyramid', locked: 2, lockCount: 5, difficulty: 1, maxRate: .6},
  {colors: 7, perColor: 4, tubes: 4, shape: 'stack', cols: 5, rows: 3, hidden: 4, pair: true, pairCount: 4},
  {colors: 7, perColor: 5, tubes: 4, shape: 'pyramid', hidden: 5, locked: 2, lockCount: 5, pair: true, pairCount: 5, difficulty: 2, maxRate: .5}
];
const levels = [normalize({
  id: 'level_001', difficulty: 0, traySlots: 1,
  tubes: [{sets: [1, 1, 2, 2], hidden: []}], blockedPairs: [],
  bottles: [{x: 2, y: 2, z: 0, color: 1}, {x: 3, y: 2, z: 0, color: 2}, {x: 2, y: 3, z: 0, color: 1}, {x: 3, y: 3, z: 0, color: 2}]
})];
PLAN.forEach((p, k) => {
  const id = 'level_' + String(k + 2).padStart(3, '0');
  const size = p.cols ? {} : fit(p.shape, p.colors * p.perColor);
  let r = null;
  for (let seed = 101 + k * 17; seed < 101 + k * 17 + 40 && !(r && !r.error && !r.offTarget); seed++) r = generate({traySlots: 1, tries: 40, ...size, ...p, seed, id, minRate: p.minRate ?? 0, maxRate: p.maxRate ?? 1});
  if (r.error) throw new Error(id + ': ' + r.error);
  // move the pile so it starts at column 0 and sits in the middle of the 7-wide board
  const lv = r.level, xs = lv.bottles.map(b => b.x), w = Math.max(...xs) - Math.min(...xs);
  const dx = Math.round((6 - w) / 2 * 2) / 2 - Math.min(...xs), ys = lv.bottles.map(b => b.y), dy = -Math.min(...ys);
  lv.bottles.forEach(b => { b.x += dx; b.y += dy; });
  levels.push(lv);
});
// Free-form piles: built with the Shape / Stack tools' code, then "Build solvable sets".
const FREE = [
  {name: 'spiral', colors: 5, tubes: 3, mix: .35, parts: [['spiral', {x: 3.5, y: 4.5}, {x: 6.6, y: 4.5}, {n: 30, orient: 'across', order: 'start', turns: 1.6}]]},
  {name: 'wall', colors: 6, tubes: 4, mix: .3, parts: [0, 1, 2, 3, 4, 5].map(k => ['stack', {x: 1 + k, y: 8}, {x: 1 + k, y: 7}, {n: 6, step: .45}])},
  {name: 'snakes', colors: 4, tubes: 3, mix: .3, parts: [['arc', {x: 1, y: 3}, {x: 2.5, y: 8.5}, {n: 12, orient: 'across', order: 'start', bend: 70}], ['arc', {x: 5.5, y: 3}, {x: 4.5, y: 8.5}, {n: 12, orient: 'across', order: 'start', bend: 70}]]},
  {name: 'arch and row', colors: 6, tubes: 4, mix: .3, parts: [...[0, 1, 2, 3, 4, 5, 6].map(k => { const t = Math.PI * (1 - k / 6), x = 3.5 + 3 * Math.cos(t), y = 4.6 - 2.6 * Math.sin(t); return ['stack', {x, y}, {x, y: y - 1}, {n: 3, step: .4}]; }), ['arc', {x: .5, y: 7.6}, {x: 6.5, y: 7.6}, {n: 7, orient: 'upright', order: 'flat', bend: 40}]]},
  {name: 'arch and tower', colors: 6, tubes: 4, mix: .3, parts: [['arc', {x: .6, y: 9}, {x: 6.4, y: 9}, {n: 22, orient: 'across', order: 'end', bend: 200}], ['stack', {x: 3.5, y: 8.4}, {x: 3.5, y: 7}, {n: 7, step: .55}]]}
];
FREE.forEach((f, k) => {
  const id = 'level_' + String(levels.length + 1).padStart(3, '0'), r = rng(900 + k);
  let bottles = [];
  f.parts.forEach(([kind, a, b, opt]) => { bottles.push(...shapeBottles(kind, a, b, opt, bottles).map(q => ({...q, color: 1, lock: 0}))); });
  const per = Math.ceil(bottles.length / f.colors), colors = shuffleArr(Array.from({length: bottles.length}, (_, i) => 1 + Math.floor(i / per)), r);
  bottles.forEach((q, i) => { q.color = colors[i]; });
  let lv = normalize({id, difficulty: 1, traySlots: 1, tubes: [], blockedPairs: [], bottles});
  const sets = buildSets(lv, {tubes: f.tubes, mix: f.mix, seed: 77 + k, tries: 40});
  if (sets.error) throw new Error(id + ' ' + f.name + ': ' + sets.error);
  lv = normalize({...lv, tubes: sets.tubes});
  levels.push(lv);
});
levels.forEach(lv => { const s = solve(lv, {limit: 100000}), e = estimate(lv, 200); console.log(lv.id, lv.tubes.length, lv.bottles.length, s.result, Math.round(e.rate * 100) + '%'); if (s.result !== 'win') throw new Error(lv.id + ' not solvable'); });
fs.writeFileSync(new URL('../src/data/levels.json', import.meta.url), serializeFile(levels));
