import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

/** The qualified baseline in pilot-pattern.md. Resolve from the actual importer,
 * including Socket.IO's own Engine.IO, rather than an unrelated flat package. */
export const pilotPins = {
  fastify: '5.12.8',
  'find-my-way': '9.10.0',
  '@fastify/cookie': '11.1.5',
  '@fastify/session': '11.1.6',
  '@fastify/proxy-addr': '5.1.2',
  qs: '6.16.1',
  '@fastify/busboy': '3.2.4',
  'socket.io': '4.8.4',
  'engine.io': '6.6.11',
  '@uppy/companion': '7.1.1',
  express: '5.3.0',
  'openid-client': '6.8.8',
  jsonwebtoken: '9.0.3',
  mongodb: '7.7.0',
  pino: '10.4.0',
};

function packageVersion(entry: string, name: string): string {
  for (let directory = path.dirname(entry); ; directory = path.dirname(directory)) {
    const manifest = path.join(directory, 'package.json');
    if (existsSync(manifest)) {
      const pkg = JSON.parse(readFileSync(manifest, 'utf8'));
      if (pkg.name === name) return pkg.version;
    }
    assert.notEqual(path.dirname(directory), directory, `Cannot find manifest for ${name}: ${entry}`);
  }
}

export function assertResolvedPilotPins(coreImporter: string) {
  const core = createRequire(coreImporter);
  const socket = createRequire(core.resolve('socket.io'));
  const versions = Object.fromEntries(
    Object.keys(pilotPins).map(name => [
      name,
      packageVersion((name === 'engine.io' ? socket : core).resolve(name), name),
    ])
  );
  assert.deepEqual(versions, pilotPins, `Resolved pilot dependency drift from ${coreImporter}`);
  return versions;
}
