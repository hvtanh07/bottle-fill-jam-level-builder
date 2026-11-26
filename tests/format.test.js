import {describe, it, expect} from 'vitest';
import fs from 'node:fs';
import {normalize, serialize, serializeFile, compact, parseLevels, check, coverMap, autoZ, overlaps} from '../src/format.js';
import {shapeBottles} from '../src/shapes.js';

const RAW = fs.readFileSync(new URL('../src/data/levels.json', import.meta.url), 'utf8');
const FILE = JSON.parse(RAW);

describe('level format', () => {
  it('writes the built-in file back byte for byte', () => {
    expect(serializeFile(FILE.levels.map(normalize), FILE)).toBe(RAW);
  });
  it('reads the file, a list, one level, pasted objects and sheet rows', () => {
    const two = FILE.levels.slice(0, 2);
    expect(parseLevels(RAW)).toHaveLength(FILE.levels.length);
    expect(parseLevels(JSON.stringify(two))).toHaveLength(2);
    expect(parseLevels(JSON.stringify(two[0]))[0].id).toBe('level_001');
    expect(parseLevels(serialize(normalize(two[0])) + '\n' + serialize(normalize(two[1])))).toHaveLength(2);
    const rows = two.map(l => `${l.id}\t"${compact(normalize(l)).replace(/"/g, '""')}"`).join('\n');
    expect(parseLevels(rows).map(l => l.id)).toEqual(['level_001', 'level_002']);
  });
  it('built-in levels have no errors', () => {
    FILE.levels.forEach(l => expect(check(normalize(l)).filter(i => i.level === 'bad')).toEqual([]));
  });
  it('defaults: tray 1, clamps tray to 5, free positions with 2 decimals, rot 0 for old files', () => {
    expect(normalize({}).traySlots).toBe(1);
    expect(normalize({traySlots: 9}).traySlots).toBe(5);
    expect(normalize({bottles: [{x: 1.333, y: .74, z: 0, color: 2}]}).bottles[0]).toEqual({x: 1.33, y: .74, z: 0, rot: 0, color: 2, lock: 0});
    expect(normalize({bottles: [{x: 0, y: 0, z: 0, rot: -30, color: 2}]}).bottles[0].rot).toBe(330);
  });
  it('turned bottles cover by their turned shape', () => {
    // side by side, upright: no overlap; turned 90°, the wider shapes overlap
    expect(overlaps({x: 0, y: 0, rot: 0}, {x: .85, y: 0, rot: 0})).toBe(false);
    expect(overlaps({x: 0, y: 0, rot: 90}, {x: .85, y: 0, rot: 90})).toBe(true);
    // a 45° bottle next to an upright one
    expect(overlaps({x: 0, y: 0, rot: 45}, {x: .7, y: 0, rot: 0})).toBe(true);
    expect(overlaps({x: 0, y: 0, rot: 45}, {x: 1.2, y: 0, rot: 0})).toBe(false);
    // a deep stack: bottles 0.3 apart overlap
    expect(overlaps({x: 0, y: 0, rot: 0}, {x: 0, y: -.3, rot: 0})).toBe(true);
  });
  it('finds color mismatches and same-layer overlaps', () => {
    const lv = normalize({tubes: [{sets: [1]}], bottles: [{x: 0, y: 0, z: 0, color: 1}, {x: .5, y: 0, z: 0, color: 2}]});
    const t = check(lv).map(i => i.text).join('\n');
    expect(t).toMatch(/Blue: 1 bottle but 0 jam sets/); expect(t).toMatch(/overlap with the same order z/);
  });
  it('a bottle on a higher layer covers the ones it overlaps', () => {
    const b = [{x: 0, y: 0, z: 0}, {x: 1, y: 0, z: 0}, {x: .5, y: .5, z: 1}];
    expect(coverMap(b)).toEqual([[2], [2], []]);
    expect(autoZ(b, .5, 0)).toBe(2); expect(autoZ(b, 3, 3)).toBe(0);
  });
});

describe('shape tool', () => {
  it('a stack is a column going back: the front bottle is on top and the only free one', () => {
    const got = shapeBottles('stack', {x: 2, y: 5}, {x: 2, y: 5}, {n: 5, step: .3});
    expect(got).toHaveLength(5);
    const front = got.reduce((a, b) => b.y > a.y ? b : a);
    expect(front.z).toBe(Math.max(...got.map(b => b.z)));
    const cov = coverMap(got.map(b => ({...b})));
    expect(cov.filter(c => !c.length)).toHaveLength(1);
  });
  it('a chain along a line rests each bottle on the one before', () => {
    const got = shapeBottles('line', {x: 0, y: 0}, {x: 3, y: 0}, {n: 7, orient: 'along', order: 'end'});
    expect(got.map(b => b.z)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(got[0].rot).toBe(270);
    const flat = shapeBottles('line', {x: 0, y: 0}, {x: 6, y: 0}, {n: 4, order: 'flat'});
    expect(flat.every(b => b.z === 0)).toBe(true);
  });
  it('circle and spiral place n bottles around the center', () => {
    const c = shapeBottles('circle', {x: 4, y: 4}, {x: 6, y: 4}, {n: 12, order: 'flat'});
    c.forEach(b => expect(Math.hypot(b.x - 4, b.y - 4)).toBeCloseTo(2, 1));
    const s = shapeBottles('spiral', {x: 4, y: 4}, {x: 7, y: 4}, {n: 20, turns: 1.5});
    expect(s).toHaveLength(20);
    expect(Math.hypot(s[0].x - 4, s[0].y - 4)).toBeGreaterThan(Math.hypot(s[19].x - 4, s[19].y - 4));
  });
});
