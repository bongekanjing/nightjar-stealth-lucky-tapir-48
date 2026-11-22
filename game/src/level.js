// The conservatory, as text. One character per tile: '#' a wall, '.' a floor, 'c' a planter that
// stops both a walker and a sight line, 'g' the relic, 'E' the west gate, 'P' where the thief comes
// in. The plan is laid out so that every patrol lane has a long clear sight line: a guard boxed in by
// planters has no cone to read, which is the one thing a stealth level must never do.
//
//   rows 1-7    three north bays (fern bench, orchid table, palm bed), split by walls at 10 and 22
//   row  8      the north spine, four doors at 5, 16, 26, 34
//   rows 9-12   the central gallery, the relic on its plinth, benches along both walls
//   row  13     the south spine, three doors at 8, 24, 31
//   rows 14-17  the potting shed (west) and the gate yard (east), split by a wall at 20

import { MAP, TILE } from './config.js';

const PLAN = [
  '########################################',
  '#P#.......#...........#................#',
  '#.#.......#...........#................#',
  '#.#.......#...........#................#',
  '#...cc....#....cc.....#.......cc.......#',
  '#.........#...........#................#',
  '#.........#...........#................#',
  '#.........#...........#................#',
  '#####.##########.#########.#######.#####',
  '#......................................#',
  '#.............c.g.c....................#',
  '#.....cc....................cc.........#',
  '#......................................#',
  '########.###############.######.########',
  '#...................#..................#',
  '#...cc..............#.........cc.......#',
  '#E.........cc.......#..................#',
  '#...................#..................#',
  '########################################',
];

/**
 * Guard routes in tile coordinates, each a closed loop, with the dwell at every waypoint. Every leg
 * runs down an open lane, so each guard's cone is long and the player can read the threat from
 * across the room. The six posts cover the three north bays, the gallery, the shed and the gate yard.
 */
const ROUTES = [
  {
    id: 'g1',
    name: 'Aster',
    post: 'the fern bench',
    points: [{ x: 9, y: 7 }, { x: 9, y: 2 }, { x: 3, y: 2 }, { x: 3, y: 7 }],
    dwell: [1.0, 1.8, 1.0, 1.8],
  },
  {
    id: 'g2',
    name: 'Bramble',
    post: 'the orchid table',
    points: [{ x: 12, y: 2 }, { x: 20, y: 2 }, { x: 20, y: 7 }, { x: 12, y: 7 }],
    dwell: [1.4, 1.2, 1.4, 1.2],
  },
  {
    id: 'g3',
    name: 'Cinder',
    post: 'the palm bed',
    points: [{ x: 24, y: 2 }, { x: 37, y: 2 }, { x: 37, y: 7 }, { x: 24, y: 7 }],
    dwell: [1.0, 1.8, 1.0, 1.8],
  },
  {
    id: 'g4',
    name: 'Dusk',
    post: 'the centre gallery',
    points: [{ x: 3, y: 9 }, { x: 20, y: 9 }, { x: 36, y: 9 }, { x: 36, y: 12 }, { x: 3, y: 12 }],
    dwell: [1.5, 1.0, 1.4, 1.0, 1.5],
  },
  {
    id: 'g5',
    name: 'Ember',
    post: 'the potting shed',
    // This loop watches the approach to the west gate but deliberately leaves the gate pocket
    // itself (columns 1-2) unwatched, so a player who has read the patrol has somewhere to go.
    points: [{ x: 5, y: 14 }, { x: 12, y: 14 }, { x: 12, y: 17 }, { x: 5, y: 17 }],
    dwell: [1.2, 1.0, 1.2, 1.0],
  },
  {
    id: 'g6',
    name: 'Flint',
    post: 'the gate yard',
    points: [{ x: 22, y: 14 }, { x: 36, y: 14 }, { x: 36, y: 17 }, { x: 22, y: 17 }],
    dwell: [1.4, 1.0, 1.4, 1.0],
  },
];

/** A tile is solid when a body cannot enter it: walls and cover both stop a walker. */
export function solidAt(tiles, col, row) {
  if (col < 0 || row < 0 || col >= MAP.cols || row >= MAP.rows) return true;
  const ch = tiles[row][col];
  return ch === '#' || ch === 'c';
}

/** Cover stops a sight line as surely as a wall does: guards and the renderer agree on one rule. */
export function opaqueAt(tiles, col, row) {
  return solidAt(tiles, col, row);
}

export function charAt(tiles, col, row) {
  if (col < 0 || row < 0 || col >= MAP.cols || row >= MAP.rows) return '#';
  return tiles[row][col];
}

/** Tile centre in logical pixels, under the HUD strip the renderer draws along the top. */
export function centre(col, row) {
  return { x: col * TILE + TILE / 2, y: MAP.top + row * TILE + TILE / 2 };
}

/** The tile a logical point falls in. */
export function tileOf(x, y) {
  return { col: Math.floor(x / TILE), row: Math.floor((y - MAP.top) / TILE) };
}

/** Read the plan into tiles plus the objects the game needs, and check it is the shape it claims. */
export function loadLevel() {
  const tiles = PLAN.map((row) => {
    if (row.length !== MAP.cols) throw new Error(`level row has ${row.length} tiles, expected ${MAP.cols}`);
    return row.split('');
  });
  if (tiles.length !== MAP.rows) throw new Error(`level has ${tiles.length} rows, expected ${MAP.rows}`);

  let spawn = null;
  let relic = null;
  let exit = null;
  const covers = [];
  const floors = [];
  for (let row = 0; row < tiles.length; row += 1) {
    for (let col = 0; col < tiles[row].length; col += 1) {
      const ch = tiles[row][col];
      if (ch === 'P') spawn = centre(col, row);
      else if (ch === 'g') relic = centre(col, row);
      else if (ch === 'E') exit = { ...centre(col, row), col, row };
      else if (ch === 'c') covers.push({ ...centre(col, row), col, row });
      if (ch !== '#' && ch !== 'c') floors.push({ col, row });
    }
  }
  if (!spawn || !relic || !exit) throw new Error('level needs a start, a relic and an exit');

  return {
    tiles,
    spawn,
    relic,
    exit,
    covers,
    floors,
    routes: ROUTES.map((route) => ({
      ...route,
      path: route.points.map((point) => centre(point.x, point.y)),
    })),
  };
}
