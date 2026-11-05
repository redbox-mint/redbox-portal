const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const { mkdtemp, writeFile, rm } = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { test } = require('node:test');

const root = createRequire(path.resolve('package.json'));
const angular = createRequire(path.resolve('angular/package.json'));
const core = createRequire(path.resolve('packages/redbox-core/package.json'));

test('serialized function boundaries cannot terminate an enclosing script', () => {
  const serialize = root('serialize-javascript');
  function f() {}
  function g() {}
  f.toString = () => 'function f(){ return 1 }//</script';
  g.toString = () => 'function g(x){ return x } > <img src=x onerror=alert(1)>';
  assert.doesNotMatch(serialize({ a: { f }, g }, { space: 2 }), /<\/script[\s/>]/i);
  const value = { pattern: /sample/gi, date: new Date('2026-01-01'), fn: x => x + 1 };
  const restored = new Function(`return (${serialize(value)})`)();
  assert.equal(restored.fn(2), 3);
  assert.equal(restored.date.toISOString(), value.date.toISOString());
  assert.equal(restored.pattern.source, 'sample');
});

test('YAML config loaders retain aliases and reject prototype changes', () => {
  const mocha = createRequire(root.resolve('mocha/package.json'));
  const nyc = createRequire(root.resolve('nyc/package.json'));
  const nycConfig = createRequire(nyc.resolve('@istanbuljs/load-nyc-config/package.json'));
  for (const yaml of [mocha('js-yaml'), nycConfig('js-yaml')]) {
    const value = yaml.load('base: &base {enabled: true}\nchild: {<<: *base, count: 2}\n');
    assert.deepEqual(value.child, { enabled: true, count: 2 });
    const hostile = yaml.load('__proto__: {polluted: true}');
    assert.equal(Object.getPrototypeOf(hostile), Object.prototype);
    assert.equal({}.polluted, undefined);
  }
});

test('SVG optimization removes executable links and foreign HTML handlers', () => {
  const { optimize } = core('svgo');
  const input = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:s="http://www.w3.org/2000/svg" xmlns:x="http://www.w3.org/1999/xlink"><s:a x:href="java&#9;script:alert(1)"><text>link</text></s:a><foreignObject><div xmlns="http://www.w3.org/1999/xhtml"><img src="x" onerror="alert(1)"/><script>alert(1)</script></div></foreignObject></svg>';
  const { data } = optimize(input, { plugins: ['removeScripts'] });
  assert.doesNotMatch(data, /javascript:|onerror|<script/i);
  assert.match(optimize('<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h10v10z"/></svg>').data, /<path/);
});

test('ReDoc uses the patched sanitizer for untrusted description strings', () => {
  const redoc = createRequire(core.resolve('redoc/package.json'));
  const { JSDOM } = core('jsdom');
  const window = new JSDOM('').window;
  try {
    const purify = redoc('dompurify')(window);
    assert.equal(purify.sanitize('<p>description</p><img src="x" onerror="alert(1)"><script>alert(1)</script>'), '<p>description</p><img src="x">');
    // GHSA-x4vx-rjvf-j5p4: observable nodeName must not disguise a script.
    const parent = window.document.createElement('div');
    const script = window.document.createElement('script');
    script.textContent = 'window.pwned = true';
    Object.defineProperty(script, 'nodeName', { value: 'DIV' });
    parent.appendChild(script);
    purify.sanitize(parent, { IN_PLACE: true });
    assert.equal(parent.querySelector('script'), null);
  } finally {
    window.close();
  }
});

test('webpack dev server rejects paths escaping a publicPath without a trailing slash', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'redbox-webpack-security-'));
  const webpack = angular('webpack');
  const Server = angular('webpack-dev-server');
  await writeFile(path.join(dir, 'entry.js'), 'console.log("safe asset");');
  const compiler = webpack({ mode: 'development', entry: path.join(dir, 'entry.js'), output: { path: path.join(dir, 'dist'), filename: 'main.js', publicPath: '/assets' } });
  const server = new Server({ host: '127.0.0.1', port: 0, static: false, hot: false, client: false, webSocketServer: false, devMiddleware: { publicPath: '/assets', stats: false } }, compiler);
  const request = url => new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: server.server.address().port, path: url }, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { body += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, body }));
    }).on('error', reject);
  });
  try {
    await server.start();
    await new Promise(resolve => server.middleware.waitUntilValid(resolve));
    server.middleware.context.outputFileSystem.writeFileSync(path.join(dir, 'secret.txt'), 'outside-output-secret');
    const asset = await request('/assets/main.js');
    assert.equal(asset.status, 200);
    assert.match(asset.body, /safe asset/);
    for (const url of ['/assets../secret.txt', '/assets%2e%2e%2fsecret.txt', '/assets..%2fsecret.txt']) {
      const response = await request(url);
      assert.equal(response.status, 403, url);
      assert.doesNotMatch(response.body, /outside-output-secret/);
    }
  } finally {
    await server.stop();
    await new Promise((resolve, reject) => compiler.close(error => error ? reject(error) : resolve()));
    await rm(dir, { recursive: true, force: true });
  }
});
