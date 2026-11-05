'use strict';
const assert = require('node:assert/strict');
const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs');
const { createHash } = require('node:crypto');
const { protocol: p, patch, metadata, hash } = require('./protocol.cjs');
const apiHeaders = {
  Authorization: 'Bearer fm007-synthetic-bearer',
  Accept: 'application/json',
  'X-ReDBox-Api-Version': '2.0',
};
function origin(cell) {
  return process.env.FM007_TLS === 'true'
    ? `https://127.0.0.1:${p.tlsPort}`
    : `http://127.0.0.1:${cell.profile === 'proxy' ? p.proxyPort : p.portalPort}`;
}
function agent() {
  const options = { keepAlive: true, maxSockets: 1, maxFreeSockets: 1, keepAliveMsecs: 1000 };
  return process.env.FM007_TLS === 'true'
    ? new https.Agent({ ...options, ca: fs.readFileSync(process.env.FM007_TLS_CERT) })
    : new http.Agent(options);
}
function prefix(cell) {
  return cell.profile === 'proxy' ? '/research' : '';
}
function base(cell) {
  return `${origin(cell)}${prefix(cell)}/default/rdmp`;
}
function request(url, options = {}) {
  const start = Number(process.hrtime.bigint()) / 1e6;
  return new Promise(resolve => {
    let response,
      firstByte,
      ended = false,
      bytes = 0,
      timer;
    const chunks = [],
      digest = createHash('sha256');
    const finish = error => {
      if (ended) return;
      ended = true;
      clearTimeout(timer);
      const end = Number(process.hrtime.bigint()) / 1e6;
      resolve({
        start,
        firstByte: firstByte ?? end,
        end,
        bytes,
        digest: digest.digest('hex'),
        status: response?.statusCode ?? null,
        headers: response?.headers ?? {},
        body: Buffer.concat(chunks),
        reusedSocket: req.reusedSocket,
        error,
      });
    };
    const req = (url.startsWith('https:') ? https : http).request(
      url,
      { ...options, headers: { 'Accept-Encoding': 'identity', ...options.headers } },
      res => {
        response = res;
        res.on('data', chunk => {
          firstByte ??= Number(process.hrtime.bigint()) / 1e6;
          bytes += chunk.length;
          digest.update(chunk);
          if (!options.stream) chunks.push(chunk);
        });
        res.on('end', () => finish(null));
        res.on('error', error => finish(error.code || error.message));
        res.on('aborted', () => finish('aborted'));
      }
    );
    timer = setTimeout(() => {
      req.destroy();
      finish('timeout');
    }, p.requestTimeoutMs);
    req.on('error', error => finish(error.code || error.message));
    req.end(options.body);
  });
}
function good(result, expected = 200) {
  assert.equal(result.error, null);
  assert.equal(result.status, expected, `${result.status}: ${result.body.toString().slice(0, 500)}`);
}
async function control(action, args = {}) {
  const response = await fetch(`http://127.0.0.1:${p.controlPort}`, {
    method: 'POST',
    body: JSON.stringify({ action, ...args }),
    signal: AbortSignal.timeout(120000),
  });
  const body = await response.json();
  assert(response.ok, JSON.stringify(body));
  return body;
}
async function login(cell, agent) {
  const csrf = await request(`${origin(cell)}${prefix(cell)}/csrfToken`, { agent });
  good(csrf);
  const initialCookie = csrf.headers['set-cookie'][0].split(';')[0];
  const response = await request(`${origin(cell)}${prefix(cell)}/user/login_local`, {
    method: 'POST',
    agent,
    headers: {
      Cookie: initialCookie,
      'Content-Type': 'application/json',
      'X-Source': 'jsclient',
      'X-CSRF-Token': JSON.parse(csrf.body)._csrf,
    },
    body: JSON.stringify({ username: 'admin', password: 'fm007-synthetic-local-password' }),
  });
  good(response);
  assert.equal(JSON.parse(response.body).message, 'Login OK');
  assert(response.headers['set-cookie']?.length);
  if (process.env.FM007_TLS === 'true')
    assert(
      response.headers['set-cookie'].some(value => /; Secure(?:;|$)/i.test(value)),
      'terminated TLS must persist a Secure session cookie'
    );
  return response.headers['set-cookie'][0].split(';')[0];
}
async function controls(cell, seed) {
  const connection = agent();
  try {
    const agent = connection;
    const cookie = await login(cell, agent);
    const item = seed.records[0],
      endpoint = `${base(cell)}/api/records/metadata/${item.oid}`;
    const read = await request(endpoint, { agent, headers: apiHeaders });
    good(read);
    const data = JSON.parse(read.body);
    assert.deepEqual(data.data, metadata(0));
    assert.equal(data.meta.revision, item.revision);
    assert(read.headers.etag);
    const denied = await request(endpoint, { agent });
    good(denied, 401);
    const permission = await request(`${base(cell)}/api/records/permissions/${item.oid}`, {
      agent,
      headers: apiHeaders,
    });
    good(permission);
    assert.deepEqual(JSON.parse(permission.body).data, seed.authorization);
    const page = await request(`${base(cell)}/record/view/${item.oid}`, { agent, headers: { Cookie: cookie } });
    validatePage(page, item);
    const streamResults = [];
    for (const file of seed.attachments) {
      const url = `${base(cell)}/record/${item.oid}/attach/${file.fileId}`;
      const stream = await request(url, { agent, stream: true, headers: { Cookie: cookie } });
      good(stream);
      assert.equal(stream.bytes, file.size);
      assert.equal(stream.digest, file.sha256);
      const noAuth = await request(url, { agent });
      assert([401, 403, 302].includes(noAuth.status));
      streamResults.push({ size: file.size, bytes: stream.bytes, digest: stream.digest, deniedStatus: noAuth.status });
    }
    // Missing and stale preconditions must never mutate a measured record.
    const missing = await request(endpoint + '?merge=true', {
      agent,
      method: 'PUT',
      headers: { ...apiHeaders, 'Content-Type': 'application/json' },
      body: patch(0),
    });
    good(missing, 428);
    return {
      readStatus: read.status,
      deniedStatus: denied.status,
      pageStatus: page.status,
      streamResults,
      missingPreconditionStatus: missing.status,
      acl: seed.authorization,
      permissionStatus: permission.status,
    };
  } finally {
    connection.destroy();
  }
}
function validatePage(result, item) {
  good(result);
  assert.match(result.headers['content-type'], /text\/html/);
  const text = result.body.toString();
  assert(text.includes(item.title), 'rendered title');
  assert(text.includes(`oid="${item.oid}"`), 'record form identity');
  assert(text.includes('<redbox-form') && /angular\/form\/browser\/main/.test(text), 'form bootstrap');
}
async function workload(cell, seed, durationMs, emit = () => {}, prepared = async () => {}) {
  const warm = seed.namespace === 'warm',
    items = warm ? seed.warm : seed.records;
  const agents = Array.from({ length: cell.concurrency }, () => agent());
  const cookies = [],
    etags = new Map(),
    revisions = new Map(),
    expected = new Map();
  let preparationGets = 0;
  try {
    if (['W3', 'W4'].includes(cell.workload)) for (const agent of agents) cookies.push(await login(cell, agent));
    if (cell.workload === 'W2') {
      for (let worker = 0; worker < agents.length; worker++) {
        const item = items[worker];
        const read = await request(`${base(cell)}/api/records/metadata/${item.oid}`, {
          agent: agents[worker],
          headers: apiHeaders,
        });
        good(read);
        const body = JSON.parse(read.body);
        assert.equal(body.meta.revision, item.revision);
        assert(read.headers.etag);
        etags.set(item.oid, read.headers.etag);
        revisions.set(item.oid, item.revision);
        preparationGets++;
      }
    }
    await prepared();
    const epoch = Number(process.hrtime.bigint()) / 1e6,
      rows = [];
    await Promise.all(
      agents.map(async (agent, worker) => {
        let count = 0;
        while (Number(process.hrtime.bigint()) / 1e6 - epoch < durationMs) {
          const index = cell.workload === 'W2' ? worker : (worker + count * agents.length) % items.length;
          const item = cell.workload === 'W4' ? items[0] : items[index];
          const headers =
            cell.workload === 'W1' || cell.workload === 'W2' ? { ...apiHeaders } : { Cookie: cookies[worker] };
          let url =
            cell.workload === 'W3'
              ? `${base(cell)}/record/view/${item.oid}`
              : `${base(cell)}/api/records/metadata/${item.oid}`;
          const options = { agent, headers };
          let body;
          if (cell.workload === 'W2') {
            body = patch(count);
            options.method = 'PUT';
            options.body = body;
            headers['If-Match'] = etags.get(item.oid);
            headers['Content-Type'] = 'application/json';
            url += '?merge=true';
          } else if (cell.workload === 'W4') {
            url = `${base(cell)}/record/${item.oid}/attach/fm007-${cell.size}.bin`;
            options.stream = true;
          }
          const result = await request(url, options);
          let error = result.error,
            returnedRevision;
          try {
            good(result);
            if (cell.workload === 'W1') {
              const response = JSON.parse(result.body);
              assert.deepEqual(response.data, metadata(index, warm));
              assert.equal(response.meta.oid, item.oid);
              assert.equal(response.meta.revision, item.revision);
              assert(result.headers.etag);
            } else if (cell.workload === 'W2') {
              const response = JSON.parse(result.body);
              assert.equal(response.meta.outcome, 'saved');
              returnedRevision = response.meta.concurrency.revision;
              assert.equal(returnedRevision, revisions.get(item.oid) + 1);
              assert(result.headers.etag);
              assert.notEqual(result.headers.etag, etags.get(item.oid));
              etags.set(item.oid, result.headers.etag);
              revisions.set(item.oid, returnedRevision);
              const value = JSON.parse(body);
              expected.set(item.oid, {
                oid: item.oid,
                revision: returnedRevision,
                title: value.title,
                metadataHash: hash(body),
              });
            } else if (cell.workload === 'W3') validatePage(result, item);
            else {
              assert.equal(result.bytes, cell.size);
              assert.equal(result.digest, seed.attachments.find(file => file.size === cell.size).sha256);
            }
          } catch (failure) {
            error ||= failure.message.slice(0, 500);
          }
          const row = {
            cell: cell.id,
            worker,
            sequence: count++,
            oid: item.oid,
            startMs: result.start - epoch,
            firstByteMs: result.firstByte - epoch,
            endMs: result.end - epoch,
            status: result.status,
            error,
            bytes: result.bytes,
            digest: result.digest,
            reusedSocket: result.reusedSocket,
            ...(returnedRevision ? { revision: returnedRevision } : {}),
          };
          rows.push(row);
          emit(row);
          if (error) break;
        }
      })
    );
    return {
      rows,
      expected: [...expected.values()],
      preparationGets,
      unexpectedRefreshGets: 0,
      epoch,
      finishedMonotonicMs: Number(process.hrtime.bigint()) / 1e6,
    };
  } finally {
    for (const agent of agents) agent.destroy();
  }
}
module.exports = { request, good, control, controls, workload };
