import assert from 'node:assert/strict';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { referenceProductionFixture } from './referenceProductionFixture';
import { persistenceStatus } from '../../../src/persistence/runtime';
const audit = require('../../../../../support/specs/fastify-migration/evidence/reconcile-FM-031.cjs');

/** Focused FM-031 browser initialization, not the FM-032 acceptance collection. */
async function main() {
  const root = path.resolve(__dirname, '../../../../..');
  const dns = JSON.parse(
    execFileSync('tailscale', ['status', '--json'], { encoding: 'utf8', timeout: 10000 })
  ).Self.DNSName.replace(/\.$/, '');
  const port = Number(process.env.FM031_BROWSER_PORT ?? 38991);
  const origin = `http://${dns}:${port}`;
  // Keep the explicitly requested legacy environment value and the supported
  // configuration override consistent; strict v6 configuration consumes the latter.
  process.env.REDBOX_PORTAL_APP_URL = origin;
  const output = process.env.FM031_RESULTS!;
  assert(output, 'FM031_RESULTS is required');
  const rootContext = process.env.FM031_BROWSER_ROOT ?? '/portal';
  const f = await referenceProductionFixture(true, undefined, undefined, {
    declarations: audit.declarations,
    rootContext,
    pages: { assetRoots: [path.join(root, '.tmp/public'), path.join(root, 'assets')] },
    env: { REDBOX_PUBLIC_URL: origin },
    configuration: {
      server: { hostname: '0.0.0.0', port, rootContext, trustProxy: true, stopDeadlineMs: 30000, publicUrl: origin },
    },
  });
  await writeFile(
    path.join(output, 'browser-ready.json'),
    JSON.stringify({
      origin,
      rootContext,
      pid: process.pid,
      url: origin + rootContext + '/default/rdmp/record/edit/reference-record',
    })
  );
  try {
    if (process.env.FM031_BROWSER_HOLD !== '1') {
      const { chromium } = require('@playwright/test') as typeof import('@playwright/test');
      const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
      try {
        const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, locale: 'en-AU' });
        const csrfResponse = await context.request.get(origin + rootContext + '/csrfToken');
        assert.equal(csrfResponse.status(), 200);
        const csrf = (await csrfResponse.json())._csrf;
        const login = await context.request.post(origin + rootContext + '/user/login_local', {
          headers: { Origin: origin, 'X-CSRF-Token': csrf },
          form: { username: 'pilot-admin', password: 'pilot-password', branding: 'default', portal: 'rdmp' },
          maxRedirects: 0,
        });
        assert.equal(login.status(), 302);
        const reports = [];
        for (const kind of ['form', 'users']) {
          const target = kind === 'form' ? '/default/rdmp/record/edit/reference-record' : '/default/rdmp/admin/users';
          const page = await context.newPage();
          const errors: string[] = [],
            failed: unknown[] = [],
            requests: unknown[] = [];
          page.on('console', message => {
            if (message.type() === 'error') errors.push(message.text());
          });
          page.on('pageerror', error => errors.push(error.message));
          page.on('requestfailed', request => failed.push({ url: request.url(), failure: request.failure() }));
          page.on('response', response => {
            requests.push({ url: response.url(), status: response.status(), type: response.headers()['content-type'] });
            if (response.status() >= 400) failed.push({ url: response.url(), status: response.status() });
          });
          assert.equal((await page.goto(origin + rootContext + target, { waitUntil: 'networkidle' }))?.status(), 200);
          const selector = kind === 'form' ? 'redbox-form[ng-version] input' : 'manage-users[ng-version] tbody tr';
          await page.locator(selector).first().waitFor({ state: 'visible', timeout: 30000 });
          if (kind === 'form') assert.equal(await page.locator(selector).first().inputValue(), 'Reference');
          const screenshot = path.join(
            root,
            'support/specs/fastify-migration/evidence/FM-031-browser',
            `${rootContext ? 'portal' : 'root'}-${kind}.png`
          );
          await mkdir(path.dirname(screenshot), { recursive: true });
          await page.screenshot({ path: screenshot, fullPage: true });
          reports.push({
            target,
            selector,
            screenshot,
            errors,
            failed,
            requests,
            body: await page.locator('body').innerText(),
          });
          await writeFile(
            path.join(output, rootContext ? 'playwright-portal.json' : 'playwright-root.json'),
            JSON.stringify(reports, null, 2)
          );
          assert.deepEqual(errors, [], 'browser console/page errors');
          assert.deepEqual(failed, [], 'failed browser requests');
          await page.close();
        }
        await context.close();
      } finally {
        await browser.close();
      }
      return;
    }
    // The shared preview browser exercises the real host and records diagnostics.
    // SIGTERM releases all production resources before the external timeout exits.
    await new Promise<void>(resolve => {
      process.once('SIGTERM', resolve);
      process.once('SIGINT', resolve);
    });
  } finally {
    await f.close();
    assert.equal(persistenceStatus(f.owner).pools, 0);
  }
}
if (require.main === module)
  main().then(
    () => process.exit(0),
    error => {
      console.error(error);
      process.exit(1);
    }
  );
