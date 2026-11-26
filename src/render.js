// Draws a level as SVG: the machine with its jam tubes, the fill spots, the waiting tray and the bottle pile.
import {colorHex, boardBounds, MAX_TRAY, PORTIONS} from './format.js';

export const CELL = 48, ZOFF = 0, TW = 58, TG = 22, SETH = 24, BOARD_COLS = 8, BOARD_ROWS = 10, ZPAD = 0, BK = CELL / 56;
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));

export function layout(lv, s) {
  const n = Math.max(1, lv.tubes.length);
  const cap = Math.max(5, ...lv.tubes.map(t => t.sets.length));
  const tubeTop = 34, tubeH = cap * SETH + 12, nozzleY = tubeTop + tubeH, spotY = nozzleY + 52;
  const machineW = n * TW + (n - 1) * TG + 40;
  const trayY = spotY + 92, slotW = 52, slotG = 8;
  const traySlots = s ? s.tray.length : lv.traySlots;
  const trayW = MAX_TRAY * slotW + (MAX_TRAY - 1) * slotG;
  const b0 = boardBounds(lv.bottles), maxZ = ZPAD;
  // the board frame is fixed (BOARD_COLS × BOARD_ROWS) so the picture does not jump while bottles are added
  const bb = lv.bottles.length ? {x0: Math.min(0, Math.floor(b0.x0)), y0: Math.min(0, Math.floor(b0.y0)), x1: Math.max(BOARD_COLS - 1, Math.ceil(b0.x1)), y1: Math.max(BOARD_ROWS - 1, Math.ceil(b0.y1))} : {x0: 0, y0: 0, x1: BOARD_COLS - 1, y1: BOARD_ROWS - 1};
  const boardTop = trayY + 62;
  const boardW = (bb.x1 - bb.x0 + 1) * CELL;
  const boardH = (bb.y1 - bb.y0 + 1) * CELL + maxZ * ZOFF;
  const W = Math.max(machineW, trayW + 30, boardW + 30, 320);
  const H = boardTop + Math.max(boardH, CELL) + 30;
  return {n, cap, tubeTop, tubeH, nozzleY, spotY, machineW, trayY, slotW, slotG, traySlots, trayW, bb, maxZ, boardTop, boardW, boardH, W, H,
    tx: t => (t - (n - 1) / 2) * (TW + TG),
    slotX: k => -trayW / 2 + slotW / 2 + k * (slotW + slotG),
    bx: x => (x - (bb.x0 + bb.x1) / 2) * CELL,
    by: (y, z) => boardTop + (y - bb.y0) * CELL + CELL / 2 + (maxZ - z) * ZOFF,
    fromBoard: (px, py, z = 0) => ({x: px / CELL + (bb.x0 + bb.x1) / 2, y: (py - boardTop - CELL / 2 - (maxZ - z) * ZOFF) / CELL + bb.y0})};
}
export const viewBox = L => `${-L.W / 2} 0 ${L.W} ${L.H}`;

const padlock = (x, y, k = 1) => `<g transform="translate(${x} ${y}) scale(${k})"><path d="M-5 -2v-4a5 5 0 0 1 10 0v4" fill="none" stroke="#fff" stroke-width="2.2"/><rect x="-7.5" y="-2.5" width="15" height="11" rx="2.5" fill="#fff"/><circle cx="0" cy="2.5" r="1.6" fill="#232B41"/></g>`;

// One jam set inside a tube. hidden: grey with "?" (design mode shows its real color as a dot).
function jamSet(x, y, c, hidden, opts) {
  const w = TW - 12, h = SETH - 2, x0 = x - w / 2;
  const fill = hidden ? '#A3ADC4' : colorHex(c);
  let s = `<rect x="${x0}" y="${y}" width="${w}" height="${h}" rx="3" fill="${fill}"/>`;
  for (let k = 1; k < PORTIONS; k++) s += `<line x1="${x0 + 2}" x2="${x0 + w - 2}" y1="${y + k * h / PORTIONS}" y2="${y + k * h / PORTIONS}" stroke="rgba(255,255,255,.28)" stroke-width="1"/>`;
  s += `<rect x="${x0}" y="${y}" width="5" height="${h}" rx="2" fill="rgba(255,255,255,.22)"/>`;
  if (hidden) s += `<text class="q" x="${x}" y="${y + h / 2 + 1}">?</text>` + (opts.design ? `<circle cx="${x0 + w - 7}" cy="${y + h / 2}" r="4.5" fill="${colorHex(c)}" stroke="#fff" stroke-width="1.5"/>` : '');
  return s;
}

// The machine, tubes, fill spots and tray. s = game state (play test) or null (design).
export function drawStatic(lv, s, L, opts = {}) {
  const design = !s;
  let out = `<rect class="mach" x="${-L.machineW / 2}" y="6" width="${L.machineW}" height="${L.nozzleY + 10}" rx="18"/>`;
  // Blocked Jam Tube brackets
  lv.blockedPairs.forEach((p, k) => {
    if (p.tube < 0 || p.tube + 1 >= lv.tubes.length) return;
    const a = L.tx(p.tube), b = L.tx(p.tube + 1), y = 22;
    const cnt = s ? s.pairs[k].cnt : p.count, stop = s && s.pairs[k].stop;
    out += `<path class="pairb" d="M${a - TW / 2 + 4} ${y + 8}V${y}H${b + TW / 2 - 4}V${y + 8}"/>`;
    if (!stop) out += `<g class="badge" data-pair="${k}"><circle cx="${(a + b) / 2}" cy="${y}" r="11"/><text x="${(a + b) / 2}" y="${y + 1}">${cnt}</text></g>`;
  });
  lv.tubes.forEach((tb, t) => {
    const x = L.tx(t), sets = s ? s.tubes[t] : tb.sets.map((c, k) => ({c, h: tb.hidden.includes(k)}));
    const open = s ? openOf(s, t) : designOpen(lv, t);
    const selT = opts.selTube === t;
    out += `<g class="tube${open ? '' : ' closed'}${selT ? ' sel' : ''}" data-tube="${t}">`;
    out += `<rect class="glass" x="${x - TW / 2}" y="${L.tubeTop}" width="${TW}" height="${L.tubeH}" rx="10"/>`;
    sets.forEach((st, k) => {
      const y = L.nozzleY - 6 - (k + 1) * SETH;
      const sel = opts.selSet && opts.selSet.t === t && opts.selSet.k === k;
      out += `<g class="set${sel ? ' sel' : ''}" data-tube="${t}" data-set="${k}">${jamSet(x, y, st.c, st.h, {design})}${sel ? `<rect class="selr" x="${x - TW / 2 + 3}" y="${y - 1}" width="${TW - 6}" height="${SETH}" rx="4"/>` : ''}</g>`;
    });
    out += `<rect class="nozzle" x="${x - 9}" y="${L.nozzleY}" width="18" height="12" rx="3"/>`;
    if (!open) out += `<g class="lid"><rect x="${x - 26}" y="${L.nozzleY + 2}" width="52" height="18" rx="5"/>${padlock(x, L.nozzleY + 11, .9)}</g>`;
    if (opts.labels) out += `<text class="tlab" x="${x}" y="${L.tubeTop - 8}">${t + 1}</text>`;
    out += `</g>`;
    out += `<rect class="spot" x="${x - 26}" y="${L.spotY - 32}" width="52" height="64" rx="12"/>`;
  });
  for (let k = 0; k < MAX_TRAY; k++) {
    const on = k < L.traySlots;
    out += `<rect class="slot${on ? '' : ' off'}" x="${L.slotX(k) - L.slotW / 2}" y="${L.trayY - 32}" width="${L.slotW}" height="64" rx="12"/>`;
    if (!on) out += `<text class="plus" x="${L.slotX(k)}" y="${L.trayY + 1}">+</text>`;
  }
  out += `<text class="cap" x="${-L.trayW / 2}" y="${L.trayY - 40}">Waiting tray</text>`;
  out += `<rect class="boardr" x="${L.bx(L.bb.x0) - CELL / 2 - 8}" y="${L.boardTop - 8}" width="${L.boardW + 16}" height="${L.boardH + 16}" rx="16"/>`;
  if (design && opts.grid) { let g = ''; for (let x = L.bb.x0; x <= L.bb.x1; x++) for (let y = L.bb.y0; y <= L.bb.y1; y++) g += `<rect class="cellr" x="${L.bx(x) - CELL / 2 + 3}" y="${L.by(y, 0) - CELL / 2 + 3}" width="${CELL - 6}" height="${CELL - 6}" rx="8"/>`; out += g; }
  if (design && !lv.bottles.length) out += `<text class="empty" x="0" y="${L.boardTop + 40}">Pick the Bottle tool and click here to add bottles</text>`;
  return out;
}
const designOpen = (lv, t) => { const p = lv.blockedPairs.find(p => p.tube === t || p.tube + 1 === t); return !p || (p.open === 0 ? p.tube : p.tube + 1) === t; };
function openOf(s, t) {
  const p = s.pairs.find(p => p.t === t || p.t + 1 === t);
  if (!p) return true; if (p.stop) return s.tubes[t].length > 0; return (p.open === 0 ? p.t : p.t + 1) === t;
}

// A can, drawn around (0,0). o: {covered, locked, count, sel, fill (0..1 jam level), z, showZ, pulse}
export function bottleSVG(c, o = {}) {
  const hex = colorHex(c);
  let s = `<rect class="hit" x="-24" y="-28" width="48" height="56" rx="10"/>`;
  s += `<ellipse cx="0" cy="25" rx="17" ry="4" fill="rgba(0,0,0,.18)"/>`;
  s += `<rect x="-18" y="-22" width="36" height="46" rx="8" fill="${hex}"/>`;
  s += `<rect x="-18" y="-22" width="36" height="46" rx="8" fill="url(#canShade)"/>`;
  if (o.fill !== undefined) s += `<rect class="jam" x="-14" y="-14" width="28" height="34" rx="5" fill="#fff" opacity=".9"/><rect class="jamfill" x="-14" y="-14" width="28" height="34" rx="5" fill="${hex}" style="--fill-ms:${o.fillMs || 700}ms"/>`;
  else s += `<rect x="-11" y="-9" width="22" height="20" rx="4" fill="rgba(255,255,255,.88)"/><circle cx="0" cy="1" r="5.5" fill="${hex}"/>`;
  s += `<ellipse cx="0" cy="-22" rx="17" ry="5" fill="${hex}" stroke="rgba(0,0,0,.25)" stroke-width="1.5"/><ellipse cx="0" cy="-22" rx="10" ry="2.6" fill="rgba(255,255,255,.55)"/>`;
  if (o.locked) {
    s += `<rect x="-18" y="-22" width="36" height="46" rx="8" fill="rgba(24,32,58,.72)"/>` + padlock(0, 2, 1.05);
    if (o.count !== undefined) s += `<g class="cnt"><circle cx="16" cy="-20" r="10"/><text x="16" y="-19">${o.count}</text></g>`;
  }
  if (o.covered) s += `<rect class="shade" x="-19" y="-28" width="38" height="53" rx="9"/>`;
  if (o.sel) s += `<rect class="selr" x="-23" y="-30" width="46" height="58" rx="11"/>`;
  if (o.showZ) s += `<g class="zl"><rect x="-23" y="14" width="16" height="13" rx="4"/><text x="-15" y="21">${o.z}</text></g>`;
  return s;
}

// Board position (center) of bottle i in design.
export const boardXY = (L, b) => ({x: L.bx(b.x), y: L.by(b.y, b.z), rot: b.rot || 0});
export const btTransform = p => `translate(${p.x} ${p.y}) rotate(${p.rot || 0}) scale(${BK})`;
export const btStyle = p => `translate(${p.x}px, ${p.y}px) rotate(${p.rot || 0}deg) scale(${BK * (p.gone === 'removed' ? .2 : 1)})`;
// Where bottle i is in the play test.
export function playXY(L, lv, s, i) {
  const st = s.st[i];
  if (st === 1) { const k = s.tray.indexOf(i); return {x: L.slotX(k), y: L.trayY, z: 900, rot: 0}; }
  if (st === 2) { const t = s.spots.indexOf(i); return {x: L.tx(t), y: L.spotY + 2, z: 950, rot: 0}; }
  const p = boardXY(L, lv.bottles[i]);
  if (st === 3) return {x: p.x, y: -80, z: 990, rot: 0, gone: 'done'};
  if (st === 4) return {...p, z: 980, gone: 'removed'};
  return {...p, z: lv.bottles[i].z};
}
export const DEFS = `<defs><linearGradient id="canShade" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity=".28"/><stop offset=".35" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".18"/></linearGradient></defs>`;
export {esc};
