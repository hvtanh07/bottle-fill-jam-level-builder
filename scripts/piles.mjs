// Pile layouts drawn as text, one picture per layer.
// Layer 0 lies on the board; layer k sits on layer k-1, shifted by `off[k]` (default half a bottle right and down,
// so a bottle rests on up to 4 bottles under it). In each picture, the character at column c, row r is a bottle at
// (c, r) plus the layer's total shift. '#' = standing bottle, '-' = bottle lying sideways,
// 'L' = a standing bottle that gets the level's Locked Bottle counter, anything else = empty.
import {overlaps} from '../src/format.js';

export const Q = [.5, .5], P = [.5, 0], S = [0, 0], N = [-.5, .5];

export function art(layers, {off = [], at = [0, 0]} = {}) {
  const out = []; let sx = at[0], sy = at[1];
  layers.forEach((pic, z) => {
    if (z > 0) { const o = off[z] || Q; sx += o[0]; sy += o[1]; }
    const rows = pic.split('\n');
    rows.forEach((row, r) => [...row].forEach((ch, c) => {
      if (ch === '#' || ch === '-' || ch === 'L') out.push({x: c + sx, y: r + sy, z, rot: ch === '-' ? 90 : 0, ...(ch === 'L' ? {mark: 'lock'} : {})});
    }));
  });
  return out;
}

// The pile rules: no two bottles of a layer touch, every bottle above layer 0 rests on a bottle of the layer
// right under it, and no layer has more bottles than the layer under it.
export function pileIssues(bs) {
  const issues = [], count = [];
  bs.forEach(b => { count[b.z] = (count[b.z] || 0) + 1; });
  bs.forEach((b, i) => {
    bs.forEach((o, j) => { if (j > i && o.z === b.z && overlaps(o, b)) issues.push(`layer ${b.z}: bottles at (${b.x},${b.y}) and (${o.x},${o.y}) touch`); });
    if (b.z > 0 && !bs.some(o => o.z === b.z - 1 && overlaps(o, b))) issues.push(`layer ${b.z}: bottle at (${b.x},${b.y}) rests on nothing`);
  });
  for (let z = 1; z < count.length; z++) if ((count[z] || 0) > (count[z - 1] || 0)) issues.push(`layer ${z} has ${count[z]} bottles, layer ${z - 1} has ${count[z - 1] || 0}`);
  return issues;
}
export const perLayer = bs => { const c = []; bs.forEach(b => { c[b.z] = (c[b.z] || 0) + 1; }); return Array.from(c, v => v || 0); };
