'use strict';
// End-to-end protocol verification against the running demo. Tokens stay in memory.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { createRequire } = require('node:module');
const sdk = createRequire(path.resolve(__dirname, '../../../packages/redbox-mcp/package.json'));
const { Client, StreamableHTTPClientTransport, auth } = sdk('@modelcontextprotocol/client');
const directory = path.join(__dirname, '.dev');
const settings = Object.fromEntries(
  fs
    .readFileSync(path.join(directory, 'demo.env'), 'utf8')
    .trim()
    .split('\n')
    .map(line => {
      const index = line.indexOf('=');
      return [line.slice(0, index), line.slice(index + 1)];
    })
);
const credentials = JSON.parse(fs.readFileSync(path.join(directory, 'credentials.json')));
const expected = JSON.parse(fs.readFileSync(path.join(directory, 'expected-results.json')));
const endpoint = `${settings.REDBOX_DEMO_URL}/mcp`;
const callback = 'http://127.0.0.1:52344/callback';
const issuer = `${settings.REDBOX_DEMO_URL}/auth/realms/redbox-reporting`;
const cookies = new Map();
async function request(url, init = {}) {
  assert.equal(new URL(url).origin, settings.REDBOX_DEMO_URL);
  const response = await fetch(url, {
    ...init,
    redirect: 'manual',
    headers: { ...init.headers, cookie: [...cookies.values()].join('; ') },
  });
  for (const value of response.headers.getSetCookie()) cookies.set(value.split('=')[0], value.split(';')[0]);
  return response;
}
function formAction(html) {
  const action = html.match(/<form[^>]*action="([^"]+)"/i)?.[1];
  if (!action) throw new Error('Expected Keycloak login/consent form');
  return new URL(action.replaceAll('&amp;', '&'), settings.REDBOX_DEMO_URL).href;
}
async function authorize(url, expectedState) {
  let response = await request(url);
  for (let attempt = 0; response.status === 302 && attempt < 10; attempt++) {
    const target = new URL(response.headers.get('location'), url);
    if (target.searchParams.has('error'))
      throw new Error(
        `OAuth authorization rejected: ${target.searchParams.get('error')} (${target.searchParams.get('error_description') || ''})`
      );
    response = await request(target);
  }
  assert.equal(response.status, 200);
  let html = await response.text();
  response = await request(formAction(html), {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ username: 'reporting-researcher', password: credentials.researcher, credentialId: '' }),
  });
  for (let attempt = 0; response.status === 302 && attempt < 10; attempt++) {
    const target = new URL(response.headers.get('location'), response.url);
    if (target.origin !== settings.REDBOX_DEMO_URL) break;
    response = await request(target);
  }
  if (response.status === 200) {
    html = await response.text();
    const body = new URLSearchParams({ accept: 'Yes' });
    for (const input of html.matchAll(/<input\b[^>]*>/g)) {
      const name = input[0].match(/\bname="([^"]+)"/)?.[1];
      const value = input[0].match(/\bvalue="([^"]*)"/)?.[1];
      if (input[0].includes('type="hidden"') && name) body.set(name, value || '');
    }
    response = await request(formAction(html), {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });
  }
  assert.equal(response.status, 302, 'OAuth should redirect to the local callback');
  const location = new URL(response.headers.get('location'));
  assert.equal(`${location.origin}${location.pathname}`, callback);
  assert.equal(location.searchParams.get('state'), expectedState);
  assert.equal(location.searchParams.get('iss'), issuer);
  assert(location.searchParams.get('code'), 'OAuth authorization code required');
  return location;
}
async function main() {
  const unauthenticated = await fetch(endpoint, { method: 'POST' });
  assert.equal(unauthenticated.status, 401);
  assert.match(unauthenticated.headers.get('www-authenticate'), /resource_metadata=/);
  const metadata = await fetch(`${settings.REDBOX_DEMO_URL}/.well-known/oauth-protected-resource/mcp`).then(response =>
    response.json()
  );
  assert.equal(metadata.resource, endpoint);
  assert.deepEqual(metadata.authorization_servers, [issuer]);
  const state = randomBytes(24).toString('hex');
  let tokens, verifier, authorization, discovery;
  const provider = {
    redirectUrl: callback,
    clientMetadata: {
      client_name: 'ReDBox reporting verification',
      redirect_uris: [callback],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    },
    clientInformation: () => ({ client_id: 'redbox-reporting-work', token_endpoint_auth_method: 'none' }),
    state: () => state,
    tokens: () => tokens,
    saveTokens: value => {
      tokens = value;
    },
    saveCodeVerifier: value => {
      verifier = value;
    },
    codeVerifier: () => verifier,
    redirectToAuthorization: value => {
      authorization = value;
    },
    saveDiscoveryState: value => {
      discovery = value;
    },
    discoveryState: () => discovery,
  };
  assert.equal(await auth(provider, { serverUrl: endpoint }), 'REDIRECT');
  assert.equal(authorization.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(authorization.searchParams.get('resource'), endpoint);
  const code = await authorize(authorization, state);
  assert.equal(
    await auth(provider, {
      serverUrl: endpoint,
      authorizationCode: code.searchParams.get('code'),
      iss: code.searchParams.get('iss'),
    }),
    'AUTHORIZED'
  );
  const claims = JSON.parse(Buffer.from(tokens.access_token.split('.')[1], 'base64url'));
  assert.equal(claims.iss, issuer);
  assert([claims.aud].flat().includes(endpoint));
  assert(claims.scope.split(' ').includes('redbox.reporting'));
  assert.equal(typeof claims.sub, 'string', 'OAuth access token must include its subject');
  if (process.env.REDBOX_DEMO_DIAGNOSTICS === 'true') {
    const { execFileSync } = require('node:child_process');
    const script = `const j=require('node:module').createRequire(require.resolve('@researchdatabox/redbox-mcp'))('jose'); const config=require('redbox-hook-reporting-demo').registerRedboxConfig().mcp; let input=''; process.stdin.on('data',v=>input+=v); process.stdin.on('end',async()=>{try{await j.jwtVerify(input,j.createRemoteJWKSet(new URL(config.jwksUrl)),{issuer:config.issuer,audience:config.resourceUrl,algorithms:config.algorithms}); console.log('JWT cryptographic verification passed');}catch(e){console.log('JWT verification failure:',e.code,e.message,e.cause?.code)}});`;
    console.log(
      execFileSync('docker', ['exec', '-i', 'redbox-reporting-demo-portal-1', 'node', '-e', script], {
        input: tokens.access_token,
      }).toString()
    );
  }
  console.log(
    'HTTPS discovery, unauthenticated rejection, OAuth authorization code + PKCE, audience and scope: passed'
  );
  const client = new Client({ name: 'redbox-reporting-live-verification', version: '1.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(endpoint), { authProvider: provider }));
  try {
    const tools = (await client.listTools()).tools.map(tool => tool.name);
    assert.deepEqual(
      tools.sort(),
      [
        'get_reporting_schema',
        'count_records',
        'group_records',
        'time_series',
        'search_records',
        'list_records',
        'get_record',
      ].sort()
    );
    async function call(name, arguments_) {
      const result = await client.callTool({ name, arguments: arguments_ });
      assert(!result.isError, `${name} failed: ${JSON.stringify(result.structuredContent || result.content)}`);
      return result.structuredContent;
    }
    const recordType = 'rdmp';
    const schema = await call('get_reporting_schema', { recordType });
    assert.equal(schema.fields.length, 6);
    assert(!JSON.stringify(schema).includes('metadata.'));
    assert.equal((await call('count_records', { recordType })).count, expected.visible);
    for (const [year, count] of Object.entries(expected.yearly)) {
      const filters = [
        { field: 'created', operator: 'between', start: `${year}-01-01`, end: `${Number(year) + 1}-01-01` },
      ];
      assert.equal((await call('count_records', { recordType, filters })).count, count);
    }
    const filters = [{ field: 'created', operator: 'between', start: '2026-01-01', end: '2027-01-01' }];
    const faculties = await call('group_records', { recordType, filters, groupBy: ['faculty'] });
    assert.deepEqual(
      Object.fromEntries(faculties.items.map(item => [item.dimensions.faculty, item.metrics.count])),
      expected.faculty2026
    );
    const series = await call('time_series', {
      recordType,
      dateHistogram: { field: 'created', interval: 'month', start: '2024-01-01', end: '2027-01-01' },
      pagination: { limit: 100 },
    });
    assert.equal(series.returned, 36);
    for (const bucket of series.items)
      assert.equal(bucket.metrics.count, expected.monthly[bucket.dimensions.bucket.slice(0, 4)]);
    const stages = await call('group_records', { recordType, groupBy: ['workflowStage'] });
    assert.deepEqual(
      Object.fromEntries(stages.items.map(item => [item.dimensions.workflowStage, item.metrics.count])),
      expected.stages
    );
    assert.equal(
      (await call('count_records', { recordType, filters: [{ field: 'sensitiveData', operator: 'eq', value: true }] }))
        .count,
      expected.sensitive
    );
    const rows = await call('list_records', { recordType, pagination: { limit: 5 } });
    assert.equal(rows.total, expected.visible);
    assert.equal(rows.returned, 5);
    assert.equal(rows.truncated, true);
    const record = await call('get_record', { recordType, oid: rows.items[0].oid });
    assert.equal(record.oid, rows.items[0].oid);
    assert.equal(Object.keys(record.fields).length, 6);
    assert(!JSON.stringify(record).includes('internalDemoNote'));
    const search = await call('search_records', { recordType, text: 'machine learning', pagination: { limit: 10 } });
    assert.equal(search.returned, 10);
    assert.equal(search.truncated, true);
    for (const item of search.items) {
      assert.match(item.fields.title, /Machine learning/);
      assert.match(item.oid, /^reporting-demo-202[456]-/);
    }
    const allMatches = [];
    for (const offset of [0, 50]) {
      const page = await call('search_records', {
        recordType,
        text: 'machine learning',
        pagination: { limit: 50, offset },
      });
      allMatches.push(...page.items.map(item => item.oid));
    }
    assert.equal(new Set(allMatches).size, expected.machineLearning);
    assert(allMatches.every(oid => /^reporting-demo-202[456]-/.test(oid)));
    assert(tokens.refresh_token, 'A refresh token is required for a persistent Work connection');
    assert.equal(await auth(provider, { serverUrl: endpoint }), 'AUTHORIZED');
    const refreshed = JSON.parse(Buffer.from(tokens.access_token.split('.')[1], 'base64url'));
    assert(
      [refreshed.aud].flat().includes(endpoint),
      `Refreshed audience must be the reporting resource (${JSON.stringify(refreshed.aud)})`
    );
    assert.equal(typeof refreshed.sub, 'string');
    assert.equal(refreshed.preferred_username, 'reporting-researcher');
    assert.equal((await call('count_records', { recordType })).count, expected.visible);
    for (const oid of ['reporting-demo-hidden-1', 'reporting-demo-otherBrand-1']) {
      const result = await client.callTool({ name: 'get_record', arguments: { recordType, oid } });
      assert(result.isError, 'Hidden and other-brand records must be rejected');
    }
    const invalid = await client.callTool({
      name: 'count_records',
      arguments: { recordType, filters: [{ field: 'metadata.faculty', operator: 'eq', value: 'Science' }] },
    });
    assert(invalid.isError);
    console.log(
      JSON.stringify(
        {
          verified: true,
          tools: tools.length,
          expected,
          searchReturned: search.returned,
          boundedRecordsReturned: rows.returned,
        },
        null,
        2
      )
    );
  } finally {
    await client.close();
  }
}
main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
