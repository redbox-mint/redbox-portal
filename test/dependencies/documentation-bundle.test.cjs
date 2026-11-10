const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { test } = require('node:test');

const core = createRequire(path.resolve(__dirname, '../../packages/redbox-core/package.json'));

async function waitForRender(mount, expected) {
  const deadline = Date.now() + 5000;
  while (!expected.test(mount.textContent)) {
    assert(Date.now() < deadline, `ReDoc did not commit the expected content: ${mount.textContent}`);
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}

test('served ReDoc bundle includes patched DOMPurify and renders untrusted API descriptions safely', async () => {
  const { JSDOM } = core('jsdom');
  const bundle = fs.readFileSync(path.resolve(__dirname, '../../.tmp/public/default/default/js/redoc.standalone.js'), 'utf8');
  assert.match(bundle, /3\.4\.17/);
  assert.doesNotMatch(bundle, /version=["']3\.4\.(?:6|13|16)["']/);
  const dom = new JSDOM('<div id="redoc"></div>', { runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost/' });
  const { window } = dom;
  const stringCompilation = [];
  window.Worker = function () { throw new Error('Search should use its main-thread index'); };
  window.Function = new Proxy(window.Function, {
    apply(_target, _receiver, args) { stringCompilation.push(args); throw new Error('CSP blocks string compilation'); },
    construct(_target, args) { stringCompilation.push(args); throw new Error('CSP blocks string compilation'); },
  });
  // jsdom has no viewport/layout. Mount lazy sections explicitly in this test.
  window.IntersectionObserver = class {
    constructor(callback) { this.callback = callback; }
    observe(target) { this.callback([{ target, isIntersecting: true }], this); }
    disconnect() {}
  };
  window.scrollTo = () => {};
  window.performance.getEntriesByType = () => [];
  window.performance.getEntriesByName = () => [];
  window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} });
  try {
    const { SourceTextModule } = require('node:vm');
    const module = new SourceTextModule(bundle, {
      context: dom.getInternalVMContext(),
      initializeImportMeta(meta) { meta.url = 'http://localhost/redoc.standalone.js'; },
    });
    await module.link(specifier => { throw new Error(`Unexpected external import: ${specifier}`); });
    await module.evaluate();
    const renderer = module.namespace;
    for (const method of ['init', 'destroy', 'hydrate']) assert.equal(typeof renderer[method], 'function');
    assert.equal(renderer.version, '3.0.1');
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('ReDoc render timed out')), 10000);
      renderer.init({ openapi: '3.0.3', info: { title: 'Security fixture', version: '1', description: '<p>Safe API description</p><img src="x" onerror="alert(1)"><script>alert(1)</script>' }, paths: {} }, { untrustedSpec: true, disableSearch: true, disableTelemetry: true }, window.document.getElementById('redoc'), error => {
        clearTimeout(timer);
        error ? reject(error) : resolve();
      });
    });
    const mount = window.document.getElementById('redoc');
    await waitForRender(mount, /Safe API description/);
    assert.equal(mount.querySelector('[onerror]'), null);
    // ReDoc 3 adds its own color-mode bootstrap script. The hostile fixture
    // script must be removed independently of that trusted renderer script.
    assert.equal([...mount.querySelectorAll('script')].some(node => node.textContent.includes('alert(1)')), false);
    renderer.destroy(mount);
    assert.equal(mount.childNodes.length, 0, 'destroy must clear the rendered documentation');
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('ReDoc reinitialization timed out')), 10000);
      renderer.init({ openapi: '3.0.3', info: { title: 'Reinitialized documentation', version: '1' }, paths: {} }, { disableSearch: true, disableTelemetry: true }, mount, error => {
        clearTimeout(timer);
        error ? reject(error) : resolve();
      });
    });
    await waitForRender(mount, /Reinitialized documentation/);
    renderer.destroy(mount);
    assert.equal(mount.childNodes.length, 0);
    await renderer.hydrate({ openapi: '3.0.3', info: { title: 'Hydrated documentation', version: '1' }, paths: {} }, { disableTelemetry: true }, mount);
    await waitForRender(mount, /Hydrated documentation/);
    renderer.destroy(mount);
    assert.equal(mount.childNodes.length, 0);
    assert.deepEqual(stringCompilation, [], 'rendering and search setup must never probe unsafe-eval');
  } finally {
    window.close();
  }
});

test('ReDoc wrapper reuses roots and cancels deferred hydration during teardown', async () => {
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
    'react-router': { HashRouter: function HashRouter() {} },
    redoc: { prepareApiDocs: async () => ({}), logoFromSpec: () => undefined },
    'redoc/package.json': { version: '3.0.1' },
  };
  const sandbox = { exports: {}, window: {}, require: name => modules[name],
    document: { querySelector: () => null },
    setTimeout(callback) { timers.set(++timerId, callback); return timerId; },
    clearTimeout(id) { timers.delete(id); },
  };
  vm.runInNewContext(source, sandbox, { filename: sourcePath });
  const api = sandbox.exports;
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

  const pending = api.hydrate({}, {}, element);
  api.destroy(element);
  await pending;
  flush();
  assert.equal(hydrated, 0, 'destroy must cancel pending hydration');
  await api.hydrate({}, {}, element);
  await api.hydrate({}, {}, element);
  flush();
  assert.equal(hydrated, 1, 'only the latest pending hydration may mount');
  api.destroy(element);
  assert.equal(roots.at(-1).unmounts, 1, 'destroy must unmount the hydrated root');

  await api.hydrate({}, {}, element);
  api.init({}, {}, element);
  flush();
  assert.equal(hydrated, 1, 'init must cancel pending hydration');
  await api.hydrate({}, {}, element);
  assert.equal(roots.at(-1).unmounts, 1, 'hydrate must release the existing root');
  flush();
  api.destroy(element);
});
