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
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const browser = await chromium.launch();
  t.after(async () => { await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
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
