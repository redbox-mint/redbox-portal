import assert from 'node:assert/strict';
import { createServer, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { of } from 'rxjs';
import { z } from 'zod';
import {
  BrandingModel,
  Controllers,
  RoleModel,
  UserModel,
  reportingPrincipal,
  type ReportingApi,
} from '@researchdatabox/redbox-core';
import { brandMcpSettings, mcp, mcpConfigSchema, resolveMcpConfig } from '../src/config';
import { connectionSetup } from '../src/setup';

const brands: Record<string, BrandingModel> = Object.fromEntries(
  ['alpha', 'beta'].map(name => [name, Object.assign(new BrandingModel(), { id: `brand-${name}`, name, roles: [] })])
);
const settings = (name: string) => ({
  mcp: {
    ...mcp,
    enabled: true,
    brand: name,
    resourceUrl: `https://portal.example/${name}/mcp`,
    issuer: `https://identity.example/${name}`,
    jwksUrl: `https://identity.example/${name}/jwks`,
  },
  mcpSetup: { clients: { codex: { clientId: `${name}-client` } } },
});

describe('MCP brand configuration and browser isolation', () => {
  const globals = ['sails', 'BrandingService', 'User', 'UsersService'] as const;
  let previous: unknown[];
  let previousFlag: string | undefined;
  beforeEach(() => {
    previous = globals.map(name => Reflect.get(globalThis, name));
    previousFlag = process.env.REDBOX_MCP_ENABLED;
    process.env.REDBOX_MCP_ENABLED = 'true';
    Reflect.set(globalThis, 'BrandingService', { getBrand: (name: string) => brands[name] });
  });
  afterEach(() => {
    globals.forEach((name, index) =>
      previous[index] === undefined
        ? Reflect.deleteProperty(globalThis, name)
        : Reflect.set(globalThis, name, previous[index])
    );
    if (previousFlag === undefined) delete process.env.REDBOX_MCP_ENABLED;
    else process.env.REDBOX_MCP_ENABLED = previousFlag;
  });

  it('requires a canonical brand resource URL and exact requested-brand binding', () => {
    const { mcp: configuration } = settings('alpha');
    assert.equal(resolveMcpConfig(configuration, 'alpha').success, true);
    assert.equal(resolveMcpConfig(configuration, 'beta').success, false);
    for (const resourceUrl of [
      'https://portal.example/mcp',
      'https://portal.example/beta/mcp',
      'https://portal.example/alpha/../alpha/mcp',
      'https://portal.example/%61lpha/mcp',
      'https://portal.example/alpha/mcp/',
      'https://portal.example/alpha/mcp?brand=beta',
    ])
      assert.equal(mcpConfigSchema.safeParse({ ...configuration, resourceUrl }).success, false, resourceUrl);
  });

  it('never falls back to global settings or another brand and requires a separate brand opt-in', () => {
    let reads = 0;
    const configurations: Record<string, ReturnType<typeof settings>> = {
      alpha: settings('alpha'),
      beta: settings('beta'),
    };
    const runtime = {
      config: {
        mcp: settings('alpha').mcp,
        brandingAware: (name: string) => {
          reads++;
          return configurations[name];
        },
      },
    };
    Reflect.set(globalThis, 'sails', runtime);
    assert.deepEqual(brandMcpSettings('alpha'), configurations.alpha);
    assert.deepEqual(brandMcpSettings('beta'), configurations.beta);
    const beforeUnknown = reads;
    for (const name of [undefined, '', 'missing', '../alpha', 'alpha/beta'])
      assert.equal(brandMcpSettings(name), undefined);
    assert.equal(reads, beforeUnknown);
    configurations.beta = configurations.alpha;
    assert.equal(brandMcpSettings('beta'), undefined);
    configurations.beta = settings('beta');
    configurations.beta.mcp.enabled = false;
    assert.equal(brandMcpSettings('beta'), undefined);
    assert.ok(brandMcpSettings('alpha'));
    process.env.REDBOX_MCP_ENABLED = 'false';
    assert.equal(brandMcpSettings('alpha'), undefined);
  });

  it('keeps discovery caches independent and immediately observes per-brand changes and disablement', async () => {
    const hook = require('../src/index') as {
      registerRedboxControllers(): {
        McpController: { handle(req: unknown, res: unknown): Promise<unknown> };
      };
    };
    const prototype = Controllers.Core.Controller.prototype;
    const original = Reflect.get(prototype, 'sendResp');
    Reflect.set(prototype, 'sendResp', (_req: unknown, res: ServerResponse, response: { status: number }) => {
      res.writeHead(response.status);
      res.end();
    });
    const configurations: Record<string, ReturnType<typeof settings>> = {
      alpha: settings('alpha'),
      beta: settings('beta'),
    };
    Reflect.set(globalThis, 'sails', {
      config: { brandingAware: (name: string) => configurations[name], reporting: { enabled: true } },
      services: { reportingservice: {} },
      log: { info() {} },
    });
    const server = createServer((req, res) => {
      const branding = new URL(req.url!, 'http://localhost').pathname.split('/').at(-2);
      void hook.registerRedboxControllers().McpController.handle(Object.assign(req, { params: { branding } }), res);
    });
    try {
      await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
      const port = (server.address() as AddressInfo).port;
      for (const name of ['alpha', 'beta'])
        configurations[name].mcp.resourceUrl = `https://127.0.0.1:${port}/${name}/mcp`;
      const discovery = (name: string) =>
        fetch(`http://127.0.0.1:${port}/.well-known/oauth-protected-resource/${name}/mcp`);
      for (const name of ['alpha', 'beta', 'alpha', 'beta']) {
        const response = await discovery(name);
        assert.equal(response.status, 200);
        const metadata = z
          .object({ resource: z.string(), authorization_servers: z.array(z.string()) })
          .parse(await response.json());
        assert.equal(metadata.resource, configurations[name].mcp.resourceUrl);
        assert.deepEqual(metadata.authorization_servers, [configurations[name].mcp.issuer]);
      }
      configurations.alpha.mcp.issuer = 'https://identity.example/new-alpha';
      assert.deepEqual(
        z.object({ authorization_servers: z.array(z.string()) }).parse(await (await discovery('alpha')).json())
          .authorization_servers,
        ['https://identity.example/new-alpha']
      );
      assert.deepEqual(
        z.object({ authorization_servers: z.array(z.string()) }).parse(await (await discovery('beta')).json())
          .authorization_servers,
        ['https://identity.example/beta']
      );
      configurations.alpha.mcp.enabled = false;
      assert.equal((await discovery('alpha')).status, 404);
      assert.equal((await discovery('beta')).status, 200);
      configurations.beta.mcp.resourceUrl = configurations.alpha.mcp.resourceUrl;
      assert.equal((await discovery('beta')).status, 503);
      assert.equal((await discovery('missing')).status, 404);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close(error => (error ? reject(error) : resolve())));
      Reflect.set(prototype, 'sendResp', original);
    }
  });

  it('returns only the URL brand OAuth registration after refreshing session identity', async () => {
    const hook = require('../src/index') as {
      registerRedboxControllers(): {
        McpSetupController: {
          status(
            req: unknown,
            res: unknown
          ): Promise<{
            data?: { connection?: { brand: string; endpoint: string; clients: unknown } };
            status?: number;
          }>;
        };
      };
    };
    const prototype = Controllers.Core.Controller.prototype;
    const original = Reflect.get(prototype, 'sendResp');
    Reflect.set(prototype, 'sendResp', (_req: unknown, _res: unknown, response: unknown) => response);
    const configurations: Record<string, ReturnType<typeof settings>> = {
      alpha: settings('alpha'),
      beta: settings('beta'),
    };
    const roles = Object.values(brands).map(brand => {
      const role = Object.assign(new RoleModel(), { id: `${brand.name}-admin`, name: 'Admin', branding: brand });
      brand.roles = [role];
      return role;
    });
    Reflect.set(globalThis, 'BrandingService', {
      getBrand: (name: string) => brands[name],
      getBrandAndPortalPath: (req: { params: { branding: string } }) => `/${req.params.branding}/rdmp`,
    });
    const user = Object.assign(new UserModel(), { id: 'session-user', username: 'user', type: 'oidc', roles });
    Reflect.set(globalThis, 'User', { findOne: () => ({ populate: async () => user }) });
    Reflect.set(globalThis, 'UsersService', { getEffectiveUser: () => of(user) });
    Reflect.set(globalThis, 'sails', {
      config: { brandingAware: (name: string) => configurations[name], reporting: { enabled: true } },
      services: { reportingservice: {} },
    });
    try {
      const controller = hook.registerRedboxControllers().McpSetupController;
      for (const branding of ['alpha', 'beta']) {
        const response = await controller.status(
          {
            params: { branding },
            body: { branding: branding === 'alpha' ? 'beta' : 'alpha' },
            session: { branding: 'another' },
            user,
            isAuthenticated: () => true,
          },
          {}
        );
        assert.equal(response.data?.connection?.brand, branding);
        assert.equal(response.data?.connection?.endpoint, configurations[branding].mcp.resourceUrl);
        assert.deepEqual(response.data?.connection?.clients, configurations[branding].mcpSetup.clients);
      }
      assert.equal(
        (await controller.status({ session: { branding: 'alpha' }, user, isAuthenticated: () => true }, {})).status,
        404
      );
    } finally {
      Reflect.set(prototype, 'sendResp', original);
    }
  });

  it('withholds connection settings and schema discovery when the principal brand mismatches', async () => {
    const brand = brands.alpha;
    const role = Object.assign(new RoleModel(), { id: 'alpha-researcher', name: 'Researcher', branding: brand });
    const user = Object.assign(new UserModel(), { id: 'alice', username: 'alice', type: 'oidc', roles: [role] });
    const principal = reportingPrincipal({ ...brand, roles: [role] }, user);
    const api: ReportingApi = {
      async getReportingSchema() {
        throw new Error('Must not reach reporting');
      },
      async execute() {
        throw new Error('Must not read records');
      },
    };
    const other = settings('beta');
    const response = await connectionSetup(other.mcp, other.mcpSetup, true, ['rdmp'], principal, api);
    assert.equal(response.state, 'needs-configuration');
    assert.equal(response.connection, undefined);
    assert.deepEqual(response.recordTypes, []);
  });
});
