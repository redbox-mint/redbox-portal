'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');
const auditor = path.resolve(__dirname, '../../support/specs/sails-retirement/evidence/retirement-closure.cjs');

for (const [name, declaration, violations] of [
  ['exported module API', 'export declare const liveOniTemplatingService: unknown;', 0],
  ['ambient global', 'declare const SyntheticService: unknown;', 1],
  ['implicit runtime global in a module', 'export {}; declare const SyntheticService: unknown;', 1],
  ['global augmentation', 'export {}; declare global { const SyntheticService: unknown; }', 1],
  ['global augmentation with export', 'export {}; declare global { export const SyntheticService: unknown; }', 1],
]) {
  test(`retirement audit distinguishes ${name}`, () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'redbox-retirement-audit-'));
    try {
      fs.writeFileSync(path.join(directory, 'fixture.d.ts'), declaration);
      const result = spawnSync(process.execPath, [auditor, '--tree', directory], { encoding: 'utf8' });
      assert.equal(result.error, undefined);
      const audit = JSON.parse(result.stdout);
      assert.equal(audit.executableViolations, violations, result.stdout + result.stderr);
      assert.equal(audit.forbiddenDependencyEntries, 0);
      assert.equal(result.status, violations ? 1 : 0);
      if (!violations)
        assert(
          audit.classified.some(entry => entry.reason === 'Explicit module export declaration; no ambient global')
        );
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
}
