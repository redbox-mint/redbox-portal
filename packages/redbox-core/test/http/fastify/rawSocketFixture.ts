import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { Readable } from 'node:stream';
import { mkdtemp, mkdir, writeFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { StreamingMultipart } from '../../../src/http/integrations/multipart';
import type { ProgressSockets } from '../../../src/http/integrations/progressSockets';

import { persistenceStatus } from '../../../src/persistence/runtime';
import { productionRawPortal } from './productionRawPortal';
import type { ApiRequestDefinition } from '../../../src/api-routes/types';
import { assertOwnedHttpClosed } from './ownedCleanup';
export const canonical = 'https://portal.example.invalid';
export const uploadPath = '/default/rdmp/api/records/datastreams/fm020-record';
export const grantPath = '/default/rdmp/asynch/socket-token';
export const socketPath = '/portal/portal-socket.io';
export const deferred = () => Promise.withResolvers<void>();
/** Only deployment configuration, an installed extension and domain fault probes.
 * Both transports assemble the actual production application and host. */
export async function rawSocketFixture(
  native: boolean,
  options: {
    retainExpress?: boolean;
    port?: number;
    declarations?: import('./productionRawPortal').RawPortalOptions['declarations'];
    uploadRequest?: ApiRequestDefinition;
    companion?: import('./productionRawPortal').RawPortalOptions['companion'];
    policyConfiguration?: import('./productionRawPortal').RawPortalOptions['policyConfiguration'];
    beforeActivate?: import('./productionRawPortal').RawPortalOptions['beforeActivate'];
  } = {}
) {
  const appPath = await mkdtemp(path.join(tmpdir(), 'fm020-installed-'));
  for (const folder of ['views', 'assets', '.tmp/public']) await mkdir(path.join(appPath, folder), { recursive: true });
  const extensionPath = path.join(appPath, 'node_modules/fm020-storage');
  await mkdir(extensionPath, { recursive: true });
  await writeFile(
    path.join(appPath, 'package.json'),
    JSON.stringify({ name: 'fm020-app', dependencies: { 'fm020-storage': '1.0.0' }, hookLoadPriority: [] })
  );
  await writeFile(
    path.join(extensionPath, 'package.json'),
    JSON.stringify({ name: 'fm020-storage', version: '1.0.0', main: 'index.cjs', redbox: { extension: '.' } })
  );
  const storagePath = path.resolve(__dirname, '../../../../sails-hook-redbox-storage-mongo/dist/extension.js');
  const controllersPath = path.resolve(__dirname, '../../../src/http/controllers');
  await writeFile(
    path.join(extensionPath, 'index.cjs'),
    `
const storage = require(${JSON.stringify(storagePath)});
exports.inspectPrismaStagedStorage = storage.inspectPrismaStagedStorage;
exports.ensurePrismaStagedStorageIndexes = storage.ensurePrismaStagedStorageIndexes;
const echo = { name: 'RawSiblingController', actions: ['echo'], create: () => ({ echo: async request => ({ body: request.body }) }) };
const { addDataStreamsRoute: source } = require(${JSON.stringify(path.resolve(__dirname, '../../../src/api-routes/groups/records'))});
const { coreRouteName } = require(${JSON.stringify(path.resolve(__dirname, '../../../src/http/fastify/routes'))});
exports.bindings = () => [require(${JSON.stringify(controllersPath)}).bindControllerFactory(echo, undefined)];
exports.registerRedboxExtension = () => ({ ...storage.registerRedboxExtension(), apiVersion: ${2},
  ${"controllers: [echo], routes: [{ name: 'raw-sibling', method: 'post', path: '/echo', controller: echo.name, action: 'echo', access: { kind: 'public' } }, ...(exports.uploadRequest ? [{ name: coreRouteName(source.method, source.path), method: source.method, path: source.path, controller: source.controller, action: source.action, access: { kind: 'policies', names: ['nocache', 'brandingandportal', 'iswebserviceauthenticated', 'brandactor', 'checkauth'] }, replaces: true, csrf: source.csrf, api: { ...source, request: exports.uploadRequest } }] : [])]"}
});`
  );
  require(path.join(extensionPath, 'index.cjs')).uploadRequest = options.uploadRequest;
  let sockets!: ProgressSockets, multipart!: StreamingMultipart, server!: Server;
  let preparedBeforeListening = false,
    closeCalls = 0,
    listenCalls = 0,
    receiveCalls = 0,
    finalizations = 0;
  let uploadGate: ReturnType<typeof deferred> | undefined,
    providerGate: ReturnType<typeof deferred> | undefined,
    authenticationGate: ReturnType<typeof deferred> | undefined;
  let writeEntered = deferred(),
    authenticationEntered = deferred();
  function instrumentMultipart(value: StreamingMultipart) {
    multipart = value;
    const disk = Reflect.get(multipart, 'disk');
    const put = disk.putStream.bind(disk);
    disk.putStream = async (key: string, stream: Readable) => {
      receiveCalls++;
      writeEntered.resolve();
      await uploadGate?.promise;
      try {
        return await put(key, stream);
      } finally {
        await providerGate?.promise;
      }
    };
  }
  function instrumentSockets(value: ProgressSockets) {
    sockets = value;
    const input = Reflect.get(sockets, 'input');
    const authenticate = input.authenticate;
    input.authenticate = async (credential: Parameters<typeof authenticate>[0]) => {
      authenticationEntered.resolve();
      await authenticationGate?.promise;
      return authenticate(credential);
    };
    server = Reflect.get(sockets, 'io').httpServer;
  }
  try {
    const f = await productionRawPortal(native, appPath, {
      companion: options.companion,
      port: options.port,
      declarations: options.declarations,
      policyConfiguration: options.policyConfiguration,
      beforeActivate: async host => {
        const base = 'http://127.0.0.1:' + host.address()!.port;
        for (const path of [socketPath + '/socket.io.js', socketPath + '/?EIO=4&transport=polling']) {
          const response = await fetch(base + path, { headers: { Origin: canonical } });
          assert.equal(response.status, 503);
          await response.text();
        }
        await options.beforeActivate?.(host);
      },
      prepare: async portal => {
        const raw = portal.installation.raw!;
        assert.equal(raw.upload, true);
        assert.equal(raw.progress, true);
        assert.equal(Reflect.get(raw.multipart, 'limits').fileSize, portal.config.record.maxUploadSize);
        assert.equal(
          portal.installation.controllerRegistrations.some(item => item.declaration.actions.includes('addDataStreams')),
          true
        );
        instrumentMultipart(raw.multipart);
        instrumentSockets(raw.sockets);
        assert.equal(server.listening, false);
        assert.equal(server.address(), null);
        preparedBeforeListening = true;
        const close = server.close,
          listen = server.listen;
        server.close = function (...args) {
          closeCalls++;
          return close.apply(this, args);
        };
        server.listen = function (this: Server, ...args: Parameters<Server['listen']>) {
          listenCalls++;
          return listen.apply(this, args);
        } as Server['listen'];
      },
    });
    const add = f.datastream.addDatastreams.bind(f.datastream);
    f.datastream.addDatastreams = async (...args) => {
      finalizations++;
      return add(...args);
    };
    const staging = f.disks.getStagingDiskConfig();
    assert.equal(staging.driver, 'fs');
    return {
      ...f,
      sockets,
      multipart,
      server,
      bindings: { ...f, records: f.writer, log: f.portal.log },
      preparedBeforeListening,
      closeCalls: () => closeCalls,
      listenCalls: () => listenCalls,
      receiveCalls: () => receiveCalls,
      finalizations: () => finalizations,
      files: () =>
        readdir(staging.config.root).catch(error => {
          if (error.code === 'ENOENT') return [];
          throw error;
        }),
      holdUpload() {
        uploadGate = deferred();
        writeEntered = deferred();
        return { entered: writeEntered.promise, release: () => uploadGate?.resolve() };
      },
      holdProvider() {
        providerGate = deferred();
        return { release: () => providerGate?.resolve() };
      },
      holdAuthentication() {
        authenticationGate = deferred();
        authenticationEntered = deferred();
        return { entered: authenticationEntered.promise, release: () => authenticationGate?.resolve() };
      },
      async close() {
        uploadGate?.resolve();
        providerGate?.resolve();
        authenticationGate?.resolve();
        await f.close();
        await assertOwnedHttpClosed(f.host, f.owner, server);
        // The immutable FM-019 Express adapter predates explicit TCP-upgrade
        // leases; current/native owners must additionally empty that set.
        for (const name of ['pending', 'grants', 'connections', 'upgraded'])
          assert.equal(Reflect.get(sockets, name).size, 0, 'Stopped progress owner: ' + name);
        assert.equal(Reflect.get(sockets, 'io'), undefined);
        assert.equal(Reflect.get(multipart, 'pending').size, 0);
        assert.equal(Reflect.get(multipart, 'cleanup').size, 0);
        assert.equal(persistenceStatus(f.owner).pools, 0);
        await rm(appPath, { recursive: true, force: true });
      },
    };
  } catch (error) {
    await rm(appPath, { recursive: true, force: true });
    throw error;
  }
}
