const assert = require('node:assert/strict');
const { once } = require('node:events');
const fs = require('node:fs');
const http = require('node:http');
const { createRequire } = require('node:module');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const root = createRequire(path.resolve(__dirname, '../../package.json'));
const core = createRequire(path.resolve(__dirname, '../../packages/redbox-core/package.json'));

async function server(t, handler) {
  const app = http.createServer(handler);
  app.listen(0, '127.0.0.1');
  await once(app, 'listening');
  t.after(() => new Promise(resolve => { app.closeAllConnections(); app.close(resolve); }));
  return `http://127.0.0.1:${app.address().port}`;
}

for (const [name, consumer] of [
  ['portal', root], ['core', core],
  ['RAiD', createRequire(path.resolve(__dirname, '../../packages/raido/package.json'))],
  ['RVA', createRequire(path.resolve(__dirname, '../../packages/rva-registry/package.json'))],
]) {
  test(`${name}: HTTP redirects strip credentials, preserve same-origin auth and enforce redirect limits`, async t => {
    const axios = consumer('axios');
    let collected = 0;
    const target = await server(t, (req, res) => { collected++; res.end(JSON.stringify(req.headers)); });
    const source = await server(t, (req, res) => {
      if (req.url === '/local') return res.end(JSON.stringify(req.headers));
      res.writeHead(302, { Location: req.url === '/same' ? '/local' : target });
      res.end();
    });
    const headers = { Authorization: 'Bearer private', Cookie: 'session=private' };
    const remote = await axios.get(source, { proxy: false, headers });
    assert.equal(remote.data.authorization, undefined);
    assert.equal(remote.data.cookie, undefined);
    const local = await axios.get(`${source}/same`, { proxy: false, headers });
    assert.equal(local.data.authorization, headers.Authorization);
    assert.equal(local.data.cookie, headers.Cookie);
    const before = collected;
    const blocked = await axios.get(source, { proxy: false, maxRedirects: 0, validateStatus: () => true });
    assert.equal(blocked.status, 302);
    assert.equal(collected, before);
    // Fetch must obey the same SSRF boundary as the Node adapter.
    const fetchBlocked = await axios.get(source, { adapter: 'fetch', maxRedirects: 0, validateStatus: () => true });
    assert.equal(fetchBlocked.status, 302);
    assert.equal(collected, before);
  });

  test(`${name}: explicit proxy auth and CIDR NO_PROXY preserve outbound routing`, async t => {
    const axios = consumer('axios');
    const target = await server(t, (req, res) => res.end('direct'));
    let proxied = 0;
    const proxy = await server(t, (req, res) => {
      proxied++;
      assert.equal(req.url, `${target}/resource`);
      assert.equal(req.headers['proxy-authorization'], `Basic ${Buffer.from('user:pass').toString('base64')}`);
      res.end('proxied');
    });
    const proxyUrl = new URL(proxy);
    assert.equal((await axios.get(`${target}/resource`, {
      proxy: { protocol: 'http', host: proxyUrl.hostname, port: Number(proxyUrl.port), auth: { username: 'user', password: 'pass' } },
    })).data, 'proxied');
    const saved = { ...process.env };
    try {
      for (const key of ['http_proxy', 'https_proxy', 'all_proxy', 'no_proxy', 'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY']) delete process.env[key];
      process.env.HTTP_PROXY = `http://user:pass@${proxyUrl.host}`;
      process.env.NO_PROXY = '127.0.0.0/8';
      assert.equal((await axios.get(`${target}/resource`)).data, 'direct');
      assert.equal(proxied, 1);
    } finally {
      for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
      Object.assign(process.env, saved);
    }
  });

  test(`${name}: multipart forwarding escapes hostile field names and filenames`, async t => {
    const axios = consumer('axios');
    const FormData = createRequire(consumer.resolve('axios/package.json'))('form-data');
    const multiparty = root('multiparty');
    const destination = await server(t, (req, res) => {
      new multiparty.Form().parse(req, (error, fields, files) => {
        if (error) { res.writeHead(400); return res.end(error.message); }
        const file = files.upload[0];
        const result = { fields, filename: file.originalFilename, content: fs.readFileSync(file.path, 'utf8'), headers: file.headers };
        fs.unlinkSync(file.path);
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(result));
      });
    });
    const form = new FormData();
    form.append('name"\r\nX-Injected: true', 'value');
    form.append('upload', Buffer.from('file content'), { filename: 'file"\r\nX-Injected: true.txt', contentType: 'text/plain' });
    const { data } = await axios.post(destination, form, { proxy: false, headers: form.getHeaders() });
    assert.deepEqual(data.fields, { 'name%22%0D%0AX-Injected: true': ['value'] });
    // Multiparty decodes %22 in filenames, while preserving encoded CR/LF.
    assert.equal(data.filename, 'file"%0D%0AX-Injected: true.txt');
    assert.ok(data.headers['content-disposition'].includes('file%22%0D%0AX-Injected: true.txt'));
    assert.equal(data.content, 'file content');
    assert.equal(data.headers['x-injected'], undefined);
  });
}

test('follow-redirects protects custom credential names and array-form headers', async t => {
  const follow = createRequire(core.resolve('axios/package.json'))('follow-redirects');
  let reached = 0;
  const target = await server(t, (req, res) => { reached++; res.end(JSON.stringify(req.headers)); });
  const source = await server(t, (req, res) => { res.writeHead(302, { Location: target }); res.end(); });
  const headers = { 'X-Api^Key': 'secret', 'X-Token|Secret': 'secret', Authorization: 'Bearer secret', Cookie: 'private', 'X-Public': 'ok' };
  const send = headers => new Promise((resolve, reject) => {
    follow.http.get(source, { headers, sensitiveHeaders: ['X-Api^Key', 'X-Token|Secret'] }, res => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => resolve(JSON.parse(body)));
    }).on('error', reject);
  });
  for (const supplied of [headers, Object.entries(headers).flat()]) {
    const received = await send(supplied);
    assert.equal(received['x-public'], 'ok');
    for (const key of ['x-api^key', 'x-token|secret', 'authorization', 'cookie']) assert.equal(received[key], undefined);
  }
  assert.equal(reached, 2);
});

test('Sails socket virtual requests retain IPv4/IPv6 trust boundaries and IP attribution', () => {
  const sockets = createRequire(root.resolve('sails-hook-sockets/package.json'));
  const receive = sockets('./lib/receive-incoming-sails-io-msg');
  const express = createRequire(root.resolve('sails/package.json'))('express');
  for (const [trust, remote, forwarded, ip, ips] of [
    [false, '203.0.113.4', '198.51.100.1', '203.0.113.4', []],
    [true, '127.0.0.1', '198.51.100.1, 10.0.0.2', '198.51.100.1', ['198.51.100.1', '10.0.0.2']],
    [1, '::1', '198.51.100.1, 10.0.0.2', '10.0.0.2', ['10.0.0.2']],
    ['10.0.0.0/8', '::ffff:10.0.0.2', '198.51.100.1', '198.51.100.1', ['198.51.100.1']],
    ['::ffff:10.0.0.0/104', '203.0.113.4', '198.51.100.1', '203.0.113.4', []],
    ['::ffff:10.0.0.0/8', '203.0.113.4', '198.51.100.1', '203.0.113.4', []],
    ['::/1', '203.0.113.4', '198.51.100.1', '203.0.113.4', []],
    ['2001:db8::/32', '2001:db8::2', '2001:db9::1', '2001:db9::1', ['2001:db9::1']],
    ['2001:db8::/32', '2001:db9::2', '2001:db8::1', '2001:db9::2', []],
  ]) {
    const app = express();
    app.set('trust proxy', trust);
    let context;
    receive({ hooks: { http: { app } }, config: { host: 'localhost' }, log: { verbose() {} }, router: { route(req) { context = req; } } })({
      incomingSailsIOMsg: { url: '/record', headers: { 'x-forwarded-for': '192.0.2.99' } }, eventName: 'get',
      socket: { handshake: { address: remote, headers: { 'x-forwarded-for': forwarded }, query: { __sails_io_sdk_version: '1.2.1', __sails_io_sdk_platform: 'node', __sails_io_sdk_language: 'javascript' } } },
    });
    assert.equal(context.ip, ip, `trust ${trust} remote ${remote}`);
    assert.deepEqual(context.ips, ips);
  }
  // The hook also exposes proxyaddr directly; independently compiled trust
  // subnets must reject the advisory's misconfiguration, too.
  const proxyaddr = sockets('proxy-addr');
  assert.equal(proxyaddr.compile('::ffff:10.0.0.0/8')('203.0.113.4'), false);
  assert.equal(proxyaddr.compile('::ffff:10.0.0.0/104')('10.1.2.3'), true);
});

for (const [name, consumer] of [['portal', root], ['core', core], ['dev tools', createRequire(path.resolve(__dirname, '../../packages/redbox-dev-tools/package.json'))]]) {
  test(`${name}: Handlebars renders escaped templates, rejects forged AST and emits safe precompiled output`, () => {
    const hbs = consumer('handlebars');
    assert.equal(hbs.compile('{{#each records}}{{title}}{{/each}}')({ records: [{ title: '<script>' }] }), '&lt;script&gt;');
    const ast = hbs.parse('{{#if ok}}yes{{/if}}');
    ast.body[0].program.blockParams = { length: '(globalThis.__redboxDependencyInjected = true)' };
    assert.throws(() => hbs.compile(ast)({ ok: true }));
    assert.throws(() => hbs.precompile(ast));
    assert.equal(globalThis.__redboxDependencyInjected, undefined);
    const source = 'safe</script><script>globalThis.injected=true</script><script>';
    const compiled = hbs.precompile(source);
    assert.equal(/<\/script/i.test(compiled), false);
    const spec = vm.runInNewContext(`(${compiled})`);
    assert.equal(hbs.template(spec)({}), source);
    assert.equal(hbs.compile('{{lookup fn "constructor"}}')({ fn() {} }, { allowProtoMethodsByDefault: true }), '');
  });
}

test('query serialization and schema URI resolution handle hostile input safely', () => {
  for (const consumer of [root, core]) {
    const qs = createRequire(consumer.resolve('sails-mongo/package.json'))('qs');
    assert.deepEqual(qs.parse('metadata[title]=record&tags[]=a&tags[]=b'), { metadata: { title: 'record' }, tags: ['a', 'b'] });
    assert.doesNotThrow(() => qs.stringify(JSON.parse('{"a":[{"toString":"x"}]}'), { arrayFormat: 'comma' }));
    assert.doesNotThrow(() => qs.stringify(JSON.parse('{"a":[{"toString":"x"}]}'), { arrayFormat: 'comma', encodeValuesOnly: true }));
    assert.doesNotThrow(() => qs.stringify(JSON.parse('{"constructor":{"isBuffer":"x"}}')));
    assert.equal({}.polluted, undefined);
  }
  const ajvRequire = createRequire(root.resolve('ajv/package.json'));
  const uri = ajvRequire('fast-uri');
  assert.equal(uri.resolve('https://EXAMPLE.org/schemas/root.json', '../common.json'), 'https://example.org/common.json');
  assert.throws(() => uri.serialize({ scheme: 'http', host: 'trusted.example', port: '@127.0.0.1:8124', path: '/app' }));
  assert.equal(uri.serialize({ path: 'javascript:alert(1)' }, { reference: 'suffix' }), 'javascript%3Aalert(1)');
  const Ajv = root('ajv');
  const validator = new Ajv().addSchema({ $id: 'https://example.org/common.json', type: 'string' })
    .compile({ $id: 'https://example.org/schemas/root.json', type: 'object', properties: { title: { $ref: '../common.json' } } });
  assert.equal(validator({ title: 'record' }), true);
  assert.equal(validator({ title: 42 }), false);
});

test('YAML loaders, glob expansion, temporary files and Moment preserve consumer behavior', () => {
  for (const consumer of [root, core]) {
    for (const loader of ['mocha', '@istanbuljs/load-nyc-config']) {
      const yaml = createRequire(consumer.resolve(`${loader}/package.json`))('js-yaml');
      const result = yaml.load('defaults: &defaults\n  enabled: true\nrecord:\n  <<: *defaults\n  title: example\n');
      assert.deepEqual(result.record, { enabled: true, title: 'example' });
      const emptyMerges = 'arr: &arr [' + Array(20).fill('{}').join(',') + ']\ntargets:\n  - <<: *arr\n  - <<: *arr\n';
      assert.throws(() => yaml.load(emptyMerges, { maxTotalMergeKeys: 10 }), /merge/i);
    }
    const moment = consumer('moment');
    assert.equal(moment.utc('2026-11-05').format('YYYY-MM-DD'), '2026-11-05');
    assert.equal(moment.locale('en'), 'en');
    assert.throws(() => moment.locale({ toString() { return '../../injected'; } }), TypeError);
    assert.equal(moment.locale(), 'en');
  }
  const minimatch = createRequire(core.resolve('archiver-utils/package.json'))('minimatch');
  assert.equal(minimatch('records/a.json', 'records/*.{json,yaml}'), true);
  const glob = core('glob');
  assert.deepEqual(glob.globSync('test/dependencies/{ingress,outbound}.test.cjs').sort(), ['test/dependencies/ingress.test.cjs', 'test/dependencies/outbound.test.cjs']);
  const tmp = createRequire(core.resolve('exceljs/package.json'))('tmp');
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'redbox-dependencies-'));
  try {
    const file = tmp.fileSync({ tmpdir: base, prefix: 'upload-', postfix: '.tmp' });
    assert.equal(path.dirname(file.name), base);
    fs.writeFileSync(file.fd, 'temporary upload');
    assert.equal(fs.readFileSync(file.name, 'utf8'), 'temporary upload');
    file.removeCallback();
    assert.equal(fs.existsSync(file.name), false);
    assert.throws(() => tmp.fileSync({ tmpdir: base, name: '../escape' }));
    for (const options of [{ prefix: '../escape' }, { postfix: '../../escape' }, { dir: '../escape' }]) {
      assert.throws(() => tmp.fileSync({ tmpdir: base, ...options }));
    }
  } finally { fs.rmSync(base, { recursive: true, force: true }); }
});

test('legacy and current glob consumers bound hostile brace expansion', () => {
  const shell = createRequire(root.resolve('shelljs/package.json'));
  const glob = createRequire(core.resolve('glob/package.json'));
  for (const consumer of [shell, root, glob]) {
    const matcher = createRequire(consumer.resolve('minimatch/package.json'));
    const brace = matcher('brace-expansion');
    const expand = typeof brace === 'function' ? brace : brace.expand;
    assert.deepEqual(expand('record-{draft,published}.{json,yaml}'), [
      'record-draft.json', 'record-draft.yaml', 'record-published.json', 'record-published.yaml',
    ]);
    const start = performance.now();
    assert.deepEqual(expand('{1..10000000}', { max: 8 }), ['1', '2', '3', '4', '5', '6', '7', '8']);
    assert.ok(Array.isArray(expand('{}'.repeat(2000))));
    assert.ok(Array.isArray(expand('{'.repeat(2000) + 'a,b' + '}'.repeat(2000))));
    assert.ok(performance.now() - start < 5000, 'bounded expansion must finish without exhausting the stack');
  }
});

test('Companion access logging escapes quotes and Unicode line separators', async t => {
  const morgan = createRequire(root.resolve('@uppy/companion/package.json'))('morgan');
  const lines = [];
  const logger = morgan('combined', { stream: { write(line) { lines.push(line); } } });
  const address = await server(t, (req, res) => logger(req, res, () => { res.end('ok'); }));
  await root('axios').get(address, { proxy: false, headers: { 'User-Agent': 'client" forged' } });
  assert.equal(lines.length, 1);
  assert.ok(lines[0].includes('client\\" forged'));
  const format = morgan.compile(':user-agent');
  const escaped = format(morgan, { headers: { 'user-agent': 'a\u2028b\u2029c' } }, {});
  assert.equal(/[\u2028\u2029]/.test(escaped), false);
});
