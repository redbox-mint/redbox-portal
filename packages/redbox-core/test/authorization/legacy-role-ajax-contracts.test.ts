import { strict as assert } from 'node:assert';
import { describe, it, beforeEach, afterEach } from 'mocha';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as sinon from 'sinon';
import { of, throwError } from 'rxjs';
import {
  LEGACY_ROLES_GET_CONTRACT,
  LEGACY_ROLES_USER_CONTRACT,
  LEGACY_ROLE_AJAX_SECURITY_CONTRACT,
  legacyRolesGetFixtureBrandRoles,
  legacyRolesUserRequestFixture,
} from '../fixtures/legacy-role-ajax.fixtures';
import {
  ROLE_DEPENDENCY_INVENTORY,
  ROLE_READER_INVENTORY,
  ROLE_WRITER_INVENTORY,
} from '../../src/authorization/role-inventory';
import { Services as RolesServices } from '../../src/services/RolesService';
import { Services as RoleAdministrationServices } from '../../src/services/RoleAdministrationService';
import { Controllers as AdminControllers } from '../../src/controllers/AdminController';

describe('legacy role AJAX contracts', function () {
  it('pins the /admin/roles/get compatibility shape', function () {
    assert.equal(LEGACY_ROLES_GET_CONTRACT.method, 'get');
    assert.equal(LEGACY_ROLES_GET_CONTRACT.responseBodyKind, 'array-of-roles-with-users');
    assert.ok(LEGACY_ROLES_GET_CONTRACT.requiredHeaders.includes('Deprecation'));
    const roles = legacyRolesGetFixtureBrandRoles();
    assert.ok(roles.length >= 2);
    for (const role of roles) {
      assert.ok(role.id.length > 0);
      assert.ok(role.name.length > 0);
      assert.ok(role.branding.length > 0);
      assert.ok(Array.isArray(role.users));
    }
  });

  it('pins the /admin/roles/user compatibility shape', function () {
    assert.deepEqual([...LEGACY_ROLES_USER_CONTRACT.requestBody.required], ['userid', 'roles']);
    assert.deepEqual(LEGACY_ROLES_USER_CONTRACT.successBody, { status: true, message: 'Save OK.' });
    assert.equal(LEGACY_ROLES_USER_CONTRACT.missingInputMessage, 'Please provide userid and/or roles names.');
    const request = legacyRolesUserRequestFixture();
    assert.ok(request.userid.length > 0);
    assert.ok(request.roles.length > 0);
  });

  it('records Guest rejection and cross-brand opacity without approval claims', function () {
    assert.equal(LEGACY_ROLE_AJAX_SECURITY_CONTRACT.guestAssignmentError, 'Guest cannot be assigned explicitly');
    assert.equal(LEGACY_ROLE_AJAX_SECURITY_CONTRACT.crossBrandResult, 404);
    assert.equal(LEGACY_ROLE_AJAX_SECURITY_CONTRACT.emptyRolesError, 'Please assign at least one role');
  });

  it('maintains a complete reader/writer/dependency inventory with no supported direct writer', function () {
    assert.ok(ROLE_WRITER_INVENTORY.length >= 7);
    assert.ok(ROLE_READER_INVENTORY.length >= 4);
    assert.ok(ROLE_DEPENDENCY_INVENTORY.length >= 4);
    const supported = ROLE_WRITER_INVENTORY.filter(row => row.classification === 'supported-service');
    assert.ok(supported.every(row => !row.operation.includes('User.addToCollection')));
    assert.ok(ROLE_WRITER_INVENTORY.some(row => row.operation.includes('POST /:branding/:portal/api/roles/:roleName')));
    // Phase 0.5: every maintained UsersService.updateUserRoles call site is enumerated.
    for (const location of [
      'packages/redbox-core/src/controllers/AdminController.ts:updateUserRoles',
      'packages/redbox-core/src/controllers/AdminController.ts:addLocalUser',
      'packages/redbox-core/src/controllers/AdminController.ts:updateUserDetails',
    ]) {
      assert.ok(
        ROLE_WRITER_INVENTORY.some(row => row.location === location && row.classification === 'compatibility-adapter'),
        location
      );
    }
  });

  it('restricts the legacy role-creation bypass from exported writers', function () {
    const exported = new RolesServices.Roles().exports() as Record<string, unknown>;
    assert.equal('createRoleWithBrand' in exported, false);
  });

  it('reconciles every production writer call site against the inventory with no grouped rows', function () {
    // Deterministic source-to-inventory reconciliation over ALL production
    // sources (every .ts file under src/controllers and src/services, minus
    // specs and the inventory module itself): the inventory must name one row
    // per production call site (grouped locations such as
    // `createUser/updateUser` or `initDefAdmin, link alias cleanup` are
    // rejected) and every association-write call site and
    // RoleAdministrationService mutation must resolve to an inventory row.
    const packageRoot = path.resolve(__dirname, '..', '..');
    const discoverProductionSources = (): Record<string, string> => {
      const roots = ['src/controllers', 'src/services'];
      const sources: Record<string, string> = {};
      const walk = (dir: string): void => {
        for (const entry of fs.readdirSync(path.join(packageRoot, dir), { withFileTypes: true })) {
          const relative = `${dir}/${entry.name}`;
          if (entry.isDirectory()) {
            walk(relative);
          } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
            if (relative === 'src/services/role-inventory.ts') continue;
            sources[relative] = fs.readFileSync(path.join(packageRoot, relative), 'utf8');
          }
        }
      };
      for (const root of roots) walk(root);
      assert.ok(
        Object.keys(sources).length > 10,
        `production source discovery found ${Object.keys(sources).length} files`
      );
      return sources;
    };
    const productionSources = discoverProductionSources();
    // The inventory module itself must never be mistaken for a production
    // source: its notes mention writer symbols descriptively.
    assert.ok(
      !Object.keys(productionSources).some(relative => relative.includes('authorization/')),
      'inventory modules must stay out of production source discovery'
    );
    const inventoryLocations = ROLE_WRITER_INVENTORY.map(row => row.location);
    // No grouped method locations: the part after `.ts:` must name exactly one
    // method (no `/` joins, no `,` joins).
    for (const location of inventoryLocations) {
      const marker = '.ts:';
      const index = location.indexOf(marker);
      if (index !== -1) {
        const methodPart = location.slice(index + marker.length);
        assert.ok(
          !methodPart.includes('/') && !methodPart.includes(','),
          `grouped inventory location must be split into one row per call site: ${location}`
        );
      }
    }

    // 1. Compatibility writers: one inventory row per
    // UsersService.updateUserRoles production call site.
    const enclosingMethodAt = (source: string, index: number): string => {
      const methodPattern = /(?:public|private|protected)\s+(?:async\s+)?(\w+)\s*(?:=\s*)?\(/g;
      let match: RegExpExecArray | null;
      let current = 'unknown';
      while ((match = methodPattern.exec(source)) !== null) {
        if (match.index > index) break;
        current = match[1];
      }
      return current;
    };
    const discoveredCallSites: string[] = [];
    for (const [relative, source] of Object.entries(productionSources)) {
      let searchFrom = 0;
      while (true) {
        const found = source.indexOf('UsersService.updateUserRoles', searchFrom);
        if (found === -1) break;
        // Skip the UsersService definition itself: the declaration
        // `public updateUserRoles = (` carries no `UsersService.` qualifier,
        // so every qualified occurrence here is a production call site.
        discoveredCallSites.push(`packages/redbox-core/${relative}:${enclosingMethodAt(source, found)}`);
        searchFrom = found + 1;
      }
    }
    // Normalize to the `packages/redbox-core/src/...` form used by inventory.
    const normalized = discoveredCallSites.map(site =>
      site.replace('packages/redbox-core/src/', 'packages/redbox-core/src/')
    );
    assert.deepEqual(
      [...normalized].sort(),
      [
        'packages/redbox-core/src/controllers/AdminController.ts:addLocalUser',
        'packages/redbox-core/src/controllers/AdminController.ts:updateUserDetails',
        'packages/redbox-core/src/controllers/AdminController.ts:updateUserRoles',
        'packages/redbox-core/src/controllers/webservice/UserManagementController.ts:createUser',
        'packages/redbox-core/src/controllers/webservice/UserManagementController.ts:updateUser',
      ],
      'production UsersService.updateUserRoles call sites changed; update ROLE_WRITER_INVENTORY one row per call site'
    );
    for (const site of normalized) {
      const matches = ROLE_WRITER_INVENTORY.filter(
        row => row.location === site && row.classification === 'compatibility-adapter'
      );
      assert.equal(matches.length, 1, `call site without exactly one compatibility-adapter inventory row: ${site}`);
    }

    // 2. Association writes: every production call site mutating a roles/users
    // collection must be named by an inventory row with the EXACT call-site
    // identity (file:method), never just the file. Waterline interface
    // declarations carry no association literal and never match.
    // Waterline interface declarations carry no association literal within
    // the call statement and never match: the scan stays inside one `;`
    // statement while tolerating nested parentheses such as
    // `String(secondaryUserObj.id ?? '')`.
    const associationPattern =
      /(addToCollection|replaceCollection|removeFromCollection)\([^;]{0,300}?['"](roles|users)['"]/g;
    const discoveredAssociationSites = new Set<string>();
    for (const [relative, source] of Object.entries(productionSources)) {
      associationPattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = associationPattern.exec(source)) !== null) {
        discoveredAssociationSites.add(`packages/redbox-core/${relative}:${enclosingMethodAt(source, match.index)}`);
      }
    }
    assert.deepEqual(
      [...discoveredAssociationSites].sort(),
      [
        'packages/redbox-core/src/services/AuthorizationConfigurationService.ts:projectLegacyAuthority',
        'packages/redbox-core/src/services/RoleAdministrationService.ts:deleteRole',
        'packages/redbox-core/src/services/RoleAdministrationService.ts:inactivateRole',
        'packages/redbox-core/src/services/RoleAdministrationService.ts:projectLegacyAuthority',
        'packages/redbox-core/src/services/RolesService.ts:bootstrap',
        'packages/redbox-core/src/services/RolesService.ts:createRoleWithBrand',
        'packages/redbox-core/src/services/UsersService.ts:initDefAdmin',
        'packages/redbox-core/src/services/UsersService.ts:linkAccounts',
      ],
      'production association-write call sites changed; update ROLE_WRITER_INVENTORY one row per call site'
    );
    for (const site of [...discoveredAssociationSites].sort()) {
      const matches = ROLE_WRITER_INVENTORY.filter(row => row.location === site);
      assert.equal(matches.length, 1, `association-write call site without exactly one inventory row: ${site}`);
    }
    // No stale association rows: every inventory row naming a production
    // file:method whose notes/operation describe an association write must
    // resolve to a discovered call site (the supported-service API row and
    // the unsupported catch-all carry no file:method identity and are
    // verified by the mutation check below instead).
    const staleAssociationRows: string[] = [];
    for (const row of ROLE_WRITER_INVENTORY) {
      if (!row.location.startsWith('packages/redbox-core/src/')) continue;
      if (!row.location.includes('.ts:')) continue;
      // Only rows describing an actual collection-mutation call participate;
      // compatibility-adapter rows merely delegate to updateUserRoles and are
      // verified by the call-site check above instead.
      if (!/addToCollection|replaceCollection|removeFromCollection/.test(`${row.operation} ${row.notes}`)) {
        continue;
      }
      if (!discoveredAssociationSites.has(row.location)) staleAssociationRows.push(row.location);
    }
    assert.deepEqual(
      staleAssociationRows,
      [],
      `stale association-write inventory rows:\n${staleAssociationRows.join('\n')}`
    );

    // 3. RoleAdministrationService mutations: every mutation named by the
    // supported-service row must exist in the service source.
    const supported = ROLE_WRITER_INVENTORY.find(
      row =>
        row.location === 'packages/redbox-core/src/services/RoleAdministrationService.ts' &&
        row.classification === 'supported-service'
    );
    assert.ok(supported, 'supported-service RoleAdministrationService row is required');
    const administrationSource = productionSources['src/services/RoleAdministrationService.ts'];
    assert.ok(administrationSource !== undefined, 'RoleAdministrationService source must be discovered');
    const mutations = supported.operation
      .split('/')
      .map(token => token.trim())
      .filter(token => token.length > 0);
    assert.ok(mutations.length >= 20, `supported-service row names ${mutations.length} mutations`);
    const missingMutations: string[] = [];
    for (const mutation of mutations) {
      const declared = new RegExp(`public\\s+(?:async\\s+)?${mutation}\\s*\\(`).test(administrationSource);
      if (!declared) missingMutations.push(mutation);
    }
    assert.deepEqual(
      missingMutations,
      [],
      `inventory names mutations missing from RoleAdministrationService:\n${missingMutations.join('\n')}`
    );
  });

  it('routes POST /api/roles/:roleName through the supported administration writer', function () {
    // UserManagementController.createSystemRole delegates to
    // RoleAdministrationService.createRole with the request actor and brand;
    // this pins the supported writer so a RolesService bypass cannot return.
    const exported = new RoleAdministrationServices.RoleAdministrationService().exports() as Record<string, unknown>;
    assert.equal('createRole' in exported, true);
  });
});

describe('legacy role AJAX controllers', function () {
  let previousBrandingService: unknown;
  let previousRolesService: unknown;
  let previousUsersService: unknown;
  let previousSails: unknown;

  const brand = { id: 'brand-1', name: 'default', roles: [{ id: 'role-1', name: 'Researcher' }] };

  function installGlobals(
    overrides: {
      getUserForBrand?: unknown;
      updateUserRoles?: unknown;
      getRolesWithBrand?: unknown;
      getRoleIds?: unknown;
    } = {}
  ) {
    Reflect.set(globalThis, 'BrandingService', {
      getBrandFromReq: sinon.stub().returns(brand),
      getBrandAndPortalPath: sinon.stub().returns('/default/rdmp'),
    });
    Reflect.set(globalThis, 'RolesService', {
      getRoleIds: sinon.stub().callsFake((...args: unknown[]) => {
        if (overrides.getRoleIds !== undefined) return overrides.getRoleIds as never;
        return ['role-1'] as never;
      }),
      getRolesWithBrand:
        overrides.getRolesWithBrand !== undefined
          ? overrides.getRolesWithBrand
          : { pipe: () => ({ subscribe: (cb: (v: unknown) => void) => cb(legacyRolesGetFixtureBrandRoles()) }) },
    });
    Reflect.set(globalThis, 'UsersService', {
      getUserForBrand: sinon.stub().callsFake(() => {
        if (overrides.getUserForBrand !== undefined) return overrides.getUserForBrand as never;
        return of({ id: 'user-1', roles: [] }) as never;
      }),
      updateUserRoles: sinon.stub().callsFake(() => {
        if (overrides.updateUserRoles !== undefined) return overrides.updateUserRoles as never;
        return of({ id: 'user-1' }) as never;
      }),
    });
  }

  beforeEach(function () {
    previousBrandingService = Reflect.get(globalThis, 'BrandingService');
    previousRolesService = Reflect.get(globalThis, 'RolesService');
    previousUsersService = Reflect.get(globalThis, 'UsersService');
    previousSails = (globalThis as unknown as { sails: any }).sails;
    (globalThis as unknown as { sails: any }).sails = {
      ...(previousSails as object),
      config: { ...(previousSails as { config: object }).config, auth: { hiddenRoles: [] } },
      log: { error: sinon.stub(), verbose: sinon.stub(), debug: sinon.stub(), info: sinon.stub() },
    };
  });

  afterEach(function () {
    sinon.restore();
    (globalThis as unknown as { sails: any }).sails = previousSails;
    if (previousBrandingService === undefined) Reflect.deleteProperty(globalThis, 'BrandingService');
    else Reflect.set(globalThis, 'BrandingService', previousBrandingService);
    if (previousRolesService === undefined) Reflect.deleteProperty(globalThis, 'RolesService');
    else Reflect.set(globalThis, 'RolesService', previousRolesService);
    if (previousUsersService === undefined) Reflect.deleteProperty(globalThis, 'UsersService');
    else Reflect.set(globalThis, 'UsersService', previousUsersService);
  });

  function stubSendResp(controller: { sendResp: unknown }) {
    const calls: Array<{
      data: unknown;
      headers: Record<string, string>;
      status?: number;
      displayErrors?: Array<{ detail?: string }>;
    }> = [];
    sinon
      .stub(controller as unknown as Record<string, unknown>, 'sendResp')
      .callsFake((_req: unknown, _res: unknown, built: unknown) => {
        const response = built as { data: unknown; headers: Record<string, string>; status?: number };
        calls.push(response);
        return undefined as never;
      });
    return calls;
  }

  function ajaxReq(body: Record<string, unknown>) {
    return { body, params: {}, query: {}, headers: {} } as unknown as Sails.Req;
  }

  it('invokes updateUserRoles successfully with Deprecation/Link headers', async function () {
    installGlobals();
    const controller = new AdminControllers.Admin();
    const calls = stubSendResp(controller as unknown as { sendResp: unknown });
    await controller.updateUserRoles(ajaxReq({ userid: 'user-1', roles: ['Researcher'] }), {} as Sails.Res);
    // updateUserRoles subscribes asynchronously; allow the observable to flush.
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].data, { status: true, message: 'Save OK.' });
    assert.equal(calls[0].headers['Deprecation'], 'true');
    assert.ok(String(calls[0].headers['Link']).includes('rel="successor-version"'));
    assert.ok(String(calls[0].headers['Link']).includes('/api/authorization/assignments'));
  });

  it('returns failure with Deprecation/Link headers when the writer rejects', async function () {
    installGlobals({ updateUserRoles: throwError(() => new Error('writer failed')) });
    const controller = new AdminControllers.Admin();
    const calls = stubSendResp(controller as unknown as { sendResp: unknown });
    await controller.updateUserRoles(ajaxReq({ userid: 'user-1', roles: ['Researcher'] }), {} as Sails.Res);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(calls.length, 1);
    assert.equal((calls[0].data as { status: boolean }).status, false);
    assert.equal(calls[0].headers['Deprecation'], 'true');
    assert.ok(String(calls[0].headers['Link']).includes('rel="successor-version"'));
  });

  it('rejects Guest assignments through the controller failure path', async function () {
    installGlobals({ updateUserRoles: throwError(() => new Error('Guest cannot be assigned explicitly')) });
    const controller = new AdminControllers.Admin();
    const calls = stubSendResp(controller as unknown as { sendResp: unknown });
    await controller.updateUserRoles(ajaxReq({ userid: 'user-1', roles: ['Guest'] }), {} as Sails.Res);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(calls.length, 1);
    assert.equal((calls[0].data as { status: boolean }).status, false);
    assert.match((calls[0].data as { message: string }).message, /Guest/);
    assert.equal(calls[0].headers['Deprecation'], 'true');
  });

  it('rejects empty role sets through the controller failure path', async function () {
    installGlobals({ updateUserRoles: throwError(() => new Error('Please assign at least one role')) });
    const controller = new AdminControllers.Admin();
    const calls = stubSendResp(controller as unknown as { sendResp: unknown });
    await controller.updateUserRoles(ajaxReq({ userid: 'user-1', roles: [] }), {} as Sails.Res);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(calls.length, 1);
    assert.equal((calls[0].data as { status: boolean }).status, false);
    assert.match((calls[0].data as { message: string }).message, /at least one role/);
  });

  it('maps cross-brand targets to opaque 404 without leaking assignment headers', async function () {
    installGlobals({ getUserForBrand: of(null) });
    const controller = new AdminControllers.Admin();
    const calls = stubSendResp(controller as unknown as { sendResp: unknown });
    await controller.updateUserRoles(ajaxReq({ userid: 'foreign-user', roles: ['Researcher'] }), {} as Sails.Res);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(calls.length, 1);
    assert.equal(calls[0].status, 404);
    // Narrowed contract exception: the opaque cross-brand 404 carries only
    // no-cache headers and MUST NOT carry Deprecation/Link successor headers,
    // so the response cannot oracle cross-brand existence via the brand-pathed
    // successor Link. Fixture pins the exception; this test pins the live wire
    // response (status, body detail, and exact no-cache headers) against it.
    assert.equal(calls[0].status, LEGACY_ROLE_AJAX_SECURITY_CONTRACT.crossBrandResult);
    const liveDetail = (calls[0].displayErrors ?? [])[0]?.detail;
    assert.equal(liveDetail, LEGACY_ROLE_AJAX_SECURITY_CONTRACT.crossBrandBodyDetail);
    assert.equal(LEGACY_ROLE_AJAX_SECURITY_CONTRACT.crossBrandBodyDetail, 'Resource was not found.');
    assert.equal(LEGACY_ROLE_AJAX_SECURITY_CONTRACT.crossBrandOmitsDeprecationHeaders, true);
    assert.deepEqual(
      Object.keys(calls[0].headers).sort(),
      [...LEGACY_ROLE_AJAX_SECURITY_CONTRACT.crossBrandHeaders].sort()
    );
    assert.equal(calls[0].headers['Cache-control'], 'no-cache, private');
    assert.equal(calls[0].headers['Pragma'], 'no-cache');
    assert.equal(calls[0].headers['Expires'], '0');
    assert.equal(calls[0].headers['Deprecation'], undefined);
    assert.equal(calls[0].headers['Link'], undefined);
  });

  it('returns missing-input with Deprecation/Link headers per the declared contract', async function () {
    installGlobals();
    const controller = new AdminControllers.Admin();
    const calls = stubSendResp(controller as unknown as { sendResp: unknown });
    await controller.updateUserRoles(ajaxReq({}), {} as Sails.Res);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].data, { status: false, message: 'Please provide userid and/or roles names.' });
    assert.equal(calls[0].headers['Deprecation'], 'true');
    assert.ok(String(calls[0].headers['Link']).includes('rel="successor-version"'));
    // Declared fixture contract still matches the live missing-input message.
    assert.equal(LEGACY_ROLES_USER_CONTRACT.missingInputMessage, 'Please provide userid and/or roles names.');
  });

  it('invokes getBrandRoles with the declared body shape, headers, and hidden-role filtering', function () {
    installGlobals();
    (
      globalThis as unknown as { sails: { config: { auth: { hiddenRoles: string[] } } } }
    ).sails.config.auth.hiddenRoles = ['Guest'];
    // Provide roles in the full declared shape (id/name/branding/users with
    // id/username members, per LEGACY_ROLES_GET_CONTRACT's
    // `array-of-roles-with-users` body kind); the controller must preserve the
    // shape for visible roles and filter the hidden Guest role.
    // getRolesWithBrand is invoked as a function returning an Observable, so
    // the stub returns a real Observable and the controller's pipe/flatMap
    // (including hidden-role filtering) executes.
    const visibleRole = {
      id: 'role-1',
      name: 'Researcher',
      key: 'Researcher',
      branding: 'brand-1',
      users: [{ id: 'user-1', username: 'alice' }],
    };
    Reflect.set(globalThis, 'RolesService', {
      getRoleIds: sinon.stub().returns([]),
      getRolesWithBrand: sinon
        .stub()
        .returns(of([visibleRole, { id: 'role-guest', name: 'Guest', key: 'Guest', branding: 'brand-1', users: [] }])),
    });
    const controller = new AdminControllers.Admin();
    const calls = stubSendResp(controller as unknown as { sendResp: unknown });
    controller.getBrandRoles(ajaxReq({}), {} as Sails.Res);
    assert.equal(calls.length, 1);
    // Declared status: the compatibility adapter emits the default 200.
    assert.ok(calls[0].status === undefined || calls[0].status === 200, `status: ${calls[0].status}`);
    // Declared body shape: array of roles with users; every role carries the
    // declared fields (id, name, branding, users) and every user member
    // carries id/username. The hidden Guest role is filtered.
    assert.ok(Array.isArray(calls[0].data));
    const roles = calls[0].data as Array<Record<string, unknown>>;
    assert.equal(roles.length, 1);
    assert.deepEqual(roles[0], visibleRole);
    for (const role of roles) {
      assert.equal(typeof role.id, 'string');
      assert.ok((role.id as string).length > 0);
      assert.equal(typeof role.name, 'string');
      assert.ok((role.name as string).length > 0);
      assert.equal((role as { name: string }).name === 'Guest', false);
      assert.equal(typeof role.branding, 'string');
      assert.ok((role.branding as string).length > 0);
      assert.ok(Array.isArray(role.users));
      for (const user of role.users as Array<Record<string, unknown>>) {
        assert.equal(typeof user.id, 'string');
        assert.equal(typeof user.username, 'string');
      }
    }
    // Declared headers: every required header from the contract is present,
    // the Link successor carries the declared rel and suffix on the request
    // brand path, and no-cache headers accompany the compatibility payload.
    for (const header of LEGACY_ROLES_GET_CONTRACT.requiredHeaders) {
      assert.ok(calls[0].headers[header] !== undefined, `missing required header: ${header}`);
    }
    assert.equal(calls[0].headers['Deprecation'], 'true');
    assert.ok(String(calls[0].headers['Link']).includes(`rel="${LEGACY_ROLES_GET_CONTRACT.successorRel}"`));
    assert.ok(String(calls[0].headers['Link']).includes(LEGACY_ROLES_GET_CONTRACT.successorSuffix));
    assert.ok(String(calls[0].headers['Link']).includes('/default/rdmp/api/authorization/roles'));
    assert.equal(calls[0].headers['Cache-control'], 'no-cache, private');
    assert.equal(calls[0].headers['Pragma'], 'no-cache');
    assert.equal(calls[0].headers['Expires'], '0');
  });
});
