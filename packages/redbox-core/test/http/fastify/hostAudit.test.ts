import assert from 'node:assert/strict';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

describe('FM-042 retained host discovery', function () {
  this.timeout(180000);
  it('follows source exports, renamed constructors, namespaces, factories and packed imports', () => {
    const root = path.resolve(__dirname, '../../../../..');
    const result = JSON.parse(execFileSync(process.execPath, ['--max-old-space-size=4096',
      'support/specs/fastify-migration/evidence/FM-042-host-symbols.cjs', '--self-test'], {
      cwd: root, encoding: 'utf8', timeout: 150000,
    }));
    assert.equal(result.checks, 9);
    assert(result.modules >= 58);
  });
});
