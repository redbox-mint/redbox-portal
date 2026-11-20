import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { runInNewContext } from 'node:vm';
const root = path.resolve(__dirname, '../../../../..');
const { assertStartedHost } = require(path.join(root, 'support/integration-testing/playwright-host.cjs'));
const executable = readFileSync(path.join(root, 'app.integrationtest.js'), 'utf8');
describe('tested-image Fastify executable', () => {
  it('loads the production executable directly', () => {
    const loaded: string[] = [];
    runInNewContext(executable, { require: (name: string) => loaded.push(name) });
    assert.deepEqual(loaded, ['./app.js']);
  });
  const ready = JSON.stringify({ msg: 'Fastify host ready.', pid: 17, time: 123 });
  it('proves activation from the current portal log', () => {
    assert.deepEqual(assertStartedHost('non-JSON build output\n' + ready), { host: 'fastify', pid: 17, time: 123 });
  });
  for (const log of ['', JSON.stringify({ msg: 'Another host ready.' }), ready + '\n' + ready])
    it(`refuses missing or ambiguous startup evidence ${log}`, () =>
      assert.throws(() => assertStartedHost(log), /Playwright host mismatch/));
});
