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
    window.Redoc.destroy(mount);
    assert.equal(mount.childNodes.length, 0, 'destroy must clear the rendered documentation');
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('ReDoc reinitialization timed out')), 10000);
      window.Redoc.init({ openapi: '3.0.3', info: { title: 'Reinitialized documentation', version: '1' }, paths: {} }, { disableSearch: true }, mount, error => {
        clearTimeout(timer);
        error ? reject(error) : resolve();
      });
    });
    assert.match(mount.textContent, /Reinitialized documentation/);
    window.Redoc.destroy(mount);
    assert.equal(mount.childNodes.length, 0);
  } finally {
    window.close();
  }
});

test('ReDoc wrapper reuses roots and cancels deferred hydration during teardown', () => {
  const vm = require('node:vm');
  const sourcePath = path.resolve(__dirname, '../../packages/redbox-core/browser/redoc-standalone.js');
  const source = fs.readFileSync(sourcePath, 'utf8');
  const roots = [];
  const timers = new Map();
  let timerId = 0;
  let hydrated = 0;
  const makeRoot = () => {
    const root = { renders: 0, unmounts: 0, render() { this.renders++; }, unmount() { this.unmounts++; } };
    roots.push(root);
    return root;
  };
  const modules = {
    react: { createElement: (...args) => args },
    'react-dom/client': { createRoot: makeRoot, hydrateRoot: () => { hydrated++; return makeRoot(); } },
    mobx: { configure() {} },
    redoc: { AppStore: { fromJS: value => value } },
    'redoc/package.json': { version: '2.5.3' },
  };
  const sandbox = { module: { exports: {} }, require: name => modules[name],
    document: { querySelector: () => null },
    setTimeout(callback) { timers.set(++timerId, callback); return timerId; },
    clearTimeout(id) { timers.delete(id); },
  };
  vm.runInNewContext(source, sandbox, { filename: sourcePath });
  const api = sandbox.module.exports;
  const element = { attributes: [] };
  const flush = () => { for (const [id, callback] of timers) { timers.delete(id); callback(); } };

  api.init({}, {}, element);
  api.init({}, {}, element);
  assert.equal(roots.length, 1, 'repeated init must reuse the existing root');
  assert.equal(roots[0].renders, 2);
  api.destroy(element);
  assert.equal(roots[0].unmounts, 1);
  api.destroy(element);
  assert.equal(roots.length, 1, 'destroy must not create a root');

  api.hydrate({}, element);
  api.destroy(element);
  flush();
  assert.equal(hydrated, 0, 'destroy must cancel pending hydration');
  api.hydrate({}, element);
  api.hydrate({}, element);
  flush();
  assert.equal(hydrated, 1, 'only the latest pending hydration may mount');
  api.destroy(element);
  assert.equal(roots.at(-1).unmounts, 1, 'destroy must unmount the hydrated root');

  api.hydrate({}, element);
  api.init({}, {}, element);
  flush();
  assert.equal(hydrated, 1, 'init must cancel pending hydration');
  api.hydrate({}, element);
  assert.equal(roots.at(-1).unmounts, 1, 'hydrate must release the existing root');
  flush();
  api.destroy(element);
});
