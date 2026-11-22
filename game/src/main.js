// The entry point: one canvas, a fixed-step loop, and the screenshot scenes behind ?shot=. The whole
// simulation lives in world.js; this file only turns the keyboard and the clock into calls on it.

import { FIELD, SCREEN_CAUGHT, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WON, STEP } from './config.js';
import { createInput } from './input.js';
import { loadLevel } from './level.js';
import { drawLegend, render } from './render.js';
import { stageShot, shotName } from './shots.js';
import { begin, createWorld, reset, step } from './world.js';

const canvas = document.querySelector('#game');
const ctx = canvas.getContext('2d', { alpha: false });
const status = document.querySelector('#status');

/** Size the canvas to the window, letterboxed so the 1280x720 field is never distorted. */
function fit() {
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.round(window.innerWidth * ratio);
  canvas.height = Math.round(window.innerHeight * ratio);
  const scale = Math.min(canvas.width / FIELD.width, canvas.height / FIELD.height);
  ctx.setTransform(scale, 0, 0, scale, (canvas.width - FIELD.width * scale) / 2, (canvas.height - FIELD.height * scale) / 2);
  ctx.imageSmoothingEnabled = true;
}
window.addEventListener('resize', fit);
fit();

const world = createWorld();
const input = createInput(canvas);

/** The scene a screenshot asks for, or null when this is a normal session. */
const scene = shotName();

function announce(text) {
  if (status) status.textContent = text;
}

/** Draw one frame of a screenshot scene: the real renderer over the real world state. */
if (scene !== null) {
  const result = stageShot(scene, world);
  if (result && result.screen) world.screen = result.screen;
  render(ctx, world);
  if (scene === 'play') drawLegend(ctx);
  announce(`Nightjar screenshot: ${scene}`);
} else {
  // The live game: a fixed-step accumulator, so the simulation is the same at any frame rate.
  let accumulator = 0;
  let last = performance.now();
  let wasOver = false;

  const frame = (now) => {
    const elapsed = Math.min(0.25, (now - last) / 1000);
    last = now;
    input.poll();
    const keys = input.consume();

    if (world.screen === SCREEN_TITLE) {
      if (keys.restart || keys.x !== 0 || keys.y !== 0 || keys.crouch || keys.sprint) begin(world);
    } else if (keys.restart) {
      if (world.screen === SCREEN_WON || world.screen === SCREEN_CAUGHT) begin(world);
      else begin(world);
    } else if (keys.escape) {
      world.screen = SCREEN_TITLE;
      reset(world);
    }

    // The aim follows the pointer when there is one, so the thief's shape points where you move.
    let aim = null;
    if (keys.pointer) {
      aim = Math.atan2(keys.pointer.y - (world.player.y), keys.pointer.x - (world.player.x));
    } else if (keys.x !== 0 || keys.y !== 0) {
      aim = Math.atan2(keys.y, keys.x);
    }

    accumulator += elapsed;
    let guard = 0;
    while (accumulator >= STEP && guard < 8) {
      step(world, { x: keys.x, y: keys.y }, keys.crouch, keys.sprint, aim, STEP);
      accumulator -= STEP;
      guard += 1;
    }

    render(ctx, world);
    if (world.screen === SCREEN_PLAY) {
      announce(world.messageTimer > 0 ? world.message : `${world.alarms} alarms; the gate is ${world.player.hasRelic ? 'open' : 'locked'}`);
    } else if (world.screen === SCREEN_WON && !wasOver) {
      wasOver = true;
      announce('Extracted with the Ember Relic.');
    } else if (world.screen === SCREEN_CAUGHT && !wasOver) {
      wasOver = true;
      announce('Caught by a guard.');
    }
    if (world.screen === SCREEN_PLAY && wasOver) wasOver = false;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  // A click starts the run from the title and restarts it after a win or a catch.
  canvas.addEventListener('pointerdown', () => {
    if (world.screen !== SCREEN_PLAY) begin(world);
  });
}

export { loadLevel };
