import { build } from 'esbuild';

// Marked is ESM-only. Emit a private CJS module for the synchronous Node API,
// including Node versions that cannot require ESM. Never load it at startup.
await build({
  entryPoints: ['marked'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  outfile: 'dist/src/marked-parser.cjs',
});
