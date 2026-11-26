// Bottle layouts from a drag on the board: line, arc, circle, spiral, and a deep stack (column going back).
// Points are in board units (bottle widths); rot is the bottle's angle in degrees, clockwise.
import {autoZ, overlaps} from './format.js';

export const SHAPES = ['line', 'arc', 'circle', 'spiral', 'stack'];
const r2 = v => Math.round(v * 100) / 100;

// A dense polyline for the shape, from a (press) to b (release).
function path(kind, a, b, opt) {
  const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1e-6, pts = [];
  const S = 240;
  if (kind === 'line' || kind === 'stack') { for (let i = 0; i <= S; i++) pts.push({x: a.x + dx * i / S, y: a.y + dy * i / S}); return pts; }
  if (kind === 'circle') {
    const R = L, a0 = Math.atan2(dy, dx);
    for (let i = 0; i <= S; i++) { const t = a0 + 2 * Math.PI * i / S; pts.push({x: a.x + R * Math.cos(t), y: a.y + R * Math.sin(t)}); }
    return pts;
  }
  if (kind === 'spiral') {
    const R = L, a0 = Math.atan2(dy, dx), turns = opt.turns || 1.5, inner = opt.inner ?? 0.2, T = turns * 2 * Math.PI;
    for (let i = 0; i <= S * 2; i++) { const u = i / (S * 2), t = a0 + T * u, r = R * (1 - (1 - inner) * u); pts.push({x: a.x + r * Math.cos(t), y: a.y + r * Math.sin(t)}); }
    return pts;
  }
  // arc: from a to b, bulging to the left of the drag direction by `bend` degrees (180 = half circle)
  const bend = Math.max(10, Math.min(350, opt.bend || 180)) * Math.PI / 180;
  const r = (L / 2) / Math.sin(bend / 2), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, nx = -dy / L, ny = dx / L;
  const cx = mx + nx * r * Math.cos(bend / 2), cy = my + ny * r * Math.cos(bend / 2);
  const t0 = Math.atan2(a.y - cy, a.x - cx);
  // sweep toward the side away from the normal (the bulge)
  const probe = s => { const t = t0 + s * bend / 2; return (cx + r * Math.cos(t) - mx) * nx + (cy + r * Math.sin(t) - my) * ny; };
  const sgn = probe(1) < probe(-1) ? 1 : -1;
  for (let i = 0; i <= S; i++) { const t = t0 + sgn * bend * i / S; pts.push({x: cx + r * Math.cos(t), y: cy + r * Math.sin(t)}); }
  return pts;
}
// n points spread evenly along the polyline, each with the tangent angle.
function spread(pts, n, closed) {
  const acc = [0]; for (let i = 1; i < pts.length; i++) acc.push(acc[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  const total = acc[acc.length - 1], out = [];
  for (let k = 0; k < n; k++) {
    const s = n === 1 ? 0 : closed ? total * k / n : total * k / (n - 1);
    let i = acc.findIndex(v => v >= s); if (i <= 0) i = 1;
    const f = (s - acc[i - 1]) / ((acc[i] - acc[i - 1]) || 1), p = pts[i - 1], q = pts[i];
    out.push({x: p.x + (q.x - p.x) * f, y: p.y + (q.y - p.y) * f, t: Math.atan2(q.y - p.y, q.x - p.x)});
  }
  return out;
}
// opt: {n, orient: 'upright'|'along'|'across', order: 'end'|'start'|'flat', step (stack), bend (arc), turns (spiral)}
export function shapeBottles(kind, a, b, opt, existing = []) {
  let pts;
  if (kind === 'stack') {
    // a = front bottle; drag sets the direction going back (default straight up); bottles step back by `step`
    let dx = b.x - a.x, dy = b.y - a.y; if (Math.hypot(dx, dy) < .2) { dx = 0; dy = -1; }
    const L = Math.hypot(dx, dy), step = opt.step || .3;
    pts = Array.from({length: opt.n}, (_, k) => ({x: a.x + dx / L * step * (opt.n - 1 - k), y: a.y + dy / L * step * (opt.n - 1 - k), t: Math.atan2(dy, dx) + Math.PI}));
    return place(pts.map(p => ({x: p.x, y: p.y, rot: 0})), 'end', existing);
  }
  pts = spread(path(kind, a, b, opt), opt.n, kind === 'circle');
  const rot = p => opt.orient === 'along' ? p.t * 180 / Math.PI - 90 : opt.orient === 'across' ? p.t * 180 / Math.PI : 0;
  return place(pts.map(p => ({x: p.x, y: p.y, rot: rot(p)})), opt.order || 'end', existing);
}
// Gives each new bottle a z: on top of what is under it; in a chain each one also rests on the one before.
function place(pts, order, existing) {
  const list = order === 'start' ? pts.slice().reverse() : pts.slice();
  const out = [];
  list.forEach(p => {
    const b = {x: r2(p.x), y: r2(p.y), rot: ((Math.round(p.rot) % 360) + 360) % 360};
    let z = autoZ(existing, b.x, b.y, new Set(), b.rot);
    if (order !== 'flat') out.forEach(o => { if (overlaps(o, b)) z = Math.max(z, o.z + 1); });
    out.push({...b, z});
  });
  return order === 'start' ? out.reverse() : out;
}
