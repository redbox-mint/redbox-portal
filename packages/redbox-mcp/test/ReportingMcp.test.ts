import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Client, InMemoryTransport, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWTVerifyGetKey } from 'jose';
import {
  BrandingModel,
  RoleModel,
  UserModel,
  ReportingError,
  reportingPrincipal,
  type ReportingApi,
} from '@researchdatabox/redbox-core';
import { createReportingMcpServer } from '../src/server';
import { McpAuthenticator, McpAuthError } from '../src/auth';
import { mcpConfigSchema, type McpConfig } from '../src/config';
import { reportingMcpHttpHandler } from '../src/http';

const brand = Object.assign(new BrandingModel(), { id: 'brand-a', name: 'a' });
const role = Object.assign(new RoleModel(), { id: 'role-a', name: 'Researcher', branding: brand });
brand.roles = [role];
const user = Object.assign(new UserModel(), { id: 'alice-id', username: 'alice', type: 'oidc', roles: [role] });
const principal = reportingPrincipal(brand, user);
const config: McpConfig = {
  enabled: true,
  resourceUrl: 'https://redbox.example/mcp',
  issuer: 'https://id.example',
  jwksUrl: 'https://id.example/jwks',
  brand: 'a',
  scope: 'redbox.reporting',
  identityClaim: 'sub',
  usernameToLowercase: false,
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
      registerRedboxConfig(): { mcp: { enabled: boolean }; routes: Record<string, unknown>; policies: unknown };
      registerRedboxControllers(): Record<string, unknown>;
      createReportingMcpServer: unknown;
    };
    assert.equal(typeof hook, 'function');
    assert.equal(typeof hook.createReportingMcpServer, 'function');
    assert.equal(hook.registerRedboxConfig().mcp.enabled, false);
    assert.ok(hook.registerRedboxConfig().routes['/mcp']);
    assert.deepEqual(hook.registerRedboxConfig().policies, { McpController: { '*': [] } });
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
    const local = { ...config, resourceUrl: `https://127.0.0.1:${port}/mcp` };
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
      const metadata = await fetch(`${base}/.well-known/oauth-protected-resource/mcp`);
      assert.deepEqual(await metadata.json(), {
        resource: local.resourceUrl,
        authorization_servers: [config.issuer],
        scopes_supported: [config.scope],
        bearer_methods_supported: ['header'],
        resource_name: 'ReDBox reporting',
      });
      const challenge = await fetch(`${base}/mcp`, { method: 'POST', body: '{}' });
      assert.equal(challenge.status, 401);
      assert.ok(challenge.headers.get('www-authenticate')?.includes('resource_metadata='));
      const malicious = await fetch(`${base}/mcp`, {
        method: 'POST',
        headers: { Origin: 'https://evil.example' },
        body: '{}',
      });
      assert.equal(malicious.status, 403);
      const invalidHost = await new Promise<number | undefined>((resolve, reject) => {
        const call = request(`${base}/mcp`, { method: 'POST', headers: { Host: 'evil.example' } }, response => {
          response.resume();
          resolve(response.statusCode);
        });
        call.on('error', reject);
        call.end('{}');
      });
      assert.equal(invalidHost, 403);
      client = new Client({ name: 'http-reporting-test', version: '1.0' });
      await client.connect(
        new StreamableHTTPClientTransport(new URL(`${base}/mcp`), {
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
      const tooLarge = await fetch(`${base}/mcp`, {
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
  for (const framing of ['chunked', 'content-length'] as const) {
    it(`returns a complete 413 response while an oversized ${framing} upload is still streaming`, async () => {
      invocations = [];
      const server = createServer();
      await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
      const port = (server.address() as AddressInfo).port;
      const local = { ...config, resourceUrl: `https://127.0.0.1:${port}/mcp` };
      const auth = new McpAuthenticator(local, async () => principal, keys);
      const events: Record<string, unknown>[] = [];
      const handler = reportingMcpHttpHandler(local, reporting, auth, event => events.push(event));
      server.on('request', (req, res) => {
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
      try {
        const result = await new Promise<{ status: number | undefined; body: string; sent: number }>(
          (resolve, reject) => {
            const chunk = Buffer.alloc(4096, 'x');
            const total = 512 * chunk.length;
            let sent = 0;
            let timer: ReturnType<typeof setTimeout> | undefined;
            const call = request(
              `http://127.0.0.1:${port}/mcp`,
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
