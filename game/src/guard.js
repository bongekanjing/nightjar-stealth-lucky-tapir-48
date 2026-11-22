// What a guard sees and hears, and how it decides what to do about it. Vision is a cone with a
// range, blocked by walls and cover; hearing is a radius that only a sprint reaches. A guard's
// memory of the thief fades, which is what gives a player a chance to recover from a near miss.

import { GUARD, MAP, NOISE, PLAYER, STEP, TILE } from './config.js';
import { opaqueAt, tileOf } from './level.js';

/** Angle difference folded into (-PI, PI]. */
export function angleDelta(a, b) {
  let d = (b - a + Math.PI) % (Math.PI * 2);
  if (d < 0) d += Math.PI * 2;
  return d - Math.PI;
}

/** Squared distance, to keep the hot loop free of square roots. */
function dist2(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

/**
 * Whether anything solid stands between two points: a Bresenham walk over the tile grid, stopping
 * at the first wall or cover tile. This is the same rule the renderer darkens the floor by, so a
 * cone drawn on screen is exactly the cone the guard can see through.
 */
export function lineOfSight(tiles, ax, ay, bx, by) {
  let c0 = Math.floor(ax / TILE);
  let r0 = Math.floor((ay - MAP.top) / TILE);
  const c1 = Math.floor(bx / TILE);
  const r1 = Math.floor((by - MAP.top) / TILE);
  if (c0 === c1 && r0 === r1) return true;
  const dc = Math.abs(c1 - c0);
  const dr = Math.abs(r1 - r0);
  const sc = c0 < c1 ? 1 : -1;
  const sr = r0 < r1 ? 1 : -1;
  let err = dc - dr;
  // Walk the grid, skipping the guard's own tile and checking every tile the line crosses.
  let first = true;
  while (true) {
    if (!first && opaqueAt(tiles, c0, r0)) return false;
    first = false;
    if (c0 === c1 && r0 === r1) return true;
    const e2 = err * 2;
    if (e2 > -dr) {
      err -= dr;
      c0 += sc;
    }
    if (e2 < dc) {
      err += dc;
      r0 += sr;
    }
  }
}

/** A guard, at the first point of its route, facing along that route's first leg. */
export function createGuard(route) {
  const [first, second] = [route.path[0], route.path[1]];
  return {
    id: route.id,
    name: route.name,
    post: route.post,
    path: route.path,
    dwell: route.dwell,
    x: first.x,
    y: first.y,
    facing: Math.atan2(second.y - first.y, second.x - first.x),
    aim: 0,
    leg: 1,
    wait: 0,
    scan: 0,
    state: 'calm',
    suspicion: 0,
    memory: 0,
    lastSeen: null,
    catchCooldown: 0,
    alertTimer: 0,
  };
}

/** Move a circle by (dx, dy), sliding along a wall instead of stopping dead at it. */
export function moveCircle(level, x, y, dx, dy, radius) {
  let nx = x + dx;
  let ny = y + dy;
  const blocked = (px, py) => {
    const { col, row } = tileOf(px, py);
    if (opaqueAt(level.tiles, col, row)) return true;
    // Also refuse a step that puts the body's edge through a corner.
    const corners = [
      [px - radius, py - radius],
      [px + radius, py - radius],
      [px - radius, py + radius],
      [px + radius, py + radius],
    ];
    return corners.some(([cx, cy]) => {
      const tiled = tileOf(cx, cy);
      return opaqueAt(level.tiles, tiled.col, tiled.row);
    });
  };
  if (!blocked(nx, y)) x = nx;
  else ny = y;
  if (!blocked(x, ny)) y = ny;
  return { x, y };
}

/**
 * Advance one guard by one step. Returns the events this step produced, so the caller can raise
 * the alarm, play a sound or score a catch without the guard knowing about any of it.
 */
export function stepGuard(guard, level, player, dt, noise) {
  const events = [];
  const px = player.x;
  const py = player.y;

  // --- what it can perceive right now -------------------------------------------------
  const distance2 = dist2(guard.x, guard.y, px, py);
  const range = guard.state === 'chase' ? GUARD.coneRange * 1.25 : GUARD.coneRange;
  const inCone = distance2 < range * range
    && Math.abs(angleDelta(guard.facing, Math.atan2(py - guard.y, px - guard.x))) < GUARD.coneAngle
    && lineOfSight(level.tiles, guard.x, guard.y, px, py);
  const hidden = player.crouched && distance2 > (range * 0.45) * (range * 0.45);
  const sees = inCone && !hidden;

  guard.memory = Math.max(0, guard.memory - dt);
  guard.catchCooldown = Math.max(0, guard.catchCooldown - dt);

  if (sees) {
    const closeness = 1 - Math.sqrt(distance2) / range;
    const gain = GUARD.sightGain * (0.55 + 0.85 * closeness) * (player.crouched ? GUARD.crouchFactor : 1);
    guard.suspicion = Math.min(GUARD.alertAt, guard.suspicion + gain * dt);
    guard.memory = GUARD.loseTrackAfter;
    guard.lastSeen = { x: px, y: py };
    if (guard.state === 'calm') events.push({ type: 'spotted', guard });
  } else if (noise > 0) {
    guard.suspicion = Math.min(GUARD.alertAt, guard.suspicion + noise * dt);
    guard.lastSeen = { x: px, y: py };
    guard.memory = Math.max(guard.memory, GUARD.loseTrackAfter * 0.7);
  } else {
    guard.suspicion = Math.max(0, guard.suspicion - GUARD.decay * dt);
  }

  // --- what it does about it ------------------------------------------------------------
  if (guard.suspicion >= GUARD.alertAt && guard.state !== 'chase') {
    guard.state = 'chase';
    guard.alertTimer = 0;
    events.push({ type: 'alarm', guard });
  } else if (guard.state === 'chase' && guard.suspicion <= GUARD.calmBelow && guard.memory <= 0) {
    guard.state = 'search';
    events.push({ type: 'lostTrack', guard });
  } else if (guard.state === 'search' && guard.suspicion <= 0.02) {
    guard.state = 'calm';
  }

  if (guard.state === 'chase' || guard.state === 'search') {
    const goal = guard.lastSeen ?? guard.path[guard.leg];
    const dx = goal.x - guard.x;
    const dy = goal.y - guard.y;
    const want = Math.atan2(dy, dx);
    guard.facing += angleDelta(guard.facing, want) * Math.min(1, GUARD.aimTurn * dt);
    const speed = guard.state === 'chase' ? GUARD.chaseSpeed : GUARD.speed * 1.35;
    const step = speed * dt;
    const length = Math.hypot(dx, dy);
    if (length > 1.5) {
      const moved = moveCircle(level, guard.x, guard.y, (dx / length) * step, (dy / length) * step, GUARD.radius);
      guard.x = moved.x;
      guard.y = moved.y;
    } else if (guard.state === 'chase') {
      // Reached where it last saw the thief and found nothing: go back to the route.
      guard.state = 'search';
    }
    if (guard.state === 'chase' && distance2 < GUARD.catchRadius * GUARD.catchRadius && guard.catchCooldown === 0) {
      guard.catchCooldown = 1.2;
      events.push({ type: 'caught', guard });
    }
  } else {
    // On the route: walk the current leg, pause and scan at each waypoint.
    const target = guard.path[guard.leg];
    const dx = target.x - guard.x;
    const dy = target.y - guard.y;
    const distance = Math.hypot(dx, dy);
    if (guard.wait > 0) {
      guard.wait -= dt;
      guard.scan += dt * GUARD.scanSpeed;
      guard.facing += Math.sin(guard.scan) * 1.6 * dt;
    } else if (distance < 2.5) {
      guard.wait = guard.dwell[guard.leg % guard.dwell.length];
      guard.scan = 0;
      guard.leg = (guard.leg + 1) % guard.path.length;
    } else {
      const want = Math.atan2(dy, dx);
      guard.facing += angleDelta(guard.facing, want) * Math.min(1, GUARD.aimTurn * 0.7 * dt);
      const moved = moveCircle(level, guard.x, guard.y, (dx / distance) * GUARD.speed * dt, (dy / distance) * GUARD.speed * dt, GUARD.radius);
      if (Math.abs(moved.x - guard.x) < 0.01 && Math.abs(moved.y - guard.y) < 0.01) {
        // Wedged on a corner: nudge around it rather than standing still forever.
        const slide = Math.hypot(dx, dy) > 0 ? Math.atan2(dy, dx) + Math.PI / 2 : 0;
        const nudge = moveCircle(level, guard.x, guard.y, Math.cos(slide) * GUARD.speed * dt, Math.sin(slide) * GUARD.speed * dt, GUARD.radius);
        guard.x = nudge.x;
        guard.y = nudge.y;
      }
      guard.x = moved.x;
      guard.y = moved.y;
    }
  }

  const state = guard.state === 'chase' ? 'alert'
    : guard.suspicion > GUARD.calmBelow || guard.state === 'search' ? 'suspicious'
      : 'calm';
  return { events, state, sees };
}

/** How far a footstep carries, given how the thief is moving. */
export function noiseRadius(player) {
  if (player.speed <= 0) return 0;
  return player.sprinting ? GUARD.ear : player.crouched ? 0 : GUARD.ear * 0.4;
}

/** The suspicion a sprinting thief at this distance adds to a guard each second. */
export function heardGain(guard, player, dt) {
  if (!player.sprinting || player.speed <= 0) return 0;
  const d = Math.hypot(player.x - guard.x, player.y - guard.y);
  if (d > GUARD.ear) return 0;
  return NOISE.sprintGain * (1 - d / GUARD.ear) * (dt / STEP);
}

export const GUARD_STEP = STEP;
export const PLAYER_CROUCH_RADIUS = PLAYER.crouchRadius;
