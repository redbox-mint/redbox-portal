import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

// Execute the executable's exact production assembly against source modules.
// Only package resolution changes; declarations, bindings and host creation are
// the same functions used by app.js and the runtime image.
const root = path.resolve(__dirname, '../../../..');
const requireRoot = createRequire(path.join(root, 'portal.cjs'));
const sourceRequire = Object.assign(
  (name: string) => {
    const prefix = '@researchdatabox/redbox-core/';
    return name.startsWith(prefix)
      ? require(path.join(__dirname, '../../src', (name.slice(prefix.length) === 'portal' ? 'application/portal' : name.slice(prefix.length))))
      : requireRoot(name);
  },
  { resolve: (name: string) => name === '@researchdatabox/redbox-core'
    ? path.resolve(__dirname, '../../src/index.ts') : requireRoot.resolve(name) }
);
const loaded = { exports: {} as { createApplication(options: Omit<Parameters<typeof import('../../src/application/portal').createPortalFastifyApplication>[0], 'http'>): ReturnType<typeof import('../../src/application/portal').createPortalFastifyApplication>;
  createHost(portal: Awaited<ReturnType<typeof import('../../src/application/portal').createPortalFastifyApplication>>): ReturnType<typeof import('../../src/application/portal').createPortalFastifyHost> } };
new Function('require', 'module', readFileSync(path.join(root, 'portal.cjs'), 'utf8'))(sourceRequire, loaded);
export const sourcePortal = loaded.exports;
