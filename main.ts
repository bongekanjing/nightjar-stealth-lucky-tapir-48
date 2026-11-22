// Nightjar — the entry point the judge runs. It copies game/ and screenshots/ into /output and
// writes dossier.json, the summary the judge reads, with the vendored make.fun library. The game is
// plain static files: one canvas, ES modules, no library and no network request at runtime.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(here, 'screenshots'), { recursive: true });
cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// The scorer's own caps (reference/gate.json): text_max_bytes shapes the dossier; the rest refuse an
// entry the scorer would refuse (more than 4 screenshots or one over 256 KiB; more than 993 files in
// game/, 48 MiB of game files, or a path under game/ longer than 1000 bytes).
const dossier = buildDossier(out, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});

writeFileSync(join(out, 'dossier.json'), dossier);
console.log(`wrote ${join(out, 'dossier.json')} (${dossier.length} bytes)`);
console.log(`screenshots: ${readdirSync(join(out, 'screenshots')).join(', ')}`);
if (!existsSync(join(out, 'game', 'index.html'))) throw new Error('game/index.html is missing');
