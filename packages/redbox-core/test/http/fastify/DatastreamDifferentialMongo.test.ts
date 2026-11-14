import { resumableUploadRoutes } from '../../../src/http/uploadRoutes';
import assert from 'node:assert/strict';
import type { RequestHandler } from 'express';
import { Agent, request, type IncomingMessage } from 'node:http';
import { Readable } from 'node:stream';
import { finished } from 'node:stream/promises';
import { setTimeout as pause } from 'node:timers/promises';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import sinon from 'sinon';
import { nothingLogger } from '@researchdatabox/sails-ng-common';
import { datastreamReadRoutes } from '../../../src/http/datastreamRoutes';
import { persistenceStatus } from '../../../src/persistence/runtime';
import { getStorageRepositories } from '../../../src/persistence/storage/runtime';
import { referenceOrigin, referenceProductionFixture } from './referenceProductionFixture';
import { retainedDatastreamExpress } from './retainedDatastreamExpress';

type Fixture = Awaited<ReturnType<typeof referenceProductionFixture>>;
type Wire = { status?: number; headers?: Record<string, unknown>; body: string; aborted?: boolean; error?: string };
const bytes = Buffer.from('FM033 \u0000研究 🌏 download\n');
const auth = { Authorization: 'Bearer pilot-api-token' };
const routes = datastreamReadRoutes.map(route => ({
  ...route,
  target:
    '/default/rdmp' +
    route.path
      .replace('/:branding/:portal', '')
      .replace(':oid', 'reference-record')
      .replace(':datastreamId', 'file-1.txt')
      .replace(':attachId', 'file-1.txt')
      .replace('datastream*', 'datastream'),
  listing: ['listDatastreams', 'getAttachments'].includes(route.action),
}));
const downloads = routes.filter(route => !route.listing);
const implicit = downloads.filter(route => !('headBehavior' in route));
const query = (route: (typeof routes)[number], extra = '') =>
  (route.controller === 'RecordController' && route.action === 'getDataStream' ? '?datastreamId=file-1.txt' : '?') +
  (extra ? '&' + extra : '');

/** Raw HTTP over real sockets, including absolute-form targets. */
async function wire(
  f: Fixture,
  target: string,
  method = 'GET',
  headers: Record<string, string> = auth,
  options: { absolute?: boolean; agent?: Agent; abortOnData?: boolean; body?: string } = {}
): Promise<Wire> {
  const url = new URL(f.url);
  return new Promise(resolve => {
    const chunks: Buffer[] = [];
    let settled = false;
    const complete = (value: Wire) => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };
    const client = request(
      {
        hostname: url.hostname,
        port: url.port,
        method,
        path: (options.absolute ? 'http://foreign-target.invalid' : '') + url.pathname.replace(/\/$/, '') + target,
        headers: { ...headers, ...(options.body ? { 'Content-Length': String(Buffer.byteLength(options.body)) } : {}) },
        agent: options.agent,
      },
      response => {
        const selected: Record<string, unknown> = { ...response.headers };
        for (const key of ['date', 'connection', 'keep-alive', 'x-request-id']) delete selected[key];
        const result = (aborted = false): Wire => ({
          status: response.statusCode!,
          headers: selected,
          body: Buffer.concat(chunks).toString('base64'),
          ...(aborted ? { aborted: true } : {}),
        });
        response.on('data', chunk => {
          chunks.push(chunk);
          if (options.abortOnData) {
            client.destroy();
            response.destroy();
          }
        });
        response.on('end', () => complete(result()));
        response.on('aborted', () => complete(result(true)));
        response.on('error', () => complete(result(true)));
      }
    );
    client.setTimeout(10000, () => client.destroy(new Error('HTTP timeout')));
    client.on('error', error => complete({ error: (error as NodeJS.ErrnoException).code ?? error.message, body: '' }));
    client.end(options.body);
  });
}

async function session(f: Fixture) {
  const token = await wire(f, '/csrfToken', 'GET', {});
  const cookie = String((token.headers!['set-cookie'] as string[])[0]).split(';')[0];
  const login = await wire(
    f,
    '/user/login_local',
    'POST',
    {
      Cookie: cookie,
      Origin: referenceOrigin,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    {
      body: new URLSearchParams({
        username: 'pilot-admin',
        password: 'pilot-password',
        _csrf: JSON.parse(Buffer.from(token.body, 'base64').toString())._csrf,
      }).toString(),
    }
  );
  assert.equal(login.status, 302);
  return String((login.headers!['set-cookie'] as string[])[0]).split(';')[0];
}

async function seed(f: Fixture) {
  const disk = f.data.disks.get().primaryDisk();
  const prefix = (f.portal.config.storage.keyPrefix ?? '').replace(/\/+$/, '');
  const key = (prefix ? prefix + '/' : '') + 'reference-record/file-1.txt';
  await disk.put(key, bytes, { contentType: 'text/plain' });
  await getStorageRepositories(f.owner).attachments.upsert({
    oid: 'reference-record',
    fileId: 'file-1.txt',
    storageKey: key,
    filename: '研究 🌏.txt',
    contentType: 'text/plain',
    mimeType: 'text/plain',
    contentLength: bytes.length,
    lastModified: '2026-01-01T00:00:00.000Z',
  });
}

const variants: {
  name: string;
  headers?: Record<string, string>;
  query?: string;
  record?: string;
  missing?: boolean;
  absolute?: boolean;
  upstreamStatus?: 202 | 204;
  buffered?: boolean;
}[] = [
  { name: 'authorized' },
  ...([202, 204] as const).flatMap(upstreamStatus =>
    [false, true].map(buffered => ({
      name: `upstream-${upstreamStatus}-${buffered ? 'buffered' : 'stream'}`,
      upstreamStatus,
      buffered,
      headers: { ...auth, 'X-FM033-Upstream-Status': String(upstreamStatus) },
    }))
  ),
  { name: 'anonymous', headers: {} },
  { name: 'denied', headers: { Authorization: 'Bearer reader-token' } },
  { name: 'cross-brand-actor', headers: { Authorization: 'Bearer foreign-token' } },
  { name: 'invalid-bearer', headers: { Authorization: 'Bearer invalid-token' } },
  { name: 'cross-brand-record', record: 'foreign-record' },
  { name: 'missing-record', record: 'absent-record' },
  { name: 'missing-datastream', missing: true, headers: { ...auth, 'X-Source': 'jsclient' } },
  { name: 'absolute-form', absolute: true },
  { name: 'non-ASCII-name', query: 'fileName=' + encodeURIComponent('报告 🌏.csv') },
  { name: 'basename-name', query: 'fileName=' + encodeURIComponent('/folder/报告 🌏.csv') },
  { name: 'empty-name', query: 'fileName=' },
  { name: 'empty-basename', query: 'fileName=%2F' },
  { name: 'structured-name', query: 'fileName[x]=invalid' },
  { name: 'single-range', headers: { ...auth, Range: 'bytes=2-8' } },
  { name: 'suffix-range', headers: { ...auth, Range: 'bytes=-5' } },
  { name: 'multi-range', headers: { ...auth, Range: 'bytes=0-2,8-10' } },
  { name: 'unsatisfiable-range', headers: { ...auth, Range: 'bytes=999999-' } },
  { name: 'if-range-etag', headers: { ...auth, Range: 'bytes=0-2', 'If-Range': '"different"' } },
  { name: 'if-range-date', headers: { ...auth, Range: 'bytes=0-2', 'If-Range': 'Thu, 01 Jan 2026 00:00:00 GMT' } },
  { name: 'if-none-match', headers: { ...auth, 'If-None-Match': '"unmatched"' } },
  { name: 'if-none-match-star', headers: { ...auth, 'If-None-Match': '*' } },
  { name: 'if-modified-since', headers: { ...auth, 'If-Modified-Since': 'Thu, 01 Jan 2037 00:00:00 GMT' } },
  { name: 'conditional-no-cache', headers: { ...auth, 'If-None-Match': '*', 'Cache-Control': 'no-cache' } },
];
const cases = routes.flatMap(route =>
  ['GET', 'HEAD'].flatMap(method =>
    ['1.0', '2.0'].flatMap(version =>
      variants
        .filter(variant => !route.listing || !variant.upstreamStatus)
        .map(variant => ({
          route,
          method,
          version,
          variant,
          name: `${route.path} ${method} v${version} ${variant.name}`,
        }))
    )
  )
);

describe('FM-033 retained production datastream differential', function () {
  this.timeout(1200000);
  for (const profile of [
    { name: 'portal', root: '/portal' },
    { name: 'root', root: '' },
    { name: 'reduced', root: '/portal', policy: { '*': ['noCache', 'brandingAndPortal'] } },
  ]) {
    describe(profile.name, () => {
      const results: Wire[][] = [];
      before(async () => {
        const retained = await retainedDatastreamExpress();
        // Freeze only Date, preserving real sockets, deadlines and backpressure.
        const time = sinon.useFakeTimers({ now: Date.parse('2026-11-14T00:00:00Z'), toFake: ['Date'] });
        try {
          for (const mode of ['retained', 'express', 'fastify']) {
            const f = await referenceProductionFixture(
              mode === 'fastify',
              profile.policy,
              mode === 'retained' ? retained.install : undefined,
              {
                declarations: [...datastreamReadRoutes, ...resumableUploadRoutes],
                rootContext: profile.root,
                pages: {},
                bindings: {
                  handler: registration => () => (registration.declaration.create as () => RequestHandler)(),
                },
                artifacts: async (_directory, provider) => {
                  const entry = provider + '/index.cjs';
                  const run = `const status=request.headers['x-fm033-upstream-status'];if(status==='202'||status==='204'){response.${mode === 'fastify' ? 'code' : 'status'}(status==='202'?202:204);response.${mode === 'fastify' ? 'header' : 'set'}('X-FM033-Upstream-Status',status);}`;
                  const extension =
                    mode === 'fastify'
                      ? `hooks:[{name:'download-upstream-status',stage:'afterAuthentication',scope:{kind:'application'},run:async(request,response)=>{${run}}}],`
                      : `handlers:[{name:'download-upstream-status',create:()=>((request,response,next)=>{${run}next();})}],middleware:[{name:'download-upstream-status',stage:'beforeRoutes',handler:'download-upstream-status'}],`;
                  await writeFile(
                    entry,
                    (await readFile(entry, 'utf8')).replace('apiVersion:', extension + 'apiVersion:')
                  );
                },
              }
            );
            try {
              await seed(f);
              const rows: Wire[] = [];
              for (const c of cases) {
                const target = (
                  c.route.target.replace('reference-record', c.variant.record ?? 'reference-record') +
                  query(c.route, c.variant.query)
                ).replaceAll('file-1.txt', c.variant.missing ? 'missing.txt' : 'file-1.txt');
                const buffered = c.variant.buffered
                  ? sinon.stub(f.data.datastream.get(), 'getDatastream').resolves({ body: bytes })
                  : undefined;
                try {
                  const response = await wire(
                    f,
                    target,
                    c.method,
                    {
                      ...(c.variant.headers ?? auth),
                      'X-ReDBox-API-Version': c.version,
                    },
                    { absolute: c.variant.absolute }
                  );
                  // Dynamic cookies/nonces are absent on successful downloads;
                  // browser TUS HEAD is a separately owned FM-034 response.
                  rows.push(response);
                  if (buffered)
                    assert.equal(
                      buffered.callCount,
                      profile.name === 'reduced' || (c.method === 'HEAD' && 'headBehavior' in c.route) ? 0 : 1
                    );
                } finally {
                  buffered?.restore();
                }
              }
              results.push(rows);
            } finally {
              await f.close();
            }
          }
        } finally {
          time.restore();
          await retained.close();
        }
        if (process.env.FM033_RESULTS)
          await writeFile(
            process.env.FM033_RESULTS + '/downloads-' + profile.name + '.json',
            JSON.stringify({ cases, results }, null, 2)
          );
      });
      for (const [index, c] of cases.entries())
        it(c.name, () => {
          const [retained, express, native] = results.map(rows => rows[index]);
          assert.deepEqual(express, retained, 'Shared extraction preserves preceding Express');
          if (c.method === 'HEAD' && 'headBehavior' in c.route) {
            // This is TUS HEAD, after the download policies, never a download
            // shortcut. FM-034 now binds the retained protocol implementation.
            assert.equal(native.body, '');
            const expected = structuredClone(retained);
            // The existing native public-error boundary retains documented
            // headers only, including deliberate TUS invalid-ID refusals.
            if (c.variant.upstreamStatus && expected.status! >= 400)
              delete expected.headers!['x-fm033-upstream-status'];
            assert.deepEqual(native, expected, 'TUS HEAD preserves the retained response after download guards');
            return;
          }
          const expected = structuredClone(retained);
          if (c.method === 'HEAD' && !c.route.listing && [200, 202, 204].includes(expected.status!)) {
            if (c.variant.buffered) expected.headers!['content-length'] = String(bytes.length);
            else expected.headers!['transfer-encoding'] = 'chunked';
          }
          // Preserve the existing framework's no-body behavior as well as the
          // qualified HEAD framing above. Fastify strips Content-Type for 204
          // payloads; a buffered HEAD reaches its undefined-payload path instead.
          if (expected.status === 204 && (c.method !== 'HEAD' || !c.variant.buffered))
            delete expected.headers!['content-type'];
          // Native safe errors discard extension diagnostic headers after the
          // reduced-policy actor guard; the status and denial body still match.
          if (c.variant.upstreamStatus && expected.status === 401) delete expected.headers!['x-fm033-upstream-status'];
          assert.deepEqual(native, expected, 'Fastify retains the complete response');
          if (c.method === 'HEAD') assert.equal(native.body, '');
          if (c.variant.upstreamStatus && profile.name !== 'reduced') {
            assert.equal(native.status, c.variant.upstreamStatus, 'Preserve the upstream download status');
            assert.equal(native.headers!['x-fm033-upstream-status'], String(c.variant.upstreamStatus));
            for (const response of [retained, express, native])
              assert.equal(
                response.body,
                c.method === 'HEAD' || c.variant.upstreamStatus === 204 ? '' : bytes.toString('base64'),
                '204 and HEAD never send file bytes'
              );
          }
          if (native.status === 200 && !c.route.listing) {
            assert.equal(native.headers!['etag'], undefined);
            assert.equal(native.headers!['last-modified'], undefined);
            assert.equal(native.headers!['accept-ranges'], undefined);
            assert.equal(native.headers!['content-range'], undefined);
            assert.equal(native.headers!['cache-control'], 'no-store, no-cache, must-revalidate, proxy-revalidate');
            assert.match(String(native.headers!['content-disposition']), /^attachment(?:;|$)/);
            assert.equal(native.body, c.method === 'HEAD' ? '' : bytes.toString('base64'));
          }
          if ([200, 202].includes(native.status!) && c.method === 'HEAD') {
            const getIndex = cases.findIndex(
              other =>
                other.route === c.route &&
                other.method === 'GET' &&
                other.version === c.version &&
                other.variant === c.variant
            );
            assert.deepEqual(native.headers, results[2][getIndex].headers, 'HEAD = GET headers minus body');
          }
        });
    });
  }
});

describe('FM-033 production session authorization and unopened storage', function () {
  this.timeout(120000);
  for (const reduced of [false, true])
    for (const subject of [
      'session',
      'deleted-actor',
      'anonymous',
      'denied',
      'missing-record',
      'missing-file',
      'branded-missing',
    ])
      it(`${reduced ? 'reduced' : 'default'} policies ${subject}`, async () => {
        const retained = await retainedDatastreamExpress();
        const results: Wire[][] = [];
        const time = sinon.useFakeTimers({ now: Date.parse('2026-11-14T00:00:00Z'), toFake: ['Date'] });
        try {
          for (const mode of ['retained', 'express', 'fastify']) {
            const f = await referenceProductionFixture(
              mode === 'fastify',
              reduced ? { '*': ['noCache', 'brandingAndPortal'] } : undefined,
              mode === 'retained' ? retained.install : undefined,
              { declarations: [...datastreamReadRoutes, ...resumableUploadRoutes], pages: {} }
            );
            try {
              await seed(f);
              const cookie = await session(f);
              if (subject === 'deleted-actor')
                assert.equal(
                  (await f.client.db().collection('user').deleteOne({ username: 'pilot-admin' })).deletedCount,
                  1
                );
              const spy = sinon.spy(f.data.datastream.get(), 'getDatastream');
              const rows: Wire[] = [];
              for (const route of downloads) {
                const path = (route.target + query(route))
                  .replaceAll('reference-record', subject === 'missing-record' ? 'absent-record' : 'reference-record')
                  .replaceAll(
                    'file-1.txt',
                    ['missing-file', 'branded-missing'].includes(subject) ? 'absent.txt' : 'file-1.txt'
                  );
                const response = await wire(f, path, 'GET', {
                  ...(subject === 'anonymous'
                    ? {}
                    : subject === 'denied'
                      ? { Authorization: 'Bearer reader-token' }
                      : { Cookie: cookie }),
                  ...(subject === 'branded-missing' ? { Accept: 'application/json' } : { 'X-Source': 'jsclient' }),
                });
                // Session identifiers are independently generated by each host.
                delete response.headers?.['set-cookie'];
                for (const key of ['content-security-policy', 'content-security-policy-report-only'])
                  if (typeof response.headers?.[key] === 'string')
                    response.headers[key] = response.headers[key].replace(/nonce-[^' ]+/g, 'nonce-<nonce>');
                rows.push(response);
              }
              assert.equal(
                spy.callCount,
                subject === 'session' && !reduced ? downloads.length : 0,
                'Guards and membership precede storage acquisition'
              );
              if (subject === 'session')
                for (const row of rows) {
                  assert.equal(row.status, reduced ? 401 : 200);
                  if (!reduced) assert.equal(row.body, bytes.toString('base64'));
                }
              results.push(rows);
            } finally {
              await f.close();
            }
          }
          assert.deepEqual(results[1], results[0]);
          assert.deepEqual(results[2], results[0]);
        } finally {
          time.restore();
          await retained.close();
        }
      });
});

describe('FM-033 production storage faults and stream ownership', function () {
  this.timeout(120000);
  const faultFixtures: Fixture[] = [],
    faultMessages: string[][] = [];
  let retainedFaults: Awaited<ReturnType<typeof retainedDatastreamExpress>>;
  before(async () => {
    retainedFaults = await retainedDatastreamExpress();
    for (const mode of ['retained', 'express', 'fastify']) {
      const messages: string[] = [];
      const f = await referenceProductionFixture(
        mode === 'fastify',
        undefined,
        mode === 'retained' ? retainedFaults.install : undefined,
        {
          declarations: [...datastreamReadRoutes, ...resumableUploadRoutes],
          pages: {},
          log: { ...nothingLogger, warn: message => messages.push(String(message)) },
        }
      );
      faultFixtures.push(f);
      faultMessages.push(messages);
      await seed(f);
    }
  });
  after(async () => {
    for (const f of faultFixtures) await f.close();
    await retainedFaults?.close();
  });
  for (const route of downloads)
    for (const method of 'headBehavior' in route ? ['GET'] : ['GET', 'HEAD'])
      for (const fault of [
        'before-byte',
        'mid-stream',
        'empty',
        'normal',
        'acquisition',
        'not-found',
        'buffer',
        'length',
      ])
        for (const version of ['1.0', '2.0'])
          it(`${route.path} ${method} ${fault} v${version}`, async () => {
            const responses: Wire[] = [];
            const failures: string[][] = [];
            const unhandled: unknown[] = [];
            const observeUnhandled = (error: unknown) => unhandled.push(error);
            process.on('unhandledRejection', observeUnhandled);
            process.on('uncaughtExceptionMonitor', observeUnhandled);
            try {
              for (const [hostIndex, f] of faultFixtures.entries()) {
                const messages = faultMessages[hostIndex];
                messages.length = 0;
                let count = 0,
                  disposed = 0,
                  produced = 0;
                const source = new Readable({
                  read() {
                    if (fault === 'before-byte') {
                      if (++count === 1) void pause(25).then(() => this.destroy(new Error('secret-before-byte')));
                    } else if (fault === 'mid-stream') {
                      if (++count === 1) {
                        this.push('first');
                        void pause(25).then(() => this.destroy(new Error('secret-mid-stream')));
                      }
                    } else {
                      produced++;
                      this.push(fault === 'empty' ? null : bytes);
                      if (fault !== 'empty') this.push(null);
                    }
                  },
                  destroy(error, done) {
                    disposed++;
                    done(error);
                  },
                });
                const streamDone = finished(source).catch(() => {});
                const stub = sinon.stub(f.data.datastream.get(), 'getDatastream').callsFake(async () => {
                  if (fault === 'acquisition') throw new Error('secret-acquisition');
                  if (fault === 'not-found') throw Object.assign(new Error('secret-not-found'), { code: 'ENOENT' });
                  return fault === 'buffer' ? { body: bytes } : { readstream: source };
                });
                const membership =
                  fault === 'length'
                    ? sinon
                        .stub(f.data.records.get(), 'getAttachments')
                        .resolves([{ fileId: 'file-1.txt', name: '研究 🌏.txt', size: bytes.length }])
                    : undefined;
                const agent = new Agent({ keepAlive: true });
                try {
                  const response = await wire(
                    f,
                    route.target + query(route),
                    method,
                    {
                      ...auth,
                      'X-ReDBox-API-Version': version,
                      ...(fault === 'not-found' ? { 'X-Source': 'jsclient' } : {}),
                    },
                    { agent }
                  );
                  responses.push(response);
                  if (!['acquisition', 'not-found', 'buffer'].includes(fault)) {
                    await streamDone;
                    assert(source.destroyed && source.closed);
                    assert.equal(disposed, 1, 'One source disposal owner');
                  }
                  assert.equal(stub.callCount, 1);
                  assert.equal(produced, ['empty', 'normal', 'length'].includes(fault) ? 1 : 0);
                } finally {
                  agent.destroy();
                  source.destroy();
                  await streamDone;
                  membership?.restore();
                  stub.restore();
                }
                failures.push(messages.filter(message => /HTTP_(STREAM|REQUEST|POST_SEND)/.test(message)));
              }
              assert.deepEqual(responses[1], responses[0]);
              const native = responses[2];
              if (fault === 'before-byte') {
                assert.equal(responses[0].error, 'ECONNRESET');
                assert.equal(native.status, 500);
                assert.equal(native.aborted, undefined);
                assert.equal(native.headers!['content-disposition'], undefined);
                const expected =
                  version === '2.0'
                    ? '{"errors":[{"detail":"Internal server error"}],"meta":{}}'
                    : '{"message":"Internal server error","details":""}';
                assert.equal(native.body, method === 'HEAD' ? '' : Buffer.from(expected).toString('base64'));
                assert.equal(native.headers!['content-length'], String(Buffer.byteLength(expected)));
                assert.equal(failures[2].length, 1);
              } else if (fault === 'mid-stream') {
                assert.equal(
                  method === 'HEAD' ? native.error : native.aborted,
                  method === 'HEAD' ? 'ECONNRESET' : true
                );
                assert.equal(failures[2].length, 1, 'One diagnostic per storage fault');
              } else {
                const expected = structuredClone(responses[0]);
                if (method === 'HEAD' && fault === 'normal') expected.headers!['transfer-encoding'] = 'chunked';
                if (method === 'HEAD' && fault === 'buffer') expected.headers!['content-length'] = String(bytes.length);
                if (method === 'HEAD' && fault === 'empty') expected.headers!['content-length'] = '0';
                assert.deepEqual(native, expected);
              }
              assert(!JSON.stringify(native).includes('secret-'));
              assert(!JSON.stringify(failures[2]).includes('secret-'));
              await pause(0);
              assert.deepEqual(unhandled, []);
            } finally {
              process.off('unhandledRejection', observeUnhandled);
              process.off('uncaughtExceptionMonitor', observeUnhandled);
            }
          });

  for (const route of downloads)
    for (const afterEof of [false, true])
      it(route.path + ' retains pending disposal through ' + (afterEof ? 'EOF' : 'client abort'), async () => {
        const messages: string[] = [];
        let observationsFile = '';
        const f = await referenceProductionFixture(true, undefined, undefined, {
          declarations: [...datastreamReadRoutes, ...resumableUploadRoutes],
          pages: {},
          log: { ...nothingLogger, warn: message => messages.push(String(message)) },
          artifacts: async (_directory, provider) => {
            observationsFile = provider + '/observations.cjs';
            await writeFile(
              observationsFile,
              `exports.responses=[];exports.errors=[];exports.hooks=[
                {name:'download-completion-metric',stage:'onResponse',scope:{kind:'application'},observe:async(request)=>{exports.responses.push(request)}},
                {name:'download-error-metric',stage:'onError',scope:{kind:'application'},observe:async(request)=>{exports.errors.push(request)}}];`
            );
            const entry = provider + '/index.cjs';
            await writeFile(
              entry,
              (await readFile(entry, 'utf8')).replace(
                'apiVersion:',
                "hooks:require('./observations.cjs').hooks,apiVersion:"
              )
            );
          },
        });
        const observations = require(observationsFile) as { responses: unknown[]; errors: unknown[] };
        await seed(f);
        const release = Promise.withResolvers<void>(),
          finalizing = Promise.withResolvers<void>();
        let produced = 0,
          disposeCount = 0;
        const source = new Readable({
          highWaterMark: 65536,
          read() {
            if (afterEof) {
              this.push(bytes);
              this.push(null);
              return;
            }
            produced++;
            this.push(Buffer.alloc(65536, 97));
          },
          destroy(error, done) {
            disposeCount++;
            finalizing.resolve();
            void release.promise.then(() => done(afterEof ? new Error('secret-finalizer') : error));
          },
        });
        const done = finished(source).catch(() => {});
        const stub = sinon.stub(f.data.datastream.get(), 'getDatastream').resolves({ readstream: source });
        let client: ReturnType<typeof request> | undefined, response: IncomingMessage | undefined;
        const unhandled: unknown[] = [],
          record = (error: unknown) => unhandled.push(error);
        process.on('unhandledRejection', record);
        try {
          if (afterEof) {
            const received = await wire(f, route.target + query(route));
            assert.equal(received.status, 200);
            assert.equal(received.body, bytes.toString('base64'));
          } else {
            const receiving = Promise.withResolvers<void>();
            client = request(f.url + route.target + query(route), { headers: auth }, res => {
              response = res;
              res.pause();
              assert.equal(res.statusCode, 200);
              receiving.resolve();
            });
            client.on('error', () => {});
            client.end();
            await receiving.promise;
            await pause(100);
            assert(produced > 0 && produced < 256, 'A paused reader bounds production below 16 MiB');
            assert(source.readableLength <= 131072, 'Bounded producer buffering');
            client.destroy();
            response?.destroy();
          }
          await finalizing.promise;
          let stopped = false;
          const stopping = f.host.stop().then(() => {
            stopped = true;
          });
          await pause(50);
          assert.equal(stopped, false);
          assert(persistenceStatus(f.owner).pools > 0);
          release.resolve();
          await stopping;
          await done;
          assert.equal(disposeCount, 1);
          assert.equal(
            observations.responses.length,
            afterEof ? 1 : 0,
            'No duplicate response completion metric after disposal/disconnect'
          );
          assert.equal(observations.errors.length, 0, 'Post-EOF disposal does not create a second HTTP failure');
          assert(source.destroyed && source.closed);
          assert.equal(persistenceStatus(f.owner).pools, 0);
          assert.equal(
            messages.filter(message => message.includes('HTTP_STREAM_DISPOSAL_FAILED')).length,
            afterEof ? 1 : 0
          );
          assert.equal(
            messages.filter(message => /HTTP_REQUEST_FAILED|HTTP_POST_SEND_FAILURE/.test(message)).length,
            0
          );
          await pause(0);
          assert.deepEqual(unhandled, []);
          if (process.env.FM033_RESULTS)
            await writeFile(
              process.env.FM033_RESULTS +
                '/ownership-' +
                createHash('sha256')
                  .update(route.path + afterEof)
                  .digest('hex')
                  .slice(0, 12) +
                '.json',
              JSON.stringify(
                { path: route.path, afterEof, produced, disposeCount, status: f.host.status(), messages, observations },
                null,
                2
              )
            );
        } finally {
          release.resolve();
          client?.destroy();
          response?.destroy();
          source.destroy();
          await done;
          stub.restore();
          await f.close();
          process.off('unhandledRejection', record);
        }
      });

  for (const route of implicit)
    it(route.path + ' graceful stop drains an active slow download without cancelling it', async () => {
      const f = await referenceProductionFixture(true, undefined, undefined, { declarations: datastreamReadRoutes });
      await seed(f);
      const release = Promise.withResolvers<void>(),
        started = Promise.withResolvers<void>();
      const source = Readable.from(
        (async function* () {
          yield bytes;
          started.resolve();
          await release.promise;
          yield bytes;
        })(),
        { objectMode: false, highWaterMark: 65536 }
      );
      const stub = sinon.stub(f.data.datastream.get(), 'getDatastream').resolves({ readstream: source });
      try {
        const receiving = wire(f, route.target + query(route));
        await started.promise;
        let stopped = false;
        const stopping = f.host.stop().then(() => {
          stopped = true;
        });
        await pause(50);
        assert.equal(stopped, false);
        assert(!source.destroyed);
        assert(persistenceStatus(f.owner).pools > 0);
        assert.equal(f.host.status().ready, false);
        release.resolve();
        const response = await receiving;
        await stopping;
        assert.equal(response.status, 200);
        assert.equal(response.body, Buffer.concat([bytes, bytes]).toString('base64'));
        assert(source.destroyed && source.closed);
        assert.equal(persistenceStatus(f.owner).pools, 0);
      } finally {
        release.resolve();
        source.destroy();
        stub.restore();
        await f.close();
      }
    });

  for (const route of downloads)
    for (const phase of ['acquisition', 'before-byte'])
      it(`${route.path} disconnect during ${phase} retains acquisition and disposal`, async () => {
        const messages: string[] = [];
        const f = await referenceProductionFixture(true, undefined, undefined, {
          declarations: [...datastreamReadRoutes, ...resumableUploadRoutes],
          log: { ...nothingLogger, warn: message => messages.push(String(message)) },
        });
        await seed(f);
        const acquired = Promise.withResolvers<void>(),
          acquiring = Promise.withResolvers<void>();
        const reading = Promise.withResolvers<void>(),
          disposing = Promise.withResolvers<void>(),
          release = Promise.withResolvers<void>();
        let disposalCount = 0;
        const source = new Readable({
          read() {
            reading.resolve();
          },
          destroy(error, done) {
            disposalCount++;
            disposing.resolve();
            void release.promise.then(() => done(error));
          },
        });
        const done = finished(source).catch(() => {});
        const stub = sinon.stub(f.data.datastream.get(), 'getDatastream').callsFake(async () => {
          acquiring.resolve();
          if (phase === 'acquisition') await acquired.promise;
          return { readstream: source };
        });
        const client = request(f.url + route.target + query(route), { headers: auth });
        const disconnected = new Promise<void>(resolve => client.once('close', resolve));
        client.on('error', () => {});
        const unhandled: unknown[] = [],
          observe = (error: unknown) => unhandled.push(error);
        process.on('unhandledRejection', observe);
        try {
          client.end();
          await acquiring.promise;
          if (phase === 'before-byte') await reading.promise;
          client.destroy();
          await disconnected;
          let stopped = false;
          const stopping = f.host.stop().then(() => {
            stopped = true;
          });
          await pause(50);
          assert.equal(stopped, false);
          assert(persistenceStatus(f.owner).pools > 0);
          acquired.resolve();
          await disposing.promise;
          await pause(25);
          assert.equal(stopped, false);
          release.resolve();
          await done;
          await stopping;
          assert(source.destroyed && source.closed);
          assert.equal(disposalCount, 1);
          assert.equal(persistenceStatus(f.owner).pools, 0);
          assert.equal(
            messages.filter(message =>
              /HTTP_(REQUEST_FAILED|STREAM_FAILED|STREAM_DISPOSAL_FAILED|POST_SEND_FAILURE)/.test(message)
            ).length,
            0
          );
          await pause(0);
          assert.deepEqual(unhandled, []);
        } finally {
          acquired.resolve();
          release.resolve();
          client.destroy();
          source.destroy();
          await done;
          stub.restore();
          await f.close();
          process.off('unhandledRejection', observe);
        }
      });

  for (const route of downloads)
    for (const replacement of ['filename', 'foreign-record'])
      it(`${route.path} reads live beforeAction ${replacement} replacement`, async () => {
        const f = await referenceProductionFixture(true, undefined, undefined, {
          declarations: [...datastreamReadRoutes, ...resumableUploadRoutes],
          artifacts: async (_directory, provider) => {
            const entry = provider + '/index.cjs';
            const run =
              replacement === 'filename'
                ? `request.query={...request.query,fileName:'报告 after.csv'}`
                : `request.params={...request.params,oid:'foreign-record'}`;
            await writeFile(
              entry,
              (await readFile(entry, 'utf8')).replace(
                'apiVersion:',
                `hooks:[{name:'download-live-input',stage:'beforeAction',scope:{kind:'application'},run:async(request)=>{${run}}}],apiVersion:`
              )
            );
          },
        });
        await seed(f);
        const spy = sinon.spy(f.data.datastream.get(), 'getDatastream');
        try {
          const received = await wire(f, route.target + query(route));
          assert.equal(received.status, replacement === 'filename' ? 200 : 404);
          assert.equal(spy.callCount, replacement === 'filename' ? 1 : 0);
          if (replacement === 'filename') {
            assert.match(
              String(received.headers!['content-disposition']),
              /filename\*=UTF-8''%E6%8A%A5%E5%91%8A%20after.csv/
            );
            assert.equal(received.headers!['content-type'], 'text/csv; charset=utf-8');
            assert.equal(received.body, bytes.toString('base64'));
          }
        } finally {
          spy.restore();
          await f.close();
        }
      });

  for (const driver of ['gridfs', 'fs'])
    it(driver + ' closes the real storage producer and its cursor/file after a slow-reader disconnect', async () => {
      const storage = { primaryDisk: 'primary', disks: { primary: { driver, config: {} as Record<string, unknown> } } };
      const f = await referenceProductionFixture(true, undefined, undefined, {
        declarations: [...datastreamReadRoutes, ...resumableUploadRoutes],
        ...(driver === 'fs'
          ? {
              configuration: { storage },
              artifacts: async directory => {
                storage.disks.primary.config.root = directory + '/real-files';
              },
            }
          : {}),
      });
      const disk = f.data.disks.get().primaryDisk();
      let client: ReturnType<typeof request> | undefined, response: IncomingMessage | undefined;
      let spy: sinon.SinonSpy | undefined;
      try {
        const prefix = (f.portal.config.storage.keyPrefix ?? '').replace(/\/+$/, '');
        const key = prefix + '/reference-record/file-1.txt';
        await disk.putStream(
          key,
          Readable.from(
            (async function* () {
              for (let index = 0; index < (driver === 'gridfs' ? 2048 : 512); index++) yield Buffer.alloc(65536, 97);
            })(),
            { objectMode: false, highWaterMark: 65536 }
          )
        );
        spy = sinon.spy(disk, 'getStream');
        const baseline = process.memoryUsage().external;
        const receiving = Promise.withResolvers<void>();
        client = request(f.url + routes[1].target, { headers: auth }, res => {
          response = res;
          res.pause();
          assert.equal(res.statusCode, 200);
          receiving.resolve();
        });
        client.on('error', () => {});
        client.end();
        await receiving.promise;
        await pause(100);
        assert.equal(spy.callCount, 1);
        const source = (await spy.firstCall.returnValue) as Readable & {
          fd?: number | null;
          s?: {
            cursor?: {
              killed?: boolean;
              id?: { isZero(): boolean };
              session?: { hasEnded?: boolean };
              bufferedCount(): number;
            };
          };
        };
        assert(!source.readableEnded, 'Large producer remains in flight under downstream backpressure');
        assert(
          source.readableLength <= (driver === 'gridfs' ? 2 * 261120 : 131072),
          'Readable buffering stays bounded'
        );
        const bufferedChunks = source.s?.cursor?.bufferedCount();
        if (driver === 'gridfs') assert(bufferedChunks! <= 101, 'At most one default cursor batch is retained');
        const allocated = process.memoryUsage().external - baseline;
        // Mongo batches chunks (up to a wire batch) independently of Node's
        // readable high-water mark. Bound well below the 128 MiB object.
        assert(allocated < (driver === 'gridfs' ? 64 : 16) * 1024 * 1024, 'The object is not buffered in full');
        if (process.env.FM033_RESULTS)
          await writeFile(
            process.env.FM033_RESULTS + '/backpressure-' + driver + '.json',
            JSON.stringify(
              {
                driver,
                objectBytes: (driver === 'gridfs' ? 128 : 32) * 1024 * 1024,
                externalAllocated: allocated,
                readableLength: source.readableLength,
                bufferedChunks,
              },
              null,
              2
            )
          );
        const done = finished(source).catch(() => {});
        client.destroy();
        response?.destroy();
        await done;
        await f.host.stop();
        assert(source.destroyed && source.closed);
        if (driver === 'fs') assert.equal(source.fd, null, 'The operating-system file handle closes');
        else {
          // Driver .closed also requires consuming every locally buffered
          // document. Cancellation must kill the server cursor and end its
          // session without reading the remainder into the HTTP response.
          assert.equal(source.s?.cursor?.killed, true, 'The server cursor is killed');
          assert.equal(source.s?.cursor?.id?.isZero(), true, 'No live cursor ID remains');
          assert.equal(source.s?.cursor?.session?.hasEnded, true, 'The borrowed cursor session ends');
        }
        assert.equal(persistenceStatus(f.owner).pools, 0);
      } finally {
        client?.destroy();
        response?.destroy();
        spy?.restore();
        await f.close();
      }
    });
});
