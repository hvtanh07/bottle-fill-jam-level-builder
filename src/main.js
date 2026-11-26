import './style.css';
import ORIGINAL from './data/levels.json';
import {PALETTE, colorHex, colorName, DIFFICULTY, MAX_TRAY, normalize, blankLevel, serialize, serializeFile, compact, parseLevels, check, statusOf, tally, overlaps, autoZ, rng, shuffleArr} from './format.js';
import {ST, newGame, clone as cloneGame, tap, completeFill, settle, outcome, isFree, tappable, destination, extraTray, shuffle as shuffleBooster, removeBooster, revive, botChoice, estimate, solve, fewestSlots, generate, pilePositions, buildSets} from './engine.js';
import {layout, viewBox, drawStatic, bottleSVG, boardXY, playXY, btTransform, btStyle, DEFS, CELL} from './render.js';
import {shapeBottles} from './shapes.js';

const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const NS = 'http://www.w3.org/2000/svg';
const STORE = 'bottleFillJamLevelBuilder.v1';
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const clone = o => JSON.parse(JSON.stringify(o));
const PRAISE = ['Great!', 'Excellent!', 'Amazing!', 'Sweet!'];

/* ---------- state ---------- */
const ORIG_LEVELS = (ORIGINAL.levels || []).map(normalize);
let levels = [], cur = 0;
let tab = 'level', mode = 'edit', tool = 'select';
let sel = {bottles: new Set(), set: null, tube: null};
let undo = [], redo = [], lastSnap = '';
let prefs = {color: 1, showZ: false, grid: true, lockCount: 3, fast: false, snap: 0.25, shape: {kind: 'arc', n: 10, orient: 'along', order: 'end', bend: 180, turns: 1.5, colors: 'current', mixed: 4}, stack: {n: 6, step: 0.3}};
let genOpt = {colors: 4, perColor: 4, tubes: 2, shape: 'pyramid', cols: 4, rows: 3, traySlots: 1, hidden: 0, locked: 0, lockCount: 3, pair: false, pairCount: 3, minRate: 0, maxRate: 100, seed: 1};
const L = () => levels[cur];
const hash = t => { let h = 0; for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0; return String(h >>> 0); };
const BASE = hash(JSON.stringify(ORIGINAL));
let savedBase = BASE;

function load() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(STORE) || 'null'); } catch (e) {}
  if (saved && Array.isArray(saved.levels) && saved.levels.length) { levels = saved.levels.map(normalize); cur = Math.min(saved.cur | 0, levels.length - 1); savedBase = saved.base || ''; }
  else { levels = clone(ORIG_LEVELS); cur = 0; }
  if (!levels.length) levels = [blankLevel('level_001')];
  const d = clone(prefs);
  try { Object.assign(prefs, JSON.parse(localStorage.getItem(STORE + '.prefs') || '{}')); } catch (e) {}
  prefs.shape = {...d.shape, ...(prefs.shape || {})}; prefs.stack = {...d.stack, ...(prefs.stack || {})};
  try { Object.assign(genOpt, JSON.parse(localStorage.getItem(STORE + '.gen') || '{}')); } catch (e) {}
}
const STALE = 'The built-in levels changed since you last saved here. Press Reset to built-in levels to load them (export first to keep your edits).';
function persist() {
  try { localStorage.setItem(STORE, JSON.stringify({levels, cur, base: savedBase})); $('#saveNote').textContent = savedBase === BASE ? 'Changes are saved in this browser.' : STALE; }
  catch (e) { $('#saveNote').textContent = 'This browser is not saving changes. Export before you close the page.'; }
}
const savePrefs = () => { try { localStorage.setItem(STORE + '.prefs', JSON.stringify(prefs)); localStorage.setItem(STORE + '.gen', JSON.stringify(genOpt)); } catch (e) {} };
const origById = id => ORIG_LEVELS.find(o => o.id === id);
const isChanged = lv => { const o = origById(lv.id); return !o || serialize(o) !== serialize(lv); };

/* ---------- history ---------- */
function resetHistory() { undo = []; redo = []; lastSnap = JSON.stringify(L()); syncUndo(); }
function commit() {
  const s = JSON.stringify(L()); if (s === lastSnap) return;
  undo.push(lastSnap); if (undo.length > 200) undo.shift(); redo = []; lastSnap = s; persist(); syncUndo(); refreshList(); refreshChecks();
}
function doUndo() { if (!undo.length) return; redo.push(lastSnap); lastSnap = undo.pop(); levels[cur] = JSON.parse(lastSnap); afterHistory(); }
function doRedo() { if (!redo.length) return; undo.push(lastSnap); lastSnap = redo.pop(); levels[cur] = JSON.parse(lastSnap); afterHistory(); }
function afterHistory() { clearSel(); persist(); syncUndo(); renderAll(); }
function syncUndo() { $('#tUndo').disabled = !undo.length; $('#tRedo').disabled = !redo.length; }
function clearSel() { sel = {bottles: new Set(), set: null, tube: null}; }
function edit(fn, keepPane) { fn(L()); commit(); renderStage(); if (!keepPane) renderPane(); }

/* ---------- level list ---------- */
let listStatus = [];
const refreshAllStatus = () => { listStatus = levels.map(lv => statusOf(check(lv))); };
function elems(lv) { const t = tally(lv), e = []; if (t.hidden) e.push('hidden'); if (t.locked) e.push('lock'); if (t.pairs) e.push('blocked'); return e; }
function refreshList() {
  listStatus[cur] = statusOf(check(L()));
  const q = $('#lvSearch').value.trim().toLowerCase();
  $('#lvList').innerHTML = levels.map((lv, i) => {
    const el = elems(lv);
    if (q && !(lv.id.toLowerCase().includes(q) || String(i + 1) === q || el.some(e => e.startsWith(q)) || DIFFICULTY[lv.difficulty].toLowerCase().startsWith(q))) return '';
    const st = listStatus[i] || 'ok', ch = isChanged(lv), t = tally(lv);
    const d = lv.difficulty ? ` · <b class="hard">${DIFFICULTY[lv.difficulty]}</b>` : '';
    return `<li><button type="button" class="lv" data-i="${i}" aria-current="${i === cur}"><span class="n">${i + 1}</span><span><span class="t">${esc(lv.id)}${ch ? ' <i class="sr">changed</i>' : ''}</span><span class="m">${ch ? '<i>● </i>' : ''}${lv.tubes.length} tube${lv.tubes.length === 1 ? '' : 's'} · ${t.nBottles} bottles · ${t.colors.length} colors${d}${el.length ? ' · ' + el.join(', ') : ''}</span></span><span class="dot ${st}" title="${st === 'ok' ? 'No problems' : st === 'warn' ? 'Has warnings' : 'Has errors'}"></span></button></li>`;
  }).join('');
  const a = $('#lvList [aria-current="true"]'); if (a) a.scrollIntoView({block: 'nearest'});
}
function selectLevel(i) {
  if (i < 0 || i >= levels.length) return;
  if (mode === 'play') setMode('edit');
  cur = i; clearSel(); resetHistory(); persist(); renderAll();
}
$('#lvList').addEventListener('click', e => { const b = e.target.closest('.lv'); if (b) selectLevel(+b.dataset.i); });
$('#lvSearch').addEventListener('input', refreshList);
function uniqueId(base) { let n = base, k = 2; while (levels.some(l => l.id === n)) n = `${base}_${k++}`; return n; }
function nextLevelId() { const n = Math.max(0, ...levels.map(l => +((/(\d+)$/.exec(l.id) || [0, 0])[1]))) + 1; return uniqueId('level_' + String(n).padStart(3, '0')); }
$('#lvNew').addEventListener('click', () => { const lv = blankLevel(nextLevelId()); levels.splice(cur + 1, 0, lv); refreshAllStatus(); selectLevel(cur + 1); tool = 'bottle'; syncTools(); toast(`Made ${lv.id}. Add bottles, then tubes.`); });
$('#lvDup').addEventListener('click', () => { const c = clone(L()); c.id = uniqueId(L().id + '_copy'); levels.splice(cur + 1, 0, c); refreshAllStatus(); selectLevel(cur + 1); toast(`Made ${c.id}.`); });
$('#lvUp').addEventListener('click', () => { if (cur < 1) return; [levels[cur - 1], levels[cur]] = [levels[cur], levels[cur - 1]]; cur--; refreshAllStatus(); persist(); refreshList(); });
$('#lvDown').addEventListener('click', () => { if (cur >= levels.length - 1) return; [levels[cur + 1], levels[cur]] = [levels[cur], levels[cur + 1]]; cur++; refreshAllStatus(); persist(); refreshList(); });
function arm(btn, label, fn) {
  if (btn.classList.contains('armed')) { btn.classList.remove('armed'); btn.textContent = btn.dataset.label; fn(); return; }
  btn.dataset.label = btn.textContent; btn.classList.add('armed'); btn.textContent = label;
  setTimeout(() => { if (btn.classList.contains('armed')) { btn.classList.remove('armed'); btn.textContent = btn.dataset.label; } }, 3500);
}
$('#lvDel').addEventListener('click', e => arm(e.currentTarget, 'Confirm delete', () => {
  if (levels.length <= 1) { toast('Keep at least one level.'); return; }
  const n = L().id; levels.splice(cur, 1); cur = Math.min(cur, levels.length - 1); refreshAllStatus(); persist(); selectLevel(cur); toast(`Deleted ${n}.`);
}));
$('#btnReset').addEventListener('click', e => arm(e.currentTarget, 'Confirm reset', () => {
  levels = clone(ORIG_LEVELS); cur = 0; savedBase = BASE; refreshAllStatus(); persist(); selectLevel(0); toast(`Back to the built-in levels: ${levels.length}.`);
}));

/* ---------- palette and tools ---------- */
function renderPalette() {
  $('#palette').innerHTML = PALETTE.map(p => `<button type="button" class="pal" data-c="${p.n}" style="background:${p.hex}" aria-pressed="${prefs.color === p.n}" title="${p.name} (${p.n})">${p.n}</button>`).join('');
}
$('#palette').addEventListener('click', e => { const b = e.target.closest('.pal'); if (b) setColor(+b.dataset.c, true); });
function setColor(c, apply) {
  prefs.color = c; savePrefs(); renderPalette();
  if (!apply || mode !== 'edit') return;
  if (sel.bottles.size) edit(lv => sel.bottles.forEach(i => { lv.bottles[i].color = c; }));
  else if (sel.set) edit(lv => { lv.tubes[sel.set.t].sets[sel.set.k] = c; });
}
const HINTS = {
  select: 'Click a bottle or jam set to select it. Drag bottles to move them (they stack where you drop them). Drag on empty board to box-select.',
  bottle: 'Click the board to add a bottle in the current color. Click a bottle to stack a new one on top of it.',
  paint: 'Click a bottle or jam set to give it the current color.',
  erase: 'Click a bottle or jam set to delete it.',
  lock: 'Click a bottle to make it a Locked Bottle (counter set in the Bottles tab) or to unlock it.',
  hidden: 'Click a jam set to make it Hidden Jam, or to show it again.',
  shape: 'Drag on the board: line and arc go from press to release; circle and spiral are centered on the press. Pick the shape and count in the toolbar.',
  stack: 'Click to add a deep column (front bottle on top, the rest behind). Drag to set which way it goes back.'
};
function syncTools() {
  $$('#tools [data-tool]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tool === tool)));
  $('#toolHint').textContent = mode === 'edit' ? HINTS[tool] : '';
  $('#tZ').setAttribute('aria-pressed', String(prefs.showZ)); $('#tGrid').setAttribute('aria-pressed', String(prefs.grid));
  $('#pFast').setAttribute('aria-pressed', String(prefs.fast));
  $('#snapSel').value = String(prefs.snap);
  renderShapeOpts();
}
function renderShapeOpts() {
  const el = $('#shapeOpts'), sh = prefs.shape, st = prefs.stack;
  if (mode !== 'edit' || (tool !== 'shape' && tool !== 'stack')) { el.hidden = true; return; }
  el.hidden = false;
  const sel = (k, v, opts) => `<select data-so="${k}">${opts.map(([a, b]) => `<option value="${a}"${String(v) === String(a) ? ' selected' : ''}>${b}</option>`).join('')}</select>`;
  const n = (k, v, min, max, step = 1, w = 52) => `<input type="number" data-so="${k}" value="${v}" min="${min}" max="${max}" step="${step}" style="width:${w}px">`;
  el.innerHTML = tool === 'stack'
    ? `<span class="hint">Bottles</span>${n('stack.n', st.n, 2, 30)}<span class="hint">Step back</span>${n('stack.step', st.step, .1, .9, .05, 60)}`
    : `${sel('shape.kind', sh.kind, [['line', 'Line'], ['arc', 'Arc'], ['circle', 'Circle'], ['spiral', 'Spiral']])}<span class="hint">Bottles</span>${n('shape.n', sh.n, 1, 80)}
       ${sel('shape.orient', sh.orient, [['upright', 'Upright'], ['along', 'Along the path'], ['across', 'Across the path']])}
       ${sel('shape.order', sh.order, [['end', 'Chain: last on top'], ['start', 'Chain: first on top'], ['flat', 'Flat (no chain)']])}
       ${sh.kind === 'arc' ? `<span class="hint">Bend°</span>${n('shape.bend', sh.bend, 10, 350, 10, 60)}` : ''}${sh.kind === 'spiral' ? `<span class="hint">Turns</span>${n('shape.turns', sh.turns, .5, 5, .25, 56)}` : ''}
       ${sel('shape.colors', sh.colors, [['current', 'Current color'], ['mixed', 'Mixed colors']])}${sh.colors === 'mixed' ? `<span class="hint">1–</span>${n('shape.mixed', sh.mixed, 1, 8, 1, 44)}` : ''}`;
}
$('#shapeOpts').addEventListener('change', e => {
  const k = e.target.dataset.so; if (!k) return;
  const [g, f] = k.split('.'), v = e.target.tagName === 'SELECT' && isNaN(+e.target.value) ? e.target.value : +e.target.value;
  prefs[g][f] = v; savePrefs(); renderShapeOpts();
});
$('#snapSel').addEventListener('change', e => { prefs.snap = +e.target.value; savePrefs(); });
$('#tools').addEventListener('click', e => { const b = e.target.closest('[data-tool]'); if (b) { tool = b.dataset.tool; syncTools(); } });
$('#tZ').addEventListener('click', () => { prefs.showZ = !prefs.showZ; savePrefs(); syncTools(); renderStage(); });
$('#tGrid').addEventListener('click', () => { prefs.grid = !prefs.grid; savePrefs(); syncTools(); renderStage(); });
$('#tUndo').addEventListener('click', doUndo); $('#tRedo').addEventListener('click', doRedo);
$('#tCopy').addEventListener('click', () => copyText(serialize(L()), 'Copied the level JSON.'));

/* ---------- rendering ---------- */
const svg = $('#view');
let LAY = null;
function renderAll() {
  $('#lvTitle').textContent = L().id;
  refreshList(); syncTools(); renderPalette(); renderStage(); renderPane(); refreshChecks();
}
function renderStage() { if (mode === 'edit') renderEdit(); else renderPlay(); }
function renderEdit() {
  const lv = L(); LAY = layout(lv, null);
  svg.setAttribute('viewBox', viewBox(LAY)); svg.classList.remove('play');
  $('#static').innerHTML = DEFS + drawStatic(lv, null, LAY, {selSet: sel.set, selTube: sel.tube, labels: true, grid: prefs.grid});
  const cov = lv.bottles.map((b, i) => lv.bottles.some((o, j) => j !== i && o.z > b.z && overlaps(o, b)));
  const order = lv.bottles.map((b, i) => i).sort((a, b) => lv.bottles[a].z - lv.bottles[b].z || lv.bottles[a].y - lv.bottles[b].y || lv.bottles[a].x - lv.bottles[b].x);
  $('#bottles').innerHTML = order.map(i => {
    const b = lv.bottles[i], p = boardXY(LAY, b);
    return `<g class="bt" data-b="${i}" transform="${btTransform(p)}">${bottleSVG(b.color, {covered: cov[i], locked: b.lock > 0, count: b.lock > 0 ? b.lock : undefined, sel: sel.bottles.has(i), z: b.z, showZ: prefs.showZ})}</g>`;
  }).join('');
  $('#ui').innerHTML = '';
}

/* ---------- design: pointer ---------- */
function svgPt(e) { const p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; return p.matrixTransform(svg.getScreenCTM().inverse()); }
const snapH = v => prefs.snap > 0 ? Math.round(Math.round(v / prefs.snap) * prefs.snap * 100) / 100 : Math.round(v * 100) / 100;
let drag = null;
svg.addEventListener('pointerdown', e => {
  if (mode !== 'edit' || e.button > 0) return;
  const p = svgPt(e), lv = L();
  const bt = e.target.closest('.bt'), st = e.target.closest('.set'), tb = e.target.closest('.tube');
  const bi = bt ? +bt.dataset.b : -1;
  const setRef = st ? {t: +st.dataset.tube, k: +st.dataset.set} : null;
  if (tool === 'select') {
    if (bi >= 0) {
      if (e.shiftKey) { sel.bottles.has(bi) ? sel.bottles.delete(bi) : sel.bottles.add(bi); sel.set = null; sel.tube = null; renderEdit(); renderPane(); return; }
      if (!sel.bottles.has(bi)) { clearSel(); sel.bottles.add(bi); }
      drag = {kind: 'move', start: p, base: clone(lv), ids: [...sel.bottles], moved: false};
      svg.setPointerCapture(e.pointerId); renderEdit(); if (tab !== 'bottles') { tab = 'bottles'; } renderPane(); return;
    }
    if (setRef) { clearSel(); sel.set = setRef; sel.tube = setRef.t; tab = 'tubes'; renderEdit(); renderPane(); return; }
    if (tb) { clearSel(); sel.tube = +tb.dataset.tube; tab = 'tubes'; renderEdit(); renderPane(); return; }
    clearSel(); drag = {kind: 'marq', start: p, add: e.shiftKey}; svg.setPointerCapture(e.pointerId); renderEdit(); renderPane(); return;
  }
  if (tool === 'bottle') {
    if (setRef || tb) { clearSel(); sel.tube = setRef ? setRef.t : +tb.dataset.tube; sel.set = setRef; tab = 'tubes'; renderEdit(); renderPane(); return; }
    if (p.y < LAY.boardTop - 20) return;
    let x, y;
    if (bi >= 0) { x = lv.bottles[bi].x; y = lv.bottles[bi].y; }
    else { const q = LAY.fromBoard(p.x, p.y, 0); x = snapH(q.x); y = snapH(q.y); }
    const z = autoZ(lv.bottles, x, y);
    edit(l => { l.bottles.push({x, y, z, color: prefs.color, lock: 0}); clearSel(); sel.bottles.add(l.bottles.length - 1); }, tab !== 'bottles' && tab !== 'level' && tab !== 'check');
    return;
  }
  if (tool === 'shape' || tool === 'stack') {
    if (p.y < LAY.boardTop - 20) return;
    const q = LAY.fromBoard(p.x, p.y, 0);
    drag = {kind: 'shape', a: {x: snapH(q.x), y: snapH(q.y)}, b: null};
    drag.b = drag.a; svg.setPointerCapture(e.pointerId); shapePreview(); return;
  }
  if (tool === 'paint') {
    if (bi >= 0) edit(l => { l.bottles[bi].color = prefs.color; });
    else if (setRef) edit(l => { l.tubes[setRef.t].sets[setRef.k] = prefs.color; });
    return;
  }
  if (tool === 'erase') {
    if (bi >= 0) edit(l => { l.bottles.splice(bi, 1); clearSel(); });
    else if (setRef) edit(l => removeSet(l, setRef.t, setRef.k));
    return;
  }
  if (tool === 'lock') { if (bi >= 0) edit(l => { const b = l.bottles[bi]; b.lock = b.lock > 0 ? 0 : prefs.lockCount; clearSel(); sel.bottles.add(bi); }); return; }
  if (tool === 'hidden') { if (setRef) edit(l => toggleHidden(l, setRef.t, setRef.k)); }
});
svg.addEventListener('pointermove', e => {
  if (!drag) return;
  const p = svgPt(e);
  if (drag.kind === 'shape') { const q = LAY.fromBoard(p.x, p.y, 0); drag.b = {x: snapH(q.x), y: snapH(q.y)}; shapePreview(); return; }
  if (drag.kind === 'move') {
    const dx = snapH((p.x - drag.start.x) / CELL), dy = snapH((p.y - drag.start.y) / CELL);
    if (!dx && !dy && !drag.moved) return;
    drag.moved = true;
    const lv = clone(drag.base); drag.ids.forEach(i => { lv.bottles[i].x += dx; lv.bottles[i].y += dy; });
    restack(lv, new Set(drag.ids));
    levels[cur] = lv; renderEdit();
  } else {
    const x = Math.min(p.x, drag.start.x), y = Math.min(p.y, drag.start.y), w = Math.abs(p.x - drag.start.x), h = Math.abs(p.y - drag.start.y);
    drag.rect = {x, y, w, h};
    $('#ui').innerHTML = `<rect class="marq" x="${x}" y="${y}" width="${w}" height="${h}"/>`;
  }
});
function endDrag() {
  if (!drag) return;
  if (drag.kind === 'move' && drag.moved) { commit(); renderPane(); }
  if (drag.kind === 'shape') {
    const got = shapeNow();
    $('#ui').innerHTML = '';
    if (got.length) edit(l => { const n0 = l.bottles.length; l.bottles.push(...got); clearSel(); got.forEach((_, k) => sel.bottles.add(n0 + k)); });
  }
  if (drag.kind === 'marq' && drag.rect) {
    const r = drag.rect;
    L().bottles.forEach((b, i) => { const q = boardXY(LAY, b); if (q.x >= r.x && q.x <= r.x + r.w && q.y >= r.y && q.y <= r.y + r.h) sel.bottles.add(i); });
    $('#ui').innerHTML = ''; if (sel.bottles.size) tab = 'bottles'; renderEdit(); renderPane();
  }
  drag = null;
}
svg.addEventListener('pointerup', endDrag); svg.addEventListener('pointercancel', endDrag);

function shapeNow() {
  if (!drag || drag.kind !== 'shape') return [];
  const lv = L(), sh = prefs.shape;
  const got = tool === 'stack' ? shapeBottles('stack', drag.a, drag.b, prefs.stack, lv.bottles) : shapeBottles(sh.kind, drag.a, drag.b, sh, lv.bottles);
  const r = rng(hash(JSON.stringify(drag.a) + JSON.stringify(drag.b)) | 0);
  return got.map(b => ({...b, color: tool === 'shape' && sh.colors === 'mixed' ? 1 + Math.floor(r() * Math.max(1, Math.min(8, sh.mixed))) : prefs.color, lock: 0}));
}
function shapePreview() {
  const got = shapeNow();
  $('#ui').innerHTML = `<g class="ghost">${got.slice().sort((a, b) => a.z - b.z).map(b => `<g transform="${btTransform(boardXY(LAY, b))}">${bottleSVG(b.color, {})}</g>`).join('')}</g>`;
}
// Moved bottles keep their layers relative to each other and sit on top of whatever is under them.
function restack(lv, moved) {
  const ids = [...moved]; if (!ids.length) return;
  const zmin = Math.min(...ids.map(i => lv.bottles[i].z));
  const others = lv.bottles.map((b, i) => moved.has(i) ? null : b);
  let base = 0;
  ids.forEach(i => { const b = lv.bottles[i]; let z = -1; others.forEach(o => { if (o && overlaps(o, b)) z = Math.max(z, o.z); }); base = Math.max(base, z + 1 - (b.z - zmin)); });
  ids.forEach(i => { lv.bottles[i].z = lv.bottles[i].z - zmin + base; });
}
// Every bottle drops onto what is under it (bottom layers first).
function settleLayers(lv) {
  const order = lv.bottles.map((b, i) => i).sort((a, b) => lv.bottles[a].z - lv.bottles[b].z);
  const placed = [];
  order.forEach(i => { const b = lv.bottles[i]; let z = -1; placed.forEach(o => { if (overlaps(o, b)) z = Math.max(z, o.z); }); b.z = z + 1; placed.push(b); });
}
function removeSet(lv, t, k) {
  const tb = lv.tubes[t]; tb.sets.splice(k, 1);
  tb.hidden = tb.hidden.filter(h => h !== k).map(h => h > k ? h - 1 : h);
  sel.set = null;
}
function toggleHidden(lv, t, k) { const tb = lv.tubes[t]; tb.hidden = tb.hidden.includes(k) ? tb.hidden.filter(h => h !== k) : [...tb.hidden, k].sort((a, b) => a - b); }
function moveSet(lv, t, k, d) {
  const tb = lv.tubes[t], j = k + d; if (j < 0 || j >= tb.sets.length) return false;
  [tb.sets[k], tb.sets[j]] = [tb.sets[j], tb.sets[k]];
  const hk = tb.hidden.includes(k), hj = tb.hidden.includes(j);
  tb.hidden = tb.hidden.filter(h => h !== k && h !== j); if (hk) tb.hidden.push(j); if (hj) tb.hidden.push(k); tb.hidden.sort((a, b) => a - b);
  return true;
}

/* ---------- play test ---------- */
let game = null, ghist = [], timers = {}, autoT = null, autoQueue = null, ended = false;
const FILL = () => prefs.fast ? 220 : 700;
function setMode(m) {
  mode = m;
  $('#modeEdit').setAttribute('aria-pressed', String(m === 'edit')); $('#modePlay').setAttribute('aria-pressed', String(m === 'play'));
  $$('[data-edit]').forEach(el => { el.hidden = m !== 'edit'; }); $$('[data-play]').forEach(el => { el.hidden = m !== 'play'; });
  stopAuto(); clearTimers();
  if (m === 'play') startGame(); else { game = null; $('#banner').hidden = true; }
  syncTools(); renderStage();
}
$('#modeEdit').addEventListener('click', () => setMode('edit'));
$('#modePlay').addEventListener('click', () => setMode('play'));
function clearTimers() { Object.values(timers).forEach(clearTimeout); timers = {}; }
function startGame() {
  clearTimers(); stopAuto();
  game = newGame(L(), Math.floor(Math.random() * 1e9)); ghist = []; ended = false;
  $('#bottles').innerHTML = ''; $('#banner').hidden = true;
}
function scheduleFills() {
  game.spots.forEach((b, t) => {
    if (b < 0 || timers[t]) return;
    timers[t] = setTimeout(() => {
      delete timers[t];
      if (!game) return;
      completeFill(game, t);
      scheduleFills(); renderPlay(); maybeEnd();
    }, FILL() + 260);
  });
}
function renderPlay() {
  const lv = L(), s = game; LAY = layout(lv, s);
  svg.setAttribute('viewBox', viewBox(LAY)); svg.classList.add('play');
  $('#static').innerHTML = DEFS + drawStatic(lv, s, LAY, {});
  const host = $('#bottles');
  if (host.childElementCount !== lv.bottles.length) {
    host.innerHTML = '';
    lv.bottles.map((b, i) => i).sort((a, b) => lv.bottles[a].z - lv.bottles[b].z || lv.bottles[a].y - lv.bottles[b].y).forEach(i => {
      const g = document.createElementNS(NS, 'g'); g.setAttribute('class', 'bt'); g.dataset.b = i; host.appendChild(g);
    });
  }
  host.querySelectorAll('.bt').forEach(g => {
    const i = +g.dataset.b, st = s.st[i], p = playXY(LAY, lv, s, i), free = st === ST.BOARD && isFree(s, i);
    const locked = st === ST.BOARD && s.lock[i] > 0;
    const o = {covered: st === ST.BOARD && !free, locked, count: locked && s.act[i] ? s.lock[i] : undefined};
    if (st === ST.SPOT) { o.fill = 1; o.fillMs = FILL(); }
    const sig = JSON.stringify(o) + st;
    if (g.dataset.sig !== sig) { g.innerHTML = bottleSVG(s.color[i], o); g.dataset.sig = sig; }
    const where = st + ':' + p.x + ':' + p.y;
    if (g.dataset.where !== where) {
      if (g.dataset.where && st !== ST.BOARD) { host.appendChild(g); g.getBoundingClientRect(); }
      g.dataset.where = where;
    }
    g.style.transform = btStyle(p);
    g.classList.toggle('gone', !!p.gone); g.classList.toggle('covered', o.covered || locked);
  });
  const out = outcome(s);
  $('#pStats').innerHTML = `<span>Sent <b>${s.sent}</b></span><span>Tray <b>${s.tray.filter(b => b >= 0).length}/${s.tray.length}</b></span><span>Bottles left <b>${[...s.st].filter(v => v === ST.BOARD || v === ST.TRAY).length}</b></span>${out === 'busy' ? '<span>Pouring…</span>' : ''}`;
  $('#bExtra').disabled = s.tray.length >= MAX_TRAY; $('#bExtraN').textContent = s.used.extra ? '×' + s.used.extra : '';
  $('#bShuffleN').textContent = s.used.shuffle ? '×' + s.used.shuffle : ''; $('#bRemoveN').textContent = s.used.remove ? '×' + s.used.remove : '';
  $('#pUndo').disabled = !ghist.length;
}
function maybeEnd() {
  if (!game || ended) return;
  const o = outcome(game);
  if (o === 'busy' || o === 'playing') { $('#banner').hidden = true; return; }
  ended = true; stopAuto();
  const b = $('#banner'); b.hidden = false;
  const used = Object.entries(game.used).filter(([, v]) => v).map(([k, v]) => `${k} ×${v}`).join(', ');
  if (o === 'won') { b.className = 'banner won'; b.innerHTML = `${PRAISE[Math.floor(Math.random() * PRAISE.length)]} Level complete in ${game.sent} sends${used ? ' (' + used + ')' : ''}. <button class="btn" type="button" data-b="restart">Play again</button>`; }
  else if (o === 'lost') { b.className = 'banner lost'; b.innerHTML = `Tray full, no move left. <button class="btn" type="button" data-b="revive">Revive (removes 3 tray bottles)</button><button class="btn" type="button" data-b="restart">Restart</button>`; flashTray(); }
  else { b.className = 'banner lost'; b.innerHTML = `Stuck: nothing can move (GDD fail-safe case). <button class="btn" type="button" data-b="restart">Restart</button>`; }
}
$('#banner').addEventListener('click', e => {
  const k = e.target.closest('[data-b]'); if (!k) return;
  if (k.dataset.b === 'restart') { startGame(); renderPlay(); }
  if (k.dataset.b === 'revive') { snapshot(); revive(game); ended = false; $('#banner').hidden = true; scheduleFills(); renderPlay(); maybeEnd(); }
});
function flashTray() { $$('#view .slot:not(.off)').forEach(r => { r.classList.add('flash'); setTimeout(() => r.classList.remove('flash'), 450); }); }
function snapshot() { ghist.push(cloneGame(game)); if (ghist.length > 300) ghist.shift(); }
function playTap(i) {
  if (!game || ended) return;
  const r = tap(game, i);
  if (!r.ok) {
    const g = $(`#bottles .bt[data-b="${i}"]`); if (g) { g.classList.remove('shake'); g.getBoundingClientRect(); g.classList.add('shake'); }
    if (r.why === 'tray') { flashTray(); toast('The tray is full and no tube has this color at the bottom.'); }
    else if (r.why === 'locked') toast(game.act[i] ? `Locked: send ${game.lock[i]} more bottle${game.lock[i] === 1 ? '' : 's'} to open it.` : 'Locked: free it first (send the bottles resting on it).');
    return false;
  }
  scheduleFills(); renderPlay(); maybeEnd(); return true;
}
svg.addEventListener('click', e => {
  if (mode !== 'play') return;
  const bt = e.target.closest('.bt'); if (!bt) return;
  const i = +bt.dataset.b; if (game.st[i] !== ST.BOARD) return;
  const before = cloneGame(game);
  if (playTap(i)) { ghist.push(before); renderPlay(); }
});
$('#pRestart').addEventListener('click', () => { startGame(); renderPlay(); });
$('#pUndo').addEventListener('click', playUndo);
function playUndo() { if (!ghist.length) return; stopAuto(); clearTimers(); game = ghist.pop(); settle(game); ended = false; $('#banner').hidden = true; renderPlay(); maybeEnd(); }
$('#pBot').addEventListener('click', botStep);
function botStep() {
  if (!game || ended) return false;
  if (outcome(game) === 'busy') return true;
  let i;
  if (autoQueue && autoQueue.length) i = autoQueue.shift(); else i = botChoice(game);
  if (i < 0 || i === undefined) { maybeEnd(); return false; }
  const before = cloneGame(game); if (playTap(i)) ghist.push(before);
  renderPlay(); return !ended;
}
function stopAuto() { clearInterval(autoT); autoT = null; autoQueue = null; $('#pAuto').setAttribute('aria-pressed', 'false'); }
$('#pAuto').addEventListener('click', () => { if (autoT) { stopAuto(); return; } startAuto(); });
function startAuto(queue) {
  if (ended) { startGame(); renderPlay(); }
  autoQueue = queue || null; $('#pAuto').setAttribute('aria-pressed', 'true');
  autoT = setInterval(() => { if (!botStep()) stopAuto(); }, prefs.fast ? 260 : 520);
}
$('#pFast').addEventListener('click', () => { prefs.fast = !prefs.fast; savePrefs(); syncTools(); });
function booster(fn) {
  if (!game || ended) return;
  if (outcome(game) === 'busy') { toast('Wait for the pours to finish.'); return; }
  snapshot(); const r = fn(game); if (r === false) { ghist.pop(); return; }
  scheduleFills(); renderPlay(); maybeEnd();
}
$('#bExtra').addEventListener('click', () => booster(s => extraTray(s)));
$('#bShuffle').addEventListener('click', () => booster(s => { shuffleBooster(s); }));
$('#bRemove').addEventListener('click', () => booster(s => { const r = removeBooster(s); if (!r.picked.length) return false; }));

/* ---------- inspector ---------- */
$('#tabs').addEventListener('click', e => { const b = e.target.closest('[role=tab]'); if (b) { tab = b.dataset.tab; renderPane(); } });
const fld = (label, html, cls = '') => `<label class="fld ${cls}"><span>${label}</span>${html}</label>`;
const num = (id, v, min, max, step = 1) => `<input type="number" id="${id}" value="${v}" min="${min}" max="${max}" step="${step}">`;
const colorSel = (id, v) => `<select id="${id}">${PALETTE.map(p => `<option value="${p.n}"${p.n === v ? ' selected' : ''}>${p.n} ${p.name}</option>`).join('')}</select>`;
function renderPane() {
  $$('#tabs [role=tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
  const fn = {level: paneLevel, tubes: paneTubes, bottles: paneBottles, gen: paneGen, check: paneCheck, json: paneJson, help: paneHelp}[tab];
  $('#pane').innerHTML = fn();
  if (tab === 'check') runChecks();
}
function paneLevel() {
  const lv = L(), t = tally(lv);
  return `<h2>Level</h2><div class="fields">
    ${fld('Id <code>id</code>', `<input id="fId" value="${esc(lv.id)}">`, 'full')}
    ${fld('Difficulty <code>difficulty</code>', `<select id="fDiff">${DIFFICULTY.map((d, k) => `<option value="${k}"${k === lv.difficulty ? ' selected' : ''}>${d}</option>`).join('')}</select>`)}
    ${fld('Tray slots at start <code>traySlots</code>', num('fTray', lv.traySlots, 1, MAX_TRAY))}
  </div>
  <p class="hint">GDD: the tray starts with 1 slot; each Extra Tray adds 1, up to ${MAX_TRAY}.</p>
  <div class="stat"><div><b>${lv.tubes.length}</b><span>tubes</span></div><div><b>${t.nBottles}</b><span>bottles</span></div><div><b>${t.nSets}</b><span>jam sets</span></div>
  <div><b>${t.colors.length}</b><span>colors</span></div><div><b>${t.layers}</b><span>layers</span></div><div><b>${t.hidden + t.locked + t.pairs}</b><span>elements</span></div></div>
  <h3>Elements</h3>
  <p>Hidden Jam: <b>${t.hidden}</b> · Locked Bottle: <b>${t.locked}</b> · Blocked Jam Tube: <b>${t.pairs}</b></p>
  <p class="hint">Add Hidden Jam and Blocked Jam Tube in the Tubes tab, Locked Bottles with the Lock tool or the Bottles tab.</p>
  <div class="btns"><button class="btn primary" type="button" id="goPlay">Play test this level</button></div>`;
}
function paneTubes() {
  const lv = L();
  const cards = lv.tubes.map((tb, t) => {
    const pi = lv.blockedPairs.findIndex(p => p.tube === t || p.tube + 1 === t);
    const rows = tb.sets.map((c, k) => `<div class="setrow${sel.set && sel.set.t === t && sel.set.k === k ? ' on' : ''}">
      <span class="pc" style="background:${colorHex(c)}"></span>
      <span><select data-setc="${t}:${k}">${PALETTE.map(p => `<option value="${p.n}"${p.n === c ? ' selected' : ''}>${p.n} ${p.name}</option>`).join('')}</select> <span class="k">${k === 0 ? 'bottom' : '#' + (k + 1)}</span></span>
      <label class="chk" title="Hidden Jam"><input type="checkbox" data-seth="${t}:${k}"${tb.hidden.includes(k) ? ' checked' : ''}> ?</label>
      <span><button class="ib" type="button" data-setmv="${t}:${k}:-1" aria-label="Move down (toward the nozzle)">↓</button><button class="ib" type="button" data-setmv="${t}:${k}:1" aria-label="Move up">↑</button><button class="ib" type="button" data-setdel="${t}:${k}" aria-label="Delete set">✕</button></span>
    </div>`).join('');
    return `<div class="tube-card${sel.tube === t ? ' on' : ''}"><header><b>Tube ${t + 1}</b><small class="hint">${tb.sets.length} sets${pi >= 0 ? ' · Blocked pair ' + (pi + 1) : ''}</small>
      <button class="ib" type="button" data-tmv="${t}:-1" aria-label="Move tube left">←</button><button class="ib" type="button" data-tmv="${t}:1" aria-label="Move tube right">→</button><button class="ib" type="button" data-tdel="${t}" aria-label="Delete tube">✕</button></header>
      <p class="hint" style="margin:0 0 4px">Listed from the nozzle (bottom) up.</p>${rows || '<p class="hint">No sets yet.</p>'}
      <div class="btns"><button class="btn" type="button" data-tadd="${t}">+ Set (${colorName(prefs.color)})</button></div></div>`;
  }).join('');
  const pairs = lv.blockedPairs.map((p, k) => `<div class="elem"><b>Blocked Jam Tube ${k + 1}</b><div class="fields">
    ${fld('Left tube', `<select data-pt="${k}">${lv.tubes.slice(0, -1).map((_, t) => `<option value="${t}"${t === p.tube ? ' selected' : ''}>Tubes ${t + 1} + ${t + 2}</option>`).join('')}</select>`)}
    ${fld('Swap every <code>count</code> bottles', `<input type="number" min="1" max="30" value="${p.count}" data-pc="${k}">`)}
    ${fld('Open at the start', `<select data-po="${k}"><option value="0"${p.open === 0 ? ' selected' : ''}>Left tube</option><option value="1"${p.open === 1 ? ' selected' : ''}>Right tube</option></select>`)}
    </div><div class="btns"><button class="btn" type="button" data-pdel="${k}">Delete pair</button></div></div>`).join('');
  return `<h2>Jam tubes</h2>
  <p class="hint">Each set is 4 portions of one color and fills one bottle. Click a set on the machine to select it; keys 1–8 recolor it, <kbd>H</kbd> hides it, <kbd>Delete</kbd> removes it.</p>
  <div class="btns"><button class="btn" type="button" id="tAdd">+ Tube</button><button class="btn" type="button" id="tMix">Mix set order</button></div>
  <div class="elem"><b>Build jam sets from the bottles</b>
    <div class="fields">${fld('Tubes', num('sbTubes', Math.max(1, lv.tubes.length), 1, 6))}${fld('Mix %', num('sbMix', prefs.sbMix ?? 30, 0, 100, 5))}</div>
    <div class="btns"><button class="btn primary" type="button" id="tSolvable">Build solvable sets</button><button class="btn" type="button" id="tBuild">Random sets</button></div>
    <p class="hint">Solvable: deals one set per bottle in an order the pile can be cleared in, mixes it by Mix %, and keeps the most mixed order the solver wins with ${lv.traySlots} tray slot${lv.traySlots === 1 ? '' : 's'}. Random: one set per bottle in any order. Both keep Hidden Jam positions where they still exist.</p>
    <div class="msg" id="sbMsg"></div></div>
  ${cards}
  <h3>Blocked Jam Tube</h3>
  <p class="hint">Two side-by-side tubes take turns: one open, one closed. The counter counts every bottle sent from the board; at 0 they swap. When one tube is empty the other stays open.</p>
  ${pairs}
  <div class="btns"><button class="btn" type="button" id="pAdd"${lv.tubes.length < 2 ? ' disabled' : ''}>+ Blocked pair</button></div>`;
}
function paneBottles() {
  const lv = L(), ids = [...sel.bottles].filter(i => lv.bottles[i]), t = tally(lv);
  let top = '<p class="hint">Click a bottle to edit it. Shift-click or box-select for several.</p>';
  if (ids.length === 1) {
    const i = ids[0], b = lv.bottles[i];
    top = `<h3>Bottle ${i + 1}</h3><div class="fields">
      ${fld('x', num('bX', b.x, -20, 40, .5))}${fld('y', num('bY', b.y, -20, 40, .5))}
      ${fld('Cover order <code>z</code>', num('bZ', b.z, 0, 999))}${fld('Turn <code>rot</code> (°)', num('bR', b.rot, -360, 360, 5))}${fld('Color', colorSel('bC', b.color))}
      ${fld('Locked Bottle counter <code>lock</code> (0 = normal)', num('bL', b.lock, 0, 99), 'full')}</div>`;
  } else if (ids.length > 1) {
    top = `<h3>${ids.length} bottles selected</h3><div class="fields">${fld('Color', colorSel('bC', lv.bottles[ids[0]].color))}${fld('Lock counter', num('bL', lv.bottles[ids[0]].lock, 0, 99))}${fld('Turn each (°)', num('bR', lv.bottles[ids[0]].rot, -360, 360, 5))}</div>`;
  }
  const rows = t.colors.map(c => { const b = t.bottles[c] || 0, s = t.sets[c] || 0; return `<tr><td><span class="pc" style="display:inline-block;width:12px;height:12px;border-radius:3px;background:${colorHex(c)};vertical-align:-1px"></span> ${colorName(c)}</td><td>${b}</td><td>${s}</td><td class="${b !== s ? 'x' : ''}">${b === s ? '✓' : (b - s > 0 ? '+' : '') + (b - s)}</td></tr>`; }).join('');
  return `<h2>Bottles</h2>${top}
  ${ids.length ? `<div class="btns"><button class="btn" type="button" id="bDel">Delete</button><button class="btn" type="button" id="bDup">Duplicate <kbd>Ctrl D</kbd></button><button class="btn" type="button" id="bUpL">Order up <kbd>]</kbd></button><button class="btn" type="button" id="bDnL">Order down <kbd>[</kbd></button>
    <button class="btn" type="button" id="bRotL">Turn −15° <kbd>Q</kbd></button><button class="btn" type="button" id="bRotR">Turn +15° <kbd>E</kbd></button>${ids.length > 1 ? `<button class="btn" type="button" id="bGrpL">Turn group −15° <kbd>Shift Q</kbd></button><button class="btn" type="button" id="bGrpR">Turn group +15° <kbd>Shift E</kbd></button><button class="btn" type="button" id="bMirSel">Mirror group</button><button class="btn" type="button" id="bChain">Make a chain (by order picked)</button>` : ''}</div>` : ''}
  <h3>Default lock counter</h3><div class="fields">${fld('New Locked Bottles start at', num('bDefLock', prefs.lockCount, 1, 99))}</div>
  <h3>Bottles and jam per color</h3>
  <table class="tally"><tr><th>Color</th><th>Bottles</th><th>Sets</th><th></th></tr>${rows || '<tr><td colspan="4" class="hint">No bottles yet.</td></tr>'}</table>
  <h3>Pile</h3>
  <div class="btns"><button class="btn" type="button" id="bSettle">Settle layers</button><button class="btn" type="button" id="bCenter">Move to top left</button><button class="btn" type="button" id="bMirror">Mirror left–right</button><button class="btn" type="button" id="bClear">Clear board</button></div>
  <p class="hint">Settle layers drops every bottle onto whatever is under it. A bottle on a higher layer that overlaps a lower one rests on it; only bottles with nothing on them can be tapped.</p>`;
}
function paneGen() {
  const g = genOpt;
  return `<h2>Generate</h2><p class="hint">Makes a random pile and jam order, then keeps it only if the solver can win it with the tray slots below. Replaces the bottles and tubes of this level (Undo brings them back).</p>
  <div class="fields">
    ${fld('Colors', num('gColors', g.colors, 1, 8))}${fld('Bottles per color', num('gPer', g.perColor, 1, 12))}
    ${fld('Tubes', num('gTubes', g.tubes, 1, 6))}${fld('Tray slots', num('gTray', g.traySlots, 1, MAX_TRAY))}
    ${fld('Pile shape', `<select id="gShape"><option value="pyramid"${g.shape === 'pyramid' ? ' selected' : ''}>Pyramid (half-offset layers)</option><option value="stack"${g.shape === 'stack' ? ' selected' : ''}>Stacks (layers right on top)</option><option value="rows"${g.shape === 'rows' ? ' selected' : ''}>One layer</option></select>`, 'full')}
    ${fld('Base columns', num('gCols', g.cols, 1, 10))}${fld('Base rows', num('gRows', g.rows, 1, 10))}
    ${fld('Hidden Jam sets', num('gHidden', g.hidden, 0, 30))}${fld('Locked Bottles', num('gLocked', g.locked, 0, 10))}
    ${fld('Lock counter', num('gLockN', g.lockCount, 1, 20))}${fld('Seed', num('gSeed', g.seed, 1, 999999999))}
    <label class="chk full"><input type="checkbox" id="gPair"${g.pair ? ' checked' : ''}> Blocked Jam Tube on tubes 1 + 2, swap every <input type="number" id="gPairN" value="${g.pairCount}" min="1" max="20" style="width:56px"> bottles</label>
    ${fld('Greedy bot win rate from %', num('gMin', g.minRate, 0, 100))}${fld('to %', num('gMax', g.maxRate, 0, 100))}
  </div>
  <p class="hint" id="gInfo">${g.colors * g.perColor} bottles. The pile holds ${pilePositions(g.shape, g.cols, g.rows, 999).length}.</p>
  <div class="btns"><button class="btn" type="button" id="gAuto">Fit pile to bottle count</button><button class="btn primary" type="button" id="gGo">Generate</button><button class="btn" type="button" id="gNext">New seed + generate</button></div>
  <div class="msg" id="gMsg"></div>`;
}
let checkCache = {key: '', html: ''};
function paneCheck() {
  const issues = check(L());
  const list = issues.length ? issues.map(i => `<li class="${i.level}"${i.ref && i.ref.bottle !== undefined ? ` data-bottle="${i.ref.bottle}"` : ''}${i.ref && i.ref.tube !== undefined ? ` data-tube="${i.ref.tube}"` : ''}>${esc(i.text)}</li>`).join('') : '<li class="ok">No format problems.</li>';
  return `<h2>Check</h2><ul class="issues">${list}</ul>
  <h3>Solver</h3><div id="solveOut"><p class="hint">Working…</p></div>
  <h3>Bot estimate</h3><div id="estOut"><p class="hint">Working…</p></div>
  <div class="btns"><button class="btn" type="button" id="cSlots">Find fewest tray slots</button><button class="btn" type="button" id="cRun">Run again (500 games)</button></div>
  <p class="hint">The solver tries every tap order without boosters, letting each pour finish before the next tap, and it knows the Hidden Jam colors. The greedy bot sends a bottle that fills when it can, else the one whose jam is nearest a nozzle. The random player taps any bottle that can go. Neither uses boosters.</p>`;
}
function runChecks(big) {
  const lv = L(), key = serialize(lv) + (big ? 'B' : '');
  if (checkCache.key === key) { $('#solveOut').innerHTML = checkCache.solve; $('#estOut').innerHTML = checkCache.est; return; }
  setTimeout(() => {
    if (tab !== 'check') return;
    const bad = check(lv).some(i => i.level === 'bad');
    let sHtml, eHtml;
    if (bad) { sHtml = '<p class="hint">Fix the errors above first.</p>'; eHtml = sHtml; }
    else {
      const r = solve(lv, {limit: 80000});
      sHtml = r.result === 'win' ? `<ul class="issues"><li class="ok"><b>Solvable</b> with ${lv.traySlots} tray slot${lv.traySlots === 1 ? '' : 's'}, no boosters (${r.moves.length} taps, ${r.nodes.toLocaleString()} states searched).</li></ul><div class="btns"><button class="btn" type="button" id="cShow">Play the solution</button></div>`
        : r.result === 'none' ? `<ul class="issues"><li class="bad"><b>Not solvable</b> with ${lv.traySlots} tray slot${lv.traySlots === 1 ? '' : 's'} and no boosters. Players will need Extra Tray, Shuffle or Remove.</li></ul>`
        : `<ul class="issues"><li class="warn"><b>Unknown</b>: the search stopped after ${r.nodes.toLocaleString()} states.</li></ul>`;
      if (r.result === 'win') solution = r.moves;
      const n = big ? 500 : 200, g = estimate(lv, n, 'greedy', 7), rd = estimate(lv, n, 'random', 7);
      eHtml = `<div class="stat"><div><b>${Math.round(g.rate * 100)}%</b><span>greedy bot wins</span></div><div><b>${Math.round(rd.rate * 100)}%</b><span>random player wins</span></div><div><b>${Math.round(rd.lost / n * 100)}%</b><span>random: tray full</span></div></div><p class="hint">${n} games each. Random player stuck (fail-safe) in ${Math.round(rd.stuck / n * 100)}%.</p>`;
    }
    checkCache = {key, solve: sHtml, est: eHtml};
    if (tab === 'check') { $('#solveOut').innerHTML = sHtml; $('#estOut').innerHTML = eHtml; }
  }, 30);
}
let solution = null;
function paneJson() {
  return `<h2>JSON</h2><textarea class="code" id="jsonText" spellcheck="false">${esc(serialize(L()))}</textarea>
  <div class="btns"><button class="btn primary" type="button" id="jsonApply">Apply</button><button class="btn" type="button" id="jsonCopy">Copy</button><button class="btn" type="button" id="jsonDl">Download</button></div><div class="msg" id="jsonMsg"></div>`;
}
function paneHelp() {
  return `<h2>How it works</h2>
  <p>Rules from the <a href="https://hvtanh07.github.io/gdd-bottle-fill-jam/" target="_blank" rel="noopener">Bottle Fill Jam GDD</a>, sections 1.1 to 1.5.</p>
  <ul>
  <li><b>Pile</b>: each bottle has a position, a turn and a cover order <code>z</code>. It rests on every lower-z bottle its shape overlaps. Use Shape for lines, arcs, circles and spirals (a chain rests each bottle on the one before) and Stack for deep columns. Then Tubes → Build solvable sets.</li>
  <li>Tap a free bottle (nothing rests on it). If an open tube has its color at the bottom and a free fill spot, it goes there (leftmost tube first) and fills with one set of 4 portions. Else it goes to the first free tray slot from the left. Tray full: it shakes and stays.</li>
  <li>A poured set leaves and the column drops one set. Tray bottles go up on their own when their color reaches the bottom of an open tube (leftmost first).</li>
  <li>While a bottle fills, its spot is busy; another bottle of that color goes to the tray.</li>
  <li>Win: every bottle filled, every tube empty. Lose: tray full and no bottle you can tap matches an open tube, checked after every pour has finished. The play test offers Revive (a free Remove of 3 tray bottles with their jam).</li>
  <li><b>Hidden Jam</b>: grey set with “?”, shows its color at the bottom of the tube.</li>
  <li><b>Locked Bottle</b>: cannot be sent. Once nothing rests on it, its counter shows and counts down with every bottle sent from the board (bottles going up from the tray on their own do not count). At 0 it opens.</li>
  <li><b>Blocked Jam Tube</b>: two tubes take turns. The counter counts bottles sent; at 0 they swap (after a fill in progress ends). One tube empty: the other stays open.</li>
  <li><b>Boosters</b>: Extra Tray (+1 slot, up to 5), Shuffle (mixes the jam sets so each open tube gets a color you can send), Remove (3 bottles: top of the pile first, then lower layers, locked last, each with the matching set farthest from a nozzle).</li>
  </ul>
  <h3>Keys</h3><div class="keys">
  <kbd>V B S K P E L H</kbd><span>Select, Bottle, Shape, Stack, Paint, Erase, Lock, Hidden tools</span>
  <kbd>Q</kbd> <kbd>E</kbd><span>Turn selected bottles 15° (Shift: turn the group around its center)</span>
  <kbd>Ctrl D</kbd><span>Duplicate selected bottles</span>
  <kbd>1</kbd>–<kbd>8</kbd><span>Pick a color (and recolor the selection)</span>
  <kbd>Delete</kbd><span>Delete the selected bottles or set</span>
  <kbd>←↑→↓</kbd><span>Move selected bottles one snap step (Shift: one bottle)</span>
  <kbd>[</kbd> <kbd>]</kbd><span>Cover order down / up</span>
  <kbd>Z</kbd> <kbd>G</kbd><span>Show layers / grid</span>
  <kbd>Ctrl Z</kbd> <kbd>Ctrl Y</kbd><span>Undo / redo (in play test: undo move)</span>
  <kbd>Tab</kbd><span>Switch Design / Play test</span>
  <kbd>R</kbd> <kbd>N</kbd><span>Play test: restart, bot move</span>
  </div>
  <h3>Saving</h3><p>Edits are saved in this browser. Use Export to download <code>levels.json</code> or copy rows for a sheet (Id, Level JSON).</p>`;
}
function refreshChecks() {
  const issues = check(L()), st = statusOf(issues), b = $('#chkBadge');
  b.textContent = issues.filter(i => i.level !== 'ok').length; b.className = 'badge ' + (st === 'ok' ? '' : st);
}

// inspector events
$('#pane').addEventListener('change', e => {
  const t = e.target, id = t.id, lv = L(), v = t.type === 'checkbox' ? t.checked : t.value;
  if (id === 'fId') { const n = String(v).trim(); if (!n) return; if (levels.some((l, i) => i !== cur && l.id === n)) { toast('Another level has this id.'); t.value = lv.id; return; } edit(l => { l.id = n; }); $('#lvTitle').textContent = n; return; }
  if (id === 'fDiff') return edit(l => { l.difficulty = +v; });
  if (id === 'fTray') return edit(l => { l.traySlots = Math.min(MAX_TRAY, Math.max(1, +v | 0)); });
  if (t.dataset.setc) { const [a, k] = t.dataset.setc.split(':').map(Number); return edit(l => { l.tubes[a].sets[k] = +v; }); }
  if (t.dataset.seth) { const [a, k] = t.dataset.seth.split(':').map(Number); return edit(l => toggleHidden(l, a, k)); }
  if (t.dataset.pt) return edit(l => { l.blockedPairs[+t.dataset.pt].tube = +v; });
  if (t.dataset.pc) return edit(l => { l.blockedPairs[+t.dataset.pc].count = Math.max(1, +v | 0); });
  if (t.dataset.po) return edit(l => { l.blockedPairs[+t.dataset.po].open = +v; });
  const ids = [...sel.bottles];
  if (id === 'bX' || id === 'bY') return edit(l => { const b = l.bottles[ids[0]]; b[id === 'bX' ? 'x' : 'y'] = snapH(+v); restack(l, new Set(ids)); });
  if (id === 'bZ') return edit(l => { l.bottles[ids[0]].z = Math.max(0, +v | 0); });
  if (id === 'bR') return edit(l => ids.forEach(i => { l.bottles[i].rot = ((Math.round(+v) % 360) + 360) % 360; restack(l, new Set([i])); }));
  if (id === 'bC') return edit(l => ids.forEach(i => { l.bottles[i].color = +v; }));
  if (id === 'bL') return edit(l => ids.forEach(i => { l.bottles[i].lock = Math.max(0, +v | 0); }));
  if (id === 'bDefLock') { prefs.lockCount = Math.max(1, +v | 0); savePrefs(); return; }
  if (id && id[0] === 'g' && id.length > 1) { readGen(); $('#gInfo').textContent = `${genOpt.colors * genOpt.perColor} bottles. The pile holds ${pilePositions(genOpt.shape, genOpt.cols, genOpt.rows, 999).length}.`; }
});
function readGen() {
  const g = genOpt, n = id => +($('#' + id).value) || 0;
  g.colors = Math.min(8, Math.max(1, n('gColors'))); g.perColor = Math.max(1, n('gPer')); g.tubes = Math.min(6, Math.max(1, n('gTubes'))); g.traySlots = Math.min(MAX_TRAY, Math.max(1, n('gTray')));
  g.shape = $('#gShape').value; g.cols = Math.max(1, n('gCols')); g.rows = Math.max(1, n('gRows')); g.hidden = Math.max(0, n('gHidden')); g.locked = Math.max(0, n('gLocked'));
  g.lockCount = Math.max(1, n('gLockN')); g.seed = Math.max(1, n('gSeed')); g.pair = $('#gPair').checked; g.pairCount = Math.max(1, n('gPairN'));
  g.minRate = Math.min(100, Math.max(0, n('gMin'))); g.maxRate = Math.min(100, Math.max(g.minRate, n('gMax'))); savePrefs();
}
function doGenerate() {
  readGen(); const g = genOpt;
  $('#gMsg').className = 'msg'; $('#gMsg').textContent = 'Generating…';
  setTimeout(() => {
    const r = generate({...g, minRate: g.minRate / 100, maxRate: g.maxRate / 100, id: L().id, difficulty: L().difficulty});
    if (r.error) { $('#gMsg').className = 'msg bad'; $('#gMsg').textContent = r.error; return; }
    edit(l => { l.tubes = r.level.tubes; l.bottles = r.level.bottles; l.blockedPairs = r.level.blockedPairs; l.traySlots = r.level.traySlots; clearSel(); }, true);
    $('#gMsg').className = r.offTarget ? 'msg bad' : 'msg ok';
    $('#gMsg').textContent = `Made a solvable level (try ${r.tries}). Greedy bot wins ${Math.round(r.rate * 100)}%${r.offTarget ? ', outside the target range: closest found' : ''}.`;
  }, 20);
}
$('#pane').addEventListener('click', e => {
  const b = e.target.closest('button,li[data-bottle],li[data-tube]'); if (!b) return;
  const d = b.dataset, lv = L();
  if (b.id === 'goPlay') return setMode('play');
  if (d.bottle !== undefined) { clearSel(); sel.bottles.add(+d.bottle); renderEdit(); return; }
  if (d.tube !== undefined && b.tagName === 'LI') { clearSel(); sel.tube = +d.tube; renderEdit(); return; }
  if (b.id === 'tAdd') return edit(l => { l.tubes.push({sets: [], hidden: []}); });
  if (d.tadd !== undefined) return edit(l => { l.tubes[+d.tadd].sets.push(prefs.color); });
  if (d.tdel !== undefined) return edit(l => { const t = +d.tdel; l.tubes.splice(t, 1); l.blockedPairs = l.blockedPairs.filter(p => p.tube !== t && p.tube + 1 !== t).map(p => ({...p, tube: p.tube > t ? p.tube - 1 : p.tube})); clearSel(); });
  if (d.tmv !== undefined) { const [t, k] = d.tmv.split(':').map(Number), j = t + k; if (j < 0 || j >= lv.tubes.length) return; return edit(l => { [l.tubes[t], l.tubes[j]] = [l.tubes[j], l.tubes[t]]; sel.tube = j; sel.set = null; }); }
  if (d.setmv !== undefined) { const [t, k, dd] = d.setmv.split(':').map(Number); return edit(l => { if (moveSet(l, t, k, dd)) sel.set = {t, k: k + dd}; }); }
  if (d.setdel !== undefined) { const [t, k] = d.setdel.split(':').map(Number); return edit(l => removeSet(l, t, k)); }
  if (b.id === 'tBuild') return edit(l => {
    const r = rng(Math.floor(Math.random() * 1e9)), colors = shuffleArr(l.bottles.map(x => x.color), r), n = Math.max(1, +$('#sbTubes').value | 0 || l.tubes.length);
    l.tubes = Array.from({length: n}, () => ({sets: [], hidden: []})); colors.forEach((c, k) => l.tubes[k % n].sets.push(c));
  });
  if (b.id === 'tSolvable') {
    const T = Math.max(1, +$('#sbTubes').value | 0), mix = Math.min(100, Math.max(0, +$('#sbMix').value || 0)); prefs.sbMix = mix; savePrefs();
    $('#sbMsg').className = 'msg'; $('#sbMsg').textContent = 'Working…';
    setTimeout(() => {
      const r = buildSets(L(), {tubes: T, mix: mix / 100, seed: 1 + Math.floor(Math.random() * 1e9)});
      if (r.error) { $('#sbMsg').className = 'msg bad'; $('#sbMsg').textContent = r.error; return; }
      edit(l => { l.tubes = r.tubes; l.blockedPairs = r.blockedPairs; });
      $('#sbMsg').className = 'msg ok'; $('#sbMsg').textContent = `Done: solvable, ${r.swaps} swaps from the easy order, greedy bot wins ${Math.round(r.rate * 100)}%.`;
    }, 20);
    return;
  }
  if (b.id === 'tMix') return edit(l => { const r = rng(Math.floor(Math.random() * 1e9)); l.tubes.forEach(t => { shuffleArr(t.sets, r); t.hidden = []; }); });
  if (b.id === 'pAdd') return edit(l => { const used = new Set(l.blockedPairs.flatMap(p => [p.tube, p.tube + 1])); let t = 0; while (t + 1 < l.tubes.length && (used.has(t) || used.has(t + 1))) t++; l.blockedPairs.push({tube: Math.min(t, l.tubes.length - 2), count: 3, open: 0}); });
  if (d.pdel !== undefined) return edit(l => { l.blockedPairs.splice(+d.pdel, 1); });
  if (b.id === 'bDel') return deleteSel();
  if (b.id === 'bUpL' || b.id === 'bDnL') return layerSel(b.id === 'bUpL' ? 1 : -1);
  if (b.id === 'bDup') return duplicateSel();
  if (b.id === 'bRotL' || b.id === 'bRotR') return rotateSel(b.id === 'bRotR' ? 15 : -15, false);
  if (b.id === 'bGrpL' || b.id === 'bGrpR') return rotateSel(b.id === 'bGrpR' ? 15 : -15, true);
  if (b.id === 'bMirSel') return edit(l => { const ids = [...sel.bottles], a = Math.min(...ids.map(i => l.bottles[i].x)) + Math.max(...ids.map(i => l.bottles[i].x)); ids.forEach(i => { const q = l.bottles[i]; q.x = Math.round((a - q.x) * 100) / 100; q.rot = (360 - q.rot) % 360; }); });
  if (b.id === 'bChain') return edit(l => { const ids = [...sel.bottles], base = Math.min(...ids.map(i => l.bottles[i].z)); ids.forEach((i, k) => { l.bottles[i].z = base + k; }); });
  if (b.id === 'bSettle') return edit(l => settleLayers(l));
  if (b.id === 'bCenter') return edit(l => { if (!l.bottles.length) return; const x0 = Math.min(...l.bottles.map(q => q.x)), y0 = Math.min(...l.bottles.map(q => q.y)); l.bottles.forEach(q => { q.x -= x0; q.y -= y0; }); });
  if (b.id === 'bMirror') return edit(l => { if (!l.bottles.length) return; const a = Math.min(...l.bottles.map(q => q.x)) + Math.max(...l.bottles.map(q => q.x)); l.bottles.forEach(q => { q.x = a - q.x; }); });
  if (b.id === 'bClear') return arm(b, 'Confirm clear', () => edit(l => { l.bottles = []; clearSel(); }));
  if (b.id === 'gGo') return doGenerate();
  if (b.id === 'gNext') { $('#gSeed').value = 1 + Math.floor(Math.random() * 999999); return doGenerate(); }
  if (b.id === 'gAuto') {
    readGen(); const need = genOpt.colors * genOpt.perColor; let c = 1, r = 1;
    const layers = genOpt.shape === 'rows' ? 1 : 3;
    while (pilePositions(genOpt.shape, c, r, 999).length < need || (genOpt.shape === 'stack' && c * r * layers < need)) { if (c <= r) c++; else r++; if (c > 10) break; }
    genOpt.cols = c; genOpt.rows = r; savePrefs(); renderPane(); return;
  }
  if (b.id === 'cSlots') { const out = $('#solveOut'); const r = fewestSlots(L(), 60000); out.insertAdjacentHTML('beforeend', `<ul class="issues"><li class="${r.slots ? 'ok' : 'bad'}">${r.slots ? `Fewest tray slots to win without boosters: <b>${r.slots}</b>${r.unknown ? ' (search stopped early, maybe fewer)' : ''}.` : 'Not solvable even with 5 tray slots and no boosters.'}</li></ul>`); return; }
  if (b.id === 'cRun') { checkCache.key = ''; $('#estOut').innerHTML = '<p class="hint">Working…</p>'; runChecks(true); return; }
  if (b.id === 'cShow') { const moves = solution ? solution.slice() : null; setMode('play'); if (moves) startAuto(moves); return; }
  if (b.id === 'jsonApply') { try { const got = parseLevels($('#jsonText').value); if (got.length !== 1) throw new Error('Paste exactly one level here. Use Import for several.'); levels[cur] = got[0]; clearSel(); commit(); renderAll(); $('#jsonMsg').className = 'msg ok'; $('#jsonMsg').textContent = 'Applied.'; } catch (err) { $('#jsonMsg').className = 'msg bad'; $('#jsonMsg').textContent = err.message; } return; }
  if (b.id === 'jsonCopy') return copyText(serialize(L()), 'Copied.');
  if (b.id === 'jsonDl') return download(L().id + '.json', serialize(L()) + '\n');
});
function deleteSel() {
  const lv = L();
  if (sel.bottles.size) { const ids = [...sel.bottles].sort((a, b) => b - a); edit(l => { ids.forEach(i => l.bottles.splice(i, 1)); clearSel(); }); return; }
  if (sel.set) { const {t, k} = sel.set; if (lv.tubes[t] && lv.tubes[t].sets[k] !== undefined) edit(l => removeSet(l, t, k)); }
}
function duplicateSel() {
  if (!sel.bottles.size) return;
  edit(l => { const ids = [...sel.bottles], n0 = l.bottles.length; ids.forEach(i => l.bottles.push({...l.bottles[i], x: Math.round((l.bottles[i].x + 1) * 100) / 100, y: Math.round((l.bottles[i].y + .5) * 100) / 100}));
    const nids = ids.map((_, k) => n0 + k); restack(l, new Set(nids)); clearSel(); nids.forEach(i => sel.bottles.add(i)); });
}
function rotateSel(d, group) {
  if (!sel.bottles.size) return;
  edit(l => {
    const ids = [...sel.bottles], cx = ids.reduce((a, i) => a + l.bottles[i].x, 0) / ids.length, cy = ids.reduce((a, i) => a + l.bottles[i].y, 0) / ids.length, t = d * Math.PI / 180;
    ids.forEach(i => { const q = l.bottles[i]; q.rot = (((q.rot + d) % 360) + 360) % 360;
      if (group) { const dx = q.x - cx, dy = q.y - cy; q.x = Math.round((cx + dx * Math.cos(t) - dy * Math.sin(t)) * 100) / 100; q.y = Math.round((cy + dx * Math.sin(t) + dy * Math.cos(t)) * 100) / 100; } });
    restack(l, new Set(ids));
  });
}
function layerSel(d) { if (!sel.bottles.size) return; edit(l => sel.bottles.forEach(i => { l.bottles[i].z = Math.max(0, l.bottles[i].z + d); })); }
function nudge(dx, dy) { if (!sel.bottles.size) return; edit(l => { sel.bottles.forEach(i => { l.bottles[i].x += dx; l.bottles[i].y += dy; }); restack(l, sel.bottles); }); }

/* ---------- import / export ---------- */
function openModal(title, body, foot) { $('#dlgTitle').textContent = title; $('#dlgBody').innerHTML = body; $('#dlgFoot').innerHTML = foot || ''; $('#modal').hidden = false; }
function closeModal() { $('#modal').hidden = true; }
$('#dlgX').addEventListener('click', closeModal);
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });
$('#btnImport').addEventListener('click', () => {
  openModal('Import levels', `<p class="hint">Paste a levels.json file, a JSON list of levels, one level, several level objects one after another, or Id/Level rows copied from a sheet. Or pick a file.</p>
    <textarea class="code" id="impText" spellcheck="false" placeholder='{"version": 1, "levels": [ ... ]}'></textarea>
    <div class="btns"><input type="file" id="impFile" accept=".json,.txt,.tsv,application/json"><label class="fld" style="flex-direction:row;align-items:center;gap:6px"><span>Levels with an id already here</span><select id="impHow"><option value="merge">replace them, add the rest</option><option value="add">add as copies</option><option value="all">replace the whole list</option></select></label></div><div class="msg" id="impMsg"></div>`,
    `<button class="btn" type="button" id="impCancel">Cancel</button><button class="btn primary" type="button" id="impGo">Import</button>`);
  $('#impFile').addEventListener('change', e => { const f = e.target.files[0]; if (f) f.text().then(t => { $('#impText').value = t; }); });
  $('#impCancel').addEventListener('click', closeModal);
  $('#impGo').addEventListener('click', () => {
    try { const got = parseLevels($('#impText').value); doImport(got, $('#impHow').value); closeModal(); }
    catch (err) { $('#impMsg').className = 'msg bad'; $('#impMsg').textContent = err.message; }
  });
});
function doImport(got, how) {
  let n = 0, rep = 0;
  if (how === 'all') { levels = got; cur = 0; n = got.length; }
  else got.forEach(lv => { const i = levels.findIndex(l => l.id === lv.id); if (i >= 0 && how === 'merge') { levels[i] = lv; rep++; } else { if (i >= 0) lv.id = uniqueId(lv.id); levels.push(lv); n++; } });
  refreshAllStatus(); persist(); selectLevel(how === 'all' ? 0 : Math.min(cur, levels.length - 1));
  toast(how === 'merge' ? `Imported: ${rep} replaced, ${n} added.` : `Imported ${n} level${n === 1 ? '' : 's'}.`);
}
document.addEventListener('paste', e => {
  if (e.target.closest && e.target.closest('input,textarea') || !$('#modal').hidden) return;
  const t = (e.clipboardData || window.clipboardData).getData('text'); if (!t || !/[{]/.test(t)) return;
  try { const got = parseLevels(t); e.preventDefault(); doImport(got, 'merge'); } catch (err) { toast(err.message); }
});
const sheetRow = lv => `${lv.id}\t"${compact(lv).replace(/"/g, '""')}"`;
$('#btnExport').addEventListener('click', () => {
  openModal('Export levels', `<p class="hint"><b>levels.json</b>: <code>{"version": 1, "levels": [...]}</code>, every level in list order, in the layout described in the Help tab. <b>Sheet rows</b>: one row per level, Id then the level as one line of JSON, ready to paste into a sheet.</p>
    <div class="btns"><button class="btn primary" type="button" data-exp="file">Download levels.json (${levels.length})</button><button class="btn" type="button" data-exp="all">Copy levels.json</button><button class="btn" type="button" data-exp="one">Copy this level</button><button class="btn" type="button" data-exp="onefile">Download this level</button><button class="btn" type="button" data-exp="sheet">Copy as sheet rows (${levels.length})</button><button class="btn" type="button" data-exp="sheet1">Copy sheet row of this level</button></div>`,
    `<button class="btn" type="button" id="expClose">Close</button>`);
  $('#expClose').addEventListener('click', closeModal);
  $('#dlgBody').addEventListener('click', e => {
    const k = e.target.dataset.exp; if (!k) return;
    if (k === 'file') return download('levels.json', serializeFile(levels));
    if (k === 'onefile') return download(L().id + '.json', serialize(L()) + '\n');
    const txt = k === 'all' ? serializeFile(levels) : k === 'one' ? serialize(L()) : k === 'sheet' ? levels.map(sheetRow).join('\n') : sheetRow(L());
    copyText(txt, k === 'sheet' ? `Copied ${levels.length} sheet rows.` : 'Copied.');
  });
});
function download(name, text) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], {type: 'application/json'})); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }
function copyText(t, msg) { (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => toast(msg), () => { const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); toast(msg); } catch (e) { toast('Copy failed.'); } ta.remove(); }); }
let toastT = 0;
function toast(t) { const el = $('#toast'); el.textContent = t; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => el.hidden = true, 2600); }

/* ---------- keys ---------- */
document.addEventListener('keydown', e => {
  if (e.target.closest('input,textarea,select') || !$('#modal').hidden) { if (e.key === 'Escape') closeModal(); return; }
  const k = e.key, ctrl = e.ctrlKey || e.metaKey;
  if (k === 'Tab' && !ctrl && !e.altKey) { e.preventDefault(); setMode(mode === 'edit' ? 'play' : 'edit'); return; }
  if (mode === 'play') {
    if (ctrl && k.toLowerCase() === 'z') { e.preventDefault(); playUndo(); }
    else if (k === 'r' || k === 'R') { startGame(); renderPlay(); }
    else if (k === 'n' || k === 'N') botStep();
    return;
  }
  if (ctrl && k.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? doRedo() : doUndo(); return; }
  if (ctrl && k.toLowerCase() === 'y') { e.preventDefault(); doRedo(); return; }
  if (ctrl && k.toLowerCase() === 'd') { e.preventDefault(); duplicateSel(); return; }
  if (ctrl) return;
  if ((k === 'q' || k === 'Q' || k === 'e' || k === 'E') && sel.bottles.size) { rotateSel(k.toLowerCase() === 'e' ? 15 : -15, e.shiftKey); return; }
  const tools = {v: 'select', b: 'bottle', p: 'paint', e: 'erase', l: 'lock', s: 'shape', k: 'stack'};
  if (tools[k.toLowerCase()]) { tool = tools[k.toLowerCase()]; syncTools(); return; }
  if (k === 'h' || k === 'H') { if (sel.set) edit(l => toggleHidden(l, sel.set.t, sel.set.k)); else { tool = 'hidden'; syncTools(); } return; }
  if (/^[1-8]$/.test(k)) { setColor(+k, true); return; }
  if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); deleteSel(); return; }
  if (k === 'Escape') { clearSel(); renderEdit(); renderPane(); return; }
  if (k === 'z' || k === 'Z') { prefs.showZ = !prefs.showZ; savePrefs(); syncTools(); renderEdit(); return; }
  if (k === 'g' || k === 'G') { prefs.grid = !prefs.grid; savePrefs(); syncTools(); renderEdit(); return; }
  if (k === '[' || k === ']') { layerSel(k === ']' ? 1 : -1); return; }
  const st = e.shiftKey ? 1 : (prefs.snap || .05), mv = {ArrowLeft: [-st, 0], ArrowRight: [st, 0], ArrowUp: [0, -st], ArrowDown: [0, st]}[k];
  if (mv && sel.bottles.size) { e.preventDefault(); nudge(...mv); }
});

/* ---------- start ---------- */
load(); refreshAllStatus(); resetHistory(); persist(); renderAll();
