const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { test } = require('node:test');

const core = createRequire(path.resolve(__dirname, '../../packages/redbox-core/package.json'));

test('served ReDoc bundle includes patched DOMPurify and renders untrusted API descriptions safely', async () => {
  const { JSDOM } = core('jsdom');
  const bundle = fs.readFileSync(path.resolve(__dirname, '../../.tmp/public/default/default/js/redoc.standalone.js'), 'utf8');
  assert.match(bundle, /3\.4\.17/);
  assert.doesNotMatch(bundle, /version=["']3\.4\.(?:6|13)["']/);
  const dom = new JSDOM('<div id="redoc"></div>', { runScripts: 'outside-only', url: 'http://localhost/' });
  const { window } = dom;
  window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} });
  try {
    window.eval(bundle);
    for (const method of ['init', 'destroy', 'hydrate']) assert.equal(typeof window.Redoc[method], 'function');
    assert.equal(window.Redoc.version, '2.5.3');
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('ReDoc render timed out')), 10000);
      window.Redoc.init({ openapi: '3.0.3', info: { title: 'Security fixture', version: '1', description: '<p>Safe API description</p><img src="x" onerror="alert(1)"><script>alert(1)</script>' }, paths: {} }, { untrustedSpec: true, disableSearch: true }, window.document.getElementById('redoc'), error => {
        clearTimeout(timer);
        error ? reject(error) : resolve();
      });
    });
    const mount = window.document.getElementById('redoc');
    assert.match(mount.textContent, /Safe API description/);
    assert.equal(mount.querySelector('[onerror], script'), null);
  } finally {
    window.close();
  }
});
