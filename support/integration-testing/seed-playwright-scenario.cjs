#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { request } = require('@playwright/test');
const { root, scenarios, namesForScenario } = require('./playwright-catalogue.cjs');
const id = process.argv[2];
const scenario = scenarios.find(item => item.id === id);
if (!scenario || process.argv.length !== 3) {
  console.error('Usage: npm run test:playwright:seed -- <scenario-id>. List IDs with test:playwright:scenarios.');
  process.exit(2);
}
const statePath = path.join(root, '.tmp/playwright/stack.json');
if (!fs.existsSync(statePath)) {
  console.error('No prepared Playwright stack. Run npm run test:playwright:up first.');
  process.exit(1);
}
const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
if (!/^redbox-playwright(-[a-z0-9_-]+)?$/.test(state.project) || state.scenariosEnabled !== true) {
  console.error('The prepared stack has not enabled Playwright scenarios. Prepare an opted-in stack first.');
  process.exit(1);
}
if (fs.existsSync(path.join(root, '.tmp/playwright/cleanup-failed.json'))) {
  console.error('A fixture cleanup failed. Reset the Playwright stack before seeding.');
  process.exit(1);
}
if (state.mode === 'mount') {
  execFileSync(process.execPath, [path.join(__dirname, 'playwright-build-state.cjs'), 'check'], { stdio: 'inherit' });
}
const base = process.env.PLAYWRIGHT_BASE_URL || state.baseURL;
if (!base || new URL(base).origin !== new URL(state.baseURL).origin) {
  console.error('The seed URL must match the prepared Playwright stack.');
  process.exit(1);
}
(async () => {
  const api = await request.newContext({ baseURL: base });
  try {
    const tokenResponse = await api.get('/csrfToken');
    if (!tokenResponse.ok()) throw new Error(`CSRF preflight failed (${tokenResponse.status()}).`);
    const { _csrf } = await tokenResponse.json();
    if (!_csrf) throw new Error('The prepared portal did not issue a CSRF token.');
    const username = process.env.PLAYWRIGHT_ADMIN_USER || 'admin';
    const login = await api.post('/user/login_local', {
      form: { username, password: process.env.PLAYWRIGHT_ADMIN_PASSWORD || 'rbadmin', _csrf },
      headers: { 'X-CSRF-Token': _csrf, 'x-source': 'jsclient' },
    });
    if (!login.ok() || (await login.json()).user?.username !== username) throw new Error('Seed login failed.');
    const names = namesForScenario(id);
    const configuration = await api.get(`/default/rdmp/record/form/${names.recordType}`, { maxRedirects: 0 });
    if (!configuration.ok() || !JSON.stringify(await configuration.json()).includes(names.formName)) {
      throw new Error(`Scenario '${id}' is not registered in the prepared portal.`);
    }
    const csrf = (await (await api.get('/csrfToken')).json())._csrf;
    async function seedRecord(recordType, metadata) {
      const response = await api.post(`/default/rdmp/api/records/metadata/${recordType}`, {
        headers: { 'X-CSRF-Token': csrf },
        data: metadata,
      });
      const payload = await response.json();
      const oid = payload.data?.oid || payload.oid;
      if (oid) {
        const ledgerPath = path.join(root, '.tmp/playwright/seed-ledger.json');
        const ledger = fs.existsSync(ledgerPath) ? JSON.parse(fs.readFileSync(ledgerPath, 'utf8')) : [];
        ledger.push({
          scenario: id,
          recordType,
          oid,
          etag: response.headers().etag,
          baseUrl: base,
          createdAt: new Date().toISOString(),
        });
        fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2) + '\n');
      }
      if (response.status() !== 201 || !oid || !response.headers().etag)
        throw new Error(
          `Scenario seed failed (${response.status()}); any returned record identity was recorded for cleanup.`
        );
      return oid;
    }
    const oid = await seedRecord(names.recordType, scenario.initialMetadata);
    if (
      ['behaviour-processors', 'behaviour-debounce', 'behaviour-events-errors', 'behaviour-logical-row'].includes(id)
    ) {
      const sourceOid = await seedRecord('e2e-initialisation-modes', { title: 'Owned manual metadata source' });
      console.log(`Lookup record ID: ${sourceOid} (paste this into Lookup record)`);
    }
    console.log(`Scenario ${id}: ${scenario.description}`);
    console.log(`Edit URL: ${base}/default/rdmp/record/edit/${oid}`);
    console.log(`Read-only URL: ${base}/default/rdmp/record/view/${oid}`);
  } finally {
    await api.dispose();
  }
})().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
