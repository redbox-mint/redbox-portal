// Offline, disposable-container probe (no external services or provider calls):
// docker run --rm -i --network=none --entrypoint node IMAGE - [COMPANION_DIRECTORY] < support/build/docker-image-contract.behavior.cjs
// Defaults to core's Companion. Probe each context in a fresh container so the
// two Companion versions cannot collide in a shared Prometheus registry.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { createRequire } = require('node:module');

function request(server, url, headers = {}) {
  return new Promise((resolve, reject) => {
    const outgoing = http.get({ hostname: '127.0.0.1', port: server.address().port, path: url, headers }, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { body += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, body, cookies: response.headers['set-cookie'] || [] }));
      response.on('error', reject);
    }).on('error', reject);
    outgoing.setTimeout(2000, () => outgoing.destroy(new Error('response timed out')));
  });
}

async function serve(app, callback) {
  const server = http.createServer(app);
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  try { return await callback(server); }
  finally { await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
}

async function probe(manifest) {
  const resolver = createRequire(manifest);
  const express = resolver('express');
  const session = resolver('express-session');
  const version = name => resolver(`${name}/package.json`).version;
  const result = { companion: JSON.parse(fs.readFileSync(manifest)).version,
    express: { version: version('express'), entry: resolver.resolve('express') },
    session: { version: version('express-session'), entry: resolver.resolve('express-session') } };

  // This exact optional-segment syntax occurs in Companion's installed source.
  const routes = express();
  routes.get('/connect/:oauthProvider{/:override}', (req, res) => res.json(req.params));
  routes.get('/query', (req, res) => res.json(req.query));
  result.routes = await serve(routes, async server => ({
    plain: await request(server, '/connect/drive'),
    override: await request(server, '/connect/drive/custom'),
    defaultQuery: await request(server, '/query?metadata[key]=value'),
  }));

  result.sessions = {};
  for (const [name, cookie, headers] of [
    ['ordinary', { httpOnly: true, sameSite: 'lax' }, {}],
    ['factory', () => ({ httpOnly: true, sameSite: 'lax' }), {}],
    ['autoHttp', { sameSite: 'auto', secure: 'auto' }, {}],
    ['autoHttpsProxy', { sameSite: 'auto', secure: 'auto' }, { 'x-forwarded-proto': 'https' }],
  ]) {
    const app = express();
    const errors = [];
    app.use(session({ secret: 'disposable-image-contract-probe', resave: false,
      saveUninitialized: false, proxy: true, cookie }));
    app.get('/', (req, res) => { req.session.count = (req.session.count || 0) + 1; res.json({ count: req.session.count }); });
    // Unsupported cookie options can also break res.end. Destroy the disposable
    // response instead of trying to send another response through that wrapper.
    app.use((error, req, res, next) => { errors.push(error.message); res.destroy(); });
    try {
      result.sessions[name] = await serve(app, async server => {
        const first = await request(server, '/', headers);
        const second = await request(server, '/', { ...headers, cookie: first.cookies.map(value => value.split(';')[0]).join('; ') });
        // Retain cookie attributes, not random session IDs.
        for (const response of [first, second]) response.cookies = response.cookies.map(value => value.replace(/^[^;]+/, 'connect.sid=<redacted>'));
        return { first, second, ...(errors.length ? { middlewareErrors: errors } : {}) };
      });
    } catch (error) {
      result.sessions[name] = { error: error.message, middlewareErrors: errors };
    }
  }

  try {
    const companion = resolver('@uppy/companion');
    const { app } = companion.app({ secret: 'disposable-image-contract-probe', filePath: '/tmp',
      server: { host: '127.0.0.1', protocol: 'http', path: '/companion' }, providerOptions: {},
      uploadUrls: ['http://127.0.0.1'], corsOrigins: ['http://127.0.0.1'] });
    result.companionApp = await serve(app, async server => ({
      health: await request(server, '/health'),
      connect: await request(server, '/connect/drive'),
    }));
  } catch (error) {
    result.companionApp = { error: error.message };
  }
  return result;
}

async function main() {
  for (const method of ['log', 'info', 'debug', 'warn']) console[method] = (...args) => console.error(...args);
  const output = {};
  const directory = process.argv[2] || 'packages/redbox-core/node_modules/@uppy/companion';
  output[directory] = await probe(path.resolve(directory, 'package.json'));
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`, () => process.exit(0));
}

main().catch(error => { console.error(error); process.exitCode = 1; });
