import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { runInNewContext } from 'node:vm';

const root = path.resolve(__dirname, '../../../../..');
const selection = require(path.join(root, 'support/integration-testing/playwright-host.cjs'));
const executable = readFileSync(path.join(root, 'app.integrationtest.js'), 'utf8');

describe('tested-image browser host selection', () => {
  for (const [value, expected] of [
    [undefined, 'express'],
    ['express', 'express'],
    ['fastify', 'fastify'],
  ])
    it(`loads only ${expected} for selector ${String(value)}`, () => {
      const loaded: string[] = [];
      runInNewContext(executable, {
        process: { env: { RBPORTAL_PLAYWRIGHT_HOST: value } },
        require: (name: string) => {
          if (name.endsWith('playwright-host.cjs')) return selection;
          loaded.push(name);
        },
      });
      assert.deepEqual(loaded, [
        expected === 'fastify' ? './support/integration-testing/fastify-playwright.cjs' : './app.express.cjs',
      ]);
    });

  for (const value of ['fastfy', 'Fastify', 'EXPRESS', '', ' fastify', 'express '])
    it(`fails before loading either host for invalid selector ${JSON.stringify(value)}`, () => {
      const loaded: string[] = [];
      assert.throws(
        () =>
          runInNewContext(executable, {
            process: { env: { RBPORTAL_PLAYWRIGHT_HOST: value } },
            require: (name: string) => {
              if (name.endsWith('playwright-host.cjs')) return selection;
              loaded.push(name);
            },
          }),
        /Invalid RBPORTAL_PLAYWRIGHT_HOST.*use express or fastify \(lowercase\)/
      );
      assert.deepEqual(loaded, []);
    });

  const ready = (host: string) =>
    JSON.stringify({
      msg: host === 'fastify' ? 'Fastify acceptance host ready.' : 'Express host ready.',
      pid: 17,
      time: 123,
    });
  for (const host of ['express', 'fastify']) {
    it(`confirms ${host} from the activated host log rather than the selector`, () => {
      assert.deepEqual(selection.assertStartedHost('non-JSON build output\n' + ready(host), host), {
        host,
        pid: 17,
        time: 123,
      });
    });
    for (const log of ['', ready(host === 'fastify' ? 'express' : 'fastify'), ready(host) + '\n' + ready(host)])
      it(`refuses missing, wrong or ambiguous ${host} startup evidence: ${log}`, () => {
        assert.throws(() => selection.assertStartedHost(log, host), /Playwright host mismatch/);
      });
  }
});
