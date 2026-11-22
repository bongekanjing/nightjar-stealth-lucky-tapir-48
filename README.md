# Nightjar

A complete stealth game in one 1280×720 canvas: a gardener-thief crosses an old glasshouse at
night, takes the Ember Relic from the central gallery, and leaves through the west gate without a
single guard raising the alarm.

Plain static files under `game/`, ES modules, no library, no build step, no network request.

## Play

    node serve.ts          # then open http://localhost:8080

`WASD` or the arrow keys move, `C` or `Ctrl` crouches, `Shift` sprints, `R` restarts, `Esc` returns
to the title. Crouching shrinks you so a guard only sees you inside half its cone; sprinting is the
only thing a guard can hear.

## The level

`game/src/level.js` is the whole map as text: 40 by 19 tiles, `#` wall, `.` floor, `c` a planter
that stops both a walk and a sight line, `g` the relic, `E` the gate, `P` where you come in. Six
guards walk closed loops down open lanes, so every cone is long enough to read from across the room.
The layout is authored so the thief starts in a walled alcove no cone can reach, and the gate pocket
in the far south-west corner is deliberately left unwatched.

## How the stealth works

- `game/src/guard.js` holds one guard's senses: a cone with a range and an angle, a Bresenham
  line-of-sight walk over the tile grid, and a hearing radius only a sprint reaches. Suspicion fills
  while you are seen and decays when you break the line, which is what gives you a chance to
  recover from a near miss.
- `game/src/world.js` is the whole simulation: the fixed 1/60 s step, the thief's movement, every
  guard's step, the relic, the gate, the alarm count and the score. The renderer only reads it.
- `game/src/render.js` draws the map, each cone with the same rule the guards see by (so a cone on
  screen is exactly the cone in play), the guards with a facing wedge and a suspicion ring, the
  relic, the gate, the alarm wash and the HUD.
- `game/src/shots.js` stages the screenshots: each scene plays the real rules forward from a fresh
  run with a pilot that plans a route weighted against every cone, so every frame is a real position
  in a real run.

## Screenshots

`screenshots/` holds four renders of the game's own code, taken in headless Chrome at 1280×720:
the gallery with the relic and three readable cones, the open west gate with the relic in hand, a
live alarm with a hunting guard, and the title. `game/shots.json` names the scene behind each.

## Files

    main.ts              hands the entry in: copies game/ and screenshots/, writes dossier.json
    serve.ts             a static server for local play
    game/index.html      the page: one canvas, one module
    game/shots.json      which scene each screenshot asks for
    game/src/config.js   every tuning number and colour
    game/src/level.js    the map as text, plus the six patrol routes
    game/src/guard.js    one guard's vision, hearing, chase and recovery
    game/src/world.js    the fixed-step simulation and the score
    game/src/input.js    keyboard and pointer
    game/src/render.js   the canvas renderer
    game/src/shots.js    the screenshot scenes
    screenshots/         four renders, the first by name is the cover
    tools/               map authoring, cone reach, simulation and screenshot helpers

MIT licensed.
