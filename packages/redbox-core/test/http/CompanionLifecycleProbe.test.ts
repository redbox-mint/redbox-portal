import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

/** Process-owned cron and the strict singleton require a separate process. No internal timer cleanup. */
describe('Companion 7.1.1 supported public API process ownership', function () {
  this.timeout(15000);
  it('constructs during initialize, attaches once, refuses a second app and closes its isolated server', () => {
    const result = spawnSync(process.execPath, ['test/http/fixtures/companion-process.cjs'], {
      cwd: resolve(__dirname, '../..'),
      env: { ...process.env, NODE_ENV: 'production' },
      encoding: 'utf8',
      timeout: 10000,
    });
    assert.equal(result.status, 0, result.error?.message ?? result.stderr);
    assert.match(result.stdout, /Companion process qualification:/);
  });
  it('refuses a provider imported before the owned logging boundary', () => {
    const result = spawnSync(process.execPath, ['test/http/fixtures/companion-preloaded.cjs'], {
      cwd: resolve(__dirname, '../..'),
      env: { ...process.env, NODE_ENV: 'production' },
      encoding: 'utf8',
      timeout: 10000,
    });
    assert.equal(result.status, 0, result.error?.message ?? result.stderr);
    assert.match(result.stdout, /Preloaded unsafe Companion refused/);
  });
});
