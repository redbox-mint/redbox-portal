const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { once } = require('node:events');
const { chromium } = require('playwright');
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'commonjs', moduleResolution: 'node' } });
const { ResponseGate } = require('../playwright/helpers/response-gate.ts');

async function fixture(t) {
  const script = 'document.querySelector("#result").textContent = "Ready from real configuration";';
  const requests = [];
  const server = http.createServer((req, res) => {
    requests.push(req.url);
    if (req.url === '/config.js') {
      res.writeHead(200, { 'content-type': 'text/javascript', 'x-fixture-version': 'original' });
      res.end(script);
    } else {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<div id="result">Loading</div><script src="/config.js"></script>');
    }
  });
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const browser = await chromium.launch();
  if (t.signal.aborted) { await browser.close(); t.signal.throwIfAborted(); }
  t.after(() => browser.close());
  const page = await browser.newPage();
  return { page, script, requests, base: `http://127.0.0.1:${server.address().port}` };
}

test('a parser-blocking real script stays held, preserves headers/body and updates the DOM passively', { timeout: 15000 }, async t => {
  const { page, base, script, requests } = await fixture(t);
  const gate = new ResponseGate(page, { url: base + '/config.js', method: 'GET' });
  await gate.install();
  try {
    await page.goto(base, { waitUntil: 'commit' });
    const captured = await gate.waitForCapture();
    assert.equal(captured.status(), 200);
    assert.equal(captured.headers()['x-fixture-version'], 'original');
    assert.equal(await captured.text(), script);
    assert.equal(await page.locator('#result').textContent(), 'Loading');
    await gate.release();
    await page.waitForFunction(() => document.querySelector('#result').textContent === 'Ready from real configuration');
    assert.equal(requests.filter(path => path === '/config.js').length, 1);
  } finally { await gate.dispose(); }
});
test('teardown releases a held handler after an assertion fails', { timeout: 15000 }, async t => {
  const { page, base } = await fixture(t);
  const gate = new ResponseGate(page, { url: base + '/config.js' });
  await gate.install();
  await page.goto(base, { waitUntil: 'commit' });
  await gate.waitForCapture();
  await assert.rejects(async () => { try { throw Error('intentional assertion failure'); } finally { await gate.dispose(); } }, /intentional assertion failure/);
  await page.waitForFunction(() => document.querySelector('#result').textContent === 'Ready from real configuration');
});
test('missing and extra occurrences fail, and unrelated context routes still run', { timeout: 15000 }, async t => {
  const { page, base } = await fixture(t);
  let unrelated = 0;
  await page.context().route(base + '/', route => { unrelated++; return route.continue(); });
  const gate = new ResponseGate(page, { url: base + '/config.js' });
  await gate.install();
  await page.goto(base, { waitUntil: 'commit' });
  await gate.waitForCapture(); await gate.release();
  await page.waitForLoadState('load');
  await page.evaluate(() => fetch('/config.js').then(r => r.text()));
  await assert.rejects(gate.dispose(), /matched 2 requests/);
  assert.equal(unrelated, 1);
  const missing = new ResponseGate(page, { url: base + '/absent.js', timeoutMs: 100 });
  await missing.install();
  await assert.rejects(missing.waitForCapture(), /Timed out waiting/);
  await assert.rejects(missing.dispose(), /matched 0 requests/);
});

test('delayed configuration uses the HTTP fallback without removing the page CSRF token', { timeout: 15000 }, async t => {
  const { useHttpConfigurationFallback } = require('../playwright/helpers/configuration-fallback.ts');
  const server = http.createServer((req, res) => {
    if (req.url === '/dynamic/apiClientConfig') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ title: 'Ready from configuration' }));
    } else {
      res.writeHead(200, { 'content-type': 'text/html', 'x-fixture-version': 'original' });
      res.end(`<meta name="rb-client-config" content='{"title":"Ready from configuration"}'>
        <meta name="rb-csrf-token" content="fixture-token"><div id="result">Loading</div>
        <script>
          const snapshot = document.querySelector('meta[name="rb-client-config"]');
          const configuration = snapshot ? Promise.resolve(JSON.parse(snapshot.content))
            : fetch('/dynamic/apiClientConfig').then(response => response.json());
          configuration.then(value => document.querySelector('#result').textContent = value.title);
        </script>`);
    }
  });
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const browser = await chromium.launch(); t.after(() => browser.close());
  const page = await browser.newPage();
  const restore = await useHttpConfigurationFallback(page);
  const gate = new ResponseGate(page, { url: '/dynamic/apiClientConfig', timeoutMs: 3000 });
  await gate.install();
  try {
    const response = await page.goto(`http://127.0.0.1:${server.address().port}`);
    assert.equal(response.headers()['x-fixture-version'], 'original');
    await gate.waitForCapture();
    assert.equal(await page.locator('#result').textContent(), 'Loading');
    assert.equal(await page.locator('meta[name="rb-csrf-token"]').getAttribute('content'), 'fixture-token');
    await gate.release();
    await page.waitForFunction(() => document.querySelector('#result').textContent === 'Ready from configuration');
  } finally { await gate.dispose(); await restore(); }
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  assert.equal(await page.locator('meta[name="rb-client-config"]').count(), 1);
  await page.waitForFunction(() => document.querySelector('#result').textContent === 'Ready from configuration');
});
