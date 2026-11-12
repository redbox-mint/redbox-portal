import assert from 'node:assert/strict';
import { IncomingMessage } from 'node:http';
import { Socket } from 'node:net';
import { EventEmitter } from 'node:events';
import { of } from 'rxjs';
import { ResumableUploads } from '../../../src/http/express/resumableUploads';
import { StreamingMultipart } from '../../../src/http/express/multipart';
import { hasViewAccess, hasEditAccess } from '../../../src/records/access';
import express, { type RequestHandler } from 'express';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { requestContext as nativeContext } from '../../../src/http/context';
import { createHttpPolicies } from '../../../src/http/express/policies';
import { expressRuntimePath } from '../../../src/http/fastify/routes';
import { sendLoginRedirect } from '../../../src/http/fastify/responses';
import { requestStrings, requestText } from '../../../src/http/requestValues';
import type { InventoryRoute } from './inventory-fixture';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Module from 'node:module';
import { cloneDeep } from 'lodash';
import { nothingLogger, type ILogger } from '@researchdatabox/sails-ng-common';
import { PathRules } from '../../../src/authorization/PathRules';
import { PortalHttp } from '../../../src/application/portal/http';
import { ExpressHost } from '../../../src/http/express/ExpressHost';
import { loadPortalConfiguration } from '../../../src/configuration/portal';
import { initializeSiemPersistence } from '../../../src/persistence/siem/runtime';
import { ensureSiemPersistenceIndexes } from '../../../src/persistence/siem/preflight';
import { prepareSessionIndexes } from '../../../src/persistence/sessions/indexes';
import { mongoFixture } from '../mongoFixture';
import { canonical } from './securityFixture';

type Mongo = Awaited<ReturnType<typeof mongoFixture>>;
export async function productionActors(mongo: Mongo, openPaths = false) {
  const hash = (token: string) => createHash('sha256').update(token).digest('base64');
  const role = await mongo.identities.create('role', { name: 'Admin', branding: mongo.otherBrand.id });
  await mongo.identities.create('user', {
    username: 'foreign',
    name: 'Foreign',
    email: 'foreign@example.invalid',
    type: 'local',
    token: hash('foreign-token'),
    roles: [role.id],
  });
  await mongo.identities.create('user', {
    username: 'wrong-role',
    name: 'Reader',
    email: 'reader@example.invalid',
    type: 'local',
    token: hash('wrong-role-token'),
    roles: [mongo.reader.id],
  });
  await mongo.identities.create('pathrule', {
    path: '/:branding/:portal(/*)',
    role: mongo.role.id,
    branding: mongo.brand.id,
    can_read: true,
  });
  const rules = new PathRules(() =>
    openPaths ? Promise.resolve([]) : mongo.identities.list('pathrule', {}, { populate: ['role', 'branding'] })
  );
  await rules.loadRules();
  return rules;
}

/** Loads a physical temporary copy of the compiled production composition. Only
 * negative controls pass a mutation; the normal oracle uses PortalHttp directly. */
function copiedComposition(mutation: 'mount' | 'policy') {
  const original = require.resolve('../../../dist/application/portal/http');
  const source = readFileSync(original, 'utf8');
  const altered =
    mutation === 'mount'
      ? source.replace('http.mountQueryReadRoutes(router, {', 'if (false) http.mountQueryReadRoutes(router, {')
      : source.replace(
          'const { policyConfiguration } = (0, httpPlan_1.portalHttpPlan)(this.portal, this.options);',
          "const policyConfiguration = { '*': ['nocache', 'brandingandportal', 'iswebserviceauthenticated', 'brandactor'] };"
        );
  assert.notEqual(altered, source, 'Negative control must change the production source');
  const directory = mkdtempSync(path.join(tmpdir(), 'fm016-review-oracle-'));
  const copy = path.join(directory, 'http.js');
  try {
    writeFileSync(copy, altered);
    const loaded = new (Module as any)(original, module);
    loaded.filename = original;
    loaded.paths = (Module as any)._nodeModulePaths(path.dirname(original));
    loaded._compile(readFileSync(copy, 'utf8'), original);
    return loaded.exports.PortalHttp as typeof PortalHttp;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

export async function productionSecurityFixture(mutation?: 'mount' | 'policy', openPaths = false, logger?: ILogger) {
  const mongo = await mongoFixture();
  let host: ExpressHost | undefined;
  try {
    const pathRules = await productionActors(mongo, openPaths);
    const actions: any[] = [];
    const domainCalls: string[] = [];
    await ensureSiemPersistenceIndexes(mongo.owner);
    await initializeSiemPersistence(mongo.owner);
    const config = cloneDeep(
      await loadPortalConfiguration({
        env: { REDBOX_SESSION_SECRET: 'fm016-session-secret-000000000000000001' },
        argv: [],
      })
    );
    Object.assign(config.server, { publicUrl: canonical, rootContext: '/portal' });
    Object.assign(config.auth, { defaultBrand: 'default', defaultPortal: 'rdmp' });
    Object.assign(config.brandingConfigurationDefaults.auth, { active: [] });
    Object.assign(config.redboxSession, {
      adapter: 'mongo',
      mongoUrl: process.env.HTTP_PILOT_TEST_MONGO_URL!.replace('/sr_p4_http', '/' + mongo.native.db().databaseName),
      name: 'fm016.sid',
      collection: 'fm016Sessions',
      secret: 'fm016-session-secret-000000000000000001',
      cookie: { secure: false },
    });
    await prepareSessionIndexes(mongo.owner, config.redboxSession, 'ensure');
    // These are domain ports only. Route registration, policy creation, parsers,
    // session and authentication all come from the unchanged production module.
    const service = new Proxy(
      {},
      {
        get: (_object, key) => {
          if (key === 'then') return undefined;
          if (key === 'getMeta')
            return async (oid: string) => {
              domainCalls.push('getMeta');
              return {
                oid,
                metaMetadata: {
                  brandId: oid === 'foreign-record' ? mongo.otherBrand.id : mongo.brand.id,
                  type: 'value',
                  form: 'value',
                  workflow: { stage: 'draft' },
                },
                metadata: {},
                authorization: { view: ['pilot-admin'], edit: ['pilot-admin'] },
              };
            };
          if (key === 'addUserAuditEvent') return async () => {};
          if (key === 'getDeletedRecordMeta') return async () => null;
          if (key === 'hasViewAccess') return hasViewAccess;
          if (key === 'hasEditAccess') return hasEditAccess;
          if (key === 'hasCreateAccess') return (_brand: unknown, user: any) => user?.username === 'pilot-admin';
          if (key === 'list')
            return () => {
              domainCalls.push('list');
              return [];
            };
          return () => {
            domainCalls.push(String(key));
            throw new Error('Controlled downstream failure');
          };
        },
      }
    );
    const ref: any = new Proxy(
      { pathRules },
      { get: (object, key) => Reflect.get(object, key) ?? { get: () => service } }
    );
    ref.branding = {
      get: () => ({
        getDefault: () => mongo.brand,
        getBrand: (name: string) =>
          name === 'default' ? mongo.brand : name === 'other' ? mongo.otherBrand : undefined,
        getBrandById: (id: string) => (id === mongo.brand.id ? mongo.brand : mongo.otherBrand),
        getActiveTypefaceFontInfo: () => null,
      }),
    };
    ref.appConfigs = { get: () => ({ getAppConfigurationForBrand: () => ({ auth: { active: [] } }) }) };
    ref.types = { get: () => ({ get: () => of({ name: 'value', packageType: 'value' }), getAll: () => of([]) }) };
    ref.workflows = { get: () => ({ getFirst: () => of({ name: 'draft' }) }) };
    ref.entries = { get: () => ({ listLanguages: async () => [{ code: 'en', displayName: 'English' }] }) };
    ref.translation = { get: () => ({ t: (key: string) => key }) };
    ref.roles = { get: () => ({ getDefUnathenticatedRole: () => undefined }) };
    const data: any = new Proxy(
      { reference: ref, storage: () => service, disks: { get: () => ({ stagingDisk: () => service }) } },
      { get: (object, key) => Reflect.get(object, key) ?? { get: () => service } }
    );
    const providers = new Proxy(
      { security: { get: () => ({ emitSecurityEvent: async () => {} }) } },
      { get: (object, key) => Reflect.get(object, key) ?? { get: () => service } }
    );
    const portal = {
      data,
      providers,
      config,
      owner: mongo.owner,
      log: logger ?? nothingLogger,
      models: service,
      prepareExtensions: async () => {},
    };
    const Composition = mutation ? copiedComposition(mutation) : PortalHttp;
    const production = new Composition(portal as any, {
      appPath: process.cwd(),
      portals: ['rdmp'],
      ...(logger ? { requestLogging: { successSampleRate: 1, successSampleExcludePattern: '' } } : {}),
      actions: {
        value: {
          authorize: async context => context.actor.username === 'pilot-admin',
          execute: async () => ({ ok: true }),
        },
      },
    });
    // Stub resource/domain collaborators, never route handlers or their security preludes.
    const uploads = new ResumableUploads({
      disk: service as any,
      records: service as any,
      maxSize: 1024 * 1024,
      origins: [canonical],
      rootContext: '/portal',
      log: nothingLogger,
      authorizePending: async context => context.actor?.username === 'pilot-admin',
      audit: async () => {},
    });
    const multipart = new StreamingMultipart(service as any, { files: 1, fileSize: 1024, fields: 1, fieldSize: 1024 });
    Object.assign(production, {
      artifacts: {
        assets: [],
        bundleHash: () => '',
        view: (name: string) => name,
        layout: () => 'layout',
        render: (name: string) => '<html>' + name + '</html>',
        find: () => undefined,
      },
      logos: service,
      multipart,
      uploads,
      sockets: { attach() {} },
    });
    host = new ExpressHost(mongo.application, {
      owner: mongo.owner,
      hostname: '127.0.0.1',
      port: 0,
      rootContext: '/portal',
      prepare: async (router, server) => {
        await production.prepare(router, server);
        // Read-only references to the actual production actions for the native
        // test adapter. The Express stack is never modified.
        actions.push(...(router as any).stack.filter((layer: any) => layer.route));
      },
    });
    await host.initialize();
    await host.activate();
    return {
      mongo,
      host,
      domainCalls,
      action(row: InventoryRoute) {
        const layer = actions.find(
          layer =>
            (Array.isArray(layer.route.path) ? layer.route.path : [layer.route.path]).includes(
              expressRuntimePath(row.original.path)
            ) &&
            (layer.route.methods[row.method] || layer.route.methods._all)
        );
        assert(layer, 'Production action must exist: ' + row.name);
        return nativeAction(
          layer.route.stack.slice(row.action === 'aafLogin' ? -2 : -1).map((entry: any) => entry.handle),
          mongo
        );
      },
      url: `http://127.0.0.1:${host.address()!.port}/portal`,
      async close() {
        await host!.stop();
        await uploads.close();
        await multipart.close();
        await mongo.close();
      },
    };
  } catch (error) {
    await host?.stop();
    await mongo.close();
    throw error;
  }
}

/** Test transport adapter only: it runs the unchanged real action, never a
 * replacement authorization prelude. Native policies/CSRF/parsing/session run
 * before entry. Later FM controller tasks replace this test adapter. */
function nativeAction(handlers: RequestHandler[], mongo: Mongo) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const url = request.raw.url!.replace(/^\/portal/, '') || '/';
    const req: any = new IncomingMessage(new Socket());
    Object.setPrototypeOf(req, express.request);
    req.push(null);
    const query = request.query as Record<string, unknown>;
    // Native response negotiation ignores structured version values. Keep an
    // invalid object marker for the real action's own query-shape validation,
    // while preventing the legacy response helper from coercing attacker data.
    const version = (value: unknown) => requestStrings(value) ?? (value && typeof value === 'object' ? {} : undefined);
    Object.defineProperties(req, {
      method: { enumerable: true, value: request.method },
      protocol: { enumerable: true, value: request.protocol },
      url: { enumerable: true, value: url, writable: true },
      originalUrl: { enumerable: true, value: '/portal' + url },
      headers: {
        enumerable: true,
        value: {
          ...request.headers,
          accept: requestText(request.headers.accept),
          'x-redbox-api-version': requestStrings(request.headers['x-redbox-api-version']),
        },
      },
      query: {
        enumerable: true,
        value: {
          ...query,
          ...(Object.hasOwn(query, 'apiVersion') ? { apiVersion: version(query.apiVersion) } : {}),
          ...(Object.hasOwn(query, 'apiversion') ? { apiversion: version(query.apiversion) } : {}),
        },
      },
      params: { enumerable: true, value: { ...(request.params as object) } },
      body: { enumerable: true, value: request.body },
      session: {
        enumerable: true,
        value: new Proxy(
          {},
          {
            get: (_target, key) =>
              typeof key === 'string' && ['save', 'destroy', 'regenerate'].includes(key)
                ? (callback: (error?: Error) => void) => (request.session as any)[key](callback)
                : (request.session as any)?.get(String(key)),
            set: (_target, key, value) => {
              (request.session as any).set(String(key), value);
              return true;
            },
          }
        ),
      },
    });
    const lifetime = Symbol.for('@researchdatabox/redbox-core/http-request-lifetime/v1');
    req[lifetime] = Reflect.get(request, lifetime);
    let context;
    try {
      context = nativeContext(request);
    } catch {
      /* genuinely unbranded */
    }
    if (context) {
      // Equivalent independently created databases have different identifiers.
      // Preserve native brand membership while translating fixture IDs only.
      const brand = context.brand.name === 'other' ? mongo.otherBrand : mongo.brand;
      context = {
        ...context,
        brand,
        actor: context.actor && {
          ...context.actor,
          roles: context.actor.roles.map(role => ({ ...role, brandId: brand.id })),
        },
      };
      const policies = createHttpPolicies({
        branding: { getBrand: async () => context!.brand } as any,
        portals: [context.portal],
        authenticate: async () => context!.actor ?? false,
      } as any);
      // These two helpers transfer the already-resolved immutable native facts
      // into the Express action's private context; they make no auth decisions.
      for (const policy of [policies.brandingandportal, policies.browseractor])
        await new Promise<void>((resolve, reject) =>
          policy(req, {} as any, error => (error ? reject(error) : resolve()))
        );
    }
    await new Promise<void>((resolve, reject) => {
      const chunks: Buffer[] = [];
      const res: any = {
        get headersSent() {
          return reply.sent;
        },
        get writableEnded() {
          return reply.sent;
        },
        get statusCode() {
          return reply.statusCode;
        },
        set statusCode(code: number) {
          reply.code(code);
        },
        status(code: number) {
          reply.code(code);
          return res;
        },
        set(name: string | Record<string, any>, value?: string) {
          if (typeof name === 'string') reply.header(name, value!);
          else reply.headers(name);
          return res;
        },
        setHeader(name: string, value: string) {
          reply.header(name, value);
        },
        contentType(value: string) {
          return res.type(value);
        },
        writeHead(code: number, reasonOrHeaders?: unknown, rawHeaders?: string[]) {
          reply.code(code);
          const headers = rawHeaders ?? reasonOrHeaders;
          if (Array.isArray(headers))
            for (let i = 0; i < headers.length; i += 2) reply.header(headers[i], headers[i + 1]);
          else if (headers && typeof headers === 'object') reply.headers(headers as Record<string, string>);
          return res;
        },
        write(value: string | Buffer) {
          chunks.push(Buffer.from(value));
          return true;
        },
        getHeader(name: string) {
          return reply.getHeader(name);
        },
        get(name: string) {
          return reply.getHeader(name);
        },
        header(name: string, value: string) {
          return res.set(name, value);
        },
        removeHeader(name: string) {
          reply.removeHeader(name);
        },
        type(value: string) {
          reply.type(
            require('mime-types').contentType(value.includes('/') ? value : require('mime-types').lookup(value)) ||
              value
          );
          return res;
        },
        send(value?: unknown) {
          if (typeof value === 'string' && !reply.hasHeader('content-type')) reply.type('text/html; charset=utf-8');
          reply.send(value);
          resolve();
          return res;
        },
        json(value?: unknown) {
          if (!reply.hasHeader('content-type')) reply.type('application/json');
          return res.send(typeof value === 'string' ? JSON.stringify(value) : value);
        },
        end(value?: unknown, _encoding?: unknown, callback?: () => void) {
          if (typeof value === 'function') {
            callback = value as () => void;
            value = undefined;
          }
          if (chunks.length) {
            if (value) chunks.push(Buffer.from(value as string));
            value = Buffer.concat(chunks);
          }
          res.send(value);
          callback?.();
          return res;
        },
        redirect(target: string) {
          sendLoginRedirect(request, reply, target);
          resolve();
        },
        sendStatus(code: number) {
          reply.code(code);
          reply.type('text/plain');
          return res.send(require('node:http').STATUS_CODES[code]);
        },
      };
      Object.setPrototypeOf(res, EventEmitter.prototype);
      EventEmitter.call(res);
      let index = 0;
      const next = (error?: unknown): void => {
        if (error) {
          reject(error);
          return;
        }
        const handler = handlers[index++];
        if (!handler) {
          resolve();
          return;
        }
        try {
          const work = handler(req, res, next);
          if (work && typeof (work as any).then === 'function') (work as any).catch(reject);
        } catch (error) {
          reject(error);
        }
      };
      next();
    });
    req.destroy();
    return reply;
  };
}
