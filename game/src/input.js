// Keyboard and mouse, in one place, as plain state the world reads. WASD or the arrow keys move,
// Shift sprints, Control or C crouches, R restarts and Escape returns to the title; the pointer's
// angle from the thief is the direction the next step will take, which is what aims the light.

export function createInput(canvas) {
  const keys = new Set();
  const state = { x: 0, y: 0, crouch: false, sprint: false, aim: null, restart: false, escape: false };

  const codeOf = (event) => (event.code || '').toLowerCase();

  const onKeyDown = (event) => {
    const code = codeOf(event);
    if (code === 'keyr') state.restart = true;
    if (code === 'escape') state.escape = true;
    keys.add(code);
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'space'].includes(code)) event.preventDefault();
  };
  const onKeyUp = (event) => keys.delete(codeOf(event));
  const onBlur = () => keys.clear();

  const onPointerMove = (event) => {
    const rect = canvas.getBoundingClientRect();
    const scale = Math.max(rect.width, rect.height) / 1280;
    const offsetX = (rect.width - 1280 * scale) / 2;
    const offsetY = (rect.height - 720 * scale) / 2;
    const px = (event.clientX - rect.left - offsetX) / scale;
    const py = (event.clientY - rect.top - offsetY) / scale;
    state.pointer = { x: px, y: py };
  };

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  canvas.addEventListener('pointermove', onPointerMove);

  /** Read and clear the one-shot flags, so a key press is acted on exactly once. */
  state.consume = () => {
    const snapshot = {
      x: state.x,
      y: state.y,
      crouch: state.crouch,
      sprint: state.sprint,
      aim: state.aim,
      pointer: state.pointer,
      restart: state.restart,
      escape: state.escape,
    };
    state.restart = false;
    state.escape = false;
    return snapshot;
  };

  /** Fold the held keys into the movement vector and the modifiers. */
  state.poll = () => {
    let x = 0;
    let y = 0;
    if (keys.has('keya') || keys.has('arrowleft')) x -= 1;
    if (keys.has('keyd') || keys.has('arrowright')) x += 1;
    if (keys.has('keyw') || keys.has('arrowup')) y -= 1;
    if (keys.has('keys') || keys.has('arrowdown')) y += 1;
    state.x = x;
    state.y = y;
    state.sprint = keys.has('shiftleft') || keys.has('shiftright');
    state.crouch = keys.has('controlleft') || keys.has('controlright') || keys.has('keyc');
  };

  return state;
}
