# Bottle Fill Jam Level Builder

A level builder for Bottle Fill Jam, built on the rules in the [Bottle Fill Jam GDD](https://hvtanh07.github.io/gdd-bottle-fill-jam/). 21 levels are built in: level_001 is the FTUE from GDD section 2.2, level_002–016 come from the generator, level_017–021 are free-form piles (spiral, wall of deep columns, two snakes, arch with a row, arch with a tower). All are solvable with 1 tray slot and no boosters.

**Tool:** https://hvtanh07.github.io/bottle-fill-jam-level-builder/

## Run it

You need Node.js 20 or newer.

```sh
npm install
npm run dev      # opens the builder at http://localhost:5173
npm test         # format round trip, game rules, boosters, solver
npm run build    # writes dist/index.html, one file that opens without a server
node scripts/make-levels.mjs   # rebuilds the built-in levels in src/data/levels.json
```

Every push to `main` runs the tests, builds, and publishes `dist/` to the `gh-pages` branch, which GitHub Pages serves.

## Features

- **Levels:** list, filter (id, number, element, difficulty), new, duplicate, reorder, delete. Edits are saved in the browser. **Reset to built-in levels** brings back the built-in set.
- **Design:** the play screen as in the GDD sketch: machine with jam tubes, fill spots, waiting tray, bottle pile. Bottles go anywhere and can be turned. Tools: Select (drag to move, box-select), Bottle (click to add, click a bottle to stack one on top), **Shape** (drag to lay N bottles along a line, arc, circle or spiral; upright, along or across the path; as a chain where each bottle rests on the one before, or flat), **Stack** (a deep column: the front bottle on top, the rest behind it), Paint, Erase, Lock (Locked Bottle), Hidden (Hidden Jam). Turn with Q/E (Shift: turn the group), duplicate with Ctrl+D, mirror, make a chain from a selection. Snap 0.05–1 or off. Colors 1–8, order numbers, grid, undo and redo.
- **Inspector:** Level (id, difficulty, tray slots, counts), Tubes (sets per tube from the nozzle up, Hidden Jam, reorder, **Build solvable sets** for a hand-made pile with a Mix %, random sets, Blocked Jam Tube pairs), Bottles (position, layer, color, lock counter, bottles vs jam per color, settle layers, mirror), Generate, Check, JSON, Help.
- **Play test:** tap free bottles; pours take time, so a busy fill spot sends a same-color bottle to the tray. Extra Tray, Shuffle and Remove boosters, Revive on a full tray, undo move, restart, a bot that plays one move or the whole level, fast mode.
- **Check:** format problems (bottles vs jam sets per color, overlaps, floating bottles, fail-safe lock counters), a solver (no boosters, 1 pour at a time) with **Play the solution**, **Find fewest tray slots**, and win rates of a greedy bot and a random player over 200 or 500 games.
- **Generate:** colors, bottles per color, tubes, tray slots, pile shape (pyramid, stacks, one layer), Hidden Jam, Locked Bottles, Blocked Jam Tube, and a target greedy-bot win rate. Keeps only levels the solver can win.
- **Import / export:** a levels.json file, a JSON list, one level, several level objects one after another, or Id/Level rows from a sheet. Export writes levels.json, one level, or sheet rows (Id, then the level as one line of JSON).

## Level format

There is no game level file yet, so the tool defines one. It reads and writes these keys in this order (2-space JSON, one tube / pair / bottle per line):

```json
{
  "id": "level_001",
  "difficulty": 0,
  "traySlots": 1,
  "tubes": [
    {"sets": [1, 1, 2, 2], "hidden": []}
  ],
  "blockedPairs": [],
  "bottles": [
    {"x": 2, "y": 2, "z": 0, "rot": 0, "color": 1, "lock": 0}
  ]
}
```

| Key | Meaning |
| --- | --- |
| `difficulty` | 0 Normal, 1 Hard, 2 Super hard. |
| `traySlots` | Waiting tray slots at the start, 1–5. The GDD starts every level with 1; Extra Tray adds 1, up to 5. |
| `tubes[].sets` | Jam sets of the tube, listed from the nozzle (bottom) up. One set = 4 portions of one color = one bottle. |
| `tubes[].hidden` | Indexes into `sets` that are Hidden Jam. |
| `blockedPairs[]` | Blocked Jam Tube: tubes `tube` and `tube + 1` take turns. `count` = bottles to send before they swap, `open` = 0 if the left tube starts open, 1 for the right. |
| `bottles[]` | `x` right and `y` down in bottle widths (any value, 2 decimals). `rot` = turn in degrees, clockwise (0 = upright; missing in old files = 0). `z` = cover order: a bottle rests on every bottle with a lower `z` that its shape overlaps. The shape is a 0.78 × 0.95 rectangle turned by `rot`. Only bottles with nothing on them can be tapped. `lock` = Locked Bottle counter, 0 = a normal bottle. |
| `color` | The GDD color list: 1 Red, 2 Blue, 3 Green, 4 Yellow, 5 Pink, 6 Orange, 7 Purple, 8 Brown. |

A level is valid when, for every color, the number of bottles equals the number of jam sets.

## Rules used by the play test

From GDD sections 1.1, 1.2, 1.4 and 1.5:

- Tap a free bottle. An open tube with its color at the bottom and a free fill spot takes it (two match: the left one). Else it goes to the first free tray slot from the left. Tray full: it shakes and stays.
- A bottle fills with one set; the set leaves and the column drops. Tray bottles go up on their own when their color reaches the bottom of an open tube with a free spot (leftmost first).
- Win: every bottle filled, every tube empty. Lose: tray full and no tappable bottle matches an open tube, checked once every pour has finished. If nothing can move with room left in the tray (a fail-safe case), the play test shows "Stuck".
- Hidden Jam shows its color at the bottom of the tube and is a normal set from then on.
- Locked Bottle: once nothing rests on it, its counter shows and counts every bottle sent from the board (tray bottles going up on their own and removed bottles do not count). At 0 it opens. The send that frees it does not count.
- Blocked Jam Tube: the counter counts bottles sent; at 0 the tubes swap, after a fill in progress finishes. One tube empty: the other stays open.
- Extra Tray: +1 slot, up to 5. Shuffle: mixes all jam sets across the tubes (each tube keeps its number of sets) so each open tube gets a bottom color the player can send, as many as possible. Remove: 3 board bottles (free first, then lower layers, Locked Bottles last, random in a group), each with the set of its color farthest from a nozzle. Revive: removes 3 tray bottles with their jam.

Readings the GDD leaves open, chosen here: Shuffle mixes sets across tubes (not only inside each tube); the solver and the bots let each pour finish before the next tap.

## Code

- `index.html`: page markup.
- `src/main.js`: the builder UI.
- `src/format.js`: the level format, reading, writing, board geometry and checks.
- `src/engine.js`: game rules, boosters, bots, solver and generator.
- `src/render.js`: draws a level as SVG.
- `src/shapes.js`: the Shape and Stack tools (line, arc, circle, spiral, deep column).
- `src/data/levels.json`: the built-in levels.
- `scripts/make-levels.mjs`: rebuilds the built-in levels.
- `tests/`: Vitest tests.
