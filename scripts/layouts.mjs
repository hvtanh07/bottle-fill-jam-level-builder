// Bottle layouts for the designed levels. Each maker returns a list of {x, y, z, rot}.
// The board is about 8 bottles wide (x 0..7) and 10 tall (y 0..9); the center column is x = 3.5.
import {shapeBottles, place} from '../src/shapes.js';
import {overlaps} from '../src/format.js';

// n points spread evenly along a curve f(t), t in 0..1, with the tangent angle.
function along(f, n, closed = false) {
  const S = 400, pts = Array.from({length: S + 1}, (_, i) => f(i / S));
  const acc = [0]; for (let i = 1; i <= S; i++) acc.push(acc[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  const total = acc[S], out = [];
  for (let k = 0; k < n; k++) {
    const s = n === 1 ? total / 2 : closed ? total * k / n : total * k / (n - 1);
    let i = acc.findIndex(v => v >= s); if (i <= 0) i = 1;
    const fr = (s - acc[i - 1]) / ((acc[i] - acc[i - 1]) || 1), p = pts[i - 1], q = pts[i];
    out.push({x: p.x + (q.x - p.x) * fr, y: p.y + (q.y - p.y) * fr, t: Math.atan2(q.y - p.y, q.x - p.x)});
  }
  return out;
}
const rotOf = (p, orient) => orient === 'along' ? p.t * 180 / Math.PI - 90 : orient === 'across' ? p.t * 180 / Math.PI : 0;

// A builder: add parts one after the other; later parts rest on earlier ones where they overlap.
export function board() {
  const all = [];
  const api = {
    all,
    add(list) { all.push(...list.map(b => ({x: b.x, y: b.y, z: b.z, rot: b.rot}))); return api; },
    // a curve; order 'end' = each bottle rests on the one before (the last one is on top), 'start' = the first one on top, 'flat' = one layer
    curve(f, n, {orient = 'across', order = 'end', closed = false} = {}) {
      return api.add(place(along(f, n, closed).map(p => ({x: p.x, y: p.y, rot: rotOf(p, orient)})), order, all));
    },
    shape(kind, a, b, opt) { return api.add(shapeBottles(kind, a, b, opt, all)); },
    // a deep column: the front bottle at (x, y), the others step back (up the screen) by `step`
    stack(x, y, n, step = .32, dir = {x: 0, y: -1}) { return api.shape('stack', {x, y}, {x: x + dir.x, y: y + dir.y}, {n, step}); },
    // single bottles on one layer above what they touch
    dots(points, rot = 0) { return api.add(place(points.map(([x, y, r]) => ({x, y, rot: r ?? rot})), 'flat', all)); }
  };
  return api;
}
const line = (a, b) => t => ({x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t});
const poly = (...P) => t => {
  const seg = P.length - 1, u = Math.min(seg - 1e-9, t * seg), i = Math.floor(u), f = u - i;
  return {x: P[i][0] + (P[i + 1][0] - P[i][0]) * f, y: P[i][1] + (P[i + 1][1] - P[i][1]) * f};
};
const arc = (cx, cy, rx, ry, a0, a1) => t => { const a = (a0 + (a1 - a0) * t) * Math.PI / 180; return {x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a)}; };
const grid = (cols, rows, x0, y0, dx = 1, dy = 1) => { const p = []; for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) p.push([x0 + c * dx, y0 + r * dy]); return p; };

export const LAYOUTS = {
  // L1 FTUE: two rows of two, nothing covered
  square4: () => board().dots(grid(2, 2, 3, 4)),
  // a smile: one flat arc
  smile: ({n = 6} = {}) => board().curve(arc(3.5, 3.4, 3, 2.6, 160, 20), n, {orient: 'upright', order: 'flat'}),
  // two short rows, the back row half covered
  bridge: ({n = 5} = {}) => board().dots(grid(n, 1, 3.5 - (n - 1) / 2, 4)).dots(grid(n - 1, 1, 4 - (n - 1) / 2, 4.6)),
  // a ring of bottles turned along the circle, each resting on the one before
  ring: ({n = 12, r = 2.2, cy = 4.5} = {}) => board().curve(arc(3.5, cy, r, r, -90, 270), n, {orient: 'across', order: 'end', closed: true}),
  // a ring around a deep center stack
  ringTower: ({n = 12, r = 2.4, deep = 4} = {}) => board().stack(3.5, 5, deep, .32).curve(arc(3.5, 4.5, r, r, -90, 270), n, {orient: 'across', order: 'end', closed: true}),
  // spiral going in: outer bottles on top
  spiral: ({n = 24, turns = 1.6, R = 3.1} = {}) => board().shape('spiral', {x: 3.5, y: 4.6}, {x: 3.5 + R, y: 4.6}, {n, orient: 'across', order: 'start', turns}),
  // a wall of deep columns
  wall: ({cols = 5, deep = 4, step = .42, y = 7.6} = {}) => { const b = board(); for (let k = 0; k < cols; k++) b.stack(3.5 - (cols - 1) / 2 + k, y, deep, step); return b; },
  // a wall where the middle columns are deeper (a skyline)
  skyline: ({deeps = [2, 3, 5, 3, 2], step = .42} = {}) => { const b = board(), c = deeps.length; deeps.forEach((d, k) => b.stack(3.5 - (c - 1) / 2 + k, 7.8, d, step)); return b; },
  // two snakes coming down side by side
  snakes: ({n = 10, bend = 70} = {}) => board()
    .shape('arc', {x: 1.2, y: 2.2}, {x: 2.6, y: 8.6}, {n, orient: 'across', order: 'start', bend})
    .shape('arc', {x: 5.8, y: 2.2}, {x: 4.4, y: 8.6}, {n, orient: 'across', order: 'start', bend}),
  // one S-shaped snake
  sCurve: ({n = 14} = {}) => board().curve(t => ({x: 3.5 + 2.4 * Math.sin(t * Math.PI * 2), y: 1.6 + 7 * t}), n, {orient: 'across', order: 'start'}),
  // an arch of short stacks and a row in front
  archRow: ({legs = 7, deep = 3, row = 7} = {}) => {
    const b = board();
    for (let k = 0; k < legs; k++) { const t = Math.PI * (1 - k / (legs - 1)), x = 3.5 + 3 * Math.cos(t), y = 4.6 - 2.6 * Math.sin(t); b.stack(x, y, deep, .4); }
    return b.shape('arc', {x: .5, y: 7.6}, {x: 6.5, y: 7.6}, {n: row, orient: 'upright', order: 'flat', bend: 40});
  },
  // an arch over a tower in the middle
  archTower: ({n = 18, deep = 6} = {}) => board()
    .shape('arc', {x: .6, y: 8.8}, {x: 6.4, y: 8.8}, {n, orient: 'across', order: 'end', bend: 200})
    .stack(3.5, 8.2, deep, .55),
  // a heart: two lobes and a point, outline turned along the curve
  heart: ({n = 20} = {}) => board().curve(t => { const a = t * 2 * Math.PI; return {x: 3.5 + 2.35 * Math.pow(Math.sin(a), 3), y: 4.4 - (1.9 * Math.cos(a) - .75 * Math.cos(2 * a) - .3 * Math.cos(3 * a) - .1 * Math.cos(4 * a))}; }, n, {orient: 'across', order: 'end', closed: true}),
  // a diamond outline and a center stack
  diamond: ({n = 16, deep = 3} = {}) => board().stack(3.5, 4.9, deep, .3).curve(poly([3.5, 1.4], [6.4, 4.6], [3.5, 7.8], [.6, 4.6], [3.5, 1.4]), n, {orient: 'across', order: 'end', closed: true}),
  // a flower: a center stack and petals made of short stacks
  flower: ({petals = 6, deep = 3, center = 4} = {}) => {
    const b = board();
    for (let k = 0; k < petals; k++) { const a = k / petals * 2 * Math.PI - Math.PI / 2, x = 3.5 + 2.3 * Math.cos(a), y = 4.6 + 2.3 * Math.sin(a); b.stack(x, y, deep, .3, {x: -Math.cos(a), y: -Math.sin(a)}); }
    return b.stack(3.5, 4.9, center, .3);
  },
  // two lines crossing in the middle
  cross: ({n = 9} = {}) => board()
    .curve(line([.8, 1.8], [6.2, 7.8]), n, {orient: 'along', order: 'end'})
    .curve(line([6.2, 1.8], [.8, 7.8]), n, {orient: 'along', order: 'start'}),
  // zigzag chain, each bottle resting on the one before
  zigzag: ({n = 16} = {}) => board().curve(poly([.6, 2], [2.5, 4.2], [4.5, 2], [6.4, 4.2], [4.5, 6.4], [2.5, 8.4], [.6, 6.4]), n, {orient: 'across', order: 'end'}),
  // waves: two sine rows
  waves: ({n = 9} = {}) => board()
    .curve(t => ({x: .5 + 6 * t, y: 3.4 + .8 * Math.sin(t * Math.PI * 2)}), n, {orient: 'across', order: 'start'})
    .curve(t => ({x: .5 + 6 * t, y: 6.2 + .8 * Math.sin(t * Math.PI * 2 + Math.PI)}), n, {orient: 'across', order: 'end'}),
  // a tree: a triangle pile on a deep trunk
  tree: ({trunk = 4} = {}) => board().stack(3.5, 7.4, trunk, .35)
    .dots(grid(5, 1, 1.5, 5.8)).dots(grid(4, 1, 2, 5.2)).dots(grid(3, 1, 2.5, 4.6)).dots(grid(2, 1, 3, 4)).dots([[3.5, 3.4]]),
  // a pyramid of stacks: the middle is deepest
  stackPyramid: ({deeps = [[2, 3, 2], [3, 4, 4, 3], [2, 3, 4, 3, 2]]} = {}) => {
    const b = board();
    deeps.forEach((row, r) => row.forEach((d, k) => b.stack(3.5 - (row.length - 1) / 2 + k, 3.2 + r * 2.2, d, .32)));
    return b;
  },
  // a butterfly: two rings and a body stack
  butterfly: ({n = 9, body = 5} = {}) => board()
    .curve(arc(1.9, 4.4, 1.5, 1.9, 0, 360), n, {orient: 'across', order: 'end', closed: true})
    .curve(arc(5.1, 4.4, 1.5, 1.9, 180, 540), n, {orient: 'across', order: 'end', closed: true})
    .stack(3.5, 6.6, body, .55),
  // two rings, the small one inside and on top
  doubleRing: ({n1 = 16, n2 = 9} = {}) => board()
    .curve(arc(3.5, 4.6, 2.7, 2.7, -90, 270), n1, {orient: 'across', order: 'end', closed: true})
    .curve(arc(3.5, 4.6, 1.3, 1.3, 90, 450), n2, {orient: 'across', order: 'start', closed: true}),
  // three towers joined by a bridge
  towers: ({deep = 5, bridge = 9} = {}) => board()
    .stack(1, 8, deep, .5).stack(3.5, 8, deep + 1, .5).stack(6, 8, deep, .5)
    .shape('arc', {x: .4, y: 5}, {x: 6.6, y: 5}, {n: bridge, orient: 'across', order: 'end', bend: 120}),
  // a chevron (V) of two chains meeting at the bottom
  chevron: ({n = 8} = {}) => board()
    .curve(line([.6, 2.4], [3.3, 7.6]), n, {orient: 'along', order: 'start'})
    .curve(line([6.4, 2.4], [3.7, 7.6]), n, {orient: 'along', order: 'start'}),
  // a big pile: offset layers like a pyramid
  pile: ({cols = 5, rows = 4, layers = 3} = {}) => {
    const b = board();
    for (let z = 0; z < layers; z++) b.dots(grid(cols - z, rows - z, 3.5 - (cols - 1 - z) / 2, 3 + z * .5));
    return b;
  },
  // an hourglass: two triangles of stacks
  hourglass: () => board()
    .dots(grid(5, 1, 1.5, 2)).dots(grid(4, 1, 2, 2.6)).dots(grid(3, 1, 2.5, 3.2)).dots(grid(2, 1, 3, 3.8))
    .stack(3.5, 5, 3, .3)
    .dots(grid(2, 1, 3, 6.2)).dots(grid(3, 1, 2.5, 6.8)).dots(grid(4, 1, 2, 7.4)).dots(grid(5, 1, 1.5, 8)),
  // two small spirals and a deep stack between them
  twinSpirals: ({n = 13, core = 4} = {}) => board()
    .stack(1.6, 7.6, core, .32)
    .shape('spiral', {x: 1.8, y: 2.6}, {x: 1.8, y: .9}, {n, orient: 'across', order: 'start', turns: 1.3, inner: .3})
    .shape('spiral', {x: 5.2, y: 5.4}, {x: 5.2, y: 7.1}, {n, orient: 'across', order: 'start', turns: 1.3, inner: .3}),
  // two chains weaving across each other
  braid: ({n = 13} = {}) => board()
    .curve(t => ({x: 1.4 + 4.2 * (.5 + .5 * Math.sin(t * Math.PI * 2.5)), y: 1.2 + 7.6 * t}), n, {orient: 'across', order: 'end'})
    .curve(t => ({x: 1.4 + 4.2 * (.5 - .5 * Math.sin(t * Math.PI * 2.5)), y: 1.2 + 7.6 * t}), n, {orient: 'across', order: 'start'}),
  // a big spiral around a deep core
  spiralCore: ({n = 26, core = 5} = {}) => board().stack(3.5, 4.9, core, .3).shape('spiral', {x: 3.5, y: 4.6}, {x: 6.7, y: 4.6}, {n, orient: 'across', order: 'start', turns: 1.4, inner: .4})
};
