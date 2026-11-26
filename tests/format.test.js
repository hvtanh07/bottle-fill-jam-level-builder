import {describe, it, expect} from 'vitest';
import fs from 'node:fs';
import {normalize, serialize, serializeFile, compact, parseLevels, check, coverMap, autoZ} from '../src/format.js';

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
  it('defaults: tray 1, clamps tray to 5, snaps positions to half a bottle', () => {
    expect(normalize({}).traySlots).toBe(1);
    expect(normalize({traySlots: 9}).traySlots).toBe(5);
    expect(normalize({bottles: [{x: 1.3, y: .74, z: 0, color: 2}]}).bottles[0]).toEqual({x: 1.5, y: .5, z: 0, color: 2, lock: 0});
  });
  it('finds color mismatches and same-layer overlaps', () => {
    const lv = normalize({tubes: [{sets: [1]}], bottles: [{x: 0, y: 0, z: 0, color: 1}, {x: .5, y: 0, z: 0, color: 2}]});
    const t = check(lv).map(i => i.text).join('\n');
    expect(t).toMatch(/Blue: 1 bottle but 0 jam sets/); expect(t).toMatch(/overlap on the same layer/);
  });
  it('a bottle on a higher layer covers the ones it overlaps', () => {
    const b = [{x: 0, y: 0, z: 0}, {x: 1, y: 0, z: 0}, {x: .5, y: .5, z: 1}];
    expect(coverMap(b)).toEqual([[2], [2], []]);
    expect(autoZ(b, .5, 0)).toBe(2); expect(autoZ(b, 3, 3)).toBe(0);
  });
});
