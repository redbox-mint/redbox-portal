import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, readdir } from 'node:fs/promises';
import { request as httpRequest } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { io } from 'socket.io-client';
import { addDataStreamsRoute, getMetaRoute, updateMetaRoute } from '../../../src/api-routes/groups/records';
import { progressSocketGrantRoute } from '../../../src/http/express/progressOperations';
import { progressOperationRoutes } from '../../../src/http/progressRoutes';
import { coreRouteName } from '../../../src/http/fastify/routes';
import { runAcceptedPersistenceWork, persistenceStatus } from '../../../src/persistence/runtime';
import { productionRawPortal } from './productionRawPortal';
import { canonical, uploadPath, grantPath, socketPath } from './rawSocketFixture';

if (!process.env.HTTP_PILOT_TEST_MONGO_URL || !process.env.HTTP_READ_SOLR_PORT)
  throw new Error('FM-020 replacements require disposable real Mongo and Solr.');

const sources = { upload: addDataStreamsRoute, progress: progressSocketGrantRoute, metadata: updateMetaRoute };
type Family = keyof typeof sources;
type Replacement = 'core' | 'alias' | 'strict' | 'access' | 'deny' | 'redirect' | 'subclass';
const policies = ['brandingandportal', 'iswebserviceauthenticated', 'brandactor', 'checkauth'];
const headers = { Authorization: 'Bearer pilot-api-token', Origin: canonical, 'X-ReDBox-Api-Version': '2.0' };
const metadataPath = '/default/rdmp/api/records/metadata/fm020-record';
const boundary = 'fm020-replacement';
const payload = Buffer.from(
  `--${boundary}\r\nContent-Disposition: form-data; name="attachmentFields"; filename="replacement.txt"\r\nContent-Type: text/plain\r\n\r\nreplacement raw bytes\r\n--${boundary}--\r\n`
);

/** Install declarations and ordinary factory bindings. Production owns route
 * resolution, parser scopes, sessions, raw resources, server and socket wiring. */
async function replacementPortal(
  family: Family,
  kind: Replacement,
  options: {
    alias?: boolean;
    metadataOnly?: boolean;
    disableBoth?: boolean;
    overrideAction?: boolean | 'throw';
    terminateHook?: boolean | 'throw';
    ordering?: boolean;
  } = {}
) {
  const appPath = await mkdtemp(path.join(tmpdir(), 'fm020-replacement-installed-'));
  for (const folder of ['views', 'assets', '.tmp/public', 'node_modules/fm020-storage'])
    await mkdir(path.join(appPath, folder), { recursive: true });
  const extensionPath = path.join(appPath, 'node_modules/fm020-storage');
  await writeFile(
    path.join(appPath, 'package.json'),
    JSON.stringify({ name: 'fm020-replacement-app', dependencies: { 'fm020-storage': '1.0.0' }, hookLoadPriority: [] })
  );
  await writeFile(
    path.join(extensionPath, 'package.json'),
    JSON.stringify({ name: 'fm020-storage', version: '1.0.0', main: 'index.cjs', redbox: { extension: '.' } })
  );
  const source = sources[family];
  const name = coreRouteName(source.method, source.path);
  const declaration = {
    name,
    method: source.method,
    path: source.path,
    controller: kind === 'redirect' ? 'ReplacementController' : source.controller,
    action: kind === 'redirect' ? 'echo' : source.action,
    access:
      kind === 'deny'
        ? { kind: 'deny' }
        : kind === 'redirect'
          ? { kind: 'public' }
          : { kind: 'policies', names: kind === 'access' ? policies.filter(name => name !== 'checkauth') : policies },
    replaces: true,
    ...(['redirect', 'strict'].includes(kind) ? { csrf: false } : kind === 'access' ? { csrf: true } : {}),
  };
  const subclass = kind === 'subclass' || options.overrideAction;
  const controllerFile =
    family === 'progress'
      ? 'ProgressController'
      : options.metadataOnly
        ? 'webservice/RecordController'
        : 'webservice/DatastreamController';
  const className =
    family === 'progress' ? 'ProgressController' : options.metadataOnly ? 'RecordController' : 'DatastreamController';
  const factoryName =
    family === 'progress' ? 'progressController' : options.metadataOnly ? 'recordController' : 'datastreamController';
  const modulePath = (file: string) => path.resolve(__dirname, '../../../src', file);
  const aliasPath = '/:branding/:portal/api/resolved-' + family + (family === 'progress' ? '' : '/:oid');
  const aliasMethod = family === 'metadata' ? 'post' : 'put';
  const routes = [
    ...(kind === 'core'
      ? []
      : kind === 'alias'
        ? [
            { ...declaration, access: { kind: 'deny' } },
            {
              ...declaration,
              name: 'resolved-alias-' + family,
              path: aliasPath,
              method: aliasMethod,
              replaces: undefined,
              csrf: false,
            },
          ]
        : [declaration]),
    ...(options.disableBoth
      ? [...progressOperationRoutes, progressSocketGrantRoute].map(route => ({
          name: coreRouteName(route.method, route.path),
          ...route,
          access: { kind: 'deny' },
          replaces: true,
        }))
      : []),
    {
      name: 'replacement-sibling',
      method: 'post',
      path: '/echo',
      controller: 'ReplacementController',
      action: 'echo',
      access: { kind: 'public' },
    },
    ...(options.alias
      ? [
          {
            name: 'replacement-upload-alias',
            method: 'post',
            path: '/:branding/:portal/api/replacement-upload/:oid',
            controller: source.controller,
            action: source.action,
            access: { kind: 'policies', names: policies },
            csrf: false,
          },
        ]
      : []),
  ];
  await writeFile(
    path.join(extensionPath, 'index.cjs'),
    `const assert = require('node:assert/strict');
const storage = require(${JSON.stringify(path.resolve(__dirname, '../../../../sails-hook-redbox-storage-mongo/dist/extension.js'))});
const { bindControllerFactory } = require(${JSON.stringify(modulePath('http/controllers'))});
const { z } = require(${JSON.stringify(path.resolve(__dirname, '../../../node_modules/zod'))});
const source = require(${JSON.stringify(family === 'progress' ? modulePath('http/express/progressOperations') : modulePath('api-routes/groups/records'))})[${JSON.stringify(family === 'upload' ? 'addDataStreamsRoute' : family === 'metadata' ? 'updateMetaRoute' : 'progressSocketGrantRoute')}];
const { receiveMultipart } = require(${JSON.stringify(modulePath('http/fastify/rawMultipart'))});
exports.inspectPrismaStagedStorage = storage.inspectPrismaStagedStorage;
exports.ensurePrismaStagedStorageIndexes = storage.ensurePrismaStagedStorageIndexes;
const events = [];
exports.events = events;
const observe = (name, schema) => { const parse = schema.safeParse.bind(schema); schema.safeParse = (...args) => { events.push(name); return parse(...args); }; return schema; };
const echo = { name: 'ReplacementController', actions: ['echo'], create: () => ({
  async echo(request) {
    if (${!!options.ordering}) events.push('action');
    assert.throws(() => receiveMultipart(request, undefined, async () => {}), /scoped raw parser/);
    return { body: request.body, controller: 'replacement' };
  }
}) };
let raw, installation;
const ownership = [];
exports.observeOwners = resolved => { installation = resolved; raw = resolved.raw; };
exports.ownership = ownership;
const probe = { name: 'probe-final-raw-bindings', stage: 'beforeAction', scope: { kind: 'application' }, async run(request, reply) {
  if (${!!options.ordering}) events.push('beforeAction');
  const binding = request.routeOptions.config.redboxRoute;
  const expected = !!binding && installation.httpOwners.uploads.some(route => route.declaration.name === binding.route.declaration.name) && binding.method === request.method;
  const sentinel = new Error('owned parser reached');
  // Probe the ownership boundary without reading a byte or replacing the real
  // adapter. The action will subsequently use the production multipart owner.
  assert.throws(() => receiveMultipart(request, { receive() { throw sentinel; } }, async () => {}),
    error => expected ? error === sentinel : /scoped raw parser/.test(error.message));
  ownership.push({ name: binding?.route.declaration.name, method: request.method, raw: expected });
  if (${options.terminateHook === 'throw'} && expected) throw new Error('private hook failure');
  if (${!!options.terminateHook} && expected) return reply.send({ hook: true });
} };
${
  subclass
    ? `const { ${className}: Base, ${factoryName}: base } = require(${JSON.stringify(modulePath('http/controllers/' + controllerFile))});
class InstalledController extends Base {
  async ${source.action}(request, reply) {
    ${family === 'upload' ? `assert.deepEqual(request.body, ${kind === 'strict' ? "{ approvalField: 'yes' }" : '{}'});` : ''}
    if (${!!options.ordering}) events.push('action');
    ${options.overrideAction === 'throw' ? "throw new Error('private action failure');" : options.overrideAction ? 'return reply.send({ override: true });' : ''}
    reply.header('X-FM020-Controller', 'subclass');
    return super.${source.action}(request, reply);
  }
}
const replacement = { ...base, replaces: true, create: input => new InstalledController(input) };`
    : ''
}
exports.bindings = context => [bindControllerFactory(echo, undefined), ${
      subclass
        ? `bindControllerFactory(replacement, {
  log: context.log,
  rootContext: context.config.server.rootContext,
  get records() { return context.data.records.get(); },
  get storage() { return context.data.storage(); },
  get recordTypes() { return context.data.reference.types.get(); },
  get workflows() { return context.data.reference.workflows.get(); },
  get schemas() { return context.data.reference.schema.get(); },
  get datastream() { return context.data.datastream.get(); },
  get multipart() { return raw.multipart; },
  get sockets() { return raw.sockets; }
})`
        : ''
    }];
const routes = ${JSON.stringify(routes)};
for (const route of routes) {
  if (route.name === ${JSON.stringify(kind === 'alias' ? 'resolved-alias-' + family : name)} && ${kind === 'strict' || kind === 'alias'}) {
    const request = { ...source.request };
    ${kind === 'alias' && family === 'upload' ? 'request.files = { approvedFiles: { ...source.request.files.attachmentFields } };' : ''}
    if (${kind === 'strict'}) {
      request.query = z.object({ approval: z.literal('yes') }).passthrough();
      request.headers = z.object({ 'x-approval': z.literal('yes') }).passthrough();
      ${family !== 'progress' ? "request.params = z.object({ oid: z.literal('fm020-record') }).passthrough();" : ''}
      ${family !== 'progress' ? "request.body = { required: true, content: { ['" + (family === 'upload' ? 'multipart/form-data' : 'application/json') + "']: { schema: z.object({ approvalField: z.literal('yes') }).passthrough().refine(value => value.approvalField !== value.rejectPair, 'Invalid field combination') } } };" : ''}
      ${family === 'upload' ? "request.files = { attachmentFields: { required: true, multiple: false, maxBytes: 32, mimeTypes: ['text/plain'] } };" : ''}
    }
    route.api = { ...source, method: route.method, path: route.path, csrf: route.csrf, policy: route.access.names, request, responses: {} };
  }
}
if (${!!options.ordering}) {
  for (const route of routes) if (route.api?.request) {
    const request = route.api.request;
    for (const name of ['params', 'query', 'headers']) if (request[name]) request[name] = observe(name, request[name]);
    for (const content of Object.values(request.body?.content || {})) content.schema = observe('body', content.schema);
  }
  routes.push({ name: 'ordered-json', method: 'post', path: '/:branding/:portal/api/ordered/:oid', controller: echo.name, action: 'echo', access: { kind: 'policies', names: ${JSON.stringify(policies)} }, csrf: false, api: { ...source, controller: echo.name, action: 'echo', method: 'post', path: '/:branding/:portal/api/ordered/:oid', policy: ${JSON.stringify(policies)}, csrf: false, responses: {}, request: {
    params: observe('params', z.object({ oid: z.literal('fm020-record') }).passthrough()),
    query: observe('query', z.object({ approval: z.literal('yes') })),
    headers: observe('headers', z.object({ 'x-approval': z.literal('yes') }).passthrough()),
    body: { content: { 'application/json': { schema: observe('body', z.object({ approvalField: z.literal('yes') })) } } }
  } } });
}
const authenticated = { name: 'ordered-authentication', stage: 'afterAuthentication', scope: { kind: 'application' }, async run() { if (${!!options.ordering}) events.push('afterAuthentication'); } };
exports.registerRedboxExtension = () => ({ ...storage.registerRedboxExtension(), apiVersion: 2,
  controllers: [echo${subclass ? ', replacement' : ''}], routes, hooks: [authenticated, probe]
});`
  );
  try {
    const f = await productionRawPortal(true, appPath, {
      ...(options.metadataOnly ? { declarations: [getMetaRoute, updateMetaRoute], progress: false } : {}),
      prepare: async portal => {
        require(path.join(extensionPath, 'index.cjs')).observeOwners(portal.installation);
        const final = portal.installation.routePlan.routes.find(route => route.declaration.name === name)!;
        assert.equal(final.provider, kind === 'core' ? '@researchdatabox/redbox-core' : 'fm020-storage');
        if (!['core', 'strict'].includes(kind))
          assert.equal(
            final.declaration.api,
            undefined,
            'explicit access replacement removes the inherited API source'
          );
        for (const owned of Object.values(portal.installation.httpOwners))
          for (const route of owned) assert.ok(portal.installation.routePlan.routes.includes(route));
      },
    });
    assert.ok(f.host.status().ready);
    return {
      ...f,
      installation: f.nativePlan!.resolved,
      events: require(path.join(extensionPath, 'index.cjs')).events as string[],
      ownership: require(path.join(extensionPath, 'index.cjs')).ownership as {
        name?: string;
        method: string;
        raw: boolean;
      }[],
      async close() {
        await f.close();
        assert.equal(persistenceStatus(f.owner).pools, 0);
        await rm(appPath, { recursive: true, force: true });
      },
    };
  } catch (error) {
    await rm(appPath, { recursive: true, force: true });
    throw error;
  }
}
type Fixture = Awaited<ReturnType<typeof replacementPortal>>;
function familyOwners(f: Fixture, family: Family) {
  const owners =
    f.installation.httpOwners[family === 'upload' ? 'uploads' : family === 'progress' ? 'progress' : 'metadataUpdates'];
  if (family !== 'progress') return owners;
  // Replacing the grant leaves the six original progress operations selected.
  // Check those owners too, then isolate the declaration varied by this matrix.
  const operations = new Set(progressOperationRoutes.map(route => coreRouteName(route.method, route.path)));
  assert.deepEqual(
    owners
      .map(route => route.declaration.name)
      .filter(name => operations.has(name))
      .sort(),
    [...operations].sort()
  );
  return owners.filter(route => !operations.has(route.declaration.name));
}
async function unaffectedParsers(f: Fixture) {
  for (const [type, body, parsed] of [
    ['application/json', '{"nested":{"value":"json"}}', { nested: { value: 'json' } }],
    [
      'application/x-www-form-urlencoded',
      'nested[value]=form&list[]=one&list[]=two',
      { nested: { value: 'form' }, list: ['one', 'two'] },
    ],
  ] as const) {
    const response = await fetch(f.url + '/echo', { method: 'POST', headers: { 'Content-Type': type }, body });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { controller: 'replacement', body: parsed });
  }
  const malformed = await fetch(f.url + '/echo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{',
  });
  assert.equal(malformed.status, 400);
  await malformed.text();
}
async function rawUpload(
  f: Fixture,
  uploadUrl = uploadPath,
  method = 'POST',
  extra: Record<string, string> = {},
  uploadBody = payload
) {
  const response = await fetch(f.url + uploadUrl, {
    method,
    headers: { ...headers, ...extra, 'Content-Type': `multipart/form-data; boundary=${boundary}` },
    body: uploadBody,
  });
  assert.equal(response.status, 200, await response.clone().text());
  const body = await response.json();
  assert.equal(body.data.message.fileIds.length, 1);
  await runAcceptedPersistenceWork(f.owner, async () => {
    const uploaded = await f.datastream.getDatastream('fm020-record', body.data.message.fileIds[0].fileId, {
      username: 'pilot-admin',
    });
    const chunks: Buffer[] = [];
    for await (const chunk of uploaded.readstream!) chunks.push(Buffer.from(chunk));
    assert.equal(Buffer.concat(chunks).toString(), 'replacement raw bytes');
  });
  return response;
}
async function progress(f: Fixture, url = grantPath, method = 'POST', extra: Record<string, string> = {}) {
  const response = await fetch(f.url + url, { method, headers: { ...headers, ...extra } });
  assert.equal(response.status, 200, await response.clone().text());
  const token = (await response.json()).data.token;
  const client = io(new URL(f.url).origin, {
    path: socketPath,
    transports: ['websocket'],
    reconnection: false,
    extraHeaders: { Origin: canonical },
    auth: { token },
  });
  try {
    await new Promise<void>((resolve, reject) => {
      client.once('connect', () => resolve());
      client.once('connect_error', reject);
    });
  } finally {
    client.disconnect();
  }
  return response;
}

/** Send headers alone: validation must finish before the multipart body exists. */
async function rejectedBeforeBody(f: Fixture, url: string, headers: Record<string, string>, method: string) {
  await new Promise<void>((resolve, reject) => {
    const request = httpRequest(
      f.url + url,
      {
        method,
        headers: {
          ...headers,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Transfer-Encoding': 'chunked',
        },
      },
      response => {
        response.resume();
        response.once('end', () => {
          try {
            assert.equal(response.statusCode, 400);
            resolve();
          } catch (error) {
            reject(error);
          } finally {
            request.destroy();
          }
        });
      }
    );
    request.setTimeout(5000, () => request.destroy(new Error('Upload validation waited for the body')));
    request.once('error', reject);
    request.flushHeaders();
  });
}

describe('FM-020 production resolved-route transport ownership', function () {
  this.timeout(60000);
  // The same final declaration axes cover every integration/action-prelude owner.
  for (const family of Object.keys(sources) as Family[])
    for (const kind of ['core', 'alias', 'strict', 'access', 'deny'] as const)
      it(`final contract matrix: ${family} / ${kind}`, async () => {
        const f = await replacementPortal(family, kind);
        try {
          const original = family === 'upload' ? uploadPath : family === 'progress' ? grantPath : metadataPath;
          const url =
            kind === 'alias'
              ? '/default/rdmp/api/resolved-' + family + (family === 'progress' ? '' : '/fm020-record')
              : original;
          const method =
            kind === 'alias' ? (family === 'metadata' ? 'POST' : 'PUT') : family === 'metadata' ? 'PUT' : 'POST';
          const owners = familyOwners(f, family);
          assert.deepEqual(
            owners.map(route => route.declaration.name),
            kind === 'deny'
              ? []
              : [
                  kind === 'alias'
                    ? 'resolved-alias-' + family
                    : coreRouteName(sources[family].method, sources[family].path),
                ]
          );
          const extra: Record<string, string> = {};
          if (kind === 'access') {
            assert.deepEqual(
              owners[0].effectivePolicies,
              policies.filter(name => name !== 'checkauth')
            );
            const token = await fetch(f.url + '/csrfToken');
            assert.equal(token.status, 200);
            extra.Cookie = token.headers
              .getSetCookie()
              .map(value => value.split(';')[0])
              .join('; ');
            extra['X-CSRF-Token'] = (await token.json())._csrf;
          }
          const strictPayload = Buffer.concat([
            Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="approvalField"\r\n\r\nyes\r\n`),
            payload,
          ]);
          const request = (
            target = url,
            supplied: Record<string, string> = {},
            validBody = true,
            verb = method,
            body?: string | Buffer<ArrayBuffer>
          ) =>
            fetch(f.url + target, {
              method: verb,
              headers: {
                ...headers,
                ...supplied,
                'Content-Type': family === 'upload' ? `multipart/form-data; boundary=${boundary}` : 'application/json',
              },
              body:
                body ??
                (family === 'upload'
                  ? kind === 'strict' && validBody
                    ? strictPayload
                    : payload
                  : JSON.stringify({
                      title: 'matrix metadata',
                      ...(kind === 'strict' && validBody ? { approvalField: 'yes' } : {}),
                    })),
            });
          if (kind === 'deny' || kind === 'alias') {
            const denied = await request(original, {}, true, family === 'metadata' ? 'PUT' : 'POST');
            assert.equal(denied.status, 403);
            await denied.text();
          }
          if (kind !== 'deny') {
            const wrong = await request(url, extra, true, method === 'PUT' ? 'POST' : 'PUT');
            // FM-031 reserves the complete inventory even in this deliberately
            // partial fixture. POST metadata is a real (unselected here) create
            // declaration, so its guarded 501 owns this verb before fallback.
            assert.equal(wrong.status, family === 'metadata' && kind !== 'alias' ? 501 : 404);
            await wrong.text();
            const unauth = await request(url, { ...extra, Authorization: 'Bearer invalid' });
            assert.equal(unauth.status, 401);
            await unauth.text();
            if (kind === 'access') {
              const denied = await request();
              assert.equal(denied.status, 403);
              await denied.text();
              const badToken = await request(url, { ...extra, 'X-CSRF-Token': 'invalid' });
              assert.equal(badToken.status, 403);
              await badToken.text();
              const foreign = await request(url, { ...extra, Origin: 'https://foreign.invalid' });
              assert.equal(foreign.status, 403);
              await foreign.text();
            }
            if (kind === 'core') {
              const foreign = await request(url, { Origin: 'https://foreign.invalid' });
              assert.equal(foreign.status, 403);
              await foreign.text();
            }
            if (kind === 'strict') {
              const before = await f.storage.getMeta('fm020-record');
              if (family === 'upload') {
                const disk = f.disks.stagingDisk(),
                  put = disk.putStream;
                let staged = 0;
                disk.putStream = async function (...args) {
                  staged++;
                  return put.apply(this, args);
                };
                try {
                  for (const [target, supplied] of [
                    [url, { ...headers, 'X-Approval': 'yes' }],
                    [url + '?approval=yes', headers],
                    [url.replace('fm020-record', 'invalid-oid') + '?approval=yes', { ...headers, 'X-Approval': 'yes' }],
                  ] as const)
                    await rejectedBeforeBody(f, target, supplied, method);
                  assert.equal(staged, 0);
                  // Body validation waits for all staging writes regardless of
                  // field order, and rejection cleans those files before replying.
                  const badField = Buffer.from(
                    `--${boundary}\r\nContent-Disposition: form-data; name="approvalField"\r\n\r\nno\r\n`
                  );
                  const invalid = await request(
                    url + '?approval=yes',
                    { 'X-Approval': 'yes' },
                    true,
                    method,
                    Buffer.concat([badField, payload])
                  );
                  assert.equal(invalid.status, 400);
                  await invalid.text();
                  assert.equal(staged, 1);
                  const after = Buffer.concat([
                    payload.subarray(0, payload.length - Buffer.byteLength(`--${boundary}--\r\n`)),
                    badField,
                    Buffer.from(`--${boundary}--\r\n`),
                  ]);
                  const late = await request(url + '?approval=yes', { 'X-Approval': 'yes' }, true, method, after);
                  assert.equal(late.status, 400);
                  await late.text();
                  assert.equal(staged, 2);
                  assert.deepEqual(await readdir(path.join(f.directory, 'staging')), []);
                } finally {
                  disk.putStream = put;
                }
              }
              for (const [target, supplied, validBody, body] of [
                [url, { 'X-Approval': 'yes' }, true],
                [url + '?approval=no', { 'X-Approval': 'yes' }, true],
                [url + '?approval=yes', {}, true],
                ...(family === 'progress'
                  ? []
                  : [
                      [url + '?approval=yes', { 'X-Approval': 'yes' }, false],
                      [
                        url + '?approval=yes',
                        { 'X-Approval': 'yes' },
                        true,
                        family === 'upload'
                          ? Buffer.concat([
                              Buffer.from(
                                `--${boundary}\r\nContent-Disposition: form-data; name="approvalField"\r\n\r\nno\r\n`
                              ),
                              payload,
                            ])
                          : JSON.stringify({ title: 'invalid', approvalField: 'no' }),
                      ],
                    ]),
              ] as [string, Record<string, string>, boolean, (string | Buffer<ArrayBuffer>)?][]) {
                const invalid = await request(target, supplied, validBody, method, body);
                assert.equal(invalid.status, 400, await invalid.clone().text());
                await invalid.text();
                assert.equal((await f.storage.getMeta('fm020-record')).revision, before.revision);
              }
              extra['X-Approval'] = 'yes';
              if (family === 'upload') {
                for (const invalidBody of [
                  strictPayload.toString().replace('text/plain', 'application/pdf'),
                  strictPayload.toString().replace('replacement raw bytes', 'x'.repeat(33)),
                  strictPayload.toString().replace('name="attachmentFields"', 'name="unexpectedFile"'),
                  strictPayload
                    .toString()
                    .replace(
                      `--${boundary}--\r\n`,
                      `--${boundary}\r\nContent-Disposition: form-data; name="rejectPair"\r\n\r\nyes\r\n--${boundary}--\r\n`
                    ),
                ]) {
                  const invalid = await request(url + '?approval=yes', extra, true, method, invalidBody);
                  assert.equal(invalid.status, 400, await invalid.clone().text());
                  await invalid.text();
                  assert.equal((await f.storage.getMeta('fm020-record')).revision, before.revision);
                  assert.deepEqual(await readdir(path.join(f.directory, 'staging')), []);
                }
              }
            }
            const successUrl = url + (kind === 'strict' ? '?approval=yes' : '');
            // These declarations explicitly disable CSRF. A foreign-origin
            // request therefore proves we did not retain the source adapter.
            if (kind === 'alias' || kind === 'strict') extra.Origin = 'https://foreign.invalid';
            if (family === 'upload')
              await rawUpload(
                f,
                successUrl,
                method,
                extra,
                kind === 'strict'
                  ? strictPayload
                  : kind === 'alias'
                    ? Buffer.from(payload.toString().replace('name="attachmentFields"', 'name="approvedFiles"'))
                    : payload
              );
            else if (family === 'progress') await progress(f, successUrl, method, extra);
            else {
              const response = await request(successUrl, extra);
              assert.equal(response.status, 200, await response.clone().text());
              await response.text();
              assert.equal((await f.storage.getMeta('fm020-record')).metadata.title, 'matrix metadata');
            }
          }
          if (family === 'progress' && kind === 'deny') {
            const handshake = await fetch(new URL(socketPath + '/?EIO=4&transport=polling', f.url), { headers });
            assert.equal(handshake.status, 200, 'remaining progress operations retain the socket integration');
            await handshake.text();
          }
          await unaffectedParsers(f);
          if (kind !== 'deny')
            assert.ok(
              f.ownership.some(
                observation =>
                  observation.name === owners[0].declaration.name &&
                  observation.method === method &&
                  observation.raw === (family === 'upload')
              )
            );
          assert.ok(f.ownership.some(observation => observation.name === 'replacement-sibling' && !observation.raw));
        } finally {
          await f.close();
        }
      });
  for (const family of Object.keys(sources) as Family[])
    for (const kind of ['deny', 'redirect', 'subclass'] as const)
      it(`starts with a ${kind} ${family} replacement and preserves sibling parsing`, async () => {
        const f = await replacementPortal(family, kind);
        try {
          const selected = kind === 'subclass';
          const raw = f.installation.raw!;
          assert.equal(raw.upload, family !== 'upload' || selected);
          assert.equal(raw.progress, true);
          assert.equal(raw.multipart !== undefined, raw.upload);
          assert.equal(raw.sockets !== undefined, raw.progress);
          const owner = familyOwners(f, family);
          assert.equal(owner.length, selected ? 1 : 0);
          const url = family === 'upload' ? uploadPath : family === 'progress' ? grantPath : metadataPath;
          const method = family === 'metadata' ? 'PUT' : 'POST';
          if (kind === 'deny') {
            const response = await fetch(f.url + url, {
              method,
              headers: { ...headers, 'Content-Type': 'application/json' },
              body: '{"title":"denied"}',
            });
            assert.equal(response.status, 403);
            await response.text();
          } else if (kind === 'redirect') {
            for (const [type, body, parsed] of [
              ['application/json', '{"replacement":true}', { replacement: true }],
              ['application/x-www-form-urlencoded', 'replacement=yes', { replacement: 'yes' }],
            ] as const) {
              const response = await fetch(f.url + url, {
                method,
                headers: { ...headers, 'Content-Type': type },
                body,
              });
              assert.equal(response.status, 200);
              assert.deepEqual(await response.json(), { controller: 'replacement', body: parsed });
            }
          } else if (family === 'upload') {
            assert.equal((await rawUpload(f)).headers.get('x-fm020-controller'), 'subclass');
          } else if (family === 'progress') {
            assert.equal((await progress(f)).headers.get('x-fm020-controller'), 'subclass');
          } else {
            const invalid = await fetch(f.url + url, {
              method,
              headers: { ...headers, 'Content-Type': 'application/json' },
              body: '[]',
            });
            assert.equal(invalid.status, 400);
            assert.equal(
              invalid.headers.get('x-fm020-controller'),
              null,
              'metadata prelude precedes the selected subclass'
            );
            await invalid.text();
            const response = await fetch(f.url + url, {
              method,
              headers: { ...headers, 'Content-Type': 'application/json' },
              body: '{"title":"replacement metadata"}',
            });
            assert.equal(response.status, 200, await response.clone().text());
            assert.equal(response.headers.get('x-fm020-controller'), 'subclass');
            await response.text();
            assert.equal((await f.storage.getMeta('fm020-record')).metadata.title, 'replacement metadata');
          }
          if (family === 'progress' && !selected) {
            for (const suffix of ['/socket.io.js', '/?EIO=4&transport=polling']) {
              const response = await fetch(new URL(socketPath + suffix, f.url), { headers });
              assert.equal(
                response.status,
                200,
                'remaining progress operations retain the client script and socket integration'
              );
              await response.text();
            }
          }
          if (family !== 'upload') await rawUpload(f);
          if (family !== 'progress') await progress(f);
          await unaffectedParsers(f);
        } finally {
          await f.close();
        }
      });
  it('owns a newly registered raw action when the original upload is denied', async () => {
    const f = await replacementPortal('upload', 'deny', { alias: true });
    try {
      assert.deepEqual(
        f.installation.httpOwners.uploads.map(route => route.declaration.name),
        ['replacement-upload-alias']
      );
      await rawUpload(f, '/default/rdmp/api/replacement-upload/fm020-record');
      const denied = await fetch(f.url + uploadPath, { method: 'POST', headers });
      assert.equal(denied.status, 403);
      await denied.text();
      await unaffectedParsers(f);
    } finally {
      await f.close();
    }
  });
  it('keeps the FM-019 metadata-only prelude after API metadata is removed', async () => {
    const f = await replacementPortal('metadata', 'subclass', { metadataOnly: true });
    try {
      assert.equal(f.installation.raw, undefined);
      assert.equal(f.installation.httpOwners.uploads.length, 0);
      assert.equal(f.installation.httpOwners.progress.length, 0);
      assert.equal(f.installation.httpOwners.metadataUpdates.length, 1);
      const invalid = await fetch(f.url + metadataPath, {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: '[]',
      });
      assert.equal(invalid.status, 400);
      assert.equal(invalid.headers.get('x-fm020-controller'), null);
      await invalid.text();
      await unaffectedParsers(f);
    } finally {
      await f.close();
    }
  });
  it('acquires neither raw resource when both final transport routes are denied', async () => {
    const f = await replacementPortal('upload', 'deny', { disableBoth: true });
    try {
      assert.equal(f.installation.raw!.upload, false);
      assert.equal(f.installation.raw!.progress, false);
      assert.equal(f.installation.raw!.multipart, undefined);
      assert.equal(f.installation.raw!.sockets, undefined);
      assert.equal(f.installation.httpOwners.uploads.length, 0);
      assert.equal(f.installation.httpOwners.progress.length, 0);
      await unaffectedParsers(f);
    } finally {
      await f.close();
    }
  });
});

describe('FM-020 host-owned upload validation', function () {
  this.timeout(60000);
  const valid = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="approvalField"\r\n\r\nyes\r\n`),
    payload,
  ]);
  for (const mode of ['override', 'terminating-hook'] as const)
    it(`cannot bypass either validation stage with an installed ${mode}`, async () => {
      const f = await replacementPortal('upload', 'strict', {
        overrideAction: mode === 'override',
        terminateHook: mode === 'terminating-hook',
        ordering: true,
      });
      const disk = f.disks.stagingDisk(),
        put = disk.putStream;
      let staged = 0;
      disk.putStream = async function (...args) {
        staged++;
        return put.apply(this, args);
      };
      const before = (await f.storage.getMeta('fm020-record')).revision;
      try {
        for (const [url, extra] of [
          [uploadPath, { 'X-Approval': 'yes' }],
          [uploadPath + '?approval=yes', {}],
          [uploadPath.replace('fm020-record', 'invalid') + '?approval=yes', { 'X-Approval': 'yes' }],
        ] as const) {
          f.events.length = 0;
          await rejectedBeforeBody(f, url, { ...headers, ...extra }, 'POST');
          assert.deepEqual(f.events, ['afterAuthentication', 'params', 'query', 'headers']);
          assert.equal(staged, 0);
        }
        for (const body of [payload, Buffer.from(valid.toString().replace('replacement raw bytes', 'x'.repeat(33)))]) {
          f.events.length = 0;
          const response = await fetch(f.url + uploadPath + '?approval=yes', {
            method: 'POST',
            headers: { ...headers, 'X-Approval': 'yes', 'Content-Type': `multipart/form-data; boundary=${boundary}` },
            body,
          });
          assert.equal(response.status, 400);
          await response.text();
          assert.deepEqual(f.events, ['afterAuthentication', 'params', 'query', 'headers', 'body']);
          assert.deepEqual(await readdir(path.join(f.directory, 'staging')), []);
        }
        f.events.length = 0;
        const response = await fetch(f.url + uploadPath + '?approval=yes', {
          method: 'POST',
          headers: { ...headers, 'X-Approval': 'yes', 'Content-Type': `multipart/form-data; boundary=${boundary}` },
          body: valid,
        });
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), mode === 'override' ? { override: true } : { hook: true });
        assert.deepEqual(f.events, [
          'afterAuthentication',
          'params',
          'query',
          'headers',
          'body',
          'beforeAction',
          ...(mode === 'override' ? ['action'] : []),
        ]);
        assert.equal(staged, 3);
        assert.deepEqual(await readdir(path.join(f.directory, 'staging')), []);
        assert.equal((await f.storage.getMeta('fm020-record')).revision, before);
        await unaffectedParsers(f);
      } finally {
        disk.putStream = put;
        await f.close();
      }
    });
  it('joins staging cleanup when an installed action or beforeAction hook throws', async () => {
    for (const mode of ['action', 'hook']) {
      const f = await replacementPortal('upload', 'strict', {
        overrideAction: mode === 'action' ? 'throw' : false,
        terminateHook: mode === 'hook' ? 'throw' : false,
        ordering: true,
      });
      try {
        const before = (await f.storage.getMeta('fm020-record')).revision;
        const response = await fetch(f.url + uploadPath + '?approval=yes', {
          method: 'POST',
          headers: { ...headers, 'X-Approval': 'yes', 'Content-Type': `multipart/form-data; boundary=${boundary}` },
          body: valid,
        });
        assert.equal(response.status, 500);
        assert.equal((await response.text()).includes('private'), false);
        assert.deepEqual(await readdir(path.join(f.directory, 'staging')), []);
        assert.equal((await f.storage.getMeta('fm020-record')).revision, before);
        assert.ok(f.events.includes('beforeAction'));
        assert.equal(f.events.includes('action'), mode === 'action');
      } finally {
        await f.close();
      }
    }
  });
  it('preserves a safe cleanup warning and retries retained staging for early hook and action replies', async () => {
    for (const mode of ['action', 'hook']) {
      const f = await replacementPortal('upload', 'strict', {
        overrideAction: mode === 'action',
        terminateHook: mode === 'hook',
        ordering: true,
      });
      const disk = f.disks.stagingDisk(),
        remove = disk.delete;
      let calls = 0,
        closed = false;
      disk.delete = async function (...args) {
        if (++calls === 1) throw new Error('private cleanup failure');
        return remove.apply(this, args);
      };
      try {
        const response = await fetch(f.url + uploadPath + '?approval=yes', {
          method: 'POST',
          headers: { ...headers, 'X-Approval': 'yes', 'Content-Type': `multipart/form-data; boundary=${boundary}` },
          body: valid,
        });
        assert.equal(response.status, 500);
        const body = await response.text();
        assert.match(body, /Upload staging cleanup failed; reconciliation is required/);
        assert.equal(body.includes('private'), false);
        assert.equal((await readdir(path.join(f.directory, 'staging'))).length, 1);
        await f.close();
        closed = true;
        assert.equal(calls, 2, 'application stop retries the retained key');
      } finally {
        disk.delete = remove;
        if (!closed) await f.close();
      }
    }
  });
  it('places upload validation before beforeAction at the same position as ordinary route validation', async () => {
    const f = await replacementPortal('upload', 'strict', { overrideAction: true, ordering: true });
    try {
      const observations: string[][] = [];
      for (const raw of [false, true]) {
        f.events.length = 0;
        const response = await fetch(
          f.url + (raw ? uploadPath : '/default/rdmp/api/ordered/fm020-record') + '?approval=yes',
          {
            method: 'POST',
            headers: {
              ...headers,
              'X-Approval': 'yes',
              'Content-Type': raw ? `multipart/form-data; boundary=${boundary}` : 'application/json',
            },
            body: raw ? valid : JSON.stringify({ approvalField: 'yes' }),
          }
        );
        assert.equal(response.status, 200);
        await response.text();
        observations.push([...f.events]);
      }
      assert.deepEqual(observations[0], [
        'afterAuthentication',
        'params',
        'query',
        'headers',
        'body',
        'beforeAction',
        'action',
      ]);
      assert.deepEqual(observations[1], observations[0]);
      assert.deepEqual(await readdir(path.join(f.directory, 'staging')), []);
    } finally {
      await f.close();
    }
  });
});
