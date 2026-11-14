'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const browser = require('./reconcile-FM-030.cjs');
function reconcile(installation, runtime) {
  const result = browser.reconcile(installation, runtime);
  const assets = result.rows.filter(row => row.originalOwner === 'FM-031');
  assert.equal(assets.length, 15);
  assert(assets.every(row => row.classification === 'migrated' && row.owner === 'FM-031'));
  assert.deepEqual(result.counts, { browserAndIntegration: 183, migrated: 176, intentionalOverrides: 0, later: 7 });
  return {
    ...result,
    assetCounts: { declarations: assets.length, migrated: assets.length, staticBoundaries: 1, laterAssetEntries: 0 },
  };
}
async function main() {
  const f = await browser.offlineApplication();
  try {
    const report = reconcile(f.portal.installation);
    const file = path.join(__dirname, 'FM-031.reconciliation.json');
    const contents = JSON.stringify(report, null, 2) + '\n';
    if (process.argv.includes('--check'))
      assert.equal(await fs.readFile(file, 'utf8'), contents, 'Asset reconciliation drift');
    else await fs.writeFile(file, contents);
    console.log(JSON.stringify({ counts: report.counts, assetCounts: report.assetCounts }));
  } finally {
    await f.close();
  }
}
module.exports = { ...browser, reconcile };
if (require.main === module)
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
