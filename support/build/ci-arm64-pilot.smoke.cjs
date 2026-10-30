// Executed over stdin inside each native image as its configured runtime user.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');

function checkAngularBundles(root = '.') {
  const applications = fs.readdirSync(path.join(root, 'assets/angular'), { withFileTypes: true })
    .filter(entry => entry.isDirectory()).map(entry => entry.name);
  assert.ok(applications.length > 0, 'Angular applications exist');
  for (const application of applications) {
    const browser = path.join(root, '.tmp/public/angular', application, 'browser');
    assert.ok(fs.readdirSync(browser).some(name => {
      if (!/^main[^/]*\.js$/.test(name)) return false;
      const bundle = fs.statSync(path.join(browser, name));
      return bundle.isFile() && bundle.size > 0;
    }), `${application} served browser bundle`);
  }
  return applications.length;
}

async function smoke(target) {
  assert.ok(['runtime', 'runtime_pdfgen'].includes(target));
  assert.equal(process.arch, 'arm64');
  assert.equal(process.getuid(), 1000);
  assert.equal(process.cwd(), '/opt/redbox-portal');
  assert.equal(process.env.NODE_ENV, 'production');
  assert.equal(process.env.TZ, 'Australia/Brisbane');
  assert.ok(fs.statSync('app.js').size > 0);
  // Resolve native/runtime dependencies using the production package graph.
  const core = require.resolve('@researchdatabox/redbox-core');
  require(core);
  createRequire(core)('@uppy/companion');
  const assets = ['default/default/js/index.bundle.js', 'default/default/styles/style.min.css'];
  for (const asset of assets) assert.ok(fs.statSync(`.tmp/public/${asset}`).size > 0, asset);
  const applications = checkAngularBundles();
  assert.throws(() => require.resolve('redbox-hook-dev'), { code: 'MODULE_NOT_FOUND' });
  let pdfBytes = null;
  if (target === 'runtime_pdfgen') {
    const hook = require.resolve('@researchdatabox/sails-hook-redbox-pdfgen');
    require(hook);
    assert.equal(process.env.PUPPETEER_EXECUTABLE_PATH, '/usr/bin/chromium');
    const browser = await createRequire(hook)('puppeteer').launch({
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });
    try {
      const page = await browser.newPage();
      await page.setContent('<html><body>ReDBox native ARM64 pilot</body></html>');
      const pdf = Buffer.from(await page.pdf());
      assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
      assert.ok(pdf.length > 500);
      pdfBytes = pdf.length;
    } finally { await browser.close(); }
  } else {
    assert.throws(() => require.resolve('@researchdatabox/sails-hook-redbox-pdfgen'), { code: 'MODULE_NOT_FOUND' });
  }
  return { target, architecture: process.arch, node: process.version, uid: process.getuid(),
    checked_static_assets: assets.length, checked_angular_applications: applications,
    core_loaded: true, companion_loaded: true, pdf_bytes: pdfBytes,
    portal_http_startup: 'not_exercised_requires_integration_services' };
}

if (require.main === module || process.argv[1] === '-') {
  smoke(process.argv[2]).then(result => {
    console.log(`CI_ARM64_PILOT_RESULT=${JSON.stringify(result)}`);
    // Some required packages create background handles. All intended checks have completed.
    process.exit(0);
  }).catch(error => { console.error(error); process.exit(1); });
}
module.exports = { smoke, checkAngularBundles };
