const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { once } = require('node:events');
const { request } = require('playwright');
require('ts-node').register({ skipProject: true, transpileOnly: true, compilerOptions: { module: 'commonjs', moduleResolution: 'node' } });
const { loginWithCsrf } = require('../playwright/fixtures/auth.ts');

test('a fresh browser session supplies brand context before CSRF and login', async t => {
  const calls = [];
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    calls.push(`${req.method} ${url.pathname}`);
    res.setHeader('content-type', 'application/json');
    if (req.method === 'GET' && url.pathname === '/csrfToken') {
      // checkAuth requires a brand even before an anonymous session logs in.
      if (url.searchParams.get('branding') !== 'default' || url.searchParams.get('portal') !== 'rdmp') {
        res.writeHead(404).end('{}');
        return;
      }
      res.setHeader('set-cookie', 'fixture=session; Path=/');
      res.end(JSON.stringify({ _csrf: 'fixture-csrf' }));
      return;
    }
    if (req.method === 'POST' && url.pathname === '/user/login_local') {
      let body = '';
      for await (const chunk of req) body += chunk;
      const form = new URLSearchParams(body);
      if (form.get('branding') !== 'default' || form.get('portal') !== 'rdmp' ||
          form.get('_csrf') !== 'fixture-csrf' || req.headers['x-csrf-token'] !== 'fixture-csrf' ||
          !req.headers.cookie?.includes('fixture=session')) {
        res.writeHead(403).end('{}');
        return;
      }
      res.end(JSON.stringify({ user: { username: form.get('username') } }));
      return;
    }
    res.writeHead(404).end('{}');
  });
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const api = await request.newContext({ baseURL: `http://127.0.0.1:${server.address().port}` });
  t.after(() => api.dispose());
  const page = { context: () => ({ request: api }) };
  const token = await loginWithCsrf(page, { username: 'fixture-admin', password: 'fixture-password' });
  assert.equal(token, 'fixture-csrf');
  assert.deepEqual(calls, ['GET /csrfToken', 'POST /user/login_local', 'GET /csrfToken']);
});
