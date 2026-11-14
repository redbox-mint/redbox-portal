import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { of } from 'rxjs';
import {
  BrandingModel,
  Controllers,
  RoleModel,
  UserModel,
  ReportingError,
  reporting,
  reportingPrincipal,
  type ReportingApi,
} from '@researchdatabox/redbox-core';
import { mcp, mcpDeploymentEnabled, mcpSetupConfigSchema, resolveMcpConfig } from '../src/config';
import { connectionSetup, hasMcpOidcIdentity } from '../src/setup';

const brand = Object.assign(new BrandingModel(), { id: 'brand-setup', name: 'default' });
const role = Object.assign(new RoleModel(), { id: 'researcher', name: 'Researcher', branding: brand });
const librarianRole = Object.assign(new RoleModel(), { id: 'librarian', name: 'Librarians', branding: brand });
const adminRole = Object.assign(new RoleModel(), { id: 'admin', name: 'Admin', branding: brand });
brand.roles = [role, adminRole, librarianRole];
const user = Object.assign(new UserModel(), { id: 'alice', username: 'alice', type: 'oidc', roles: [role] });
const principal = reportingPrincipal(brand, user);
const configuration = {
  ...mcp,
  enabled: true,
  resourceUrl: 'https://redbox.example/default/mcp',
  issuer: 'https://id.example',
  identityBindings: [{ issuer: 'https://id.example', subject: 'alice-subject', username: 'alice' }],
  jwksUrl: 'https://id.example/jwks',
};
let schemaCalls: string[] = [];
const api: ReportingApi = {
  async getReportingSchema(_actor, input) {
    schemaCalls.push(input.recordType);
    if (input.recordType === 'restricted') throw new ReportingError('FORBIDDEN');
    return {
      recordType: input.recordType,
      fields: [],
      limits: reporting.limits,
      dateSemantics: 'UTC',
      metadataFormCoverage: [],
    };
  },
  async execute() {
    throw new Error('Setup must never read records');
  },
};

describe('MCP deployment and user setup', () => {
  let previousFlag: string | undefined;
  const globals = ['sails', 'BrandingService', 'User', 'UsersService', 'TranslationService'] as const;
  let previousGlobals: unknown[];
  beforeEach(() => {
    previousFlag = process.env.REDBOX_MCP_ENABLED;
    process.env.REDBOX_MCP_ENABLED = 'true';
    previousGlobals = globals.map(key => Reflect.get(globalThis, key));
    schemaCalls = [];
  });
  afterEach(() => {
    if (previousFlag === undefined) delete process.env.REDBOX_MCP_ENABLED;
    else process.env.REDBOX_MCP_ENABLED = previousFlag;
    globals.forEach((key, index) => {
      if (previousGlobals[index] === undefined) Reflect.deleteProperty(globalThis, key);
      else Reflect.set(globalThis, key, previousGlobals[index]);
    });
  });

  it('requires an explicit true environment flag, including over customer enabled settings', () => {
    for (const value of [undefined, '', 'false', '0', '1', 'yes', 'invalid']) {
      assert.equal(mcpDeploymentEnabled(value === undefined ? {} : { REDBOX_MCP_ENABLED: value }), false);
      if (value === undefined) delete process.env.REDBOX_MCP_ENABLED;
      else process.env.REDBOX_MCP_ENABLED = value;
      assert.equal(resolveMcpConfig({ ...configuration, enabled: true }, brand.name).success, false);
    }
    process.env.REDBOX_MCP_ENABLED = ' true ';
    assert.equal(resolveMcpConfig(configuration, brand.name).success, true);
    for (const enabled of [false, 'true', undefined])
      assert.equal(resolveMcpConfig({ ...configuration, enabled }, brand.name).success, false);
  });

  it('does not permit credentials in public setup configuration', () => {
    assert.equal(
      mcpSetupConfigSchema.safeParse({ clients: { codex: { clientId: 'public-id', callbackPort: 52344 } } }).success,
      true
    );
    assert.equal(
      mcpSetupConfigSchema.safeParse({ clients: { codex: { clientId: 'id', clientSecret: 'secret' } } }).success,
      false
    );
    assert.equal(mcpSetupConfigSchema.safeParse({ chatgptPluginUrl: 'javascript:alert(1)' }).success, false);
  });

  it('resolves navigation availability from the deployment flag during hook configuration', () => {
    const hook = require('../src/index') as (application: unknown) => { configure(): void };
    const application = { config: { mcp: { ...configuration, enabled: true } } };
    process.env.REDBOX_MCP_ENABLED = 'false';
    hook(application).configure();
    assert.equal(application.config.mcp.enabled, false);
    process.env.REDBOX_MCP_ENABLED = 'true';
    hook(application).configure();
    assert.equal(application.config.mcp.enabled, true);
  });

  it('registers only admin setup URLs and the admin browser policy chain', () => {
    const hook = require('../src/index') as {
      registerRedboxConfig(): { routes: Record<string, unknown>; policies: Record<string, { '*': string[] }> };
    };
    const { routes, policies } = hook.registerRedboxConfig();
    assert.deepEqual(
      Object.keys(routes).filter(route => route.includes('/admin/mcp')),
      ['get /:branding/:portal/admin/mcp', 'get /:branding/:portal/admin/mcp/status']
    );
    assert.ok(!Object.keys(routes).some(route => route.includes('/user/mcp')));
    assert.ok(policies.McpSetupController['*'].includes('menuResolver'));
    assert.ok(policies.McpSetupController['*'].includes('contentSecurityPolicy'));
    assert.ok(!policies.McpSetupController['*'].includes('isWebServiceAuthenticated'));
  });

  it('uses authorized schema discovery and returns only permitted record types and public connection details', async () => {
    const result = await connectionSetup(configuration, {}, true, ['rdmp', 'restricted'], principal, api);
    assert.equal(result.state, 'ready');
    assert.deepEqual(result.recordTypes, ['rdmp']);
    assert.deepEqual(schemaCalls, ['rdmp', 'restricted']);
    assert.equal(result.connection?.endpoint, configuration.resourceUrl);
    assert.equal(
      result.connection?.metadataUrl,
      'https://redbox.example/.well-known/oauth-protected-resource/default/mcp'
    );
    assert.equal('configurationProblems' in result, false);
    assert.equal('jwksUrl' in (result.connection ?? {}), false);
  });

  it('reports missing identity bindings as configuration work without claiming the account is ready', async () => {
    Reflect.set(globalThis, 'UsersService', { getLinkedAccounts: () => of({ linkedAccounts: [] }) });
    const admin = reportingPrincipal(brand, { ...user, roles: [adminRole] });
    for (const identityBindings of [
      [],
      [{ issuer: 'https://other.example', subject: 'alice-subject', username: 'alice' }],
    ]) {
      const result = await connectionSetup({ ...configuration, identityBindings }, {}, true, ['rdmp'], admin, api);
      assert.equal(result.state, 'needs-configuration');
      assert.deepEqual(result.configurationProblems, ['mcp.identityBindings']);
      assert.equal(result.checks.configuration, false);
    }
    assert.deepEqual(schemaCalls, []);
  });
  it('distinguishes disabled reporting, local accounts and missing reporting access without reading records', async () => {
    assert.equal(
      (await connectionSetup(configuration, {}, false, ['rdmp'], principal, api)).state,
      'reporting-disabled'
    );
    const local = reportingPrincipal(brand, { ...user, type: 'local' });
    assert.equal((await connectionSetup(configuration, {}, true, ['rdmp'], local, api)).state, 'oidc-required');
    assert.deepEqual(schemaCalls, []);
    assert.equal(
      (await connectionSetup(configuration, {}, true, ['restricted'], principal, api)).state,
      'no-reporting-access'
    );
  });

  it('limits configuration diagnostics to canonical administrators and omits invalid settings', async () => {
    const invalid = { ...configuration, issuer: 'secret-invalid-value' };
    const ordinary = await connectionSetup(invalid, {}, true, ['rdmp'], principal, api);
    assert.equal(ordinary.state, 'needs-configuration');
    assert.equal(ordinary.connection, undefined);
    assert.equal('configurationProblems' in ordinary, false);
    const admin = reportingPrincipal(brand, { ...user, roles: [adminRole] });
    const result = await connectionSetup(invalid, {}, true, ['rdmp'], admin, api);
    assert.deepEqual(result.configurationProblems, ['mcp.issuer']);
    assert.ok(!JSON.stringify(result).includes('secret-invalid-value'));
    const forged = reportingPrincipal(brand, {
      ...user,
      roles: [Object.assign(new RoleModel(), { id: 'other-role', name: 'Admin' })],
    });
    assert.equal((await connectionSetup(invalid, {}, true, [], forged, api)).isAdmin, false);
  });

  it('recognizes a linked OIDC identity on a local primary account and rechecks disabled aliases', async () => {
    const localUser = { ...user, type: 'local' };
    const local = reportingPrincipal(brand, localUser);
    let disabled = false;
    Reflect.set(globalThis, 'BrandingService', { getBrand: () => brand });
    Reflect.set(globalThis, 'UsersService', {
      getLinkedAccounts: () => of({ linkedAccounts: [{ type: 'oidc', username: 'alice-oidc' }] }),
      getEffectiveUser: () => of(localUser),
    });
    Reflect.set(globalThis, 'User', {
      findOne: (query: Record<string, unknown>) =>
        query.username
          ? Promise.resolve({ id: 'oidc-alias' })
          : { populate: async () => ({ ...user, id: 'oidc-alias', loginDisabled: disabled }) },
    });
    const boundConfig = {
      ...configuration,
      identityBindings: [{ issuer: configuration.issuer, subject: 'alias-subject', username: 'alice-oidc' }],
    };
    const available = await hasMcpOidcIdentity(local);
    assert.equal(await hasMcpOidcIdentity(local, resolveMcpConfig(configuration, brand.name).data), false);
    assert.equal(available, true);
    assert.equal((await connectionSetup(boundConfig, {}, true, ['rdmp'], local, api, available)).state, 'ready');
    disabled = true;
    assert.equal(await hasMcpOidcIdentity(local), false);
    assert.equal(
      (await connectionSetup(boundConfig, {}, true, ['rdmp'], local, api, true)).state,
      'needs-configuration'
    );
  });

  it('does not turn infrastructure failures into a misleading access-denied result', async () => {
    await assert.rejects(
      connectionSetup(configuration, {}, true, ['rdmp'], principal, {
        ...api,
        async getReportingSchema() {
          throw new Error('database credentials');
        },
      })
    );
  });

  it('guards both page and status against disabled, anonymous, other-brand and disabled-user requests', async () => {
    const hook = require('../src/index') as {
      registerRedboxControllers(): {
        McpSetupController: Record<
          'page' | 'status',
          (req: unknown, res: unknown) => Promise<{ status: number; data?: unknown }>
        >;
      };
    };
    const prototype = Controllers.Core.Controller.prototype;
    const sendResp = Reflect.get(prototype, 'sendResp');
    Reflect.set(prototype, 'sendResp', (_req: unknown, _res: unknown, response: unknown) => response);
    const sendView = Reflect.get(prototype, 'sendView');
    Reflect.set(prototype, 'sendView', (_req: unknown, _res: unknown, view: string) => ({ status: 200, view }));
    Reflect.set(globalThis, 'TranslationService', { t: (key: string) => key });
    let persistedDisabled = false;
    let persistedRoles = [adminRole];
    Reflect.set(globalThis, 'sails', {
      config: {
        brandingAware: () => ({ mcp: configuration, mcpSetup: {} }),
        reporting: { enabled: true },
        recordtype: {
          rdmp: { reporting: { enabled: true }, labels: { name: 'Plan', namePlural: '@plan-label' } },
          dataRecord: { reporting: { enabled: true }, labels: { name: 'Data record' } },
          unnamed: { reporting: { enabled: true } },
          restricted: { reporting: { enabled: true }, labels: { namePlural: 'Restricted records' } },
        },
      },
      services: { reportingservice: api },
      getActions: () => ({ 'user/redirlogin': () => ({ status: 302 }) }),
    });
    Reflect.set(globalThis, 'BrandingService', { getBrand: () => brand, getBrandAndPortalPath: () => '/default/rdmp' });
    Reflect.set(globalThis, 'User', {
      findOne: () => ({ populate: async () => ({ ...user, roles: persistedRoles, loginDisabled: persistedDisabled }) }),
    });
    Reflect.set(globalThis, 'UsersService', { getEffectiveUser: () => of({ ...user, roles: persistedRoles }) });
    const controller = hook.registerRedboxControllers().McpSetupController;
    const authenticated = { params: { branding: 'default' }, isAuthenticated: () => true, user: { id: user.id } };
    try {
      delete process.env.REDBOX_MCP_ENABLED;
      for (const action of ['page', 'status'] as const)
        assert.equal((await controller[action](authenticated, {})).status, 404);
      process.env.REDBOX_MCP_ENABLED = 'true';
      for (const action of ['page', 'status'] as const)
        assert.equal((await controller[action]({ isAuthenticated: () => false }, {})).status, 302);
      authenticated.params.branding = 'another';
      for (const action of ['page', 'status'] as const)
        assert.equal((await controller[action](authenticated, {})).status, 404);
      authenticated.params.branding = 'default';
      persistedDisabled = true;
      assert.equal((await controller.status(authenticated, {})).status, 401);
      persistedDisabled = false;
      for (const allowedRole of [adminRole, librarianRole]) {
        persistedRoles = [allowedRole];
        assert.equal((await controller.page(authenticated, {})).status, 200);
        const response = await controller.status(authenticated, {});
        assert.equal(Reflect.get(response.data as object, 'state'), 'ready');
        assert.equal(Reflect.get(response.data as object, 'brand'), 'default');
        assert.deepEqual(Reflect.get(response.data as object, 'recordTypeLabels'), {
          rdmp: '@plan-label',
          dataRecord: 'Data record',
          unnamed: 'unnamed',
        });
        assert.ok(!JSON.stringify(response.data).includes('Restricted records'));
        assert.equal(Reflect.get(response.data as object, 'institutionalLoginUrl'), '/default/rdmp/user/login');
      }
      // Session claims cannot override persisted roles. Same-named foreign roles cannot grant access.
      for (const denied of [[role], [], [Object.assign(new RoleModel(), { id: 'forged', name: 'Admin' })]]) {
        persistedRoles = denied;
        for (const action of ['page', 'status'] as const)
          assert.equal(
            (await controller[action]({ ...authenticated, user: { id: user.id, roles: [adminRole] } }, {})).status,
            403
          );
      }
    } finally {
      Reflect.set(prototype, 'sendResp', sendResp);
      Reflect.set(prototype, 'sendView', sendView);
    }
  });

  it('gates real discovery HTTP requests before and after an MCP handler has been cached', async () => {
    const hook = require('../src/index') as {
      registerRedboxControllers(): { McpController: { handle(req: unknown, res: unknown): Promise<unknown> } };
    };
    const prototype = Controllers.Core.Controller.prototype;
    const sendResp = Reflect.get(prototype, 'sendResp');
    Reflect.set(
      prototype,
      'sendResp',
      (_req: unknown, res: import('node:http').ServerResponse, response: { status: number }) => {
        res.writeHead(response.status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'MCP_UNAVAILABLE' }));
      }
    );
    const runtime = {
      config: { brandingAware: () => ({ mcp: configuration }), reporting: { enabled: true } },
      services: { reportingservice: api },
      log: { info() {} },
    };
    Reflect.set(globalThis, 'sails', runtime);
    Reflect.set(globalThis, 'BrandingService', { getBrand: () => brand });
    const server = createServer((req, res) => {
      void hook
        .registerRedboxControllers()
        .McpController.handle(Object.assign(req, { params: { branding: 'default' } }), res);
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as AddressInfo).port;
    const previousResource = configuration.resourceUrl;
    configuration.resourceUrl = `https://127.0.0.1:${port}/default/mcp`;
    const url = `http://127.0.0.1:${port}/.well-known/oauth-protected-resource/default/mcp`;
    try {
      delete process.env.REDBOX_MCP_ENABLED;
      assert.equal((await fetch(url)).status, 404);
      process.env.REDBOX_MCP_ENABLED = 'true';
      assert.equal((await fetch(url)).status, 200);
      runtime.config.reporting.enabled = false;
      assert.equal((await fetch(url)).status, 503);
      runtime.config.reporting.enabled = true;
      process.env.REDBOX_MCP_ENABLED = 'false';
      assert.equal((await fetch(url)).status, 404);
      assert.deepEqual(schemaCalls, []);
    } finally {
      configuration.resourceUrl = previousResource;
      await new Promise<void>((resolve, reject) => server.close(error => (error ? reject(error) : resolve())));
      Reflect.set(prototype, 'sendResp', sendResp);
    }
  });
});
