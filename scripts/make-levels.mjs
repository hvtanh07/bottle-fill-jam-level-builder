// Builds src/data/levels.json: level 1 is the FTUE from the GDD, the rest come from the generator (each one solvable with 1 tray slot).
import fs from 'node:fs';
import {generate, solve, estimate, pilePositions} from '../src/engine.js';
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
levels.forEach(lv => { const s = solve(lv, {limit: 100000}), e = estimate(lv, 200); console.log(lv.id, lv.tubes.length, lv.bottles.length, s.result, Math.round(e.rate * 100) + '%'); if (s.result !== 'win') throw new Error(lv.id + ' not solvable'); });
fs.writeFileSync(new URL('../src/data/levels.json', import.meta.url), serializeFile(levels));
