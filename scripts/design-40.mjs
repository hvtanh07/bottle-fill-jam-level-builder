// Designs the 40 levels of the first release: shaped layouts, the GDD element order, a sawtooth difficulty curve.
// Each level has one challenge picked first; the script then searches colors, jam order and element spots until
//   1. the solver wins it with the 1-slot tray and no boosters, and
//   2. the bot's win rate lands in the band of the level's tier.
// Output: src/data/levels.json (the tool's built-in levels) and scripts/out/design-40.json (the design table).
import fs from 'node:fs';
import {solve, estimate, buildSets, fewestSlots, newGame, outcome, tappable, destination, botChoice, tap, settle} from '../src/engine.js';
import {normalize, serializeFile, check, rng, shuffleArr, coverMap} from '../src/format.js';
import {LAYOUTS} from './layouts.mjs';

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

// L: [layout, options]. colors, tubes, mix (how far each jam is from the order the pile clears in),
// hidden (sets), locks (counters), lockAt 'top' (a free bottle over others) or 'low', pair (swap count), run (color run length).
export const SPECS = [
  {n: 1, tier: 'intro', L: ['square4'], colors: 2, tubes: 1, mix: 0, unlock: 'Core (FTUE)', challenge: 'Học cách chơi: chạm chai cùng màu với jam ở đáy ống để rót. Không có cách thua.'},
  {n: 2, tier: 'easy', L: ['smile', {n: 6}], colors: 3, tubes: 2, mix: .1, challenge: 'Có 2 ống: nhìn đáy ống nào để chọn chai đúng. Thứ tự chạm bắt đầu có ý nghĩa.'},
  {n: 3, tier: 'easy', L: ['bridge', {n: 5}], colors: 3, tubes: 2, mix: .4, unlock: 'Booster Extra Tray', challenge: 'Khay chờ chỉ 1 ô: lần đầu khay bị đầy khi chạm chai sai màu. Dạy giữ khay trống và giới thiệu Extra Tray.'},
  {n: 4, tier: 'easy', L: ['skyline', {deeps: [1, 2, 3, 2, 1]}], colors: 3, tubes: 2, mix: .45, challenge: 'Lần đầu có chai bị che: 5 cột cao thấp, chai phía sau chỉ mở khi chai trước đi. Phải nhìn chai phía sau trước khi chạm.'},
  {n: 5, tier: 'intro', L: ['wall', {cols: 3, deep: 3}], colors: 3, tubes: 2, mix: .2, hidden: 2, unlock: 'Hidden Jam', challenge: 'Giới thiệu Hidden Jam: jam "?" chỉ hiện màu khi xuống đáy. Ít hidden, cột nông để người chơi thấy cơ chế lộ màu.'},
  {n: 6, tier: 'normal', L: ['snakes', {n: 10}], colors: 4, tubes: 3, mix: .4, run: 2, challenge: 'Hai con rắn: chỉ đầu rắn mở. Phải chọn rắn nào để gỡ theo màu ống đang cần.'},
  {n: 7, tier: 'normal', L: ['flower', {petals: 5, deep: 2, center: 3}], colors: 4, tubes: 2, mix: .4, hidden: 3, challenge: 'Hoa 5 cánh: giữ lại chai ở cánh hoa phòng khi Hidden Jam lộ màu bất ngờ.'},
  {n: 8, tier: 'easy', L: ['diamond', {n: 12, deep: 3}], colors: 4, tubes: 3, mix: .55, unlock: 'Booster Shuffle', challenge: 'Thứ tự jam lệch so với các chai đang mở: dạy đọc trước 2 tầng jam và giới thiệu Shuffle.'},
  {n: 9, tries: 150, tier: 'rise', L: ['sCurve', {n: 14}], colors: 4, tubes: 3, mix: .45, hidden: 2, run: 2, challenge: 'Đường chữ S hai đầu mở: phải quyết định gỡ từ đầu nào, đầu kia để dành.'},
  {n: 10, band: [.25, .35], tries: 150, tier: 'hard', L: ['spiral', {n: 22}], colors: 5, tubes: 3, mix: .55, run: 2, challenge: 'Level khó đầu tiên. Xoắn ốc chỉ mở đầu ngoài: chai bị khóa theo chuỗi, phải dùng khay 1 ô đúng lúc vì chạm sai một chai là kẹt.'},
  {n: 11, tier: 'intro', L: ['ringTower', {n: 10, deep: 3}], colors: 4, tubes: 3, mix: .2, locks: [3], lockAt: 'top', unlock: 'Locked Bottle', challenge: 'Giới thiệu Locked Bottle: chai trên đỉnh tháp có số đếm 3, chỉ giảm khi gửi chai khác. Người chơi học "gửi chai ngoài vòng để mở khóa".'},
  {n: 12, tier: 'normal', L: ['butterfly', {n: 8, body: 4}], colors: 4, tubes: 3, mix: .4, locks: [3, 4], lockAt: 'top', challenge: 'Hai chai khóa (đầu thân và một cánh) che các chai bên dưới: phải gửi đủ chai từ cánh kia để mở khóa mà không làm đầy khay.'},
  {n: 13, tier: 'easy', L: ['wall', {cols: 5, deep: 4}], colors: 5, tubes: 3, mix: .45, unlock: 'Booster Remove', challenge: 'Tường 5 cột sâu: chai cần nằm sâu trong cột. Dạy đào cột đúng và giới thiệu Remove để gỡ chai che.'},
  {n: 14, tier: 'rise', L: ['chevron', {n: 8}], colors: 5, tubes: 3, mix: .45, hidden: 3, run: 2, challenge: 'Chữ V: hai chuỗi, chỉ hai đầu trên mở, càng xuống đáy càng sâu. Phải dọn cân hai bên để luôn có lựa chọn.'},
  {n: 15, tier: 'hard', L: ['archRow', {legs: 6, deep: 3, row: 6}], colors: 6, tubes: 3, mix: .5, hidden: 4, locks: [4], lockAt: 'low', challenge: 'Đoán Hidden Jam: 4 jam ẩn trong khi các chân cầu sâu 3 tầng. Nếu dùng hết chai mở trước khi jam lộ màu thì sẽ kẹt.'},
  {n: 16, tier: 'easy', L: ['heart', {n: 18}], colors: 5, tubes: 3, mix: .35, run: 2, challenge: 'Nghỉ sau level khó: trái tim theo chuỗi, đọc thứ tự gỡ dễ, cảm giác dọn sạch nhanh.'},
  {n: 17, tier: 'intro', L: ['towers', {deep: 3, bridge: 7}], colors: 4, tubes: 3, mix: .25, pair: 4, unlock: 'Blocked Jam Tube', challenge: 'Giới thiệu Blocked Jam Tube: cặp ống đổi chỗ mở sau mỗi 4 lần gửi chai. Người chơi học đếm lượt và để dành chai cho ống sắp mở.'},
  {n: 18, tier: 'normal', L: ['zigzag', {n: 16}], colors: 5, tubes: 3, mix: .4, pair: 3, hidden: 2, challenge: 'Ziczac + cặp ống khóa: canh nhịp đổi ống, chai cho ống đang khóa phải giữ lại trên bàn.'},
  {n: 19, tier: 'rise', L: ['skyline', {deeps: [3, 4, 5, 4, 3]}], colors: 5, tubes: 4, mix: .45, locks: [4, 5], lockAt: 'top', challenge: 'Thành phố 5 tòa: chai trước của hai tòa bị khóa, chặn cả cột phía sau. Phải chọn tòa đào trước để đếm khóa kịp.'},
  {n: 20, band: [.08, .15], tries: 150, tier: 'super', L: ['spiralCore', {n: 24, core: 4}], colors: 6, tubes: 4, mix: .6, hidden: 4, locks: [4], lockAt: 'top', pair: 4, challenge: 'Super hard đầu tiên: xoắn ốc quanh lõi sâu, có cả Hidden, Locked và Blocked pair. Thử thách tổng hợp: lập kế hoạch nhiều bước.'},
  {n: 21, tier: 'easy', L: ['ring', {n: 14, r: 2.5}], colors: 5, tubes: 3, mix: .35, challenge: 'Nghỉ: vòng tròn mở hết, chỉ cần khớp màu. Thưởng cảm giác nhanh.'},
  {n: 22, tier: 'normal', L: ['cross', {n: 11}], colors: 5, tubes: 3, mix: .45, hidden: 4, challenge: 'Chữ X: chai giữa bị hai đường đè, jam ẩn nhiều. Phải giữ một nhánh để phản ứng khi jam lộ màu.'},
  {n: 23, tier: 'normal', L: ['stackPyramid', {deeps: [[2, 3, 2], [3, 3, 3, 3], [2, 3, 3, 3, 2]]}], colors: 6, tubes: 4, mix: .45, challenge: 'Kim tự tháp cột: 12 cột độ sâu khác nhau, phải chọn cột nào đào trước.'},
  {n: 24, tier: 'rise', L: ['doubleRing', {n1: 20, n2: 10}], colors: 6, tubes: 4, mix: .45, pair: 4, challenge: 'Hai vòng: vòng trong đè vòng ngoài, cặp ống đổi theo nhịp 4. Cân giữa vòng và nhịp ống.'},
  {n: 25, band: [.18, .28], tries: 150, tier: 'hard', L: ['snakes', {n: 12}], colors: 6, tubes: 3, mix: .6, hidden: 4, run: 2, challenge: 'Hai con rắn dài, chỉ hai đầu mở: rất ít lựa chọn mỗi lượt, jam ẩn khiến không đoán trước được. Chọn sai rắn là kẹt khay.'},
  {n: 26, tier: 'easy', L: ['waves', {n: 9}], colors: 5, tubes: 3, mix: .35, challenge: 'Nghỉ: hai làn sóng, nhiều chai mở, nhịp nhanh.'},
  {n: 27, tier: 'normal', L: ['tree', {trunk: 4}], colors: 5, tubes: 3, mix: .45, locks: [3, 4, 5], lockAt: 'top', challenge: 'Cái cây: ba chai khóa trên tán với số đếm khác nhau, phải tính lượt để chúng mở dần.'},
  {n: 28, tier: 'normal', L: ['archTower', {n: 16, deep: 5}], colors: 6, tubes: 4, mix: .5, hidden: 3, challenge: 'Vòm che tháp: phải gỡ vòm từ hai chân vào, tháp giữa giữ màu hiếm.'},
  {n: 29, tier: 'rise', L: ['hourglass'], colors: 6, tubes: 4, mix: .5, pair: 4, locks: [4], lockAt: 'top', challenge: 'Đồng hồ cát: cổ hẹp là cột khóa, nửa trên và nửa dưới phải dọn theo nhịp đổi ống.'},
  {n: 30, band: [.06, .12], tries: 150, tier: 'super', L: ['pile', {cols: 5, rows: 4, layers: 3}], colors: 7, tubes: 4, mix: .6, hidden: 5, locks: [5, 6], lockAt: 'low', challenge: 'Đống chai 3 tầng 38 chai, 7 màu: rất ít chai mở mỗi lúc, jam ẩn và chai khóa ở tầng dưới. Phải nhìn xa nhiều bước.'},
  {n: 31, tier: 'easy', L: ['flower', {petals: 6, deep: 3, center: 4}], colors: 5, tubes: 4, mix: .35, challenge: 'Nghỉ: bông hoa 6 cánh, 4 ống nên dễ khớp màu.'},
  {n: 32, tier: 'normal', L: ['diamond', {n: 16, deep: 4}], colors: 6, tubes: 4, mix: .5, hidden: 6, challenge: 'Kim cương nhiều jam ẩn: hầu hết jam phía sau là "?", phải giữ chai đa dạng màu trên bàn.'},
  {n: 33, tier: 'normal', L: ['butterfly', {n: 9, body: 5}], colors: 6, tubes: 4, mix: .5, pair: 3, locks: [4, 5], lockAt: 'top', challenge: 'Bướm + cặp ống + khóa: hai bộ đếm chạy cùng lúc, phải canh cả hai.'},
  {n: 34, tries: 150, tier: 'rise', L: ['wall', {cols: 6, deep: 5}], colors: 7, tubes: 4, mix: .55, hidden: 5, challenge: 'Tường 6 cột sâu 5: đào cột nào trước quyết định màu nào lộ ra kế tiếp.'},
  {n: 35, band: [.13, .23], tries: 150, tier: 'hard', L: ['twinSpirals', {n: 13, core: 4}], colors: 7, tubes: 4, mix: .6, pair: 4, hidden: 4, run: 2, challenge: 'Hai xoắn ốc và một cột sâu, 7 màu, cặp ống đổi nhịp 4: mỗi xoắn ốc chỉ mở đầu ngoài, phải chọn nguồn chai khớp với ống đang mở, sai nhịp là đầy khay.'},
  {n: 36, tier: 'easy', L: ['archRow', {legs: 7, deep: 2, row: 7}], colors: 6, tubes: 4, mix: .35, challenge: 'Nghỉ: cầu vòm nông và hàng trước mở hết.'},
  {n: 37, tier: 'normal', L: ['towers', {deep: 5, bridge: 9}], colors: 6, tubes: 4, mix: .5, locks: [5], lockAt: 'top', pair: 5, challenge: 'Ba tháp sâu và cầu: chai khóa trên cầu che hai tháp, cặp ống nhịp 5.'},
  {n: 38, tier: 'normal', L: ['braid', {n: 17}], colors: 6, tubes: 4, mix: .5, hidden: 5, run: 2, challenge: 'Hai sợi bện vào nhau, nhiều jam ẩn: chỗ hai sợi chéo nhau bị đè, phải chọn sợi gỡ trước và đoán màu cùng lúc.'},
  {n: 39, tier: 'rise', L: ['doubleRing', {n1: 22, n2: 12}], colors: 7, tubes: 4, mix: .4, locks: [4], lockAt: 'top', pair: 4, challenge: 'Hai vòng, một chai khóa ở vòng trong và cặp ống nhịp 4: vòng ngoài là chuỗi dài, phải mở vòng trong đúng lúc. Chuẩn bị cho trùm level 40.'},
  {n: 40, band: [.02, .08], tries: 150, tier: 'super', L: ['spiralCore', {n: 28, core: 5}], colors: 8, tubes: 5, mix: .65, hidden: 6, locks: [5, 6], lockAt: 'top', pair: 4, challenge: 'Trùm level 40: xoắn ốc quanh lõi sâu, 8 màu, 5 ống, đủ cả 3 element. Tổng hợp mọi kỹ năng đã học.'}
];

const ID = n => 'level_' + String(n).padStart(3, '0');

// Colors in runs along the build order (so the shape shows color bands), balanced counts, then a few random swaps.
function paint(n, colors, run, r, noise) {
  const pal = shuffleArr(Array.from({length: colors}, (_, k) => k + 1), r);
  const out = Array.from({length: n}, (_, i) => pal[Math.floor(i / run) % colors]);
  const sw = Math.round(n * noise);
  for (let k = 0; k < sw; k++) { const i = Math.floor(r() * n), j = Math.floor(r() * n); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}
function pickLocks(bottles, counts, at, r) {
  const cov = coverMap(bottles);
  const coversOthers = i => cov.some(c => c.includes(i));
  let pool = bottles.map((_, i) => i);
  if (at === 'top') pool = pool.filter(i => !cov[i].length && coversOthers(i));
  else if (at === 'low') pool = pool.filter(i => cov[i].length && cov[i].length <= 2);
  if (pool.length < counts.length) pool = bottles.map((_, i) => i);
  shuffleArr(pool, r).slice(0, counts.length).forEach((i, k) => { bottles[i].lock = counts[k]; });
}
function addHidden(tubes, k, r) {
  const slots = tubes.flatMap((t, ti) => t.sets.map((_, j) => ({ti, j}))).filter(x => x.j > 0);
  shuffleArr(slots, r).slice(0, k).forEach(x => tubes[x.ti].hidden.push(x.j));
  tubes.forEach(t => t.hidden.sort((a, b) => a - b));
}

export function design(sp, {tries = sp.tries || 60, games = 120} = {}) {
  const band = sp.band || TIERS[sp.tier].g, mid = (band[0] + band[1]) / 2;
  const base = LAYOUTS[sp.L[0]](sp.L[1] || {}).all;
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
    const bottles = base.map((b, i) => ({...b, color: colors[i], lock: 0}));
    if (sp.locks) pickLocks(bottles, sp.locks, (fails.sets || 0) > 4 && tr % 2 ? 'any' : sp.lockAt, r);
    let lv = normalize({id: ID(sp.n), difficulty: TIERS[sp.tier].diff, traySlots: 1, tubes: [], blockedPairs: sp.pair ? [{tube: 0, count: sp.pair, open: 0}] : [], bottles});
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
  return {spec: sp, level: lv, metrics: {casual: g2, greedy, random: rnd, band, inBand: g2 >= band[0] - .05 && g2 <= band[1] + .05, mix: best.mix, tries: best.tries, moves: best.moves, bottles: lv.bottles.length, layers: Math.max(...lv.bottles.map(b => b.z)) + 1, free: coverMap(lv.bottles).filter(c => !c.length).length, slots: slots.slots}};
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
    console.log(`${sp.n}\t${sp.tier}\t${sp.L[0]}\tb${m.bottles} z${m.layers} free${m.free}\tcasual ${Math.round(m.casual * 100)}% greedy ${Math.round(m.greedy * 100)}% random ${Math.round(m.random * 100)}%\t${m.inBand ? 'ok' : 'OFF'}\tmix ${m.mix.toFixed(2)} tries ${m.tries}\t${((Date.now() - t0) / 1000).toFixed(1)}s`);
  });
  if (rows.every(Boolean)) fs.writeFileSync(new URL('../src/data/levels.json', import.meta.url), serializeFile(rows.map(r => normalize(r.level))));
}
