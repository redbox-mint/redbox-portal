// Black-box public probes against the installed image; no application imports.
const assert = require('node:assert/strict');
(async () => {
  const base = process.env.SR_ARTIFACT_ORIGIN;
  assert.equal(base, 'http://127.0.0.1:18527');
  for (const path of ['/healthz', '/readyz', '/default/rdmp/home', '/default/rdmp/styles/style.min.css'])
    assert.equal((await fetch(base + path)).status, 200, path);
  const csrf = await fetch(base + '/csrfToken');
  assert.equal(csrf.status, 200);
  const cookie = csrf.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
  const token = (await csrf.json())._csrf;
  const login = await fetch(base + '/user/login_local', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Source': 'jsclient', 'X-CSRF-Token': token, Cookie: cookie },
    body: JSON.stringify({ username: 'admin', password: 'artifact-only-password', branding: 'default', portal: 'rdmp' }),
  });
  assert.equal(login.status, 200);
  assert.equal((await login.json()).user.username, 'admin');
  const times = [];
  for (let index = 0; index < 20; index++) {
    const start = performance.now();
    const response = await fetch(base + '/default/rdmp/api/forms', { headers: { Authorization: 'Bearer artifact-only-token' } });
    assert.equal(response.status, 200);
    assert(Array.isArray((await response.json()).records));
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  console.log(JSON.stringify({ actualInstalledExecutable: true, health: 200, ready: 200, page: 200, asset: 200, csrfLogin: 200, formsRequests: 20, formsLatencyMs: { p50: times[9], p95: times[18], max: times[19] } }));
})().catch(error => { console.error(error); process.exitCode = 1; });
