import assert from 'node:assert/strict';
import { assertNoNewConnections } from './ownedCleanup';
import { request, type ClientRequest } from 'node:http';
import { once } from 'node:events';
import { readFile, writeFile } from 'node:fs/promises';
import { setTimeout as pause } from 'node:timers/promises';
import sinon from 'sinon';
import { referenceProductionFixture, referenceOrigin } from './referenceProductionFixture';
import { retainedUploadExpress } from './retainedUploadExpress';
import { uploadDeclarations, brandingUploadRoutes, resumableUploadRoutes } from '../../../src/http/uploadRoutes';
import { datastreamReadRoutes } from '../../../src/http/datastreamRoutes';
import { persistenceStatus } from '../../../src/persistence/runtime';
import { getStorageRepositories } from '../../../src/persistence/storage/runtime';
import { recordRepresentationConcurrency } from '../../../src/RecordHttpConcurrency';
import type { PoliciesConfig } from '../../../src/config/policies.config';

type Fixture = Awaited<ReturnType<typeof referenceProductionFixture>>;
interface Wire {
  status: number;
  headers: Record<string, unknown>;
  body: string;
}
const auth = { Authorization: 'Bearer pilot-api-token' };
const declarations = [...uploadDeclarations, ...datastreamReadRoutes];
const tusHeaders = { 'Tus-Resumable': '1.0.0' };
const payload = Buffer.from('FM034 attachment bytes\n');
const svg = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="red"/></svg>'
);
function normalize(value: Wire): Wire {
  const out = structuredClone(value);
  for (const key of ['date', 'connection', 'keep-alive', 'x-request-id', 'set-cookie']) delete out.headers[key];
  const clean = (s: string) =>
    s
      .replace(/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}/g, '<uuid>')
      .replace(/[a-f0-9]{32}/g, '<upload>')
      .replace(/\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z/g, '<time>');
  out.body = clean(out.body);
  for (const key of ['location', 'content-security-policy'])
    if (typeof out.headers[key] === 'string')
      out.headers[key] = clean(String(out.headers[key])).replace(/'nonce-[^']+'/g, "'nonce-<nonce>'");
  // Volatile identifiers can change encoded JSON length (session/security metadata).
  return out;
}
const protocolBaseline = new Map<string, Wire>();
function compareProtocol(mode: string, name: string, value: Wire): void {
  const response = normalize(value);
  if (mode === 'retained' || mode === 'retained-express') protocolBaseline.set(name, response);
  else assert.deepEqual(response, protocolBaseline.get(name), name + ' matches retained status, headers and body');
}
export async function uploadWire(
  f: Fixture,
  target: string,
  method: string,
  headers: Record<string, string> = auth,
  body?: Buffer,
  absolute = false
): Promise<Wire> {
  const url = new URL(f.url);
  return new Promise((resolve, reject) => {
    const req = request(
      {
        hostname: url.hostname,
        port: url.port,
        method,
        path: (absolute ? 'http://attacker.invalid' : '') + url.pathname + target,
        headers: { ...headers, ...(body ? { 'Content-Length': String(body.length) } : {}) },
      },
      res => {
        const chunks: Buffer[] = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () =>
          resolve({ status: res.statusCode!, headers: { ...res.headers }, body: Buffer.concat(chunks).toString() })
        );
        res.on('error', reject);
      }
    );
    req.setTimeout(15000, () => req.destroy(new Error('Upload HTTP timeout')));
    req.on('error', reject);
    req.end(body);
  });
}
function multipart(
  field: string,
  bytes = payload,
  fields: { name: string; value: string }[] = [],
  after = false,
  filename = 'file.txt'
) {
  const boundary = 'fm034-boundary';
  const parts = fields.map(f =>
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${f.name}"\r\n\r\n${f.value}\r\n`)
  );
  const file = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${field}"; filename="${filename}"\r\nContent-Type: ${field === 'logo' ? 'image/svg+xml' : 'application/octet-stream'}\r\n\r\n`
    ),
    bytes,
    Buffer.from('\r\n'),
  ]);
  return {
    body: Buffer.concat([...(!after ? parts : []), file, ...(after ? parts : []), Buffer.from(`--${boundary}--\r\n`)]),
    headers: { 'Content-Type': 'multipart/form-data; boundary=' + boundary },
  };
}
const routePath = (route: (typeof uploadDeclarations)[number]) =>
  route.path
    .replace('/:branding/:portal', '/default/rdmp')
    .replace(':oid', 'reference-record')
    .replace(':attachId', '11111111111111111111111111111111')
    .replace(':slot', 'regular');
async function stagingKeys(f: Fixture | import('../../../src/storage/StorageManager').Services.IDisk) {
  const disk = 'data' in f ? f.data.disks.get().stagingDisk() : f;
  const files = await disk.listAll('', { recursive: true });
  return Array.from(files.objects).map(value =>
    String((value as { key?: string; name?: string }).key ?? (value as { name?: string }).name)
  );
}
async function cleanStaging(f: Fixture) {
  await f.data.disks.get().stagingDisk().deleteAll('');
}
async function session(f: Fixture) {
  const csrf = await uploadWire(f, '/csrfToken', 'GET', {}),
    cookie = String((csrf.headers['set-cookie'] as string[])[0]).split(';')[0];
  const token = JSON.parse(csrf.body)._csrf;
  const login = await uploadWire(
    f,
    '/user/login_local',
    'POST',
    { Cookie: cookie, Origin: referenceOrigin, 'Content-Type': 'application/x-www-form-urlencoded' },
    Buffer.from(new URLSearchParams({ username: 'pilot-admin', password: 'pilot-password', _csrf: token }).toString())
  );
  assert.equal(login.status, 302, login.body);
  const signed = String((login.headers['set-cookie'] as string[])[0]).split(';')[0];
  const next = await uploadWire(f, '/csrfToken', 'GET', { Cookie: signed });
  return { Cookie: signed, 'X-CSRF-Token': JSON.parse(next.body)._csrf, Origin: referenceOrigin };
}
const profiles: { name: string; root: string; policy?: PoliciesConfig }[] = [
  { name: 'portal', root: '/portal' },
  { name: 'root', root: '' },
  { name: 'reduced', root: '/portal', policy: { '*': ['noCache', 'brandingAndPortal'] } },
];
const variants = [
  { name: 'admin', headers: auth },
  { name: 'reader', headers: { Authorization: 'Bearer reader-token' } },
  { name: 'foreign-actor', headers: { Authorization: 'Bearer foreign-token' } },
  { name: 'anonymous', headers: {} },
  { name: 'invalid-bearer', headers: { Authorization: 'Bearer invalid' } },
  { name: 'hostile-origin', headers: { ...auth, Origin: 'https://attacker.invalid' } },
  { name: 'foreign-record', headers: auth, foreign: true },
  {
    name: 'absolute-host-poison',
    headers: {
      ...auth,
      Host: 'attacker.invalid',
      'X-Forwarded-Host': 'attacker.invalid',
      'X-Forwarded-Proto': 'https',
    },
    absolute: true,
  },
] as const;

describe('FM-034 production upload differential', function () {
  this.timeout(1200000);
  for (const profile of profiles)
    describe(profile.name, () => {
      const cases = uploadDeclarations.flatMap(route =>
        ['1.0', '2.0'].flatMap(version =>
          variants.map(variant => ({
            route,
            version,
            variant,
            name: `${route.method} ${route.path} v${version} ${variant.name}`,
          }))
        )
      );
      const results: Wire[][] = [];
      before(async () => {
        const retained = await retainedUploadExpress();
        const clock = sinon.useFakeTimers({ now: new Date('2026-11-14T08:00:00.000Z'), toFake: ['Date'] });
        try {
          for (const mode of ['retained', 'express', 'fastify']) {
            const f = await referenceProductionFixture(
              mode === 'fastify',
              profile.policy,
              mode === 'retained' ? () => retained.install() : undefined,
              {
                declarations,
                pages: {},
                rootContext: profile.root,
                configuration: { record: { maxUploadSize: 1024 * 1024, diskSpaceThreshold: 0 } },
              }
            );
            const observations: Wire[] = [];
            try {
              for (const c of cases) {
                const protocol = c.route.method === 'all';
                const data = multipart(
                  c.route.action === 'addDataStreams'
                    ? 'attachmentFields'
                    : c.route.action === 'uploadFace'
                      ? 'face'
                      : c.route.action,
                  c.route.action === 'logo' ? svg : payload,
                  c.route.action === 'uploadFace' ? [{ name: 'expectedDraftRevision', value: '0' }] : []
                );
                let target = routePath(c.route);
                if ('foreign' in c.variant) target = target.replace('reference-record', 'foreign-record');
                const value = await uploadWire(
                  f,
                  target,
                  protocol ? 'POST' : c.route.method.toUpperCase(),
                  {
                    ...c.variant.headers,
                    'X-ReDBox-API-Version': c.version,
                    ...(protocol ? { ...tusHeaders, 'Upload-Length': '6' } : data.headers),
                  },
                  protocol ? undefined : data.body,
                  'absolute' in c.variant
                );
                observations.push(value);
                if (protocol && value.status === 201) {
                  assert.match(
                    String(value.headers.location),
                    new RegExp(
                      '^' + profile.root + '/default/rdmp/(companion/)?record/reference-record/attach/[a-f0-9]{32}$'
                    )
                  );
                  await cleanStaging(f);
                } else assert.deepEqual(await stagingKeys(f), [], c.name + ' leaves no staged files');
              }
              results.push(observations);
            } finally {
              await f.close();
            }
          }
        } finally {
          clock.restore();
          await retained.close();
        }
        if (process.env.FM034_RESULTS)
          await writeFile(
            process.env.FM034_RESULTS + '/matrix-' + profile.name + '.json',
            JSON.stringify(
              {
                cases: cases.map(c => ({ name: c.name, method: c.route.method, path: c.route.path })),
                results,
                retainedHashes: retained.hashes,
              },
              null,
              2
            )
          );
      });
      cases.forEach((c, index) =>
        it(c.name, () => {
          assert.deepEqual(
            normalize(results[1][index]),
            normalize(results[0][index]),
            'Shared actions preserve retained Express'
          );
          assert.deepEqual(
            normalize(results[2][index]),
            normalize(results[0][index]),
            'Native production action preserves status, headers and body'
          );
          assert.notEqual(results[2][index].status, 501);
        })
      );
    });

  for (const mode of ['retained', 'express', 'fastify'])
    describe(mode + ' protocol and staging', () => {
      let f: Fixture, retained: Awaited<ReturnType<typeof retainedUploadExpress>>;
      const base = '/default/rdmp/record/reference-record/attach';
      before(async () => {
        retained = await retainedUploadExpress();
        f = await referenceProductionFixture(
          mode === 'fastify',
          undefined,
          mode === 'retained' ? () => retained.install() : undefined,
          { declarations, pages: {}, configuration: { record: { maxUploadSize: 1024 * 1024, diskSpaceThreshold: 0 } } }
        );
      });
      after(async () => {
        await f?.close();
        await retained?.close();
      });
      afterEach(async () => {
        await cleanStaging(f);
      });
      for (const companion of [false, true])
        it('TUS create/HEAD/PATCH/offset/finish/termination ownership companion=' + companion, async () => {
          const target = companion ? base.replace('/record/', '/companion/record/') : base;
          const created = await uploadWire(f, target, 'POST', {
            ...auth,
            ...tusHeaders,
            'Upload-Length': '6',
            'Upload-Metadata': 'filename ' + Buffer.from('file.txt').toString('base64'),
            Host: 'attacker.invalid',
          });
          assert.equal(created.status, 201, created.body);
          assert.equal(created.headers['tus-resumable'], '1.0.0');
          const location = String(created.headers.location);
          assert.match(
            location,
            /^\/portal\/default\/rdmp\/(companion\/)?record\/reference-record\/attach\/[a-f0-9]{32}$/
          );
          const resource = location.slice('/portal'.length),
            id = location.split('/').pop()!;
          const patch = async (offset: number, body: string) =>
            uploadWire(
              f,
              resource,
              'PATCH',
              {
                ...auth,
                ...tusHeaders,
                'Upload-Offset': String(offset),
                'Content-Type': 'application/offset+octet-stream',
              },
              Buffer.from(body)
            );
          assert.equal((await patch(0, 'abc')).status, 204);
          const head = await uploadWire(f, resource, 'HEAD', { ...auth, ...tusHeaders });
          assert.equal(head.status, 200);
          assert.equal(head.body, '');
          assert.equal(head.headers['upload-offset'], '3');
          assert.equal(head.headers['upload-length'], '6');
          compareProtocol(mode, 'TUS partial HEAD companion=' + companion, head);
          assert.equal((await patch(0, 'bad')).status, 409);
          assert.equal(
            (await uploadWire(f, resource, 'HEAD', { Authorization: 'Bearer reader-token', ...tusHeaders })).status,
            403
          );
          assert.equal(
            (
              await uploadWire(f, resource.replace('reference-record', 'foreign-record'), 'HEAD', {
                ...auth,
                ...tusHeaders,
              })
            ).status,
            404
          );
          assert.equal((await patch(3, 'def')).status, 204);
          assert.equal(await f.data.disks.get().stagingDisk().get(id), 'abcdef');
          assert.equal(
            (await uploadWire(f, resource, 'DELETE', { ...auth, ...tusHeaders })).status,
            400,
            'Finished upload termination remains disabled'
          );
          const pending = await uploadWire(f, target, 'POST', { ...auth, ...tusHeaders, 'Upload-Length': '6' }),
            pendingTarget = String(pending.headers.location).slice('/portal'.length);
          assert.equal((await uploadWire(f, pendingTarget, 'DELETE', { ...auth, ...tusHeaders })).status, 204);
          assert.equal((await uploadWire(f, pendingTarget, 'HEAD', { ...auth, ...tusHeaders })).status, 404);
        });
      it('TUS deferred length, OPTIONS, version/metadata errors and maximum length', async () => {
        const created = await uploadWire(f, base, 'POST', { ...auth, ...tusHeaders, 'Upload-Defer-Length': '1' });
        assert.equal(created.status, 201, created.body);
        const target = String(created.headers.location).slice('/portal'.length);
        assert.equal(
          (await uploadWire(f, target, 'HEAD', { ...auth, ...tusHeaders })).headers['upload-defer-length'],
          '1'
        );
        assert.equal(
          (
            await uploadWire(
              f,
              target,
              'PATCH',
              {
                ...auth,
                ...tusHeaders,
                'Upload-Length': '3',
                'Upload-Offset': '0',
                'Content-Type': 'application/offset+octet-stream',
              },
              Buffer.from('abc')
            )
          ).status,
          204
        );
        const options = await uploadWire(f, base, 'OPTIONS', auth);
        assert.equal(options.status, 204);
        assert(String(options.headers['tus-extension']).includes('termination'));
        compareProtocol(mode, 'TUS OPTIONS', options);
        assert.equal((await uploadWire(f, base, 'POST', auth)).status, 412);
        assert.equal(
          (await uploadWire(f, base, 'POST', { ...auth, ...tusHeaders, 'Upload-Length': '1048577' })).status,
          413
        );
        assert.equal((await uploadWire(f, base + '/invalid', 'HEAD', { ...auth, ...tusHeaders })).status, 400);
      });
      it('TUS creation-with-upload retains complete bytes and default expiry is disabled', async () => {
        const out = await uploadWire(
          f,
          base,
          'POST',
          { ...auth, ...tusHeaders, 'Upload-Length': '3', 'Content-Type': 'application/offset+octet-stream' },
          Buffer.from('abc')
        );
        assert.equal(out.status, 201, out.body);
        assert.equal(out.headers['upload-offset'], '3');
        assert.equal(out.headers['upload-expires'], undefined);
        const location = String(out.headers.location),
          id = location.split('/').pop()!;
        assert.equal(await f.data.disks.get().stagingDisk().get(id), 'abc');
        const head = await uploadWire(f, location.slice('/portal'.length), 'HEAD', { ...auth, ...tusHeaders });
        assert.equal(head.status, 200);
        assert.equal(head.headers['upload-offset'], '3');
        assert.equal(head.headers['upload-length'], '3');
      });
      it('TUS concurrent same-offset PATCH has one winner and a resumable offset', async () => {
        const out = await uploadWire(f, base, 'POST', { ...auth, ...tusHeaders, 'Upload-Length': '6' }),
          target = String(out.headers.location).slice('/portal'.length);
        assert.equal(out.status, 201, out.body);
        const patch = () =>
          uploadWire(
            f,
            target,
            'PATCH',
            { ...auth, ...tusHeaders, 'Upload-Offset': '0', 'Content-Type': 'application/offset+octet-stream' },
            Buffer.from('abc')
          );
        const writes = await Promise.all([patch(), patch()]);
        assert.deepEqual(writes.map(value => value.status).sort(), [204, 409]);
        const head = await uploadWire(f, target, 'HEAD', { ...auth, ...tusHeaders });
        assert.equal(head.status, 200);
        assert.equal(head.headers['upload-offset'], '3');
      });
      for (const query of ['?apiVersion[value]=2.0', '?apiVersion=2.0&apiVersion=1.0', '?__proto__[apiVersion]=2.0'])
        it('upload errors safely retain structured version query ' + query, async () => {
          const data = multipart('attachmentFields');
          const out = await uploadWire(
            f,
            '/default/rdmp/api/records/datastreams/missing-record' + query,
            'POST',
            { ...auth, ...data.headers },
            data.body
          );
          assert.equal(out.status, 404, out.body);
          compareProtocol(mode, 'multipart structured version ' + query, out);
          const head = await uploadWire(f, base + '/invalid' + query, 'HEAD', { ...auth, ...tusHeaders });
          assert.equal(head.status, 400);
          compareProtocol(mode, 'TUS structured version ' + query, head);
          assert.deepEqual(await stagingKeys(f), []);
        });
      for (const body of [undefined, Buffer.from('{}'), Buffer.from('{')])
        it('multipart parser scope preserves JSON/bodyless errors body=' + body?.toString(), async () => {
          const out = await uploadWire(
            f,
            '/default/rdmp/api/records/datastreams/reference-record',
            'POST',
            { ...auth, 'Content-Type': 'application/json' },
            body
          );
          assert.equal(out.status, 400, out.body);
          assert.deepEqual(await stagingKeys(f), []);
        });
      it('browser sessions enforce CSRF on POST and HEAD; bearer canonical Origin is checked', async () => {
        const browser = await session(f);
        assert.equal(
          (await uploadWire(f, base, 'POST', { Cookie: browser.Cookie, ...tusHeaders, 'Upload-Length': '3' })).status,
          403
        );
        const created = await uploadWire(f, base, 'POST', { ...browser, ...tusHeaders, 'Upload-Length': '3' });
        assert.equal(created.status, 201, created.body);
        const target = String(created.headers.location).slice('/portal'.length);
        assert.equal((await uploadWire(f, target, 'HEAD', { Cookie: browser.Cookie, ...tusHeaders })).status, 403);
        assert.equal((await uploadWire(f, target, 'HEAD', { ...browser, ...tusHeaders })).status, 200);
        assert.equal(
          (
            await uploadWire(f, base, 'POST', {
              ...auth,
              ...tusHeaders,
              'Upload-Length': '3',
              Origin: 'http://attacker.invalid',
            })
          ).status,
          403
        );
      });
      for (const after of [false, true])
        it('multipart concurrency fields ' + (after ? 'after' : 'before') + ' file and persisted bytes', async () => {
          const data = multipart(
            'attachmentFields',
            payload,
            [{ name: 'saveRequestId', value: '00000000-0000-4000-8000-000000000034' }],
            after
          );
          const out = await uploadWire(
            f,
            '/default/rdmp/api/records/datastreams/reference-record',
            'POST',
            {
              ...auth,
              ...data.headers,
              'X-ReDBox-API-Version': '2.0',
              'X-ReDBox-Save-Request-Id': '00000000-0000-4000-8000-000000000034',
            },
            data.body
          );
          assert.equal(out.status, 200, out.body);
          assert.equal(JSON.parse(out.body).meta.requestId, '00000000-0000-4000-8000-000000000034');
          const attachments = await f.data.records.get().getAttachments('reference-record');
          assert(attachments.length);
          const file = attachments.at(-1)!;
          const response = await f.data.datastream.get().getDatastream('reference-record', String(file.fileId));
          const chunks: Buffer[] = [];
          for await (const chunk of response.readstream!) chunks.push(Buffer.from(chunk));
          assert.deepEqual(Buffer.concat(chunks), payload);
          assert.deepEqual(await stagingKeys(f), []);
        });
      it('multipart save correlation and stale If-Match retain the authoritative conflict and clean staging', async () => {
        const original = await f.data.records.get().getMeta('reference-record');
        const tag = recordRepresentationConcurrency(original).metadata.entityTag;
        const data = multipart(
          'attachmentFields',
          payload,
          [
            { name: 'expectedRevision', value: String(original.revision) },
            { name: 'saveRequestId', value: '00000000-0000-4000-8000-000000000034' },
          ],
          true
        );
        const headers = {
          ...auth,
          ...data.headers,
          'X-ReDBox-API-Version': '2.0',
          'If-Match': tag!,
          'X-ReDBox-Save-Request-Id': '00000000-0000-4000-8000-000000000034',
        };
        const first = await uploadWire(
          f,
          '/default/rdmp/api/records/datastreams/reference-record',
          'POST',
          headers,
          data.body
        );
        assert.equal(first.status, 200, first.body);
        const count = (await f.data.records.get().getAttachments('reference-record')).length;
        const conflict = await uploadWire(
          f,
          '/default/rdmp/api/records/datastreams/reference-record',
          'POST',
          headers,
          data.body
        );
        assert.equal(conflict.status, 412, conflict.body);
        assert(conflict.body.includes('record-revision-stale'));
        assert.equal(JSON.parse(conflict.body).meta.requestId, '00000000-0000-4000-8000-000000000034');
        assert.notEqual(conflict.headers.etag, tag);
        assert.equal((await f.data.records.get().getAttachments('reference-record')).length, count);
        assert.deepEqual(await stagingKeys(f), []);
      });
      it('all browser branding uploads require session CSRF before staging', async () => {
        const browser = await session(f);
        for (const route of brandingUploadRoutes.filter(route => route.path.includes('/app/'))) {
          const field = route.action === 'uploadFace' ? 'face' : route.action;
          const data = multipart(field, field === 'logo' ? svg : payload, [
            { name: 'expectedDraftRevision', value: '0' },
          ]);
          const denied = await uploadWire(
            f,
            routePath(route),
            route.method.toUpperCase(),
            { Cookie: browser.Cookie, ...data.headers },
            data.body
          );
          assert.equal(denied.status, 403, denied.body);
          assert.deepEqual(await stagingKeys(f), []);
          const accepted = await uploadWire(
            f,
            routePath(route),
            route.method.toUpperCase(),
            { ...browser, ...data.headers },
            data.body
          );
          assert.notEqual(accepted.status, 403, accepted.body);
          assert(accepted.status < 500, accepted.body);
          assert.deepEqual(await stagingKeys(f), []);
        }
      });
      for (const issue of ['partial', 'oversized', 'repeated-field', 'bad-boundary'])
        it('multipart ' + issue + ' returns retained safe status and cleans staging', async () => {
          const data = multipart(
            'attachmentFields',
            issue === 'oversized' ? Buffer.alloc(1024 * 1024 + 1) : payload,
            issue === 'repeated-field'
              ? [
                  { name: 'field', value: 'a' },
                  { name: 'field', value: 'b' },
                ]
              : []
          );
          const body = issue === 'partial' ? data.body.subarray(0, data.body.length - 25) : data.body;
          const headers = issue === 'bad-boundary' ? { 'Content-Type': 'multipart/form-data' } : data.headers;
          const result = await uploadWire(
            f,
            '/default/rdmp/api/records/datastreams/reference-record',
            'POST',
            { ...auth, ...headers },
            body
          );
          assert.equal(result.status, issue === 'oversized' ? 413 : 400, result.body);
          compareProtocol(mode, 'multipart ' + issue, result);
          assert.deepEqual(await stagingKeys(f), []);
        });
    });
});

/** Faults wrap the real production disk/records, never replace the portal or
 * synthesize successful persistence. Every gate releases and every socket joins. */
describe('FM-034 upload failures, cancellation and lifetime', function () {
  this.timeout(120000);
  for (const native of [false, true])
    describe(native ? 'fastify' : 'retained-express', () => {
      let f: Fixture, retained: Awaited<ReturnType<typeof retainedUploadExpress>>;
      beforeEach(async () => {
        retained = await retainedUploadExpress();
        f = await referenceProductionFixture(native, undefined, native ? undefined : () => retained.install(), {
          declarations,
          pages: {},
          configuration: { record: { maxUploadSize: 16 * 1024 * 1024, diskSpaceThreshold: 0 } },
        });
      });
      afterEach(async () => {
        sinon.restore();
        await f?.close();
        await retained?.close();
      });
      const path = '/default/rdmp/api/records/datastreams/reference-record';
      it('refuses low filesystem space without allocating disk data', async () => {
        // The same production threshold input is used by both owners. A reserve
        // beyond this filesystem's capacity safely simulates the low-space branch.
        const low = await referenceProductionFixture(native, undefined, native ? undefined : () => retained.install(), {
          declarations,
          pages: {},
          configuration: { record: { maxUploadSize: 1024 * 1024, diskSpaceThreshold: Number.MAX_SAFE_INTEGER } },
        });
        try {
          const out = await uploadWire(low, '/default/rdmp/record/reference-record/attach', 'POST', {
            ...auth,
            ...tusHeaders,
            'Upload-Length': '3',
          });
          assert.equal(out.status, 500, out.body);
          compareProtocol(native ? 'fastify' : 'retained-express', 'low disk reserve', out);
          assert.equal(JSON.parse(out.body).message, 'not-enough-disk-space');
          assert.deepEqual(await stagingKeys(low), []);
        } finally {
          await low.close();
        }
      });
      it('cleans an ambiguous staging failure after the real write settles', async () => {
        const disk = f.data.disks.get().stagingDisk(),
          put = disk.putStream.bind(disk);
        sinon.stub(disk, 'putStream').callsFake(async (...args) => {
          await put(...args);
          throw new Error('private provider failure');
        });
        const data = multipart('attachmentFields');
        const out = await uploadWire(f, path, 'POST', { ...auth, ...data.headers }, data.body);
        assert.equal(out.status, 500, out.body);
        compareProtocol(native ? 'fastify' : 'retained-express', 'ambiguous provider failure', out);
        assert(!out.body.includes('private provider'));
        assert.deepEqual(await stagingKeys(f), []);
      });
      it('retains failed cleanup keys and retries them during owned stop', async () => {
        const disk = f.data.disks.get().stagingDisk(),
          remove = disk.delete.bind(disk);
        const deletion = sinon.stub(disk, 'delete').rejects(new Error('delete unavailable'));
        const data = multipart('attachmentFields');
        const out = await uploadWire(f, path, 'POST', { ...auth, ...data.headers }, data.body);
        assert.equal(out.status, 500, out.body);
        compareProtocol(native ? 'fastify' : 'retained-express', 'cleanup failure', out);
        assert.equal((await stagingKeys(f)).length, 1);
        deletion.callsFake(remove);
        await f.host.stop();
        assert(deletion.callCount >= 2);
        assert.deepEqual(await stagingKeys(disk), []);
        assert.equal(persistenceStatus(f.owner).pools, 0);
      });
      it('maps finalization failure after the real record save and removes staging', async () => {
        sinon.stub(f.data.datastream.get(), 'addDatastreams').rejects(new Error('private upstream failure'));
        const before = await f.data.records.get().getMeta('reference-record');
        const data = multipart('attachmentFields');
        const out = await uploadWire(
          f,
          path,
          'POST',
          { ...auth, ...data.headers, 'X-ReDBox-API-Version': '2.0' },
          data.body
        );
        assert.equal(out.status, 500, out.body);
        compareProtocol(native ? 'fastify' : 'retained-express', 'finalization failure', out);
        assert(out.body.includes('datastream-finalization-failed'));
        assert(!out.body.includes('private upstream'));
        const after = await f.data.records.get().getMeta('reference-record');
        assert(Number(after.revision) > Number(before.revision));
        assert.deepEqual(await stagingKeys(f), []);
      });
      for (const after of [false, true])
        it('real WOFF2 draft concurrency field ' + (after ? 'after' : 'before') + ' file', async () => {
          const font = await readFile(
            require('node:path').resolve(__dirname, '../../../../../test/resources/fonts/test-font-regular.woff2')
          );
          const target = '/default/rdmp/api/branding/draft/typeface/faces/regular';
          const initial = await f.data.reference.branding.get().getAdminState('default');
          const revision = Number(
            (initial as { draftRevision?: number; draft?: { revision?: number } }).draftRevision ??
              (initial as { draft?: { revision?: number } }).draft?.revision ??
              0
          );
          const data = multipart(
            'face',
            font,
            [{ name: 'expectedDraftRevision', value: String(revision) }],
            after,
            'real.woff2'
          );
          const out = await uploadWire(
            f,
            target,
            'PUT',
            { ...auth, ...data.headers, 'X-ReDBox-API-Version': '2.0' },
            data.body
          );
          assert.equal(out.status, 200, out.body);
          assert.deepEqual(await stagingKeys(f), []);
          const stale = await uploadWire(
            f,
            target,
            'PUT',
            { ...auth, ...data.headers, 'X-ReDBox-API-Version': '2.0' },
            data.body
          );
          assert.equal(stale.status, 409, stale.body);
          assert(stale.body.includes('branding-conflict'));
          assert.deepEqual(await stagingKeys(f), []);
        });
      it('checks record edit grants after route policies and before TUS state creation', async () => {
        await f.client
          .db()
          .collection('record')
          .updateOne(
            { redboxOid: 'reference-record' },
            { $set: { 'authorization.edit': [], 'authorization.editRoles': [] } }
          );
        const out = await uploadWire(f, '/default/rdmp/record/reference-record/attach', 'POST', {
          ...auth,
          ...tusHeaders,
          'Upload-Length': '3',
        });
        assert.equal(out.status, 403, out.body);
        assert.deepEqual(await stagingKeys(f), []);
      });
      it('holds real multipart backpressure behind a slow disk and joins the slow producer', async () => {
        const disk = f.data.disks.get().stagingDisk(),
          original = disk.putStream.bind(disk),
          entered = Promise.withResolvers<void>(),
          release = Promise.withResolvers<void>();
        let buffered = 0;
        sinon.stub(disk, 'putStream').callsFake(async (key, stream, options) => {
          entered.resolve();
          await release.promise;
          buffered = stream.readableLength;
          return original(key, stream, options);
        });
        const total = 12 * 1024 * 1024,
          form = multipart('attachmentFields', Buffer.alloc(0)),
          marker = Buffer.from('\r\n--fm034-boundary--\r\n');
        const header = form.body.subarray(0, form.body.length - marker.length),
          url = new URL(f.url);
        let sent = 0,
          client: ClientRequest | undefined;
        const response = new Promise<Wire>((resolve, reject) => {
          client = request(
            {
              hostname: url.hostname,
              port: url.port,
              method: 'POST',
              path: url.pathname + path,
              headers: { ...auth, ...form.headers, 'Content-Length': String(header.length + total + marker.length) },
            },
            res => {
              const chunks: Buffer[] = [];
              res.on('data', chunk => chunks.push(chunk));
              res.on('end', () =>
                resolve({
                  status: res.statusCode!,
                  headers: { ...res.headers },
                  body: Buffer.concat(chunks).toString(),
                })
              );
              res.on('error', reject);
            }
          );
          client.on('error', reject);
          client.setTimeout(15000, () => client!.destroy(new Error('slow upload timeout')));
        });
        void response.catch(() => {});
        const producing = (async () => {
          client!.write(header);
          const block = Buffer.alloc(64 * 1024, 97);
          while (sent < total) {
            if (!client!.write(block)) await once(client!, 'drain');
            sent += block.length;
            await pause(1);
          }
          client!.end(marker);
        })();
        void producing.catch(() => {});
        try {
          await entered.promise;
          await pause(200);
          assert(sent < total, 'backpressure stops the remote producer before the whole file is buffered');
          release.resolve();
          const out = await response;
          await producing;
          assert.equal(out.status, 200, out.body);
          compareProtocol(native ? 'fastify' : 'retained-express', 'slow producer', out);
          assert(buffered <= 128 * 1024);
          assert.deepEqual(await stagingKeys(f), []);
          if (process.env.FM034_RESULTS)
            await writeFile(
              process.env.FM034_RESULTS + '/multipart-backpressure-' + native + '.json',
              JSON.stringify({ total, buffered })
            );
        } finally {
          release.resolve();
          client?.destroy();
          await Promise.allSettled([producing, response]);
        }
      });
      it('retains a cancelled partial write until the real provider settles and removes it', async () => {
        const disk = f.data.disks.get().stagingDisk(),
          original = disk.putStream.bind(disk),
          entered = Promise.withResolvers<void>(),
          release = Promise.withResolvers<void>();
        let stream: import('node:stream').Readable | undefined;
        sinon.stub(disk, 'putStream').callsFake(async (key, input, options) => {
          stream = input;
          entered.resolve();
          await release.promise;
          return original(key, input, options);
        });
        const url = new URL(f.url),
          data = multipart('attachmentFields', Buffer.alloc(1024 * 1024));
        const client = request({
          hostname: url.hostname,
          port: url.port,
          method: 'POST',
          path: url.pathname + path,
          headers: { ...auth, ...data.headers, 'Content-Length': String(data.body.length) },
        });
        client.on('error', () => {});
        client.write(data.body.subarray(0, 64 * 1024));
        try {
          await entered.promise;
          client.destroy();
          await pause(50);
          const stop = f.host.stop({ deadlineMs: 50 });
          await assert.rejects(stop);
          assert(persistenceStatus(f.owner).pools > 0);
          release.resolve();
          await f.host.stop();
          assert(stream?.destroyed);
          assert.deepEqual(await stagingKeys(disk), []);
          assert.equal(persistenceStatus(f.owner).pools, 0);
        } finally {
          release.resolve();
          client.destroy();
        }
      });
      it('TUS cancellation retains the received offset and resumes without abandoned parts', async () => {
        const base = '/default/rdmp/record/reference-record/attach',
          size = 256 * 1024;
        const out = await uploadWire(f, base, 'POST', { ...auth, ...tusHeaders, 'Upload-Length': String(size) });
        assert.equal(out.status, 201, out.body);
        const target = String(out.headers.location).slice('/portal'.length),
          id = target.split('/').pop()!,
          url = new URL(f.url);
        const { TusStorageManagerDataStore } =
          require('../../../src/storage/TusStorageManagerDataStore') as typeof import('../../../src/storage/TusStorageManagerDataStore');
        const original = TusStorageManagerDataStore.prototype.write,
          entered = Promise.withResolvers<void>(),
          settled = Promise.withResolvers<void>();
        const writing = sinon.stub(TusStorageManagerDataStore.prototype, 'write').callsFake(function (
          this: InstanceType<typeof TusStorageManagerDataStore>,
          ...args
        ) {
          entered.resolve();
          return original.apply(this, args).finally(() => settled.resolve());
        });
        const client = request({
          hostname: url.hostname,
          port: url.port,
          method: 'PATCH',
          path: url.pathname + target,
          headers: {
            ...auth,
            ...tusHeaders,
            'Upload-Offset': '0',
            'Content-Type': 'application/offset+octet-stream',
            'Content-Length': String(size),
          },
        });
        client.on('error', () => {});
        client.write(Buffer.alloc(64 * 1024, 97));
        try {
          await entered.promise;
          client.destroy();
          await settled.promise;
          const head = await uploadWire(f, target, 'HEAD', { ...auth, ...tusHeaders });
          assert.equal(head.status, 200);
          assert.equal(head.headers['upload-offset'], '65536');
          compareProtocol(native ? 'fastify' : 'retained-express', 'cancelled TUS HEAD', head);
          assert.deepEqual((await stagingKeys(f)).sort(), [
            'tus/' + id + '/info.json',
            'tus/' + id + '/parts/00000000000000000000',
          ]);
          writing.restore();
          const resumed = await uploadWire(
            f,
            target,
            'PATCH',
            { ...auth, ...tusHeaders, 'Upload-Offset': '65536', 'Content-Type': 'application/offset+octet-stream' },
            Buffer.alloc(size - 65536, 98)
          );
          assert.equal(resumed.status, 204, resumed.body);
          assert.deepEqual(
            Buffer.from(await f.data.disks.get().stagingDisk().getBytes(id)),
            Buffer.concat([Buffer.alloc(65536, 97), Buffer.alloc(size - 65536, 98)])
          );
          assert.deepEqual((await stagingKeys(f)).sort(), ['tus/' + id + '/info.json', id].sort());
        } finally {
          client.destroy();
          writing.restore();
        }
      });
      it('TUS provider failure keeps a resumable offset and safe response, without partial file data', async () => {
        const base = '/default/rdmp/record/reference-record/attach';
        const created = await uploadWire(f, base, 'POST', { ...auth, ...tusHeaders, 'Upload-Length': '3' }),
          target = String(created.headers.location).slice('/portal'.length),
          id = target.split('/').pop()!;
        assert.equal(created.status, 201, created.body);
        const disk = f.data.disks.get().stagingDisk(),
          original = disk.put.bind(disk);
        const write = sinon
          .stub(disk, 'put')
          .callsFake((key, ...args) =>
            key.includes('/parts/') ? Promise.reject(new Error('private part failure')) : original(key, ...args)
          );
        const patch = () =>
          uploadWire(
            f,
            target,
            'PATCH',
            { ...auth, ...tusHeaders, 'Upload-Offset': '0', 'Content-Type': 'application/offset+octet-stream' },
            Buffer.from('abc')
          );
        const failure = await patch();
        assert.equal(failure.status, 500, failure.body);
        compareProtocol(native ? 'fastify' : 'retained-express', 'TUS provider failure', failure);
        assert(!failure.body.includes('private part'));
        assert.deepEqual(await stagingKeys(f), ['tus/' + id + '/info.json']);
        assert.equal((await uploadWire(f, target, 'HEAD', { ...auth, ...tusHeaders })).headers['upload-offset'], '0');
        write.restore();
        assert.equal((await patch()).status, 204);
      });
      it('graceful stop retains an in-flight TUS part and its finalization', async () => {
        const created = await uploadWire(f, '/default/rdmp/record/reference-record/attach', 'POST', {
            ...auth,
            ...tusHeaders,
            'Upload-Length': '3',
          }),
          target = String(created.headers.location).slice('/portal'.length),
          id = target.split('/').pop()!;
        assert.equal(created.status, 201, created.body);
        const disk = f.data.disks.get().stagingDisk(),
          original = disk.put.bind(disk),
          entered = Promise.withResolvers<void>(),
          release = Promise.withResolvers<void>();
        sinon.stub(disk, 'put').callsFake(async (key, ...args) => {
          if (key.includes('/parts/')) {
            entered.resolve();
            await release.promise;
          }
          return original(key, ...args);
        });
        const response = uploadWire(
          f,
          target,
          'PATCH',
          { ...auth, ...tusHeaders, 'Upload-Offset': '0', 'Content-Type': 'application/offset+octet-stream' },
          Buffer.from('abc')
        );
        void response.catch(() => {});
        try {
          await entered.promise;
          await assert.rejects(f.host.stop({ deadlineMs: 50 }));
          assert(persistenceStatus(f.owner).pools > 0);
          await assertNoNewConnections(f.url);
          release.resolve();
          const out = await response;
          assert.equal(out.status, 204, out.body);
          await f.host.stop();
          assert.equal(persistenceStatus(f.owner).pools, 0);
          assert.equal(await disk.get(id), 'abc');
          assert.equal(
            (await stagingKeys(disk)).some(key => key.includes('/parts/')),
            false
          );
        } finally {
          release.resolve();
          await response.catch(() => {});
        }
      });
      it('graceful stop retains an in-flight upload and its borrowed pools', async () => {
        const disk = f.data.disks.get().stagingDisk(),
          original = disk.putStream.bind(disk),
          entered = Promise.withResolvers<void>(),
          release = Promise.withResolvers<void>();
        sinon.stub(disk, 'putStream').callsFake(async (...args) => {
          entered.resolve();
          await release.promise;
          return original(...args);
        });
        const data = multipart('attachmentFields');
        const response = uploadWire(f, path, 'POST', { ...auth, ...data.headers }, data.body);
        void response.catch(() => {});
        try {
          await entered.promise;
          let stopped = false;
          const stopping = f.host.stop().then(() => {
            stopped = true;
          });
          await pause(100);
          assert(!stopped);
          assert(persistenceStatus(f.owner).pools > 0);
          await assertNoNewConnections(f.url);
          release.resolve();
          const out = await response;
          assert.equal(out.status, 200, out.body);
          await stopping;
          assert.equal(persistenceStatus(f.owner).pools, 0);
          assert.deepEqual(await stagingKeys(disk), []);
        } finally {
          release.resolve();
          await response.catch(() => {});
        }
      });
    });
});

/** Installed hooks exercise live inputs after host staging and validation. */
describe('FM-034 live upload inputs and raw session publication', function () {
  this.timeout(120000);
  const base = '/default/rdmp/record/reference-record/attach';
  const dataPath = '/default/rdmp/api/records/datastreams/reference-record';
  let f: Fixture;
  async function fixture(run: string, stage = 'beforeAction') {
    return referenceProductionFixture(true, undefined, undefined, {
      declarations,
      pages: {},
      artifacts: async (_directory, provider) => {
        const entry = provider + '/index.cjs';
        await writeFile(
          entry,
          (await readFile(entry, 'utf8')).replace(
            'apiVersion:',
            `hooks:[{name:'upload-live-input',stage:'${stage}',scope:{kind:'application'},run:async(request,reply)=>{${run}}}],apiVersion:`
          )
        );
      },
    });
  }
  afterEach(async () => {
    sinon.restore();
    await f?.close();
  });
  for (const replacement of ['foreign-record', 'save-request', 'query', 'body'])
    it('multipart action reads live ' + replacement + ' replacement and cleans staging', async () => {
      const run =
        replacement === 'foreign-record'
          ? "request.params={...request.params,oid:'foreign-record'}"
          : replacement === 'save-request'
            ? "request.headers['x-redbox-save-request-id']='00000000-0000-4000-8000-000000000034';request.headers['x-redbox-api-version']='2.0'"
            : replacement === 'query'
              ? "request.query={apiVersion:'2.0'}"
              : "request.body={field:'after-hook'}";
      f = await fixture(run);
      const data = multipart('attachmentFields');
      const out = await uploadWire(f, dataPath, 'POST', { ...auth, ...data.headers }, data.body);
      assert.equal(out.status, replacement === 'foreign-record' ? 404 : 200, out.body);
      if (replacement === 'save-request')
        assert.equal(JSON.parse(out.body).meta.context.requestId, '00000000-0000-4000-8000-000000000034');
      if (replacement === 'query') assert(JSON.parse(out.body).meta, 'Live query selects the v2 response');
      assert.deepEqual(await stagingKeys(f), []);
    });
  for (const early of ['reply', 'throw'])
    it('host cleans staged files after an early beforeAction ' + early, async () => {
      f = await fixture(
        early === 'reply'
          ? "reply.code(400).send({message:'early'})"
          : "throw Object.assign(new Error('hook failure'),{code:'FST_ERR_VALIDATION'})"
      );
      const data = multipart('attachmentFields');
      const out = await uploadWire(f, dataPath, 'POST', { ...auth, ...data.headers }, data.body);
      assert.equal(out.status, 400, out.body);
      assert.deepEqual(await stagingKeys(f), []);
      assert.deepEqual(await f.data.records.get().getAttachments('reference-record'), []);
    });
  it('branding validates the live replacement multipart revision after staging', async () => {
    f = await fixture("request.body={expectedDraftRevision:'999'}");
    const font = await readFile(
      require('node:path').resolve(__dirname, '../../../../../test/resources/fonts/test-font-regular.woff2')
    );
    const data = multipart('face', font, [{ name: 'expectedDraftRevision', value: '0' }], true, 'real.woff2');
    const out = await uploadWire(
      f,
      '/default/rdmp/api/branding/draft/typeface/faces/regular',
      'PUT',
      { ...auth, ...data.headers, 'X-ReDBox-API-Version': '2.0' },
      data.body
    );
    assert.equal(out.status, 409, out.body);
    assert(out.body.includes('branding-conflict'));
    assert.deepEqual(await stagingKeys(f), []);
  });
  it('TUS uses live record params and preserves typed missing-record refusal', async () => {
    f = await fixture("request.params={...request.params,oid:'foreign-record'}");
    const out = await uploadWire(f, base, 'POST', { ...auth, ...tusHeaders, 'Upload-Length': '3' });
    assert.equal(out.status, 404, out.body);
    assert.deepEqual(await stagingKeys(f), []);
  });
  for (const failure of [false, true])
    it(
      'raw TUS ' +
        (failure
          ? 'refuses session save failure before state/headers'
          : 'awaits and persists session mutation before headers'),
      async () => {
        f = await fixture(
          "if(request.headers['x-fm034-session'])request.session.fm034='persisted'",
          'afterAuthentication'
        );
        const browser = await session(f),
          entered = Promise.withResolvers<void>(),
          release = Promise.withResolvers<void>();
        const { NativeMongoSessionStore } =
          require('../../../src/http/fastify/session') as typeof import('../../../src/http/fastify/session');
        const original = NativeMongoSessionStore.prototype.compareAndSet;
        sinon.stub(NativeMongoSessionStore.prototype, 'compareAndSet').callsFake(function (
          this: InstanceType<typeof NativeMongoSessionStore>,
          ...args
        ) {
          entered.resolve();
          void release.promise.then(() => {
            if (failure) args[3](new Error('private store failure'));
            else original.apply(this, args);
          });
        });
        let complete = false;
        const response = uploadWire(f, base, 'POST', {
          ...browser,
          ...tusHeaders,
          'Upload-Length': '3',
          'X-FM034-Session': 'yes',
        }).then(value => {
          complete = true;
          return value;
        });
        void response.catch(() => {});
        try {
          await entered.promise;
          await pause(50);
          assert(!complete, 'No raw headers before required session save');
          assert.deepEqual(await stagingKeys(f), []);
          release.resolve();
          const out = await response;
          assert.equal(out.status, failure ? 500 : 201, out.body);
          assert(!out.body.includes('private store'));
          const rows = await f.client.db().collection('referenceSessions').find().toArray();
          assert.equal(
            rows.some(row => JSON.parse(row.session).fm034 === 'persisted'),
            !failure
          );
          if (failure) {
            assert.equal(out.headers['set-cookie'], undefined);
            assert.deepEqual(await stagingKeys(f), []);
          }
        } finally {
          release.resolve();
          await response.catch(() => {});
        }
      }
    );
  it('response completion retains TUS audit work through deadline and retry', async () => {
    f = await fixture('');
    const users = f.data.users.get(),
      original = users.addUserAuditEvent.bind(users),
      entered = Promise.withResolvers<void>(),
      release = Promise.withResolvers<void>();
    sinon.stub(users, 'addUserAuditEvent').callsFake((...args) => {
      if (args[1] === 'attachment-upload-post') {
        entered.resolve();
        return release.promise.then(() => original(...args)) as ReturnType<typeof original>;
      }
      return original(...args);
    });
    try {
      const out = await uploadWire(f, base, 'POST', { ...auth, ...tusHeaders, 'Upload-Length': '3' });
      assert.equal(out.status, 201, out.body);
      await entered.promise;
      await assert.rejects(f.host.stop({ deadlineMs: 50 }));
      assert(persistenceStatus(f.owner).pools > 0);
      release.resolve();
      await f.host.stop();
      assert.equal(persistenceStatus(f.owner).pools, 0);
    } finally {
      release.resolve();
    }
  });
});
