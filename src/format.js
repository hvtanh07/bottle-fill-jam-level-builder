// Level format for Bottle Fill Jam: reading, writing, board geometry and checks.
//
// A level:
//   id            "level_001"
//   difficulty    0 Normal, 1 Hard, 2 Super hard
//   traySlots     waiting tray slots at the start (GDD: 1; Extra Tray adds up to 5)
//   tubes         [{sets: [color...], hidden: [set index...]}]  sets are listed from the nozzle (bottom) up
//   blockedPairs  [{tube, count, open}]  Blocked Jam Tube: tubes `tube` and `tube + 1`, swap every `count` bottles sent,
//                 `open` 0 = the left tube starts open, 1 = the right one
//   bottles       [{x, y, z, rot, color, lock}]  x right / y down in bottle widths (any value, 2 decimals),
//                 z = cover order (a bottle rests on every lower-z bottle its shape overlaps), rot = degrees clockwise,
//                 lock = Locked Bottle counter (0 = a normal bottle)
// Colors are the GDD color list: 1 Red, 2 Blue, 3 Green, 4 Yellow, 5 Pink, 6 Orange, 7 Purple, 8 Brown.

export const PALETTE = [
  {n: 1, name: 'Red', hex: '#D9363E'},
  {n: 2, name: 'Blue', hex: '#2563EB'},
  {n: 3, name: 'Green', hex: '#1B8641'},
  {n: 4, name: 'Yellow', hex: '#F4BE0B'},
  {n: 5, name: 'Pink', hex: '#F472B6'},
  {n: 6, name: 'Orange', hex: '#F58220'},
  {n: 7, name: 'Purple', hex: '#7C4DDB'},
  {n: 8, name: 'Brown', hex: '#8B5A2B'}
];
export const colorHex = c => (PALETTE[c - 1] || {hex: '#7D8597'}).hex;
export const colorName = c => (PALETTE[c - 1] || {name: '?'}).name;
export const DIFFICULTY = ['Normal', 'Hard', 'Super hard'];
export const MAX_TRAY = 5, PORTIONS = 4;

const int = (v, d = 0) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? n : d; };
const r2 = v => { const n = Number(v); return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0; };
const deg = v => { const n = Math.round(Number(v)); return Number.isFinite(n) ? ((n % 360) + 360) % 360 : 0; };

export function normalize(raw) {
  const o = raw && typeof raw === 'object' ? raw : {};
  const tubes = (Array.isArray(o.tubes) ? o.tubes : []).map(t => {
    const sets = (Array.isArray(t && t.sets) ? t.sets : []).map(c => int(c, 1));
    const hidden = [...new Set((Array.isArray(t && t.hidden) ? t.hidden : []).map(i => int(i, -1)).filter(i => i >= 0 && i < sets.length))].sort((a, b) => a - b);
    return {sets, hidden};
  });
  const blockedPairs = (Array.isArray(o.blockedPairs) ? o.blockedPairs : []).map(p => ({tube: int(p && p.tube), count: Math.max(1, int(p && p.count, 2)), open: int(p && p.open) ? 1 : 0}));
  const bottles = (Array.isArray(o.bottles) ? o.bottles : []).map(b => ({x: r2(b && b.x), y: r2(b && b.y), z: Math.max(0, int(b && b.z)), rot: deg(b && b.rot), color: int(b && b.color, 1), lock: Math.max(0, int(b && b.lock))}));
  return {
    id: String(o.id ?? 'level'),
    difficulty: Math.min(2, Math.max(0, int(o.difficulty))),
    traySlots: Math.min(MAX_TRAY, Math.max(1, int(o.traySlots, 1))),
    tubes, blockedPairs, bottles
  };
}

export function blankLevel(id) {
  return normalize({id, difficulty: 0, traySlots: 1, tubes: [{sets: [], hidden: []}], blockedPairs: [], bottles: []});
}

/* ---------- writing ---------- */
const line = o => JSON.stringify(o).replace(/":/g, '": ').replace(/,"/g, ', "').replace(/,(\d|-)/g, ', $1');
export function serialize(lv, pad = '') {
  const p = pad + '  ', q = p + '  ';
  const arr = (items) => items.length ? `[\n${items.map(s => q + s).join(',\n')}\n${p}]` : '[]';
  return `${pad}{\n` +
    `${p}"id": ${JSON.stringify(lv.id)},\n` +
    `${p}"difficulty": ${lv.difficulty},\n` +
    `${p}"traySlots": ${lv.traySlots},\n` +
    `${p}"tubes": ${arr(lv.tubes.map(t => line({sets: t.sets, hidden: t.hidden})))},\n` +
    `${p}"blockedPairs": ${arr(lv.blockedPairs.map(b => line({tube: b.tube, count: b.count, open: b.open})))},\n` +
    `${p}"bottles": ${arr(lv.bottles.map(b => line({x: b.x, y: b.y, z: b.z, rot: b.rot, color: b.color, lock: b.lock})))}\n` +
    `${pad}}`;
}
export function serializeFile(levels, meta = {}) {
  return `{\n  "version": ${int(meta.version, 1)},\n  "levels": [\n${levels.map(l => serialize(l, '    ')).join(',\n')}\n  ]\n}\n`;
}
export const compact = lv => JSON.stringify({id: lv.id, difficulty: lv.difficulty, traySlots: lv.traySlots, tubes: lv.tubes, blockedPairs: lv.blockedPairs, bottles: lv.bottles.map(b => ({x: b.x, y: b.y, z: b.z, rot: b.rot, color: b.color, lock: b.lock}))});

/* ---------- reading ---------- */
function splitTsv(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
    else if (ch === '"' && cell === '') q = true;
    else if (ch === '\t') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  row.push(cell); rows.push(row);
  return rows;
}
function splitObjects(text) {
  const out = []; let depth = 0, start = -1, str = false, esc = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (str) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') str = false; continue; }
    if (ch === '"') str = true;
    else if (ch === '{') { if (depth === 0) start = i; depth++; }
    else if (ch === '}') { depth--; if (depth === 0 && start >= 0) { out.push(text.slice(start, i + 1)); start = -1; } }
  }
  return out;
}
export function parseLevels(text) {
  text = String(text || '').trim();
  if (!text) throw new Error('Nothing to read.');
  const pick = d => {
    if (Array.isArray(d)) return d;
    if (d && Array.isArray(d.levels)) return d.levels;
    if (d && (Array.isArray(d.bottles) || Array.isArray(d.tubes))) return [d];
    throw new Error('This JSON has no levels. Expected a levels file, a list of levels, or one level with "tubes" and "bottles".');
  };
  try { return pick(JSON.parse(text)).map(normalize); } catch (e) { if (!(e instanceof SyntaxError)) throw e; }
  const out = [];
  if (/\t/.test(text)) {
    for (const row of splitTsv(text)) for (const c of row) { const s = c.trim(); if (s.startsWith('{')) out.push(...pick(JSON.parse(s))); }
    if (out.length) return out.map(normalize);
  }
  for (const chunk of splitObjects(text)) out.push(...pick(JSON.parse(chunk)));
  if (!out.length) throw new Error('Could not read any level from this text.');
  return out.map(normalize);
}

/* ---------- board geometry ---------- */
// A bottle's shape on the board: a FOOT_W × FOOT_H rectangle (in bottle widths) turned by rot.
// A bottle rests on another when it has a higher z and the shapes overlap by more than a hair.
export const FOOT_W = 0.78, FOOT_H = 0.95;
const EPS = 0.02;
function axes(b) { const a = (b.rot || 0) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); return [[c, s], [-s, c]]; }
function corners(b) {
  const [[ux, uy], [vx, vy]] = axes(b), w = FOOT_W / 2, h = FOOT_H / 2;
  return [[-w, -h], [w, -h], [w, h], [-w, h]].map(([p, q]) => [b.x + p * ux + q * vx, b.y + p * uy + q * vy]);
}
export function overlaps(a, b) {
  const dx = a.x - b.x, dy = a.y - b.y;
  if (dx * dx + dy * dy >= 1.6) return false;
  const ra = a.rot || 0, rb = b.rot || 0;
  if (ra % 90 === 0 && rb % 90 === 0) {
    const wa = ra % 180 ? FOOT_H : FOOT_W, ha = ra % 180 ? FOOT_W : FOOT_H, wb = rb % 180 ? FOOT_H : FOOT_W, hb = rb % 180 ? FOOT_W : FOOT_H;
    return Math.abs(dx) < (wa + wb) / 2 - EPS && Math.abs(dy) < (ha + hb) / 2 - EPS;
  }
  const ca = corners(a), cb = corners(b);
  for (const [ax, ay] of [...axes(a), ...axes(b)]) {
    const pa = ca.map(([x, y]) => x * ax + y * ay), pb = cb.map(([x, y]) => x * ax + y * ay);
    if (Math.max(...pa) - EPS <= Math.min(...pb) || Math.max(...pb) - EPS <= Math.min(...pa)) return false;
  }
  return true;
}
export function coverMap(bottles) {
  return bottles.map((b, i) => bottles.reduce((acc, o, j) => { if (j !== i && o.z > b.z && overlaps(o, b)) acc.push(j); return acc; }, []));
}
// Layer for a new bottle at (x, y): one above the highest bottle it overlaps.
export function autoZ(bottles, x, y, skip = new Set(), rot = 0) {
  let z = -1; bottles.forEach((b, i) => { if (!skip.has(i) && overlaps(b, {x, y, rot})) z = Math.max(z, b.z); }); return z + 1;
}
export function boardBounds(bottles) {
  if (!bottles.length) return {x0: 0, y0: 0, x1: 0, y1: 0};
  return {x0: Math.min(...bottles.map(b => b.x)), y0: Math.min(...bottles.map(b => b.y)), x1: Math.max(...bottles.map(b => b.x)), y1: Math.max(...bottles.map(b => b.y))};
}
export function pairOf(lv, t) { return lv.blockedPairs.findIndex(p => p.tube === t || p.tube + 1 === t); }

/* ---------- tallies and checks ---------- */
export function tally(lv) {
  const bottles = {}, sets = {};
  lv.bottles.forEach(b => { bottles[b.color] = (bottles[b.color] || 0) + 1; });
  lv.tubes.forEach(t => t.sets.forEach(c => { sets[c] = (sets[c] || 0) + 1; }));
  const colors = [...new Set([...Object.keys(bottles), ...Object.keys(sets)].map(Number))].sort((a, b) => a - b);
  const layers = lv.bottles.length ? Math.max(...lv.bottles.map(b => b.z)) + 1 : 0;
  return {
    bottles, sets, colors, layers,
    nBottles: lv.bottles.length, nSets: lv.tubes.reduce((s, t) => s + t.sets.length, 0),
    hidden: lv.tubes.reduce((s, t) => s + t.hidden.length, 0),
    locked: lv.bottles.filter(b => b.lock > 0).length,
    pairs: lv.blockedPairs.length
  };
}

export function check(lv) {
  const out = [], add = (level, text, ref) => out.push({level, text, ref});
  const t = tally(lv);
  if (!lv.tubes.length) add('bad', 'The level has no jam tube.');
  if (!lv.bottles.length) add('bad', 'The level has no bottle.');
  t.colors.forEach(c => {
    if (!(c >= 1 && c <= 8)) add('bad', `Color ${c} is not in the color list (1–8).`);
    const b = t.bottles[c] || 0, s = t.sets[c] || 0;
    if (b !== s) add('bad', `${colorName(c)}: ${b} bottle${b === 1 ? '' : 's'} but ${s} jam set${s === 1 ? '' : 's'}. Each bottle takes one set of 4 portions.`);
  });
  lv.tubes.forEach((tb, i) => {
    if (!tb.sets.length) add('warn', `Tube ${i + 1} is empty from the start.`, {tube: i});
    if (tb.hidden.includes(0)) add('warn', `Tube ${i + 1}: the bottom set is Hidden Jam, so it shows its color at once.`, {tube: i});
  });
  const used = new Map();
  lv.blockedPairs.forEach((p, k) => {
    if (p.tube < 0 || p.tube + 1 >= lv.tubes.length) add('bad', `Blocked Jam Tube ${k + 1} needs tubes ${p.tube + 1} and ${p.tube + 2}, which do not both exist.`);
    [p.tube, p.tube + 1].forEach(x => { if (used.has(x)) add('bad', `Tube ${x + 1} is in two Blocked Jam Tube pairs.`); used.set(x, k); });
  });
  const seen = new Map();
  lv.bottles.forEach((b, i) => {
    lv.bottles.forEach((o, j) => { if (j > i && o.z === b.z && overlaps(o, b)) { const key = i + ':' + j; if (!seen.has(key)) { seen.set(key, 1); add('bad', `Bottles ${i + 1} and ${j + 1} overlap with the same order z (${b.z}), so neither rests on the other.`, {bottle: i}); } } });
    if (b.z > 0 && !lv.bottles.some((o, j) => j !== i && o.z < b.z && overlaps(o, b))) add('warn', `Bottle ${i + 1} has order z ${b.z} but rests on nothing (no lower bottle under it). Settle layers drops it.`, {bottle: i});
  });
  const num = parseInt(String(lv.id).replace(/\D/g, ''), 10);
  if (lv.traySlots > 3) add('warn', `The tray starts with ${lv.traySlots} slots. The GDD allows 1 to 3 at the start (Extra Tray adds more).`);
  else if (lv.traySlots > 1 && num <= 10) add('warn', `The tray starts with ${lv.traySlots} slots. The GDD starts levels 1–10 with 1 slot.`);
  if (lv.tubes.length > 5) add('warn', `${lv.tubes.length} tubes may not fit on a phone screen.`);
  if (t.locked && t.nBottles - t.locked < Math.max(...lv.bottles.map(b => b.lock))) add('bad', 'A Locked Bottle counter is higher than the number of other bottles, so it can never open (GDD fail-safe case).');
  return out;
}
export const statusOf = issues => issues.some(i => i.level === 'bad') ? 'bad' : issues.some(i => i.level === 'warn') ? 'warn' : 'ok';

/* ---------- seeded random ---------- */
export function rng(seed) {
  let a = (seed >>> 0) || 1;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export function shuffleArr(a, r) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
