import {describe, it, expect} from 'vitest';
import fs from 'node:fs';
import {normalize} from '../src/format.js';
import {newGame, tap, completeFill, settle, outcome, ST, extraTray, shuffle, removeBooster, revive, solve, generate, tubeOpen, tappable, isFree} from '../src/engine.js';

const FILE = JSON.parse(fs.readFileSync(new URL('../src/data/levels.json', import.meta.url), 'utf8'));
const lv = o => normalize({traySlots: 1, blockedPairs: [], ...o});
const B = (x, y, z, color, lock = 0) => ({x, y, z, color, lock});

describe('core rules (GDD 1.1, 1.2)', () => {
  it('FTUE: red fills, blue waits in the tray and goes up on its own', () => {
    const s = newGame(normalize(FILE.levels[0]));
    const r = tap(s, 0); expect(r.to).toBe('spot');
    expect(tap(s, 1).to).toBe('tray');
    completeFill(s, 0);
    expect(tap(s, 2).to).toBe('spot'); completeFill(s, 0);
    expect(s.st[1]).toBe(ST.SPOT); completeFill(s, 0);
    expect(tap(s, 3).to).toBe('spot'); completeFill(s, 0);
    expect(outcome(s)).toBe('won');
  });
  it('a busy fill spot sends a same-color bottle to the tray, it comes back after', () => {
    const s = newGame(lv({tubes: [{sets: [1, 1]}], bottles: [B(0, 0, 0, 1), B(1, 0, 0, 1)]}));
    expect(tap(s, 0).to).toBe('spot'); expect(tap(s, 1).to).toBe('tray');
    const f = completeFill(s, 0); expect(f.moved[0].bottle).toBe(1);
    completeFill(s, 0); expect(outcome(s)).toBe('won');
  });
  it('only free bottles can be tapped; full tray shakes; loses when nothing matches', () => {
    const s = newGame(lv({tubes: [{sets: [3, 1, 2]}], bottles: [B(0, 0, 0, 1), B(1, 0, 0, 2), B(.5, 0, 1, 3)]}));
    expect(tap(s, 0).why).toBe('covered');
    tap(s, 2); settle(s);
    expect(tap(s, 1).to).toBe('tray');
    expect(outcome(s)).toBe('playing');
    const s2 = newGame(lv({tubes: [{sets: [3, 1, 2]}], bottles: [B(0, 0, 0, 1), B(1, 0, 0, 2), B(3, 0, 0, 3)]}));
    tap(s2, 1); expect(tap(s2, 0).why).toBe('tray');
    tap(s2, 2); settle(s2); expect(outcome(s2)).toBe('playing');
  });
  it('two matching tubes: the left one', () => {
    const s = newGame(lv({tubes: [{sets: [1]}, {sets: [1]}], bottles: [B(0, 0, 0, 1), B(1, 0, 0, 1)]}));
    expect(tap(s, 0).t).toBe(0); expect(tap(s, 1).t).toBe(1);
  });
  it('lose: tray full and no free bottle matches', () => {
    const s = newGame(lv({tubes: [{sets: [1, 2, 3]}], bottles: [B(0, 0, 0, 2), B(1, 0, 0, 3), B(2, 0, 0, 1)]}));
    tap(s, 0); expect(tap(s, 1).why).toBe('tray');
    expect(outcome(s)).toBe('playing');
    const t = newGame(lv({tubes: [{sets: [1, 2, 3, 4]}], bottles: [B(0, 0, 0, 2), B(1, 0, 0, 3), B(2, 0, 0, 4), B(3, 0, 0, 1)]}));
    tap(t, 0); tap(t, 3); settle(t); expect(t.st[0]).toBe(ST.DONE); expect(outcome(t)).toBe('playing');
    const u = newGame(lv({tubes: [{sets: [1, 2, 3]}], bottles: [B(0, 0, 0, 2), B(1, 0, 0, 1), B(1, 0, 1, 3)]}));
    tap(u, 0); expect(outcome(u)).toBe('lost');
  });
});

describe('elements (GDD 1.4)', () => {
  it('Hidden Jam shows its color at the bottom', () => {
    const s = newGame(lv({tubes: [{sets: [1, 2], hidden: [1]}], bottles: [B(0, 0, 0, 1), B(1, 0, 0, 2)]}));
    expect(s.tubes[0][1].h).toBe(true);
    tap(s, 0); completeFill(s, 0); expect(s.tubes[0][0]).toEqual({c: 2, h: false});
  });
  it('Locked Bottle: counter starts once free, counts sends from the board only', () => {
    const s = newGame(lv({tubes: [{sets: [2, 1, 3, 4]}], traySlots: 3, bottles: [B(0, 0, 0, 1, 2), B(0, 0, 1, 2), B(2, 0, 0, 3), B(3, 0, 0, 4)]}));
    expect(s.act[0]).toBe(0);
    tap(s, 1); expect(s.act[0]).toBe(1); expect(s.lock[0]).toBe(2);
    expect(tap(s, 0).why).toBe('locked');
    settle(s); tap(s, 2); expect(s.lock[0]).toBe(1);
    tap(s, 3); expect(s.lock[0]).toBe(0);
    expect(tap(s, 0).to).toBe('spot');
    settle(s); expect(outcome(s)).toBe('won');
  });
  it('Blocked Jam Tube swaps after count sends, waits for a fill, stops when one is empty', () => {
    const s = newGame(lv({tubes: [{sets: [1]}, {sets: [2, 3]}], traySlots: 3, blockedPairs: [{tube: 0, count: 1, open: 1}], bottles: [B(0, 0, 0, 2), B(1, 0, 0, 1), B(2, 0, 0, 3)]}));
    expect(tubeOpen(s, 0)).toBe(false); expect(tubeOpen(s, 1)).toBe(true);
    tap(s, 0); expect(s.pairs[0].pend).toBe(true); expect(tubeOpen(s, 1)).toBe(true);
    completeFill(s, 1); expect(tubeOpen(s, 0)).toBe(true); expect(tubeOpen(s, 1)).toBe(false);
    tap(s, 1); settle(s); expect(s.pairs[0].stop).toBe(true); expect(tubeOpen(s, 1)).toBe(true);
    tap(s, 2); settle(s); expect(outcome(s)).toBe('won');
  });
});

describe('boosters (GDD 1.5)', () => {
  it('Extra Tray adds a slot up to 5', () => {
    const s = newGame(lv({tubes: [{sets: [1]}], bottles: [B(0, 0, 0, 1)]}));
    for (let k = 0; k < 6; k++) extraTray(s);
    expect(s.tray.length).toBe(5); expect(s.used.extra).toBe(4);
  });
  it('Shuffle puts a sendable color at the bottom of each open tube', () => {
    const s = newGame(lv({tubes: [{sets: [3, 3, 1]}, {sets: [3, 2]}], bottles: [B(0, 0, 0, 1), B(1, 0, 0, 2), B(2, 0, 0, 3, 5), B(3, 0, 0, 3, 5), B(4, 0, 0, 3, 5)]}));
    shuffle(s);
    expect([s.tubes[0][0].c, s.tubes[1][0].c].sort()).toEqual([1, 2]);
    expect(s.tubes[0].length).toBe(3); expect(s.tubes[1].length).toBe(2);
  });
  it('Remove takes free bottles first and the farthest set of each color', () => {
    const s = newGame(lv({tubes: [{sets: [1, 2, 1]}, {sets: [2]}], bottles: [B(0, 0, 0, 1), B(1, 0, 0, 2), B(0, 0, 1, 1), B(1, 0, 1, 2, 3)]}));
    const r = removeBooster(s, 1);
    expect(r.picked).toEqual([2]); expect(s.tubes[0].map(x => x.c)).toEqual([1, 2]);
  });
  it('Revive removes tray bottles with their jam', () => {
    const s = newGame(lv({tubes: [{sets: [1, 2]}], bottles: [B(0, 0, 0, 2), B(1, 0, 0, 1)]}));
    tap(s, 0); revive(s); expect(s.st[0]).toBe(ST.REMOVED); expect(s.tubes[0].map(x => x.c)).toEqual([1]);
  });
});

describe('solver and generator', () => {
  it('every built-in level is solvable with its tray', () => {
    FILE.levels.forEach(l => expect(solve(normalize(l), {limit: 100000}).result).toBe('win'));
  });
  it('the solver says no when the tray is too small', () => {
    const l = lv({tubes: [{sets: [1, 2, 2, 3, 3]}], bottles: [B(0, 0, 0, 3), B(1, 0, 0, 2), B(2, 0, 0, 1), B(2, 0, 1, 2), B(2, 0, 2, 3)]});
    expect(solve(l).result).toBe('none');
    expect(solve(l, {traySlots: 3}).result).toBe('win');
  });
  it('generates a solvable level with the asked counts', () => {
    const r = generate({colors: 3, perColor: 3, tubes: 2, cols: 4, rows: 3, seed: 3, hidden: 2, locked: 1});
    expect(r.level.bottles).toHaveLength(9);
    expect(r.level.tubes.reduce((a, t) => a + t.hidden.length, 0)).toBe(2);
    expect(solve(r.level).result).toBe('win');
  });
});
