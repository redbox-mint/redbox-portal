import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { mongoFixture } from './mongoFixture';
import { prepareSessionIndexes } from '../../src/persistence/sessions/indexes';

describe('compiled standalone authenticated pilot', function () {
  this.timeout(30_000);
  it('serves real Mongo HTTP without loading source, Sails, controllers, compatibility or the core barrel', async () => {
    const f = await mongoFixture();
    const url = process.env.HTTP_PILOT_TEST_MONGO_URL!.replace('/sr_p4_http', '/' + f.native.db().databaseName);
    await prepareSessionIndexes(f.owner, { mongoUrl: url, collection: 'pilotSessions' }, 'ensure');
    const child = fork('test/http/fixtures/compiled-pilot.cjs', [], {
      execArgv: [],
      env: { ...process.env, HTTP_PILOT_COMPILED_MONGO_URL: url },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });
    let stderr = '';
    child.stderr!.on('data', data => {
      stderr += data;
    });
    const exit = once(child, 'exit');
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const ready = await Promise.race([
        once(child, 'message').then(([message]) => message),
        exit.then(([code]) => {
          throw new Error('Compiled host failed: ' + code + ' ' + stderr);
        }),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error('Compiled host startup timed out: ' + stderr)), 10_000);
        }),
      ]);
      assert.equal(typeof ready.port, 'number');
      const base = 'http://127.0.0.1:' + ready.port + '/default/rdmp/api/recordtypes';
      for (const path of ['', '/get?name=dataRecord']) {
        const response = await fetch(base + path, {
          headers: { Authorization: 'Bearer pilot-api-token' },
          signal: AbortSignal.timeout(5000),
        });
        assert.equal(response.status, 200);
        assert((await response.text()).includes('dataRecord'));
        const denied = await fetch(base + path, { signal: AbortSignal.timeout(5000) });
        assert.equal(denied.status, 401);
        await denied.text();
      }
      child.send('stop');
      assert.equal((await exit)[0], 0, stderr);
      assert.equal(stderr, '');
    } finally {
      clearTimeout(timer);
      if (child.exitCode === null) {
        child.kill('SIGKILL');
        await exit;
      }
      await f.close();
    }
  });
});
