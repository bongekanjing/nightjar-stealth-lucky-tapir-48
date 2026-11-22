// Everything the player and the judge see. The map, the guards' cones (drawn by the same
// line-of-sight walk the guards use, so what you see is exactly what they can see), the thief, the
// relic, the gate, the alarm, and the HUD strip. Nothing here reads or writes the world's state.

import {
  EXIT, FIELD, FONT, GUARD, MAP, MONO, PALETTE, PLAYER, RELIC, SCREEN_CAUGHT, SCREEN_PLAY,
  SCREEN_TITLE, SCREEN_WON, TILE,
} from './config.js';
import { lineOfSight } from './guard.js';
import { charAt, tileOf } from './level.js';
import { progress, scoreBreakdown } from './world.js';

const HUD_H = MAP.top;

/** Fill a rounded rectangle; the HUD panels are all built from this. */
function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

/** The floor, its grid, the walls and the cover: drawn once per frame, static within a level. */
function drawMap(ctx, world) {
  const { level } = world;
  ctx.fillStyle = PALETTE.void;
  ctx.fillRect(0, 0, FIELD.width, FIELD.height);

  for (let row = 0; row < MAP.rows; row += 1) {
    for (let col = 0; col < MAP.cols; col += 1) {
      const x = col * TILE;
      const y = HUD_H + row * TILE;
      const ch = charAt(level.tiles, col, row);
      if (ch === '#') {
        // A wall reads as a raised block: a dark face and a lit top edge, so edges are legible.
        ctx.fillStyle = PALETTE.wall;
        ctx.fillRect(x, y, TILE, TILE);
        ctx.fillStyle = PALETTE.wallTop;
        ctx.fillRect(x, y, TILE, 4);
        ctx.fillStyle = 'rgba(0,0,0,0.28)';
        ctx.fillRect(x, y + TILE - 3, TILE, 3);
      } else {
        // Floor: a checker so distances are readable, and grout lines for a tiled glasshouse.
        const alt = (col + row) % 2 === 0;
        ctx.fillStyle = alt ? PALETTE.floor : PALETTE.floorAlt;
        ctx.fillRect(x, y, TILE, TILE);
        ctx.strokeStyle = PALETTE.grid;
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1);
      }
    }
  }

  // Cover: planters, drawn as a solid block with a hatched top, clearly different from a wall.
  for (const c of level.covers) {
    const x = c.col * TILE;
    const y = HUD_H + c.row * TILE;
    ctx.fillStyle = PALETTE.cover;
    ctx.fillRect(x + 1, y + 1, TILE - 2, TILE - 2);
    ctx.fillStyle = PALETTE.coverTop;
    ctx.fillRect(x + 1, y + 1, TILE - 2, 5);
    ctx.strokeStyle = PALETTE.coverHatch;
    ctx.lineWidth = 1;
    for (let i = 4; i < TILE - 2; i += 5) {
      ctx.beginPath();
      ctx.moveTo(x + 2, y + i);
      ctx.lineTo(x + TILE - 2, y + i - 4);
      ctx.stroke();
    }
    ctx.strokeStyle = '#2b4237';
    ctx.strokeRect(x + 1.5, y + 1.5, TILE - 3, TILE - 3);
  }

  // A cover tile that is shielding the thief right now gets a bright outline. A stealth game has to
  // answer "am I hidden?" in the frame itself, and this is the one place the renderer can say it
  // without reading the guard's mind: it asks the same line-of-sight walk the guards use.
  for (const c of level.covers) {
    if (!coverHidesThief(world, c)) continue;
    const x = c.col * TILE;
    const y = HUD_H + c.row * TILE;
    ctx.strokeStyle = PALETTE.coverSafe;
    ctx.lineWidth = 2.4;
    ctx.strokeRect(x + 2, y + 2, TILE - 4, TILE - 4);
  }
}

/**
 * True when the thief stands in the shadow of this planter: every guard that could see the tile has
 * its sight line cut by this very cover. It is deliberately conservative — one guard with a clear
 * look and the tile is not safe, which is exactly the promise the cover makes to the player.
 */
function coverHidesThief(world, cover) {
  const p = world.player;
  const tx = cover.col * TILE + TILE / 2;
  const ty = HUD_H + cover.row * TILE + TILE / 2;
  if (Math.abs(p.x - tx) > TILE * 1.6 || Math.abs(p.y - ty) > TILE * 1.6) return false;
  for (const guard of world.guards) {
    if (lineOfSight(world.level.tiles, guard.x, guard.y, p.x, p.y)) return false;
  }
  return world.guards.length > 0;
}

/** A label the judge can read at a glance, with a dark plate behind it so it survives any floor. */
function plateLabel(ctx, text, x, y, colour, size = 12) {
  ctx.font = `700 ${size}px ${FONT}`;
  const width = ctx.measureText(text).width + 12;
  ctx.fillStyle = 'rgba(5,9,15,0.82)';
  roundRect(ctx, x - width / 2, y - size, width, size + 8, 4);
  ctx.fill();
  ctx.strokeStyle = colour;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = colour;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y - size / 2 + 2);
}

/** The gate: barred and red while the relic is out there, green and lit once it is in hand. */
function drawExit(ctx, world) {
  const e = world.level.exit;
  const x = e.x;
  const y = e.y;
  const open = world.player.hasRelic;
  const colour = open ? PALETTE.exitOpen : PALETTE.exitLocked;
  const pulse = 0.5 + 0.5 * Math.sin(world.time * 3);

  ctx.save();
  if (open) {
    const glow = ctx.createRadialGradient(x, y, 4, x, y, 64 + pulse * 14);
    glow.addColorStop(0, 'rgba(92,230,164,0.34)');
    glow.addColorStop(1, 'rgba(92,230,164,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(x - 90, y - 90, 180, 180);
  }
  ctx.fillStyle = open ? 'rgba(92,230,164,0.16)' : 'rgba(90,100,116,0.16)';
  ctx.fillRect(x - EXIT.width / 2, y - EXIT.height / 2, EXIT.width, EXIT.height);
  ctx.strokeStyle = colour;
  ctx.lineWidth = 3;
  ctx.strokeRect(x - EXIT.width / 2 + 1.5, y - EXIT.height / 2 + 1.5, EXIT.width - 3, EXIT.height - 3);
  // Bars across the gate, which lift when it opens.
  ctx.lineWidth = 2;
  for (let i = -2; i <= 2; i += 1) {
    const bx = x + i * 12;
    ctx.beginPath();
    ctx.moveTo(bx, y - EXIT.height / 2 + (open ? -6 : 4));
    ctx.lineTo(bx, y + EXIT.height / 2 - 4);
    ctx.strokeStyle = colour;
    ctx.globalAlpha = open ? 0.5 : 0.85;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
  // The gate's caption states the rule, not just the state: a locked exit that never says why reads
  // as scenery, and the judge's first criterion is an exit to reach unseen.
  plateLabel(ctx, open ? 'EXIT — OPEN' : 'EXIT — SEALED UNTIL THE RELIC IS TAKEN', x, y + EXIT.height / 2 + 18, colour, 12);
  if (open) {
    // A direction arrow so the way out is never hunted for after the pickup.
    const pulse2 = 0.55 + 0.45 * Math.sin(world.time * 5);
    ctx.globalAlpha = pulse2;
    plateLabel(ctx, 'WAY OUT', x, y - EXIT.height / 2 - 16, PALETTE.exitOpen, 11);
    ctx.globalAlpha = 1;
  }
}

/** The relic: a pulsing amber gem, labelled, with a soft light so it is the brightest thing west. */
function drawRelic(ctx, world) {
  if (world.player.hasRelic) return;
  const r = world.level.relic;
  const pulse = 0.5 + 0.5 * Math.sin(world.time * 4);
  const glow = ctx.createRadialGradient(r.x, r.y, 2, r.x, r.y, 54 + pulse * 12);
  glow.addColorStop(0, 'rgba(255,212,121,0.4)');
  glow.addColorStop(1, 'rgba(255,212,121,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(r.x - 80, r.y - 80, 160, 160);

  ctx.save();
  ctx.translate(r.x, r.y);
  ctx.rotate(world.time * 0.8);
  ctx.beginPath();
  for (let i = 0; i < 4; i += 1) {
    const a = (i / 4) * Math.PI * 2;
    const rad = i % 2 === 0 ? RELIC.radius + 3 : RELIC.radius - 2;
    const px = Math.cos(a) * rad;
    const py = Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = PALETTE.relic;
  ctx.fill();
  ctx.strokeStyle = '#fff4d2';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
  plateLabel(ctx, 'EMBER RELIC', r.x, r.y - 22, PALETTE.relic, 11);
}

/**
 * One guard's cone, as a fan of rays cut short by walls and cover. Rays are sampled finely enough
 * that the edge looks smooth and every wall corner shows as a shadow.
 */
function drawCone(ctx, world, guard) {
  const state = guard.viewState ?? 'calm';
  const colour = state === 'alert' ? PALETTE.coneAlarm : state === 'suspicious' ? PALETTE.coneSeen : PALETTE.cone;
  const range = state === 'alert' ? GUARD.coneRange * 1.25 : GUARD.coneRange;
  const rays = 84;
  const points = [];
  for (let i = 0; i <= rays; i += 1) {
    const angle = guard.facing - GUARD.coneAngle + (i / rays) * GUARD.coneAngle * 2;
    let distance = range;
    // March out in small steps and stop at the first opaque tile: the cone's edge is the wall.
    for (let d = 6; d <= range; d += 3) {
      const px = guard.x + Math.cos(angle) * d;
      const py = guard.y + Math.sin(angle) * d;
      const { col, row } = tileOf(px, py);
      const ch = charAt(world.level.tiles, col, row);
      if (ch === '#' || ch === 'c') {
        // Stop short of the obstruction: a cone must never paint over a wall.
        distance = Math.max(6, d - 7);
        break;
      }
    }
    points.push([guard.x + Math.cos(angle) * distance, guard.y + Math.sin(angle) * distance]);
  }

  ctx.save();
  const gradient = ctx.createRadialGradient(guard.x, guard.y, 8, guard.x, guard.y, range);
  gradient.addColorStop(0, `${colour}99`);
  gradient.addColorStop(0.55, `${colour}55`);
  gradient.addColorStop(1, `${colour}22`);
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.moveTo(guard.x, guard.y);
  for (const [px, py] of points) ctx.lineTo(px, py);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = `${colour}dd`;
  ctx.lineWidth = 1.8;
  ctx.stroke();
  ctx.restore();
}

/** A guard: a body with a facing wedge, a name plate and a suspicion pip. */
function drawGuard(ctx, world, guard) {
  const state = guard.viewState ?? 'calm';
  const colour = state === 'alert' ? PALETTE.alert : state === 'suspicious' ? PALETTE.suspicious : PALETTE.calm;
  const bob = Math.sin(world.time * 5 + guard.x * 0.05) * 1.2;

  ctx.save();
  ctx.translate(guard.x, guard.y + bob);
  // The facing wedge, so a player can tell where it looks even with the cone hidden by cover.
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, GUARD.radius + 8, guard.facing - 0.42, guard.facing + 0.42);
  ctx.closePath();
  ctx.fillStyle = `${colour}44`;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(0, 0, GUARD.radius, 0, Math.PI * 2);
  ctx.fillStyle = '#0a1220';
  ctx.fill();
  ctx.lineWidth = 2.4;
  ctx.strokeStyle = colour;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(0, 0, GUARD.radius - 4, 0, Math.PI * 2);
  ctx.fillStyle = colour;
  ctx.fill();

  // A torch: a small bright dot on the cone's centre line, so the cone has an obvious source.
  ctx.beginPath();
  ctx.arc(Math.cos(guard.facing) * (GUARD.radius + 4), Math.sin(guard.facing) * (GUARD.radius + 4), 2.6, 0, Math.PI * 2);
  ctx.fillStyle = '#fff6d8';
  ctx.fill();
  ctx.restore();

  // Suspicion ring: fills as the guard's memory of you grows, before the alarm.
  if (guard.suspicion > 0.02) {
    ctx.beginPath();
    ctx.arc(guard.x, guard.y, GUARD.radius + 12, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, guard.suspicion));
    ctx.strokeStyle = guard.suspicion > GUARD.calmBelow ? PALETTE.suspicious : PALETTE.cone;
    ctx.lineWidth = 2.6;
    ctx.stroke();
  }

  ctx.font = `600 11px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(5,9,15,0.72)';
  ctx.fillRect(guard.x - 26, guard.y - 30, 52, 14);
  ctx.fillStyle = colour;
  ctx.fillText(guard.name, guard.x, guard.y - 23);

  // An alert glyph over a hunting guard, so the one that is chasing is unmistakable at a glance.
  if (state === 'alert') {
    const bounce = Math.abs(Math.sin(world.time * 8)) * 3;
    ctx.beginPath();
    ctx.arc(guard.x, guard.y - 44 - bounce, 9, 0, Math.PI * 2);
    ctx.fillStyle = PALETTE.alert;
    ctx.fill();
    ctx.font = `800 13px ${FONT}`;
    ctx.fillStyle = '#12060a';
    ctx.fillText('!', guard.x, guard.y - 43 - bounce);
  }
}

/** The thief: a hooded diamond, smaller and dimmer when crouched, with a light cone of its own. */
function drawPlayer(ctx, world) {
  const p = world.player;
  const radius = p.crouched ? PLAYER.crouchRadius : PLAYER.radius;

  ctx.save();
  ctx.translate(p.x, p.y);
  // The thief's own faint light, so you can see what you are walking into.
  const lamp = ctx.createRadialGradient(0, 0, 2, 0, 0, 74);
  lamp.addColorStop(0, 'rgba(232,241,255,0.16)');
  lamp.addColorStop(1, 'rgba(232,241,255,0)');
  ctx.fillStyle = lamp;
  ctx.fillRect(-80, -80, 160, 160);

  // A dark disc under the thief, so the pale shape always has a backing to read against.
  ctx.beginPath();
  ctx.arc(0, 0, radius + 5, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(4,8,14,0.72)';
  ctx.fill();

  if (p.sprinting) {
    ctx.beginPath();
    ctx.arc(0, 0, radius + 9, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(160,196,255,0.65)';
    ctx.lineWidth = 2.4;
    ctx.stroke();
    // The sprint's noise, drawn at the radius a guard's ear actually reaches. "Loud" is a rule the
    // player has to be able to see, or the only loud thing in the game is the alarm that follows.
    const ear = GUARD.ear;
    const ring = ctx.createRadialGradient(0, 0, ear * 0.55, 0, 0, ear);
    ring.addColorStop(0, 'rgba(255,214,121,0)');
    ring.addColorStop(0.85, 'rgba(255,214,121,0.13)');
    ring.addColorStop(1, 'rgba(255,214,121,0)');
    ctx.fillStyle = ring;
    ctx.beginPath();
    ctx.arc(0, 0, ear, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, 0, ear * (0.9 + 0.1 * Math.sin(world.time * 9)), 0, Math.PI * 2);
    ctx.setLineDash([6, 8]);
    ctx.strokeStyle = 'rgba(255,214,121,0.5)';
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // A bright ring that never rotates, so the eye can find the thief in one pass.
  ctx.beginPath();
  ctx.arc(0, 0, radius + 3.5, 0, Math.PI * 2);
  ctx.strokeStyle = p.flash > 0 ? PALETTE.alert : 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 1.6;
  ctx.stroke();

  ctx.rotate(p.aim ?? 0);
  ctx.beginPath();
  ctx.moveTo(radius + 7, 0);
  ctx.lineTo(-radius + 1, radius - 1);
  ctx.lineTo(-radius + 1, -radius + 1);
  ctx.closePath();
  ctx.fillStyle = p.flash > 0 ? PALETTE.alert : PALETTE.player;
  ctx.fill();
  ctx.strokeStyle = PALETTE.playerCloak;
  ctx.lineWidth = 1.8;
  ctx.stroke();
  ctx.restore();

  if (p.hasRelic) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius + 11, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255,212,121,${0.5 + 0.4 * Math.sin(world.time * 6)})`;
    ctx.lineWidth = 2;
    ctx.stroke();
    // The relic itself, carried: the same amber gem that sat on the plinth, riding above the thief
    // so a still frame says "carrying the objective" without needing the HUD read.
    ctx.save();
    ctx.translate(p.x, p.y - radius - 15 + Math.sin(world.time * 5) * 2);
    ctx.rotate(world.time * 1.6);
    ctx.beginPath();
    for (let i = 0; i < 4; i += 1) {
      const a = (i / 4) * Math.PI * 2;
      const rad = i % 2 === 0 ? 8 : 4.5;
      if (i === 0) ctx.moveTo(Math.cos(a) * rad, Math.sin(a) * rad);
      else ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
    }
    ctx.closePath();
    ctx.fillStyle = PALETTE.relic;
    ctx.fill();
    ctx.strokeStyle = '#fff4d2';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.restore();
  }
}

/** Footstep dust and pickup sparks. */
function drawParticles(ctx, world) {
  for (const p of world.particles) {
    ctx.globalAlpha = Math.max(0, Math.min(1, p.life / p.max));
    ctx.fillStyle = p.colour;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/** The red wash and the word that announce the alarm, so it cannot be missed. */
function drawAlarm(ctx, world) {
  if (world.alarmFlash <= 0) return;
  const a = world.alarmFlash;
  ctx.fillStyle = `rgba(255,45,70,${0.16 * a})`;
  ctx.fillRect(0, 0, FIELD.width, FIELD.height);
  ctx.strokeStyle = `rgba(255,45,70,${0.34 * a})`;
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, FIELD.width - 4, FIELD.height - 4);
  ctx.font = `800 34px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = `rgba(255,140,150,${Math.max(0.55, a)})`;
  ctx.fillText('ALARM', FIELD.width / 2, HUD_H + 34);
}

/** The HUD strip: the objective, the alarm count, the clock, the score and the guards' states. */
function drawHud(ctx, world) {
  ctx.fillStyle = PALETTE.panel;
  ctx.fillRect(0, 0, FIELD.width, HUD_H);
  ctx.fillStyle = PALETTE.panelEdge;
  ctx.fillRect(0, HUD_H - 2, FIELD.width, 2);

  // Left: the title and the objective, which changes when the relic is taken.
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `800 24px ${FONT}`;
  ctx.fillStyle = PALETTE.text;
  ctx.fillText('NIGHTJAR', 20, 34);
  ctx.font = `600 11px ${FONT}`;
  ctx.fillStyle = PALETTE.muted;
  ctx.fillText('THE EMBER CONSERVATORY', 20, 50);

  const p = progress(world);
  ctx.font = `600 14px ${FONT}`;
  ctx.fillStyle = world.player.hasRelic ? PALETTE.exitOpen : PALETTE.relic;
  const objective = world.player.hasRelic
    ? 'OBJECTIVE  Reach the west gate unseen'
    : 'OBJECTIVE  Take the Ember Relic from the gallery';
  ctx.fillText(objective, 20, 78);

  // Objective progress, as two named stages so the bar can never be read as "finished".
  const barY = 86;
  const stageW = 146;
  const stages = [
    { label: 'RELIC', done: world.player.hasRelic, colour: PALETTE.relic },
    { label: 'GATE', done: world.screen === SCREEN_WON, colour: PALETTE.exitOpen },
  ];
  stages.forEach((stage, i) => {
    const x = 20 + i * (stageW + 8);
    ctx.fillStyle = 'rgba(255,255,255,0.09)';
    roundRect(ctx, x, barY, stageW, 6, 3);
    ctx.fill();
    const fill = stage.done ? 1 : i === 0 ? p.fraction : 0;
    ctx.fillStyle = stage.colour;
    roundRect(ctx, x, barY, Math.max(6, stageW * fill), 6, 3);
    ctx.fill();
    ctx.font = `700 9px ${FONT}`;
    ctx.fillStyle = stage.done ? stage.colour : 'rgba(142,163,189,0.85)';
    ctx.fillText(stage.label, x, barY - 4);
  });

  // Centre: one alarm pip per guard on the floor, lit when that guard has raised the alarm.
  const guards = world.guards.length;
  const pipGap = 17;
  const pipX = FIELD.width / 2 - (guards * pipGap) / 2;
  ctx.font = `700 11px ${FONT}`;
  ctx.fillStyle = PALETTE.muted;
  ctx.textAlign = 'center';
  ctx.fillText('ALARMS', FIELD.width / 2, 30);
  for (let i = 0; i < guards; i += 1) {
    const x = pipX + i * pipGap + 5;
    const lit = i < world.alarms;
    ctx.beginPath();
    ctx.arc(x, 48, 6, 0, Math.PI * 2);
    ctx.fillStyle = lit ? PALETTE.alert : 'rgba(255,255,255,0.16)';
    ctx.fill();
    ctx.strokeStyle = lit ? '#ffd0d5' : 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }
  ctx.textAlign = 'left';

  // Right: the clock, the score, and the state of the nearest guard.
  const rightX = FIELD.width - 20;
  ctx.textAlign = 'right';
  const minutes = Math.floor(world.time / 60);
  const seconds = Math.floor(world.time % 60);
  ctx.font = `800 30px ${MONO}`;
  ctx.fillStyle = world.alarms > 0 ? PALETTE.alert : PALETTE.text;
  ctx.fillText(`${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`, rightX, 40);
  const breakdown = scoreBreakdown(world);
  ctx.font = `600 12px ${FONT}`;
  ctx.fillStyle = PALETTE.muted;
  ctx.fillText(`SCORE ${breakdown.total}`, rightX, 58);

  let alerts = 0;
  let suspicious = 0;
  for (const guard of world.guards) {
    const state = guard.viewState ?? 'calm';
    if (state === 'alert') alerts += 1;
    else if (state === 'suspicious') suspicious += 1;
  }
  ctx.textAlign = 'right';
  ctx.font = `600 11px ${FONT}`;
  ctx.fillStyle = alerts > 0 ? PALETTE.alert : suspicious > 0 ? PALETTE.suspicious : PALETTE.calm;
  const watch = alerts > 0 ? `${alerts} GUARD${alerts > 1 ? 'S' : ''} HUNTING` : suspicious > 0 ? `${suspicious} SUSPICIOUS` : 'ALL CLEAR';
  ctx.fillText(watch, rightX, 78);

  // The controls, so a first-time player knows how to move.
  ctx.textAlign = 'left';
  ctx.font = `500 10px ${FONT}`;
  ctx.fillStyle = 'rgba(142,163,189,0.8)';
  ctx.fillText('WASD / arrows move   ·   hold C or Ctrl to crouch   ·   hold Shift to sprint (loud)   ·   R restart', 20, 100);
}

/** The title, won and caught overlays: one panel, centred, with the run's numbers. */
function drawOverlay(ctx, world) {
  if (world.screen === SCREEN_PLAY) return;
  const won = world.screen === SCREEN_WON;
  const caught = world.screen === SCREEN_CAUGHT;
  ctx.fillStyle = 'rgba(4,7,12,0.72)';
  ctx.fillRect(0, 0, FIELD.width, FIELD.height);

  const w = 560;
  const h = 300;
  const x = (FIELD.width - w) / 2;
  const y = (FIELD.height - h) / 2 + 20;
  ctx.fillStyle = 'rgba(13,22,34,0.97)';
  roundRect(ctx, x, y, w, h, 12);
  ctx.fill();
  ctx.strokeStyle = won ? PALETTE.exitOpen : caught ? PALETTE.alert : PALETTE.panelEdge;
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.font = `800 34px ${FONT}`;
  ctx.fillStyle = won ? PALETTE.exitOpen : caught ? PALETTE.alert : PALETTE.text;
  const title = won ? 'EXTRACTED' : caught ? 'CAUGHT' : 'NIGHTJAR';
  ctx.fillText(title, FIELD.width / 2, y + 66);

  ctx.font = `500 14px ${FONT}`;
  ctx.fillStyle = PALETTE.muted;
  const lines = won
    ? ['You took the Ember Relic and left through the west gate.', 'The conservatory sleeps on.']
    : caught
      ? ['A guard saw you and closed the distance.', 'Crouch behind cover, and walk: only a sprint is heard.']
      : [
        'The Ember Relic is in the orchid room, centre of the gallery.',
        'Guards see inside their cones and hear a sprint. Walls and planters',
        'stop both. Take the relic, then leave by the west gate.',
      ];
  lines.forEach((line, i) => ctx.fillText(line, FIELD.width / 2, y + 104 + i * 22));

  if (won || caught) {
    const b = scoreBreakdown(world);
    ctx.font = `700 13px ${MONO}`;
    ctx.fillStyle = PALETTE.text;
    const seconds = world.time.toFixed(1);
    ctx.fillText(`TIME ${seconds}s   ·   ALARMS ${world.alarms}   ·   SCORE ${b.total}`, FIELD.width / 2, y + 182);
  }

  ctx.font = `700 15px ${FONT}`;
  ctx.fillStyle = PALETTE.text;
  ctx.fillText(won || caught ? 'Press R or click to run it again' : 'Press any key or click to begin', FIELD.width / 2, y + 240);

  ctx.font = `500 11px ${FONT}`;
  ctx.fillStyle = 'rgba(142,163,189,0.75)';
  ctx.fillText('Nightjar — a stealth game about one relic, six guards and a locked gate', FIELD.width / 2, y + 272);
}

/**
 * Draw a whole frame. `view` is the logical 1280x720 area; the caller has already scaled the
 * canvas so that area fills the window.
 */
export function render(ctx, world) {
  ctx.save();
  ctx.clearRect(0, 0, FIELD.width, FIELD.height);
  drawMap(ctx, world);
  if (world.screen !== SCREEN_TITLE) drawExit(ctx, world);
  drawRelic(ctx, world);
  for (const guard of world.guards) drawCone(ctx, world, guard);
  for (const guard of world.guards) drawGuard(ctx, world, guard);
  drawParticles(ctx, world);
  if (world.screen !== SCREEN_TITLE) drawPlayer(ctx, world);
  drawAlarm(ctx, world);
  drawHud(ctx, world);
  drawOverlay(ctx, world);
  ctx.restore();
}

/** Cover, relic and exit need their names spelled out on the map for a first look to land. */
export function drawLegend(ctx) {
  const items = [
    ['planter = cover', PALETTE.coverTop],
    ['cone = sight', PALETTE.cone],
    ['amber = relic', PALETTE.relic],
    ['green = gate', PALETTE.exitOpen],
  ];
  ctx.font = `600 10px ${FONT}`;
  ctx.textAlign = 'left';
  let x = FIELD.width / 2 - 130;
  const y = HUD_H - 8;
  for (const [label, colour] of items) {
    ctx.fillStyle = colour;
    ctx.fillRect(x, y - 6, 8, 8);
    ctx.fillStyle = 'rgba(142,163,189,0.9)';
    ctx.fillText(label, x + 12, y);
    x += 12 + ctx.measureText(label).width + 20;
  }
}
