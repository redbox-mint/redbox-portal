import assert from 'node:assert/strict';
import { once } from 'node:events';
import express from 'express';
import { resolveExtensions, type RedboxExtension } from '../../src/extensions';

// The published source lives outside this package's compiler root. Its own
// documentation audit typechecks it; this regression exercises it at runtime.
const registerRedboxExtension: () => RedboxExtension =
  require('../../../../support/documentation/examples/hook-override').registerRedboxExtension;

describe('published hook override example', () => {
  it('resolves and serves the example through its owned module lifecycle', async () => {
    const result = resolveExtensions([
      { name: 'example', root: process.cwd(), declaration: registerRedboxExtension() },
    ]);
    assert.equal(result.modules.length, 1);
    assert.equal(result.handlers.length, 1);
    assert.equal(result.routes.length, 1);
    assert.equal(result.routes[0].declaration.handler, result.handlers[0].declaration.name);
    const example = result.modules[0].declaration.create(undefined as never);
    await example.initialize();
    const app = express();
    app.get('/example/health', result.handlers[0].declaration.create({ example } as never));
    const server = app.listen(0, '127.0.0.1');
    try {
      await once(server, 'listening');
      const address = server.address();
      assert(address && typeof address === 'object');
      const url = `http://127.0.0.1:${address.port}/example/health`;
      const ready = await fetch(url);
      assert.equal(ready.status, 200);
      assert.deepEqual(await ready.json(), { ready: true });
      await example.close();
      const closed = await fetch(url);
      assert.equal(closed.status, 200);
      assert.deepEqual(await closed.json(), { ready: false });
    } finally {
      server.closeAllConnections();
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });
});
