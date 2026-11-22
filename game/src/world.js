// The whole game as one state machine, with no drawing and no DOM in it: a fixed step forward, the
// thief's movement, the guards' perception, the relic and the gate, the alarm, and the score. The
// renderer reads this state and never writes it, and the screenshot scenes drive the same step
// function the player does.

import { EXIT, FIELD, GUARD, NOISE, PLAYER, RELIC, SCORE, SCREEN_CAUGHT, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WON, STEP } from './config.js';
import { createGuard, heardGain, lineOfSight, moveCircle, stepGuard } from './guard.js';
import { loadLevel, tileOf } from './level.js';

export { SCREEN_TITLE, SCREEN_PLAY, SCREEN_WON, SCREEN_CAUGHT };

export const EVENT_ALARM = 1;
export const EVENT_CAUGHT = 2;
export const EVENT_WON = 3;
export const EVENT_PICKUP = 4;

/** A fresh world on the level, in the title state, with every guard waiting at its first waypoint. */
export function createWorld() {
  const level = loadLevel();
  const world = {
    level,
    screen: SCREEN_TITLE,
    time: 0,
    alarms: 0,
    score: 0,
    player: {
      x: level.spawn.x,
      y: level.spawn.y,
      vx: 0,
      vy: 0,
      aim: 0,
      speed: 0,
      crouched: false,
      sprinting: false,
      hasRelic: false,
      stepPhase: 0,
      noise: 0,
      flash: 0,
      caught: false,
    },
    guards: level.routes.map(createGuard),
    alerts: 0,
    message: '',
    messageTimer: 0,
    alarmFlash: 0,
    particles: [],
  };
  reset(world);
  return world;
}

/** Put everything back to the start of a run, without rebuilding the level. */
export function reset(world) {
  world.time = 0;
  world.alarms = 0;
  world.score = 0;
  world.alerts = 0;
  world.player.x = world.level.spawn.x;
  world.player.y = world.level.spawn.y;
  world.player.vx = 0;
  world.player.vy = 0;
  world.player.aim = 0;
  world.player.speed = 0;
  world.player.crouched = false;
  world.player.sprinting = false;
  world.player.hasRelic = false;
  world.player.noise = 0;
  world.player.flash = 0;
  world.player.caught = false;
  world.player.stepPhase = 0;
  world.guards = world.level.routes.map(createGuard);
  world.alarmFlash = 0;
  world.particles.length = 0;
}

/** Start a run from the title screen. */
export function begin(world) {
  reset(world);
  world.screen = SCREEN_PLAY;
  world.message = 'Take the Ember Relic, then reach the gate unseen.';
  world.messageTimer = 4.5;
}

/** The exits a player can reach: the gate, once the relic is in hand. */
export function exitOpen(world) {
  return world.player.hasRelic;
}

/** Is the thief standing in the gate? */
export function atExit(world) {
  const p = world.player;
  const e = world.level.exit;
  return Math.abs(p.x - e.x) < EXIT.width / 2 && Math.abs(p.y - e.y) < EXIT.height / 2;
}

/** Is the relic close enough to take? */
export function atRelic(world) {
  const p = world.player;
  const r = world.level.relic;
  return Math.hypot(p.x - r.x, p.y - r.y) < RELIC.radius + PLAYER.radius + 6;
}

/** Add a puff of dust or a spark, purely cosmetic, capped so a long run cannot grow without bound. */
function puff(world, x, y, colour, count, spread) {
  if (world.particles.length > 220) return;
  for (let i = 0; i < count; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const speed = (0.3 + Math.random() * 0.7) * spread;
    world.particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0.35 + Math.random() * 0.45,
      max: 0.8,
      colour,
    });
  }
}

/**
 * One fixed step. `move` is {x, y} in -1..0..1 from the keyboard, `wantCrouch` and `wantSprint` the
 * modifier keys, and `aim` the mouse angle. Returns a bit mask of the events this step produced.
 */
export function step(world, move, wantCrouch, wantSprint, aim, dt = STEP) {
  let events = 0;
  world.alarmFlash = Math.max(0, world.alarmFlash - dt * 1.8);
  world.messageTimer = Math.max(0, world.messageTimer - dt);
  world.player.flash = Math.max(0, world.player.flash - dt);

  for (let i = world.particles.length - 1; i >= 0; i -= 1) {
    const p = world.particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vx *= 0.94;
    p.vy *= 0.94;
    p.life -= dt;
    if (p.life <= 0) world.particles.splice(i, 1);
  }

  if (world.screen !== SCREEN_PLAY || world.player.caught) return events;

  world.time += dt;
  const player = world.player;
  player.crouched = wantCrouch;
  player.sprinting = wantSprint && !wantCrouch;

  // --- the thief moves ------------------------------------------------------------------
  const speed = player.crouched ? PLAYER.crouchSpeed : player.sprinting ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
  const length = Math.hypot(move.x, move.y);
  const dirX = length > 0 ? move.x / length : 0;
  const dirY = length > 0 ? move.y / length : 0;
  player.speed = length > 0 ? speed : 0;
  if (length > 0) {
    const radius = player.crouched ? PLAYER.crouchRadius : PLAYER.radius;
    const moved = moveCircle(world.level, player.x, player.y, dirX * speed * dt, dirY * speed * dt, radius);
    player.x = moved.x;
    player.y = moved.y;
    player.stepPhase += dt * (player.sprinting ? 13 : player.crouched ? 4.5 : 8);
    if (player.sprinting && Math.floor(player.stepPhase / 1.4) !== Math.floor((player.stepPhase - dt * 13) / 1.4)) {
      puff(world, player.x, player.y + 6, '#7b8ea8', 2, 0.6);
    }
  }
  if (typeof aim === 'number') player.aim = aim;

  // --- the relic and the gate ----------------------------------------------------------
  if (!player.hasRelic && atRelic(world)) {
    player.hasRelic = true;
    events |= EVENT_PICKUP;
    world.message = 'The Ember Relic is yours. The west gate is open.';
    world.messageTimer = 4;
    puff(world, world.level.relic.x, world.level.relic.y, '#ffd479', 14, 1.6);
  }
  if (exitOpen(world) && atExit(world)) {
    world.screen = SCREEN_WON;
    world.score += SCORE.extraction + (world.alarms === 0 ? SCORE.silent : 0) - world.alarms * SCORE.perAlarm;
    events |= EVENT_WON;
    puff(world, world.level.exit.x, world.level.exit.y, '#5ce6a4', 18, 1.8);
    return events;
  }

  // --- what each guard perceives and does ----------------------------------------------
  let anyAlert = false;
  for (const guard of world.guards) {
    const gain = heardGain(guard, player, dt);
    if (gain > 0) {
      guard.suspicion = Math.min(GUARD.alertAt, guard.suspicion + gain);
      guard.lastSeen = { x: player.x, y: player.y };
      guard.memory = Math.max(guard.memory, GUARD.loseTrackAfter * 0.7);
    }
    const outcome = stepGuard(guard, world.level, player, dt, gain);
    guard.viewState = outcome.state;
    for (const event of outcome.events) {
      if (event.type === 'alarm') {
        world.alarms += 1;
        world.alarmFlash = 1;
        events |= EVENT_ALARM;
        world.message = `${guard.name} raised the alarm at ${guard.post}.`;
        world.messageTimer = 4;
      } else if (event.type === 'caught') {
        player.caught = true;
        player.flash = PLAYER.hitFlash;
        world.screen = SCREEN_CAUGHT;
        world.score = 0;
        events |= EVENT_CAUGHT;
        world.message = `${guard.name} caught you at ${guard.post}.`;
        world.messageTimer = 6;
        puff(world, player.x, player.y, '#ff5d6c', 20, 2);
        return events;
      }
    }
    if (guard.state === 'chase') anyAlert = true;
  }

  // The score keeps ticking down the clock: a fast run is worth more than a slow one.
  if (world.screen === SCREEN_PLAY) {
    world.score = Math.max(0, world.score);
    world.alerts = anyAlert ? world.alerts + dt : world.alerts;
  }
  return events;
}

/** The score as the HUD shows it: time taken, alarms raised, and whether the run was silent. */
export function scoreBreakdown(world) {
  const seconds = Math.max(0, world.time);
  const timePoints = Math.max(0, 240 - Math.round(seconds * SCORE.perSecond));
  const alarmPenalty = world.alarms * SCORE.perAlarm * 10;
  const bonus = world.screen === SCREEN_WON ? SCORE.extraction + (world.alarms === 0 ? SCORE.silent : 0) : 0;
  return {
    seconds,
    timePoints,
    alarmPenalty,
    bonus,
    total: Math.max(0, timePoints - alarmPenalty + bonus),
  };
}

/** The guard nearest to the thief, and how close it is: the HUD's threat readout. */
export function nearestGuard(world) {
  let best = null;
  let bestDistance = Infinity;
  for (const guard of world.guards) {
    const d = Math.hypot(guard.x - world.player.x, guard.y - world.player.y);
    if (d < bestDistance) {
      bestDistance = d;
      best = guard;
    }
  }
  return { guard: best, distance: bestDistance };
}

/** How much of the board is behind the thief: the HUD's progress readout. */
export function progress(world) {
  if (world.player.hasRelic) {
    const e = world.level.exit;
    const p = world.player;
    const total = Math.hypot(e.x - world.level.relic.x, e.y - world.level.relic.y) || 1;
    const left = Math.hypot(e.x - p.x, e.y - p.y);
    return { stage: 'out', fraction: Math.max(0, Math.min(1, 1 - left / total)) };
  }
  const r = world.level.relic;
  const p = world.player;
  const total = Math.hypot(r.x - world.level.spawn.x, r.y - world.level.spawn.y) || 1;
  const left = Math.hypot(r.x - p.x, r.y - p.y);
  return { stage: 'relic', fraction: Math.max(0, Math.min(1, 1 - left / total)) };
}

export { FIELD, NOISE, tileOf, lineOfSight };
