import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Server } from 'node:http';
import { after, before, test } from 'node:test';
import * as lodash from 'lodash';
import { brandingAndPortal } from '../../../../packages/redbox-core/src/policies/brandingAndPortal';
import { checkBrandingValid } from '../../../../packages/redbox-core/src/policies/checkBrandingValid';
import { checkAuth } from '../../../../packages/redbox-core/src/policies/checkAuth';
import { isWebServiceAuthenticated } from '../../../../packages/redbox-core/src/policies/isWebServiceAuthenticated';
import { noCache } from '../../../../packages/redbox-core/src/policies/noCache';
import { Services } from '../../../../packages/redbox-core/src/services/RecordsService';
import { createPrototypeActions, prototypeConfig } from './sails';
import { caller, fixtureContracts, recordFor } from './fixtures';
import { metadataTypeName } from './renderer';
import type { ReadRecord } from './access';

interface HarnessApp {
  lift(config: Record<string, unknown>, callback: (error?: Error) => void): void;
  lower(callback: (error?: Error) => void): void;
  hooks: { http: { server: Server } };
}

const { Sails: SailsApplication } = require('sails') as { Sails: new () => HarnessApp };
const app = new SailsApplication();
let appPath: string;
let origin: string;
let reads = 0;
let record: ReadRecord;
let richType: string;
const seenPolicies: string[] = [];

before(async () => {
  const contracts = await fixtureContracts();
  record = recordFor(contracts[1]);
  richType = metadataTypeName(contracts[1]);
  const recordsService = new Services.Records();
  const branding = {
    getBrand: (name: string) => ({ ...caller.brand, name, id: name === 'default' ? 'brand-default' : 'brand-other' }),
    getAvailable: () => ['default', 'other'],
  };
  Object.assign(globalThis, {
    _: lodash,
    BrandingService: branding,
    RolesService: {
      getDefUnathenticatedRole: () => ({ id: 'guest', name: 'Guest' }),
      getRole: (_brand: unknown, name: string) => ({ id: `${name}-id`, name }),
    },
    PathRulesService: {
      getRulesFromPath: () => [{}],
      canRead: (_rules: unknown, roles: { id: string }[]) => roles.some(role => role.id === 'viewer-role'),
    },
  });
  const actions = createPrototypeActions(contracts, {
    getMeta: async oid => {
      reads += 1;
      return oid === record.redboxOid ? record : null;
    },
    hasViewAccess: recordsService.hasViewAccess.bind(recordsService),
    getBrand: branding.getBrand,
  });
  const realPolicies: Record<string, (req: Sails.Req, res: Sails.Res, next: Sails.NextFunction) => unknown> = {
    noCache,
    brandingAndPortal,
    checkBrandingValid,
    isWebServiceAuthenticated,
    checkAuth,
  };
  const policyFns = Object.fromEntries(
    prototypeConfig.policies['webservice/RecordMetadataPrototypeController']['*'].map(name => [
      name,
      (req: Sails.Req, res: Sails.Res, next: Sails.NextFunction) => {
        seenPolicies.push(name);
        if (name === 'isWebServiceAuthenticated')
          req.isAuthenticated = function (): this is Express.AuthenticatedRequest {
            return Boolean(this.user);
          };
        return realPolicies[name] ? realPolicies[name](req, res, next) : next();
      },
    ])
  );
  Object.assign(globalThis, {
    investigationActions: { graphql: actions.graphql, projection: actions.projection },
    investigationPolicyFns: policyFns,
  });
  appPath = await mkdtemp(path.join(tmpdir(), 'redbox-graphql-investigation-'));
  await mkdir(path.join(appPath, 'api/controllers/webservice'), { recursive: true });
  await mkdir(path.join(appPath, 'api/policies'), { recursive: true });
  await writeFile(
    path.join(appPath, 'api/controllers/webservice/RecordMetadataPrototypeController.js'),
    'module.exports = globalThis.investigationActions;\n'
  );
  for (const name of Object.keys(policyFns))
    await writeFile(
      path.join(appPath, `api/policies/${name}.js`),
      `module.exports = globalThis.investigationPolicyFns[${JSON.stringify(name)}];\n`
    );
  await new Promise<void>((resolve, reject) =>
    app.lift(
      {
        appPath,
        host: '127.0.0.1',
        port: 0,
        environment: 'test',
        log: { level: 'error' },
        globals: { sails: true, _: false, async: false, models: false, services: false },
        hooks: { orm: false, grunt: false, views: false, sockets: false, pubsub: false },
        session: { secret: 'local-investigation-fixture-only' },
        ...structuredClone(prototypeConfig),
        passport: {
          authenticate:
            (
              _strategy: string,
              callback: (error: null, user: Record<string, unknown> | false, info: unknown) => void
            ) =>
            (req: Sails.Req) => {
              const token = req.headers.authorization;
              const user =
                token === 'Bearer reader'
                  ? caller.user
                  : token === 'Bearer stranger'
                    ? { ...caller.user, username: 'stranger' }
                    : token === 'Bearer route-denied'
                      ? { ...caller.user, roles: [] }
                      : false;
              callback(null, user, undefined);
            },
        },
      },
      error => (error ? reject(error) : resolve())
    )
  );
  const address = app.hooks.http.server.address();
  if (!address || typeof address === 'string') throw new Error('Expected an ephemeral HTTP port.');
  origin = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  if (origin) await new Promise<void>((resolve, reject) => app.lower(error => (error ? reject(error) : resolve())));
  if (appPath) await rm(appPath, { recursive: true, force: true });
});

async function request(method: string, route: string, token?: string, body?: unknown) {
  const response = await fetch(`${origin}${route}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : undefined, headers: response.headers };
}

test('dispatches Yoga through Sails with the existing API policy chain and bearer authentication', async () => {
  const start = reads;
  seenPolicies.length = 0;
  const response = await request('POST', '/default/rdmp/api/graphql', 'reader', {
    query: `{ record(oid: "draft") { oid metadata { ... on ${richType} { title } } } }`,
  });
  assert.equal(response.status, 200);
  assert.equal(response.body.errors, undefined, JSON.stringify(response.body));
  assert.equal(response.body.data.record.oid, 'draft');
  assert.deepEqual(seenPolicies, prototypeConfig.policies['webservice/RecordMetadataPrototypeController']['*']);
  assert.equal(reads - start, 1);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
});

test('blocks unauthenticated and route-denied requests before storage access', async () => {
  for (const token of [undefined, 'route-denied']) {
    const start = reads;
    const response = await request('POST', '/default/rdmp/api/graphql', token, {
      query: '{ record(oid: "draft") { oid } }',
    });
    assert.ok([401, 403].includes(response.status));
    assert.equal(reads, start);
  }
});

test('preserves record denial and brand isolation through GraphQL and projection HTTP routes', async () => {
  const denied = await request('POST', '/default/rdmp/api/graphql', 'stranger', {
    query: '{ record(oid: "draft") { oid } }',
  });
  assert.equal(denied.body.data.record, null);
  assert.equal(denied.body.errors[0].extensions.code, 'RECORD_FORBIDDEN');
  const crossBrand = await request('POST', '/other/rdmp/api/graphql', 'reader', {
    query: '{ record(oid: "draft") { oid } }',
  });
  assert.equal(crossBrand.body.errors[0].extensions.code, 'RECORD_NOT_FOUND');
  assert.equal((await request('GET', '/default/rdmp/api/record-metadata-projection/draft', 'stranger')).status, 403);
  assert.equal((await request('GET', '/other/rdmp/api/record-metadata-projection/draft', 'reader')).status, 404);
});

test('preserves full default metadata and applies projection only when fields is supplied', async () => {
  const start = reads;
  const full = await request('GET', '/default/rdmp/api/record-metadata-projection/draft', 'reader');
  assert.deepEqual(full.body, { data: record.metadata, meta: { oid: 'draft' } });
  const selected = await request(
    'GET',
    '/default/rdmp/api/record-metadata-projection/draft?fields=%2Ftitle,%2Fcontributors%2Fname',
    'reader'
  );
  assert.deepEqual(selected.body.data, {
    title: record.metadata.title,
    contributors: [{ name: 'Stored historical value' }, { name: 'Stored historical value' }],
  });
  assert.equal(reads - start, 2);
});

test('bounds response size and rejects malformed projection input', async () => {
  const original = record;
  record = { ...record, metadata: { ...record.metadata, title: 'x'.repeat(270_000) } };
  try {
    const graphql = await request('POST', '/default/rdmp/api/graphql', 'reader', {
      query: `{ record(oid: "draft") { metadata { ... on ${richType} { title } } } }`,
    });
    assert.equal(graphql.status, 413);
    const rest = await request('GET', '/default/rdmp/api/record-metadata-projection/draft?fields=%2Ftitle', 'reader');
    assert.equal(rest.status, 413);
  } finally {
    record = original;
  }
  assert.equal(
    (await request('GET', '/default/rdmp/api/record-metadata-projection/draft?fields=title', 'reader')).status,
    400
  );
});
