#!/usr/bin/env node
const { spawnSync } = require('node:child_process');
const path = require('node:path');

// Use Playwright's real collection and reporter API. IDs mentioned only in
// comments, dead loops or empty files cannot satisfy this check.
const result = spawnSync(process.execPath, [
  require.resolve('@playwright/test/cli'),
  'test', '--list', '--reporter=./test/playwright/coverage/reporter.ts',
], {
  cwd: path.resolve(__dirname, '../..'),
  env: { ...process.env, PLAYWRIGHT_COVERAGE_COLLECTION: 'true', PLAYWRIGHT_COVERAGE_JSON: String(process.argv.includes('--json')) },
  stdio: 'inherit',
});
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
