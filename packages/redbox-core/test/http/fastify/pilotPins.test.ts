import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { assertResolvedPilotPins, pilotPins } from './pilotPins';

describe('FM-022 frozen production dependency pins', () => {
  const root = path.resolve(__dirname, '../../../../..');
  it('matches the actual root application dependency graph to every frozen pin', () => {
    const core = createRequire(path.join(root, 'package.json')).resolve('@researchdatabox/redbox-core');
    assertResolvedPilotPins(core);
  });
  it('matches the actual core dependency graph to every frozen pin', () => {
    assertResolvedPilotPins(path.join(root, 'packages/redbox-core/package.json'));
  });
  for (const directory of ['', 'packages/redbox-core'])
    it(`matches all Socket.IO/Engine.IO lock resolutions and override in ${directory || 'root'}`, () => {
      const lock = JSON.parse(readFileSync(path.join(root, directory, 'package-lock.json'), 'utf8'));
      const manifest = JSON.parse(readFileSync(path.join(root, directory, 'package.json'), 'utf8'));
      assert.equal(manifest.overrides['engine.io'], pilotPins['engine.io']);
      for (const name of ['socket.io', 'engine.io'] as const) {
        const entries = Object.entries(lock.packages).filter(
          ([key]) => key.endsWith('/node_modules/' + name) || key === 'node_modules/' + name
        );
        assert(entries.length, `No locked ${name}`);
        for (const [key, value] of entries) assert.equal(Reflect.get(value as object, 'version'), pilotPins[name], key);
      }
    });
});
