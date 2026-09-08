import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'mocha';
import { STABILIZATION_SIGNALS } from '../../src/authorization/stabilization';
import { AUTHORIZATION_METRICS } from '../../src/authorization/observability';

const root = resolve(__dirname, '../../../..');
const runbook = readFileSync(resolve(root, 'support/wiki/Authorization-Migration-and-Rollout.md'), 'utf8');
const operations = readFileSync(resolve(root, 'support/wiki/Authorization-Operations.md'), 'utf8');
const section = runbook.split('## Phase 15.2 stabilization closure')[1];

describe('Phase 15.2 runbook and verifier checks', () => {
  it('documents all ten probe contracts and every emitted instrument', () => {
    assert.ok(section);
    const documented = [...section.matchAll(/^\| `([a-z]+)`\s*\|/gm)].map(match => match[1]);
    assert.deepEqual(documented.sort(), Object.keys(STABILIZATION_SIGNALS).sort());
    for (const fields of Object.values(STABILIZATION_SIGNALS))
      for (const field of fields) assert.ok(section.includes(`\`${field}\``));
    for (const metric of AUTHORIZATION_METRICS) assert.ok(operations.includes(`\`${metric}\``));
  });
  it('keeps executable probe examples syntactically valid and explicitly retains restart and rollback gates', () => {
    for (const [, source] of section.matchAll(/^```bash\n([\s\S]*?)^```/gm)) {
      const checked = spawnSync('bash', ['-n'], { input: source, encoding: 'utf8' });
      assert.equal(checked.status, 0, checked.stderr);
    }
    for (const expected of [
      'AUTHORIZATION_COLLECTION_HEALTH_FILE',
      'getCollectionHealth()',
      'rollback.occurred: true',
      'new stabilization policy/window',
      'fail/recover/fail',
      'securityApprovalRef',
      'maxIncrease',
      'minimum samples',
    ]) {
      assert.ok(section.includes(expected), `Missing operator contract: ${expected}`);
    }
  });
  it('keeps missing evidence OPEN with a bounded CLI error and no Sails lift', () => {
    const script = resolve(root, 'scripts/authorization-stabilization.js');
    assert.equal(spawnSync('node', ['--check', script]).status, 0);
    const result = spawnSync('node', [script, '/nonexistent-policy', '/nonexistent-evidence'], { encoding: 'utf8' });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /Stabilization remains OPEN/);
    assert.equal(result.stderr.includes('/nonexistent'), false);
    assert.equal(result.stderr.includes('Error:'), false);
  });
});
