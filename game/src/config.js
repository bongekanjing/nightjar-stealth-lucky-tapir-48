// Every tuning number and colour for Nightjar lives here, so the rules can be read and changed in
// one place. The field is a fixed 1280x720 logical area; the renderer scales it to the window and
// every distance below is in those logical pixels, never in screen pixels.

export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step: 60 updates a second whatever the display's refresh rate. */
export const STEP = 1 / 60;

/** The tile grid: 40 by 19 tiles of 32 pixels, drawn under the HUD strip at the top. */
export const TILE = 32;
export const MAP = { cols: 40, rows: 19, top: 104 };

/** The thief: a walk, a crouch, and a sprint that is heard further than it is seen. */
export const PLAYER = {
  radius: 9,
  walkSpeed: 132,
  crouchSpeed: 66,
  sprintSpeed: 214,
  crouchRadius: 6,
  aimTurn: 9,
  hitFlash: 0.45,
};

/**
 * A guard patrols its waypoints, pausing at each to look around. Its cone is the angle it can see
 * inside, and its ear is how far it hears a sprint. `alert` is reached after `catchUp` seconds of a
 * full suspicion bar; the chase is the only state that can catch the thief.
 */
export const GUARD = {
  radius: 10,
  speed: 62,
  chaseSpeed: 158,
  pauseAtWaypoint: 1.5,
  scanSpeed: 1.15,
  coneAngle: 0.62,
  coneRange: 268,
  ear: 190,
  sightGain: 1.35,
  crouchFactor: 0.5,
  nearMissGain: 0.4,
  decay: 0.42,
  aimTurn: 9,
  calmBelow: 0.3,
  alertAt: 1,
  loseTrackAfter: 3.2,
  catchRadius: 20,
};

/** Suspicion a sprint raises in a guard whose ear it crosses, and how often a footstep is heard. */
export const NOISE = { sprintGain: 0.22, stride: 0.34 };

/** The objective item, and the exit it unlocks. */
export const RELIC = { radius: 11, linger: 0 };
export const EXIT = { width: 64, height: 64 };

/** Score weights, so a fast silent run beats a slow loud one. */
export const SCORE = { perSecond: 2, perAlarm: 1, silent: 40, extraction: 100 };

export const PALETTE = {
  void: '#070b12',
  floor: '#0f1926',
  floorAlt: '#0b1420',
  grid: '#16222f55',
  wall: '#33455c',
  wallTop: '#4d6480',
  cover: '#2f5a44',
  coverTop: '#3f7a5c',
  coverHatch: '#6d9a7e',
  coverSafe: '#8ef7c0',
  relic: '#fff1c2',
  exitLocked: '#5a6474',
  exitOpen: '#5ce6a4',
  player: '#d9f6ff',
  playerCloak: '#5fd7ff',
  cone: '#e8a33f',
  coneSeen: '#ffc247',
  coneAlarm: '#ff4459',
  calm: '#e8a33f',
  suspicious: '#ffc247',
  alert: '#ff5d6c',
  panel: '#0d1622',
  panelEdge: '#24374b',
  text: '#eaf2ff',
  muted: '#8ea3bd',
  alarmWash: '#ff2d46',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
export const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

/** The four screens the game can be in; world.js owns the transitions between them. */
export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_WON = 'won';
export const SCREEN_CAUGHT = 'caught';
