const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const path = require('node:path');
const net = require('node:net');

test('unknown requests remain evidence; releasing and resetting held responses wait for completion', { timeout: 15000 }, async () => {
  const probe = net.createServer(); probe.listen(0, '127.0.0.1'); await once(probe, 'listening');
  const port = probe.address().port; await new Promise(resolve => probe.close(resolve));
  const child = spawn(process.execPath, [path.resolve('support/integration-testing/playwright-stubs/server.cjs')], { env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'inherit'] });
  try {
    await once(child.stdout, 'data');
    const base = `http://127.0.0.1:${port}`;
    const get = async route => (await fetch(base + route)).json();
    const post = async (route, data) => fetch(base + route, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data ?? {}) });
    const unknown = await fetch(base + '/unknown'); assert.equal(unknown.status, 404);
    assert.equal((await get('/control/requests'))[0].matched, false);
    await post('/control/reset');
    await post('/control/responses', { responses: { 'GET /held': { hold: true, body: { value: 'real fixture payload' } } } });
    const pending = get('/held');
    let entry;
    // Poll the observable request log; no fixed delay determines readiness.
    while (!(entry = (await get('/control/requests'))[0])) {}
    assert.equal(entry.completed, false);
    assert.equal((await post('/control/release', { id: entry.id })).status, 200);
    assert.deepEqual(await pending, { value: 'real fixture payload' });
    assert.equal((await get('/control/requests'))[0].completed, true);
    assert.equal((await post('/control/release', { id: entry.id })).status, 404);
    const next = get('/held');
    while ((await get('/control/requests')).length !== 2) {}
    await post('/control/reset');
    assert.deepEqual(await next, { value: 'real fixture payload' });
    assert.deepEqual(await get('/control/requests'), []);
  } finally { child.kill('SIGTERM'); await once(child, 'exit'); }
});
