const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'commonjs', moduleResolution: 'node' } });
const { BrowserDiagnostics } = require('../playwright/fixtures/diagnostics.ts');
const { ResourceLedger } = require('../playwright/fixtures/resources.ts');
const { chromium } = require('@playwright/test');

function context() {
  const context = new EventEmitter();
  const pages = [];
  context.pages = () => pages;
  context.newPage = () => {
    const page = new EventEmitter(); page.context = () => context;
    pages.push(page); context.emit('page', page); return page;
  };
  return context;
}
function diagnosticFixture() {
  const original = context();
  const attachments = [];
  const info = { testId: 'diagnostics-probe', attach: async (name, data) => attachments.push({ name, data }) };
  return { original, attachments, diagnostics: new BrowserDiagnostics(original, info) };
}
const failed = { url: () => 'http://127.0.0.1:1500/exact', method: () => 'POST', failure: () => ({ errorText: 'net::ERR_FAILED' }) };

test('a declared error is consumed exactly once, with serializable route evidence', async () => {
  const { original, diagnostics, attachments } = diagnosticFixture();
  diagnostics.expectFailure({ kind: 'requestfailed', method: 'POST', url: /\/exact$/, message: 'net::ERR_FAILED', count: 1, reason: 'Transport fault probe' });
  original.newPage().emit('requestfailed', failed);
  await diagnostics.flush();
  assert.match(attachments[0].data.body, /exact/);
  assert.match(attachments[0].data.body, /matched/);
});
test('unused and repeated error allowances both fail', async () => {
  for (const occurrences of [0, 2]) {
    const { original, diagnostics } = diagnosticFixture();
    diagnostics.expectFailure({ kind: 'requestfailed', method: 'POST', url: failed.url(), message: 'net::ERR_FAILED', count: 1, reason: 'Exact-count fault probe' });
    const page = original.newPage();
    for (let i = 0; i < occurrences; i++) page.emit('requestfailed', failed);
    await assert.rejects(diagnostics.flush(), /Unexpected browser diagnostics/);
  }
});
test('popups from another authenticated context retain error listeners', async () => {
  const { diagnostics } = diagnosticFixture();
  const additional = context();
  diagnostics.attach(additional.newPage());
  additional.newPage().emit('pageerror', new Error('popup regression'));
  await assert.rejects(diagnostics.flush(), /popup regression/);
});
test('an unconfigured external origin fails even when its request succeeds', async () => {
  const { original, diagnostics } = diagnosticFixture();
  original.emit('request', { url: () => 'https://unconfigured.example.invalid/data', method: () => 'GET' });
  await assert.rejects(diagnostics.flush(), /unexpected external-request/);
});
test('cleanup continues in reverse order after failure and records every owned outcome', async () => {
  const ledger = new ResourceLedger(); const cleaned = [];
  ledger.track({ kind: 'record', id: 'first', cleanup: async () => { cleaned.push('first'); } });
  ledger.track({ kind: 'setting', id: 'second', cleanup: async () => { cleaned.push('second'); throw Error('restoration failed'); } });
  ledger.track({ kind: 'record', id: 'third', cleanup: async () => { cleaned.push('third'); } });
  await assert.rejects(ledger.cleanup(), /setting\/second.*restoration failed/);
  assert.deepEqual(cleaned, ['third', 'second', 'first']);
  assert.deepEqual(ledger.snapshot().map(item => item.cleanup === 'complete'), [true, false, true]);
});

test('real browser exceptions, console errors, failed transports and HTTP failures produce actionable evidence', async () => {
  const browser = await chromium.launch();
  try {
    for (const kind of ['pageerror', 'console', 'requestfailed', 'response']) {
      const browserContext = await browser.newContext();
      try {
        const attachments = [];
        const diagnostics = new BrowserDiagnostics(browserContext, {
          testId: `real-${kind}`, attach: async (_name, data) => attachments.push(JSON.parse(data.body)),
        });
        const page = await browserContext.newPage();
        const origin = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:1500';
        await page.route(`${origin}/diagnostic-probe`, route => route.fulfill({ contentType: 'text/html', body: '<h1>Diagnostic probe</h1>' }));
        await page.goto(`${origin}/diagnostic-probe`);
        if (kind === 'pageerror') {
          const error = page.waitForEvent('pageerror');
          await page.evaluate(() => setTimeout(() => { throw new Error('uncaught diagnostic probe'); }, 0));
          await error;
        } else if (kind === 'console') {
          await page.evaluate(() => console.error('console diagnostic probe'));
        } else {
          await page.route(`${origin}/failed-probe`, route => kind === 'requestfailed'
            ? route.abort('failed') : route.fulfill({ status: 503, body: 'HTTP diagnostic probe' }));
          await page.evaluate(() => fetch('/failed-probe').catch(() => undefined));
        }
        await assert.rejects(diagnostics.flush(), new RegExp(`unexpected ${kind}`));
        assert.ok(attachments[0].diagnostics.some(item => item.kind === kind));
      } finally { await browserContext.close(); }
    }
  } finally { await browser.close(); }
});
