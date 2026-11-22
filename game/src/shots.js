// The screenshot scenes behind ?shot=title|relic|escape|caught. Each scene plays the real rules
// forward from a fresh run: the relic and escape scenes are steered by a pilot that plans a route
// weighted against every guard's current cone, so it walks the cover the level was built around;
// the caught scene is a careless run that is actually seen and taken. The frame is therefore a real
// position in a real run, and the same scene always produces the same frame.

import { GUARD, MAP, STEP, TILE } from './config.js';
import { lineOfSight } from './guard.js';
import { opaqueAt, tileOf } from './level.js';
import { begin, reset, step } from './world.js';

export const SCENES = ['title', 'relic', 'escape', 'chase'];

/** Which scene this page was opened for, or null for a live game. */
export function shotName() {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const name = params.get('shot');
  if (!name || !SCENES.includes(name)) return null;
  return name;
}

/** Is the tile at (col,row) inside any guard's cone right now, with a clear line to it? */
function tileExposed(world, col, row) {
  const cx = col * TILE + TILE / 2;
  const cy = MAP.top + row * TILE + TILE / 2;
  for (const guard of world.guards) {
    const dx = cx - guard.x;
    const dy = cy - guard.y;
    const distance = Math.hypot(dx, dy);
    const range = guard.state === 'chase' ? GUARD.coneRange * 1.25 : GUARD.coneRange;
    if (distance > range) continue;
    let delta = (Math.atan2(dy, dx) - guard.facing + Math.PI) % (Math.PI * 2);
    if (delta < 0) delta += Math.PI * 2;
    delta -= Math.PI;
    if (Math.abs(delta) > GUARD.coneAngle) continue;
    if (lineOfSight(world.level.tiles, guard.x, guard.y, cx, cy)) return true;
  }
  return false;
}

/**
 * A route from the thief to `to`, cheapest rather than shortest: stepping into a tile that a cone
 * covers costs DANGER, so the planner walks the long way round a patrol instead of through it. When
 * every route is dangerous it still returns one, so a scene can never stall.
 */
const DANGER = 9;

function routeTo(world, to) {
  const level = world.level;
  const start = tileOf(world.player.x, world.player.y);
  const goal = tileOf(to.x, to.y);
  const blocked = (c, r) => c < 0 || r < 0 || c >= MAP.cols || r >= MAP.rows || opaqueAt(level.tiles, c, r);
  if (blocked(goal.col, goal.row)) return [];

  const key = (c, r) => r * MAP.cols + c;
  const cost = new Map([[key(start.col, start.row), 0]]);
  const previous = new Map();
  // A binary-heap-free Dijkstra: the grid is 760 tiles, so a sorted frontier is plenty.
  const frontier = [{ col: start.col, row: start.row, cost: 0 }];
  const done = new Set();

  while (frontier.length > 0) {
    frontier.sort((a, b) => a.cost - b.cost);
    const current = frontier.shift();
    const ck = key(current.col, current.row);
    if (done.has(ck)) continue;
    done.add(ck);
    if (current.col === goal.col && current.row === goal.row) break;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const c = current.col + dc;
      const r = current.row + dr;
      if (blocked(c, r)) continue;
      const k = key(c, r);
      if (done.has(k)) continue;
      const step = 1 + (tileExposed(world, c, r) ? DANGER : 0);
      const next = current.cost + step;
      if (!cost.has(k) || next < cost.get(k)) {
        cost.set(k, next);
        previous.set(k, { col: current.col, row: current.row });
        frontier.push({ col: c, row: r, cost: next });
      }
    }
  }

  if (!previous.has(key(goal.col, goal.row)) && !(start.col === goal.col && start.row === goal.row)) return [];
  const tiles = [];
  let cursor = { col: goal.col, row: goal.row };
  while (!(cursor.col === start.col && cursor.row === start.row)) {
    tiles.push(cursor);
    cursor = previous.get(key(cursor.col, cursor.row));
    if (!cursor) return [];
  }
  tiles.reverse();
  return tiles.map((tile) => ({ x: tile.col * TILE + TILE / 2, y: MAP.top + tile.row * TILE + TILE / 2 }));
}

/**
 * One step of the careful pilot: follow the planned route, crouch, and hold still only while the
 * tile it is about to enter is in a cone — a pause that is capped, so a scene always finishes.
 */
function carefulPilot(world, target, wait) {
  const route = routeTo(world, target);
  const p = world.player;
  if (route.length === 0) return { move: { x: 0, y: 0 }, crouch: true, sprint: false, waiting: false };

  // Look two tiles along: if the near future is watched, stop a beat and let the cone pass.
  const ahead = route.slice(0, 2);
  const watched = ahead.some((point) => {
    const { col, row } = tileOf(point.x, point.y);
    return tileExposed(world, col, row);
  });
  if (watched && wait < 1.1) return { move: { x: 0, y: 0 }, crouch: true, sprint: false, waiting: true };

  const next = route[0];
  const dx = next.x - p.x;
  const dy = next.y - p.y;
  const length = Math.hypot(dx, dy) || 1;
  // Sprint only where the route is clear for a while and no guard is near enough to hear it.
  const far = route.length > 5 && !watched
    && world.guards.every((g) => Math.hypot(g.x - p.x, g.y - p.y) > GUARD.ear + 70);
  return { move: { x: dx / length, y: dy / length }, crouch: !far, sprint: far, waiting: false };
}

/** Run the real simulation forward until `until` says stop, or `maxSeconds` runs out. */
function play(world, until, targetOf, maxSeconds, { crouched = true } = {}) {
  const limit = Math.round(maxSeconds / STEP);
  let wait = 0;
  for (let i = 0; i < limit; i += 1) {
    const decision = carefulPilot(world, targetOf(world), crouched ? wait : 0);
    wait = decision.waiting ? wait + STEP : 0;
    const move = crouched ? decision.move : decision.move;
    const aim = Math.atan2(move.y, move.x);
    step(world, move, crouched ? true : decision.crouch, decision.sprint, Number.isFinite(aim) ? aim : 0, STEP);
    if (until(world)) return true;
  }
  return false;
}

/**
 * Set `world` to the named scene and return the screen to draw. Every non-title scene is real play:
 * the relic scene stops a step short of the relic with the nearest cone visible, the escape scene
 * has the relic in hand and the open gate in frame, and the caught scene ends on a real catch.
 */
export function stageShot(name, world) {
  reset(world);
  if (name === 'title') {
    world.screen = 'title';
    return { screen: 'title' };
  }

  begin(world);
  const level = world.level;

  if (name === 'relic') {
    // Approach the plinth, but stop on the first frame where a guard's cone actually falls on the
    // relic tile: the still has to show the objective contested, not a relic in an empty room. If
    // the patrol never obliges within the time budget, the plain proximity frame stands.
    play(
      world,
      (w) => {
        const { col, row } = tileOf(w.level.relic.x, w.level.relic.y);
        const near = Math.hypot(w.player.x - w.level.relic.x, w.player.y - w.level.relic.y) < 96;
        return near && tileExposed(w, col, row);
      },
      () => level.relic,
      120,
    );
    world.player.crouched = true;
    return { screen: 'play' };
  }

  if (name === 'escape') {
    // Take the relic for real, then walk back west to the gate yard with it in hand, stopping in
    // the last stretch of floor before the gate so the frame shows the approach rather than the
    // arrival overlay.
    play(world, (w) => w.player.hasRelic, () => level.relic, 120);
    const yard = { x: 5 * TILE + TILE / 2, y: MAP.top + 16 * TILE + TILE / 2 };
    play(world, (w) => Math.hypot(w.player.x - yard.x, w.player.y - yard.y) < 58, () => yard, 90);
    return { screen: 'play' };
  }

  // chase: sprint through the open gallery until a guard has seen the thief and is hunting, then
  // stop one beat before the catch. The frame therefore shows a red cone, a lit alarm pip and a
  // guard actually closing, rather than the game-over panel that hides all of it.
  const chaseLimit = Math.round(60 / STEP);
  for (let i = 0; i < chaseLimit; i += 1) {
    const p = world.player;
    let best = world.guards[0];
    let bestDistance = Infinity;
    for (const guard of world.guards) {
      const d = Math.hypot(guard.x - p.x, guard.y - p.y);
      if (d < bestDistance) {
        bestDistance = d;
        best = guard;
      }
    }
    if (world.screen !== 'play') break;
    // Once hunted, keep running for the gate: the frame catches the thief mid-flight.
    const hunted = world.guards.some((g) => g.state === 'chase');
    const flee = hunted
      ? { x: world.level.exit.x, y: world.level.exit.y }
      : { x: best.x, y: best.y };
    if (hunted && world.alarms > 0 && world.time > 3.4 && bestDistance > 95 && bestDistance < 230) break;
    const route = routeTo(world, flee);
    const next = route.length ? route[0] : flee;
    const dx = next.x - p.x;
    const dy = next.y - p.y;
    const length = Math.hypot(dx, dy) || 1;
    step(world, { x: dx / length, y: dy / length }, false, true, Math.atan2(dy, dx), STEP);
  }
  return { screen: world.screen === 'caught' ? 'play' : world.screen };
}
