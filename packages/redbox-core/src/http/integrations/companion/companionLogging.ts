import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Companion 7.1.1 has no logger injection API. Its native logger serializes tus
// errors (including Authorization/Cookie headers) and prints transfer grants.
// Replace only that pinned module, using Node's loader API without modifying
// installed files or the process console. Refuse changed/already-loaded code.
const loggerDigest = '8afdbec41f6bb264380bb99eae2bbd66fabaf29c3a4c699c58a753da9de70de7';
const boundedLogger = `
export function setMaskables() {}
export function setProcessName() {}
export function debug() {}
export function info() { console.log('Companion provider activity'); }
export function warn() { console.log('Companion provider warning'); }
export function error() { console.log('Companion provider error'); }
export default { setMaskables, setProcessName, debug, info, warn, error };
`;

export async function loadCompanionWithSafeLogging(): Promise<typeof import('@uppy/companion')> {
  const manifest = require.resolve('@uppy/companion/package.json');
  const installed = JSON.parse(await readFile(manifest, 'utf8')) as { version: string };
  const logger = pathToFileURL(path.join(path.dirname(manifest), 'dist/server/logger.js')).href;
  if (
    installed.version !== '7.1.1' ||
    createHash('sha256')
      .update(await readFile(new URL(logger)))
      .digest('hex') !== loggerDigest
  )
    throw new Error('Unsupported Companion logging module; qualify its bounded logging adapter before startup.');
  let loaded = false;
  const hooks = registerHooks({
    load(url, context, nextLoad) {
      if (url !== logger) return nextLoad(url, context);
      loaded = true;
      return { format: 'module', source: boundedLogger, shortCircuit: true };
    },
  });
  try {
    const companion = await import('@uppy/companion');
    if (!loaded)
      throw new Error('Companion must be loaded through its owned logging boundary before any other import.');
    return companion;
  } finally {
    hooks.deregister();
  }
}
