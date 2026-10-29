import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);
for (const backend of ['sqs', 'mongo']) {
  for (const mode of [
    'success',
    'failure',
    'drain',
    'active',
    'active-cleanup-error',
    'touch',
    'initial-save-error',
    'completion-save-error',
  ]) {
    test(
      `${backend}: ${mode} job and stop exit naturally`,
      {
        skip:
          backend === 'mongo' && !process.env.AGENDA_TEST_MONGO_URL
            ? 'Set AGENDA_TEST_MONGO_URL for real MongoDB tests'
            : false,
      },
      async () => {
        const { stdout } = await exec(
          process.execPath,
          [new URL('./worker.mjs', import.meta.url).pathname, backend, mode],
          {
            timeout: 5000,
            killSignal: 'SIGKILL',
          }
        );
        assert.match(stdout, /job completed; clean stop/);
        assert.match(stdout, /pending watchdogs: 0/);
      }
    );
  }
}
