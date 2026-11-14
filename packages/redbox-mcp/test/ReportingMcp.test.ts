import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Client, InMemoryTransport, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createLocalJWKSet, errors, exportJWK, generateKeyPair, SignJWT, type JWTVerifyGetKey } from 'jose';
import {
  BrandingModel,
  Controllers,
  RoleModel,
  UserModel,
  ReportingError,
  reportingPrincipal,
  type ReportingApi,
} from '@researchdatabox/redbox-core';
import { createReportingMcpServer } from '../src/server';
import { McpAuthenticator, McpAuthError, resolveOidcIdentity } from '../src/auth';
import { mcp, mcpConfigSchema, type McpConfig } from '../src/config';
import { reportingMcpHttpHandler } from '../src/http';

const brand = Object.assign(new BrandingModel(), { id: 'brand-a', name: 'a' });
const role = Object.assign(new RoleModel(), { id: 'role-a', name: 'Researcher', branding: brand });
brand.roles = [role];
const user = Object.assign(new UserModel(), { id: 'alice-id', username: 'alice', type: 'oidc', roles: [role] });
const principal = reportingPrincipal(brand, user);
const config: McpConfig = {
  enabled: true,
  resourceUrl: 'https://redbox.example/a/mcp',
  issuer: 'https://id.example',
  jwksUrl: 'https://id.example/jwks',
  brand: 'a',
  scope: 'redbox.reporting',
  identityClaim: 'sub',
  usernameToLowercase: false,
  identityBindings: [{ issuer: 'https://id.example', subject: 'alice', username: 'alice' }],
  algorithms: ['RS256'],
  allowedOrigins: [],
  maxRequestBytes: 16_000,
};
let invocations: Array<{ actor: unknown; input: unknown; audit: unknown }> = [];
const reporting: ReportingApi = {
  async getReportingSchema(actor, input, audit) {
    invocations.push({ actor, input, audit });
    return {
      recordType: input.recordType,
      fields: [],
      limits: {
        maxPageSize: 100,
        maxGroups: 100,
        maxOffset: 10000,
        maxFilters: 20,
        maxGroupDimensions: 3,
        maxDateRangeDays: 3660,
        aggregationTimeoutMs: 5000,
        maxSearchResults: 50,
        maxOutputBytes: 64000,
      },
      dateSemantics: 'UTC',
      metadataFormCoverage: [],
    };
  },
  async execute(actor, input, audit) {
    invocations.push({ actor, input, audit });
    return { count: 10 };
  },
};

async function connection(resolve = async () => principal, service = reporting) {
  const server = createReportingMcpServer(service, resolve);
  const client = new Client({ name: 'reporting-test', version: '1.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return {
    client,
    close: async () => {
      await client.close();
      await server.close();
    },
  };
}
describe('ReDBox MCP hook registration', () => {
  it('registers a callable hook, controller and closed defaults without requiring a Sails lift', () => {
    const hook = require('../src/index') as {
      registerRedboxConfig(): {
        mcp: { enabled: boolean };
        routes: Record<string, unknown>;
        policies: Record<string, unknown>;
      };
      registerRedboxControllers(): Record<string, unknown>;
      createReportingMcpServer: unknown;
    };
    assert.equal(typeof hook, 'function');
    assert.equal(typeof hook.createReportingMcpServer, 'function');
    assert.equal(hook.registerRedboxConfig().mcp.enabled, false);
    assert.ok(hook.registerRedboxConfig().routes['/:branding/mcp']);
    assert.equal(hook.registerRedboxConfig().routes['/mcp'], undefined);
    assert.deepEqual(
      hook.registerRedboxConfig().routes['options /.well-known/oauth-protected-resource/:branding/mcp'],
      {
        controller: 'McpController',
        action: 'handle',
        csrf: false,
      }
    );
    assert.deepEqual(hook.registerRedboxConfig().policies.McpController, { '*': [] });
    assert.ok(hook.registerRedboxControllers().McpController);
  });
});

describe('Official MCP client tool integration', () => {
  beforeEach(() => {
    invocations = [];
  });
  it('discovers typed tools with read-only annotations and no principal/path/raw query inputs', async () => {
    const { client, close } = await connection();
    try {
      const { tools } = await client.listTools();
      assert.deepEqual(tools.map(tool => tool.name).sort(), [
        'count_records',
        'get_record',
        'get_reporting_schema',
        'group_records',
        'list_records',
        'search_records',
        'time_series',
      ]);
      for (const tool of tools) {
        assert.equal(tool.annotations?.readOnlyHint, true);
        assert.equal(tool.inputSchema.additionalProperties, false);
        assert.ok(!JSON.stringify(tool.inputSchema).includes('brandId'));
      }
    } finally {
      await close();
    }
  });
  it('passes a server-resolved principal and validated query into the reporting engine with tool audit metadata', async () => {
    const { client, close } = await connection();
    try {
      const result = await client.callTool({
        name: 'count_records',
        arguments: {
          recordType: 'rdmp',
          filters: [{ field: 'created', operator: 'between', start: '2026-01-01', end: '2027-01-01' }],
        },
      });
      assert.deepEqual(result.structuredContent, { count: 10 });
      assert.equal(invocations.length, 1);
      assert.equal(invocations[0].actor, principal);
      assert.deepEqual(invocations[0].audit, { channel: 'mcp', tool: 'count_records' });
      assert.equal(Reflect.get(invocations[0].input as object, 'operation'), 'count');
      await client.callTool({ name: 'get_reporting_schema', arguments: { recordType: 'rdmp' } });
      assert.deepEqual(invocations[1].audit, { channel: 'mcp', tool: 'get_reporting_schema' });
    } finally {
      await close();
    }
  });
  it('validates unknown keys, malformed filters, excessive limits and arbitrary paths before execution', async () => {
    const { client, close } = await connection();
    try {
      for (const [name, args] of [
        ['count_records', { recordType: 'rdmp', brand: 'other' }],
        ['count_records', { recordType: 'rdmp', filters: [{ field: 'metadata.faculty', operator: 'eq', value: 'A' }] }],
        ['count_records', { recordType: 'rdmp', filters: [{ field: 'faculty', operator: '$where', value: 'x' }] }],
        ['list_records', { recordType: 'rdmp', pagination: { limit: 1000 } }],
      ] as const) {
        const result = await client.callTool({ name, arguments: args });
        assert.equal(result.isError, true);
      }
      assert.equal(invocations.length, 0);
    } finally {
      await close();
    }
  });
  it('rejects missing authentication and sanitizes engine errors', async () => {
    const unauthorized = await connection(async () => {
      throw new ReportingError('AUTHENTICATION_REQUIRED');
    });
    try {
      const result = await unauthorized.client.callTool({ name: 'count_records', arguments: { recordType: 'rdmp' } });
      assert.equal(result.isError, true);
      assert.deepEqual(result.structuredContent, { error: { code: 'AUTHENTICATION_REQUIRED' } });
    } finally {
      await unauthorized.close();
    }
    const failed = await connection(async () => principal, {
      ...reporting,
      execute: async () => {
        throw new Error('mongodb credentials=secret');
      },
    });
    try {
      const result = await failed.client.callTool({ name: 'count_records', arguments: { recordType: 'rdmp' } });
      assert.equal(result.isError, true);
      assert.ok(!JSON.stringify(result).includes('credentials'));
    } finally {
      await failed.close();
    }
  });
});

describe('MCP OAuth resource-server and HTTP boundary', () => {
  let privateKey: Awaited<ReturnType<typeof generateKeyPair>>['privateKey'];
  let keys: JWTVerifyGetKey;
  before(async () => {
    const pair = await generateKeyPair('RS256');
    privateKey = pair.privateKey;
    keys = createLocalJWKSet({ keys: [{ ...(await exportJWK(pair.publicKey)), kid: 'test-key', alg: 'RS256' }] });
  });
  async function token(
    overrides: Record<string, unknown> = {},
    header = { alg: 'RS256', typ: 'at+jwt', kid: 'test-key' }
  ) {
    return new SignJWT({ scope: config.scope, ...overrides })
      .setProtectedHeader(header)
      .setIssuer(config.issuer)
      .setAudience(config.resourceUrl)
      .setSubject('alice')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(privateKey);
  }
  it('validates issuer/audience/signature/expiry/scope and does not use identity before verification', async () => {
    let mapped = 0;
    const auth = new McpAuthenticator(
      config,
      async (username, brandName) => {
        mapped++;
        assert.equal(username, 'alice');
        assert.equal(brandName, 'a');
        return principal;
      },
      keys
    );
    assert.equal(await auth.authenticate(`Bearer ${await token()}`), principal);
    assert.equal(mapped, 1);
    const wrongIssuer = await new SignJWT({ scope: config.scope })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key', typ: 'at+jwt' })
      .setIssuer('https://evil.example')
      .setAudience(config.resourceUrl)
      .setSubject('alice')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(privateKey);
    const wrongAudience = await new SignJWT({ scope: config.scope })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key', typ: 'at+jwt' })
      .setIssuer(config.issuer)
      .setAudience('different-api')
      .setSubject('alice')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(privateKey);
    const expired = await new SignJWT({ scope: config.scope })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key', typ: 'at+jwt' })
      .setIssuer(config.issuer)
      .setAudience(config.resourceUrl)
      .setSubject('alice')
      .setIssuedAt()
      .setExpirationTime(1)
      .sign(privateKey);
    const badSignature = await new SignJWT({ scope: config.scope })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key', typ: 'at+jwt' })
      .setIssuer(config.issuer)
      .setAudience(config.resourceUrl)
      .setSubject('alice')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign((await generateKeyPair('RS256')).privateKey);
    for (const value of [
      `Bearer ${badSignature}`,
      undefined,
      'Bearer proprietary-api-key',
      `Bearer ${wrongIssuer}`,
      `Bearer ${wrongAudience}`,
      `Bearer ${expired}`,
      `Bearer ${await token({ scope: 'openid' })}`,
      `Bearer ${await token({ nonce: 'id-token' })}`,
      `Bearer ${await token({}, { alg: 'RS256', typ: 'JWT', kid: 'test-key' })}`,
    ]) {
      await assert.rejects(auth.authenticate(value), McpAuthError);
    }
    assert.equal(mapped, 1);
    assert.equal(await auth.authenticate(`Bearer ${await token({ roles: ['Admin'], brand: 'other' })}`), principal);
    assert.deepEqual(
      principal.roles.map(role => role.name),
      ['Researcher']
    );
  });
  it('requires explicit issuer and subject bindings even when two issuers assert the same username', async () => {
    let mapped = 0;
    const resolve = async () => {
      mapped++;
      return principal;
    };
    const settings = { ...config, identityClaim: 'preferred_username' };
    const sign = async (issuer: string, subject: string) =>
      new SignJWT({ scope: config.scope, preferred_username: 'alice' })
        .setProtectedHeader({ alg: 'RS256', typ: 'at+jwt', kid: 'test-key' })
        .setIssuer(issuer)
        .setAudience(config.resourceUrl)
        .setSubject(subject)
        .setIssuedAt()
        .setExpirationTime('5m')
        .sign(privateKey);
    const valid = `Bearer ${await sign(config.issuer, 'alice')}`;
    assert.equal(await new McpAuthenticator(settings, resolve, keys).authenticate(valid), principal);
    await assert.rejects(
      new McpAuthenticator({ ...settings, identityBindings: [] }, resolve, keys).authenticate(valid),
      McpAuthError
    );
    await assert.rejects(
      new McpAuthenticator(settings, resolve, keys).authenticate(
        `Bearer ${await sign(config.issuer, 'different-subject')}`
      ),
      McpAuthError
    );
    const issuer = 'https://other-identity.example';
    await assert.rejects(
      new McpAuthenticator({ ...settings, issuer }, resolve, keys).authenticate(
        `Bearer ${await sign(issuer, 'alice')}`
      ),
      McpAuthError
    );
    assert.equal(mapped, 1);
  });
  it('accepts case-insensitive JWT media types while requiring access-token markers', async () => {
    let mapped = 0;
    const auth = new McpAuthenticator(
      config,
      async () => {
        mapped++;
        return principal;
      },
      keys
    );
    for (const [typ, claims] of [
      ['AT+JWT', {}],
      ['application/AT+JWT', {}],
      ['jwt', { typ: 'Bearer' }],
      ['jwt', { token_use: 'access' }],
    ] as const) {
      assert.equal(
        await auth.authenticate(`Bearer ${await token(claims, { alg: 'RS256', typ, kid: 'test-key' })}`),
        principal
      );
    }
    assert.equal(mapped, 4);
    for (const [typ, claims] of [
      ['jwt', {}],
      ['AT+JWT', { token_use: 'id' }],
      ['application/AT+JWT', { nonce: 'id-token' }],
      ['ID+JWT', { token_use: 'access' }],
    ] as const) {
      await assert.rejects(
        auth.authenticate(`Bearer ${await token(claims, { alg: 'RS256', typ, kid: 'test-key' })}`),
        McpAuthError
      );
    }
    assert.equal(mapped, 4);
  });
  it('rejects another brand audience before resolving identity and rejects mismatched resolved principals', async () => {
    let mapped = 0;
    const otherConfig = { ...config, brand: 'b', resourceUrl: 'https://redbox.example/b/mcp' };
    const otherAuth = new McpAuthenticator(
      otherConfig,
      async () => {
        mapped++;
        return principal;
      },
      keys
    );
    await assert.rejects(otherAuth.authenticate(`Bearer ${await token()}`), McpAuthError);
    assert.equal(mapped, 0);
    const otherBrand = Object.assign(new BrandingModel(), { ...brand, id: 'brand-b', name: 'b' });
    const wrongPrincipal = reportingPrincipal(otherBrand, user);
    const auth = new McpAuthenticator(config, async () => wrongPrincipal, keys);
    await assert.rejects(auth.authenticate(`Bearer ${await token()}`), McpAuthError);
  });
  it('keeps simultaneous HTTP connections bound to their own brand and rejects cross-brand tokens', async () => {
    invocations = [];
    const server = createServer();
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as AddressInfo).port;
    const base = `http://127.0.0.1:${port}`;
    const otherBrand = Object.assign(new BrandingModel(), { id: 'brand-b', name: 'b', roles: [role] });
    const actors: Record<string, typeof principal> = { a: principal, b: reportingPrincipal(otherBrand, user) };
    const configurations = Object.fromEntries(
      ['a', 'b'].map(name => [
        name,
        {
          ...config,
          brand: name,
          resourceUrl: `https://127.0.0.1:${port}/${name}/mcp`,
        },
      ])
    );
    const handlers = Object.fromEntries(
      Object.entries(configurations).map(([name, settings]) => [
        name,
        reportingMcpHttpHandler(
          settings,
          reporting,
          new McpAuthenticator(settings, async (_username, brandName) => actors[brandName], keys)
        ),
      ])
    );
    server.on('request', (req, res) => {
      const name = new URL(req.url!, base).pathname.split('/')[1];
      const handler = handlers[name];
      if (handler) void handler(req, res);
      else {
        res.writeHead(404);
        res.end();
      }
    });
    const tokens = Object.fromEntries(
      await Promise.all(
        Object.entries(configurations).map(async ([name, settings]) => [
          name,
          await new SignJWT({ scope: settings.scope })
            .setProtectedHeader({ alg: 'RS256', typ: 'at+jwt', kid: 'test-key' })
            .setIssuer(settings.issuer)
            .setAudience(settings.resourceUrl)
            .setSubject('alice')
            .setIssuedAt()
            .setExpirationTime('5m')
            .sign(privateKey),
        ])
      )
    );
    const clients: Client[] = [];
    try {
      for (const name of ['a', 'b', 'a', 'b']) {
        const client = new Client({ name: `brand-${name}`, version: '1.0' });
        clients.push(client);
        await client.connect(
          new StreamableHTTPClientTransport(new URL(`${base}/${name}/mcp`), {
            requestInit: { headers: { Authorization: `Bearer ${tokens[name]}` } },
          })
        );
        const result = await client.callTool({ name: 'count_records', arguments: { recordType: 'rdmp' } });
        assert.deepEqual(result.structuredContent, { count: 10 });
        assert.equal(invocations.at(-1)?.actor, actors[name]);
      }
      const calls = invocations.length;
      for (const [source, target] of [
        ['a', 'b'],
        ['b', 'a'],
      ]) {
        const response = await fetch(`${base}/${target}/mcp`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${tokens[source]}` },
          body: '{}',
        });
        assert.equal(response.status, 401);
        assert.ok(response.headers.get('www-authenticate')?.includes(`/oauth-protected-resource/${target}/mcp`));
      }
      assert.equal(invocations.length, calls);
      assert.equal((await fetch(`${base}/mcp`)).status, 404);
    } finally {
      await Promise.all(clients.map(client => client.close()));
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close(error => (error ? reject(error) : resolve())));
    }
  });
  it('distinguishes invalid identities from identity-store and JWKS availability failures', async () => {
    const bearer = `Bearer ${await token()}`;
    for (const failure of [new Error('private database credentials'), new ReportingError('UNAVAILABLE')]) {
      const auth = new McpAuthenticator(
        config,
        async () => {
          throw failure;
        },
        keys
      );
      await assert.rejects(auth.authenticate(bearer), error => error === failure);
    }
    const unknownUser = new McpAuthenticator(
      config,
      async () => {
        throw new ReportingError('AUTHENTICATION_REQUIRED');
      },
      keys
    );
    await assert.rejects(
      unknownUser.authenticate(bearer),
      error => error instanceof McpAuthError && error.code === 'invalid_token'
    );
    for (const failure of [new errors.JWKSTimeout(), new errors.JWKSInvalid('private JWKS response')]) {
      let resolved = false;
      const auth = new McpAuthenticator(
        config,
        async () => {
          resolved = true;
          return principal;
        },
        async () => {
          throw failure;
        }
      );
      await assert.rejects(auth.authenticate(bearer), error => error === failure);
      assert.equal(resolved, false);
    }
  });
  it('rejects unsupported critical headers while treating ambiguous JWKS keys as unavailable', async () => {
    let mapped = false;
    const resolve = async () => {
      mapped = true;
      return principal;
    };
    const unsupported = await new SignJWT({ scope: config.scope })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key', typ: 'at+jwt', crit: ['custom'], custom: true })
      .setIssuer(config.issuer)
      .setAudience(config.resourceUrl)
      .setSubject('alice')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(privateKey, { crit: { custom: true } });
    await assert.rejects(
      new McpAuthenticator(config, resolve, keys).authenticate(`Bearer ${unsupported}`),
      error => error instanceof McpAuthError && error.code === 'invalid_token'
    );
    assert.equal(mapped, false);
    const pair = await generateKeyPair('RS256');
    const key = { ...(await exportJWK(pair.publicKey)), kid: 'test-key', alg: 'RS256' };
    const ambiguous = createLocalJWKSet({ keys: [key, { ...key }] });
    await assert.rejects(
      new McpAuthenticator(config, resolve, ambiguous).authenticate(`Bearer ${await token()}`),
      errors.JWKSMultipleMatchingKeys
    );
    assert.equal(mapped, false);
  });
  it('maps only existing OIDC usernames and uses their persisted ID for principal refresh', async () => {
    const names = ['User', 'BrandingService'];
    const previous = new Map(names.map(name => [name, Reflect.get(globalThis, name)]));
    try {
      for (const stored of [null, { id: 42 }]) {
        Reflect.set(globalThis, 'User', {
          findOne: async (query: unknown) => {
            assert.deepEqual(query, { username: 'subject-1', type: 'oidc' });
            return stored;
          },
        });
        await assert.rejects(resolveOidcIdentity('subject-1', 'a'), McpAuthError);
      }
      const failure = new Error('principal refresh unavailable');
      Reflect.set(globalThis, 'BrandingService', { getBrand: () => brand });
      Reflect.set(globalThis, 'User', {
        findOne: (query: { username?: string; id?: string }) => {
          if (query.username) return Promise.resolve({ id: 'persisted-id' });
          assert.deepEqual(query, { id: 'persisted-id' });
          return {
            populate: async (association: string) => {
              assert.equal(association, 'roles');
              throw failure;
            },
          };
        },
      });
      await assert.rejects(resolveOidcIdentity('subject-1', 'a'), error => error === failure);
    } finally {
      for (const [name, value] of previous) {
        if (value === undefined) Reflect.deleteProperty(globalThis, name);
        else Reflect.set(globalThis, name, value);
      }
    }
  });
  it('returns a safe 503 without an OAuth challenge during an identity-store outage', async () => {
    const server = createServer();
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as AddressInfo).port;
    const local = { ...config, resourceUrl: `https://127.0.0.1:${port}/a/mcp` };
    const auth = new McpAuthenticator(
      local,
      async () => {
        throw new Error('private connection details');
      },
      keys
    );
    const handler = reportingMcpHttpHandler(local, reporting, auth);
    server.on('request', (req, res) => {
      void handler(req, res);
    });
    try {
      const bearer = await new SignJWT({ scope: config.scope })
        .setProtectedHeader({ alg: 'RS256', typ: 'at+jwt', kid: 'test-key' })
        .setIssuer(config.issuer)
        .setAudience(local.resourceUrl)
        .setSubject('alice')
        .setIssuedAt()
        .setExpirationTime('5m')
        .sign(privateKey);
      const response = await fetch(`http://127.0.0.1:${port}/a/mcp`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${bearer}` },
        body: '{}',
      });
      assert.equal(response.status, 503);
      assert.equal(response.headers.get('www-authenticate'), null);
      assert.deepEqual(await response.json(), { error: 'unavailable' });
      // Header rejection happens before the unavailable identity store is queried.
      const parts = bearer.split('.');
      parts[0] = Buffer.from(
        JSON.stringify({ alg: 'RS256', kid: 'test-key', crit: ['custom'], custom: true })
      ).toString('base64url');
      const invalid = await fetch(`http://127.0.0.1:${port}/a/mcp`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${parts.join('.')}` },
        body: '{}',
      });
      assert.equal(invalid.status, 401);
      assert.ok(invalid.headers.get('www-authenticate')?.includes('invalid_token'));
      assert.deepEqual(await invalid.json(), { error: 'invalid_token' });
    } finally {
      await new Promise<void>((resolve, reject) => server.close(error => (error ? reject(error) : resolve())));
    }
  });
  it('returns closed 503 responses for malformed brand URL configurations without throwing', async () => {
    const hook = require('../src/index') as {
      registerRedboxControllers(): {
        McpController: {
          handle(req: unknown, res: unknown): Promise<{ status: number; displayErrors: Array<{ code: string }> }>;
        };
      };
    };
    const previousSails = Reflect.get(globalThis, 'sails');
    const previousBranding = Reflect.get(globalThis, 'BrandingService');
    const previousFlag = process.env.REDBOX_MCP_ENABLED;
    const prototype = Controllers.Core.Controller.prototype;
    const sendResp = Reflect.get(prototype, 'sendResp');
    Reflect.set(prototype, 'sendResp', (_req: unknown, _res: unknown, response: unknown) => response);
    try {
      process.env.REDBOX_MCP_ENABLED = 'true';
      Reflect.set(globalThis, 'BrandingService', { getBrand: () => brand });
      for (const raw of [
        ...['resourceUrl', 'issuer', 'jwksUrl'].map(field => ({ ...config, [field]: 'invalid URL' })),
        { ...config, allowedOrigins: ['invalid URL'] },
      ]) {
        assert.equal(mcpConfigSchema.safeParse(raw).success, false);
        Reflect.set(globalThis, 'sails', { config: { brandingAware: () => ({ mcp: raw }) } });
        const response = await hook.registerRedboxControllers().McpController.handle({ params: { branding: 'a' } }, {});
        assert.equal(response.status, 503);
        assert.deepEqual(response.displayErrors, [{ code: 'MCP_UNAVAILABLE' }]);
      }
    } finally {
      Reflect.set(prototype, 'sendResp', sendResp);
      if (previousSails === undefined) Reflect.deleteProperty(globalThis, 'sails');
      else Reflect.set(globalThis, 'sails', previousSails);
      if (previousBranding === undefined) Reflect.deleteProperty(globalThis, 'BrandingService');
      else Reflect.set(globalThis, 'BrandingService', previousBranding);
      if (previousFlag === undefined) delete process.env.REDBOX_MCP_ENABLED;
      else process.env.REDBOX_MCP_ENABLED = previousFlag;
    }
  });
  it('requires allowedOrigins to use the exact browser origin representation', () => {
    assert.equal(mcpConfigSchema.safeParse({ ...config, allowedOrigins: ['https://app.example'] }).success, true);
    for (const origin of [
      'https://app.example/',
      'https://app.example/path',
      'https://app.example:443',
      'https://APP.example',
      'https://app.example?x=1',
    ]) {
      assert.equal(mcpConfigSchema.safeParse({ ...config, allowedOrigins: [origin] }).success, false, origin);
    }
  });
  it('requires secure configured resource/issuer/JWKS URLs and rejects URL credentials', () => {
    assert.equal(mcpConfigSchema.safeParse(config).success, true);
    for (const resourceUrl of [
      'http://example/mcp',
      'https://user:password@example/mcp',
      'https://example/mcp#x',
      'https://example/another-path',
    ])
      assert.equal(mcpConfigSchema.safeParse({ ...config, resourceUrl }).success, false);
  });
  it('serves discovery/challenges, validates origin/host, and executes with a standard HTTP MCP client', async () => {
    const server = createServer();
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as AddressInfo).port;
    const local = { ...config, resourceUrl: `https://127.0.0.1:${port}/a/mcp` };
    const auth = new McpAuthenticator(local, async () => principal, keys);
    const events: Record<string, unknown>[] = [];
    const handler = reportingMcpHttpHandler(local, reporting, auth, event => events.push(event));
    server.on('request', (req, res) => {
      void handler(req, res);
    });
    const base = `http://127.0.0.1:${port}`;
    const localToken = await new SignJWT({ scope: config.scope })
      .setProtectedHeader({ alg: 'RS256', typ: 'at+jwt', kid: 'test-key' })
      .setIssuer(config.issuer)
      .setAudience(local.resourceUrl)
      .setSubject('alice')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(privateKey);
    let client: Client | undefined;
    try {
      const metadata = await fetch(`${base}/.well-known/oauth-protected-resource/a/mcp`);
      assert.deepEqual(await metadata.json(), {
        resource: local.resourceUrl,
        authorization_servers: [config.issuer],
        scopes_supported: [config.scope],
        bearer_methods_supported: ['header'],
        resource_name: 'ReDBox reporting (a)',
      });
      const challenge = await fetch(`${base}/a/mcp`, { method: 'POST', body: '{}' });
      assert.equal(challenge.status, 401);
      assert.ok(challenge.headers.get('www-authenticate')?.includes('resource_metadata='));
      const malicious = await fetch(`${base}/a/mcp`, {
        method: 'POST',
        headers: { Origin: 'https://evil.example' },
        body: '{}',
      });
      assert.equal(malicious.status, 403);
      const invalidHost = await new Promise<number | undefined>((resolve, reject) => {
        const call = request(`${base}/a/mcp`, { method: 'POST', headers: { Host: 'evil.example' } }, response => {
          response.resume();
          resolve(response.statusCode);
        });
        call.on('error', reject);
        call.end('{}');
      });
      assert.equal(invalidHost, 403);
      client = new Client({ name: 'http-reporting-test', version: '1.0' });
      await client.connect(
        new StreamableHTTPClientTransport(new URL(`${base}/a/mcp`), {
          requestInit: { headers: { Authorization: `Bearer ${localToken}` } },
        })
      );
      const tools = await client.listTools();
      assert.equal(tools.tools.length, 7);
      const result = await client.callTool({ name: 'count_records', arguments: { recordType: 'rdmp' } });
      assert.deepEqual(result.structuredContent, { count: 10 });
      const invalid = await client.callTool({
        name: 'count_records',
        arguments: { recordType: 'rdmp', brand: 'other' },
      });
      assert.equal(invalid.isError, true);
      assert.ok(
        events.some(
          event =>
            event.event === 'reporting' &&
            event.userId === 'alice-id' &&
            event.tool === 'count_records' &&
            event.success === false
        )
      );
      const tooLarge = await fetch(`${base}/a/mcp`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'x'.repeat(20_000) }),
      });
      assert.equal(tooLarge.status, 413);
      assert.ok(!JSON.stringify(events).includes(localToken));
    } finally {
      await client?.close();
      await new Promise<void>((resolve, reject) => server.close(error => (error ? reject(error) : resolve())));
    }
  });
  it('supports scoped browser preflight and exposes authenticated MCP responses and OAuth errors', async () => {
    const origin = 'https://reporting.example';
    const server = createServer();
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as AddressInfo).port;
    const base = `http://127.0.0.1:${port}`;
    const local = { ...config, resourceUrl: `https://127.0.0.1:${port}/a/mcp`, allowedOrigins: [origin] };
    const auth = new McpAuthenticator(local, async () => principal, keys);
    const handler = reportingMcpHttpHandler(local, reporting, auth);
    server.on('request', (req, res) => {
      // Preserve middleware's existing cache variation.
      res.setHeader('Vary', 'Accept-Encoding');
      void handler(req, res);
    });
    const localToken = await new SignJWT({ scope: config.scope })
      .setProtectedHeader({ alg: 'RS256', typ: 'at+jwt', kid: 'test-key' })
      .setIssuer(config.issuer)
      .setAudience(local.resourceUrl)
      .setSubject('alice')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(privateKey);
    const preflight = (path = '/a/mcp', headers: Record<string, string> = {}) =>
      fetch(`${base}${path}`, {
        method: 'OPTIONS',
        headers: {
          Origin: origin,
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'Authorization, Content-Type, MCP-Protocol-Version, Mcp-Method, Mcp-Name',
          ...headers,
        },
      });
    const checkCors = (response: Response) => {
      assert.equal(response.headers.get('access-control-allow-origin'), origin);
      assert.equal(response.headers.get('vary'), 'Accept-Encoding, Origin');
      assert.equal(response.headers.get('access-control-allow-credentials'), null);
    };
    let client: Client | undefined;
    try {
      const allowed = await preflight(); // Browsers cannot attach a bearer token here.
      assert.equal(allowed.status, 204);
      assert.equal(await allowed.text(), '');
      checkCors(allowed);
      assert.equal(allowed.headers.get('access-control-allow-methods'), 'POST');
      assert.equal(
        allowed.headers.get('access-control-allow-headers'),
        'accept, authorization, content-type, mcp-protocol-version, mcp-method, mcp-name'
      );
      const sameOrigin = await preflight('/a/mcp', { Origin: new URL(local.resourceUrl).origin });
      assert.equal(sameOrigin.status, 204);
      assert.equal(sameOrigin.headers.get('access-control-allow-origin'), new URL(local.resourceUrl).origin);
      const deniedPreflights: Array<Record<string, string>> = [
        { Origin: 'https://evil.example' },
        { Origin: 'null' },
        { 'Access-Control-Request-Method': 'DELETE' },
        { 'Access-Control-Request-Method': 'GET' },
        { 'Access-Control-Request-Headers': 'authorization, x-untrusted-header' },
        { 'Access-Control-Request-Headers': 'authorization,' },
      ];
      for (const headers of deniedPreflights) {
        const denied = await preflight('/a/mcp', headers);
        assert.equal(denied.status, 403);
        assert.equal(denied.headers.get('access-control-allow-origin'), null);
        assert.equal(denied.headers.get('access-control-allow-headers'), null);
      }
      await new Promise<void>((resolve, reject) => {
        const call = request(
          `${base}/a/mcp`,
          {
            method: 'OPTIONS',
            headers: { Host: 'evil.example', Origin: origin, 'Access-Control-Request-Method': 'POST' },
          },
          response => {
            response.resume();
            assert.equal(response.statusCode, 403);
            assert.equal(response.headers['access-control-allow-origin'], undefined);
            response.on('end', resolve);
          }
        );
        call.on('error', reject);
        call.end();
      });
      const missing = await preflight('/unrelated');
      assert.equal(missing.status, 404);
      assert.equal(missing.headers.get('access-control-allow-origin'), null);
      const metadataPath = '/.well-known/oauth-protected-resource/a/mcp';
      const discoveryPreflight = await preflight(metadataPath, {
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'MCP-Protocol-Version',
      });
      assert.equal(discoveryPreflight.status, 204);
      assert.equal(discoveryPreflight.headers.get('access-control-allow-methods'), 'GET');
      checkCors(discoveryPreflight);
      const discovery = await fetch(`${base}${metadataPath}`, { headers: { Origin: origin } });
      assert.equal(discovery.status, 200);
      checkCors(discovery);
      const challenge = await fetch(`${base}/a/mcp`, { method: 'POST', headers: { Origin: origin }, body: '{}' });
      assert.equal(challenge.status, 401);
      checkCors(challenge);
      assert.ok(challenge.headers.get('www-authenticate')?.includes('resource_metadata='));
      assert.equal(challenge.headers.get('access-control-expose-headers'), 'WWW-Authenticate, Mcp-Session-Id');
      const malformed = await fetch(`${base}/a/mcp`, {
        method: 'POST',
        headers: { Origin: origin, Authorization: `Bearer ${localToken}` },
        body: '{',
      });
      assert.equal(malformed.status, 400);
      checkCors(malformed);
      const malicious = await fetch(`${base}/a/mcp`, {
        method: 'POST',
        headers: { Origin: 'https://evil.example', Authorization: `Bearer ${localToken}` },
        body: '{}',
      });
      assert.equal(malicious.status, 403);
      assert.equal(malicious.headers.get('access-control-allow-origin'), null);
      let posts = 0;
      client = new Client({ name: 'browser-reporting-test', version: '1.0' });
      await client.connect(
        new StreamableHTTPClientTransport(new URL(`${base}/a/mcp`), {
          requestInit: { headers: { Origin: origin, Authorization: `Bearer ${localToken}` } },
          fetch: async (input, init) => {
            if (init?.method === 'POST') {
              // Use the real SDK-generated headers, including its negotiated-version headers.
              const headers = new Headers(init.headers);
              headers.delete('origin');
              const response = await preflight('/a/mcp', {
                'Access-Control-Request-Headers': [...headers.keys()].join(', '),
              });
              assert.equal(response.status, 204);
              checkCors(response);
              posts++;
            }
            const response = await fetch(input, init);
            checkCors(response);
            return response;
          },
        })
      );
      assert.equal((await client.listTools()).tools.length, 7);
      const result = await client.callTool({ name: 'count_records', arguments: { recordType: 'rdmp' } });
      assert.deepEqual(result.structuredContent, { count: 10 });
      assert.ok(posts >= 3);
    } finally {
      await client?.close();
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close(error => (error ? reject(error) : resolve())));
    }
  });
  for (const framing of ['chunked', 'content-length'] as const) {
    it(`returns a complete 413 response while an oversized ${framing} upload is still streaming`, async () => {
      invocations = [];
      const server = createServer();
      await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
      const port = (server.address() as AddressInfo).port;
      const local = { ...config, resourceUrl: `https://127.0.0.1:${port}/a/mcp` };
      const auth = new McpAuthenticator(local, async () => principal, keys);
      const events: Record<string, unknown>[] = [];
      const destroyedRequests: boolean[] = [];
      const handler = reportingMcpHttpHandler(local, reporting, auth, event => events.push(event));
      server.on('request', (req, res) => {
        void handler(req, res).then(() => destroyedRequests.push(req.destroyed));
      });
      const localToken = await new SignJWT({ scope: config.scope })
        .setProtectedHeader({ alg: 'RS256', typ: 'at+jwt', kid: 'test-key' })
        .setIssuer(config.issuer)
        .setAudience(local.resourceUrl)
        .setSubject('alice')
        .setIssuedAt()
        .setExpirationTime('5m')
        .sign(privateKey);
      try {
        const result = await new Promise<{ status: number | undefined; body: string; sent: number }>(
          (resolve, reject) => {
            const chunk = Buffer.alloc(4096, 'x');
            const total = 512 * chunk.length;
            let sent = 0;
            let timer: ReturnType<typeof setTimeout> | undefined;
            const call = request(
              `http://127.0.0.1:${port}/a/mcp`,
              {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${localToken}`,
                  'Content-Type': 'application/json',
                  ...(framing === 'content-length' ? { 'Content-Length': total } : {}),
                },
              },
              response => {
                clearTimeout(timer);
                let body = '';
                response.setEncoding('utf8');
                response.on('data', chunk => {
                  body += chunk;
                });
                response.on('error', reject);
                response.on('end', () => {
                  resolve({ status: response.statusCode, body, sent });
                  call.destroy();
                });
              }
            );
            call.on('error', error => {
              clearTimeout(timer);
              reject(error);
            });
            call.setTimeout(3000, () => {
              call.destroy(new Error('No HTTP response to oversized upload'));
            });
            const write = () => {
              sent += chunk.length;
              call.write(chunk);
              if (sent < total) timer = setTimeout(write, 5);
              else call.end();
            };
            write();
          }
        );
        assert.deepEqual(
          destroyedRequests,
          [false],
          'body iteration must preserve the request until the response is sent'
        );
        assert.equal(result.status, 413);
        assert.deepEqual(JSON.parse(result.body), { error: 'invalid_request' });
        assert.ok(result.sent > local.maxRequestBytes);
        assert.ok(result.sent < 512 * 4096, 'must reject before the upload finishes');
        assert.equal(invocations.length, 0);
        assert.equal(events.length, 1);
        assert.equal(events[0].event, 'mcp-request');
        assert.equal(events[0].success, false);
        assert.equal(events[0].code, 'invalid_request');
        assert.ok(!JSON.stringify(events).includes(localToken));
      } finally {
        server.closeAllConnections();
        await new Promise<void>((resolve, reject) => server.close(error => (error ? reject(error) : resolve())));
      }
    });
  }
});
