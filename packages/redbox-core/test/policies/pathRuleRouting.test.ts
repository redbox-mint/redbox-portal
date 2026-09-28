import assert from 'node:assert/strict';
import { firstValueFrom } from 'rxjs';
import { Services } from '../../src/services/PathRulesService';
import { checkAuth } from '../../src/policies/checkAuth';
import { BrandingModel } from '../../src/model/storage/BrandingModel';

describe('Path-rule routing authorization', () => {
  const brand = Object.assign(new BrandingModel(), { id: 'brand-1', name: 'default' });
  const admin = { id: 'admin-1' };
  const researcher = { id: 'researcher-1' };
  const guest = { id: 'guest-1' };
  const rules = [
    { path: '/:branding/:portal/admin(/*)', role: admin, branding: brand, can_update: true },
    { path: '/:branding/:portal/user/genKey', role: admin, branding: brand, can_update: true },
    { path: '/:branding/:portal/user/revokeKey', role: admin, branding: brand, can_update: true },
    { path: '/:branding/:portal/home/', role: guest, branding: brand, can_read: true },
  ];
  let service: Services.PathRules;
  let savedGlobals: Record<string, unknown>;

  beforeEach(async () => {
    savedGlobals = {
      PathRule: Reflect.get(globalThis, 'PathRule'),
      PathRulesService: Reflect.get(globalThis, 'PathRulesService'),
      BrandingService: Reflect.get(globalThis, 'BrandingService'),
      RolesService: Reflect.get(globalThis, 'RolesService'),
    };
    const query = {
      populate: (_association: string) => query,
      exec: (callback: (error: null, result: typeof rules) => void) => callback(null, rules),
    };
    service = new Services.PathRules();
    Object.assign(globalThis, {
      PathRule: { find: () => query },
      PathRulesService: service,
      BrandingService: { getBrand: () => brand },
      RolesService: { getDefUnathenticatedRole: () => guest },
    });
    await firstValueFrom(service.loadRules());
  });

  afterEach(() => Object.assign(globalThis, savedGlobals));

  const protectedPaths = [
    '/default/rdmp/admin/users/get',
    '/default/rdmp/AdMiN/users/get',
    '/default/rdmp/ADMIN/users/generateKey',
    '/default/rdmp/user/genKey',
    '/default/rdmp/USER/GENKEY',
    '/default/rdmp/user/genKey/',
    '/default/rdmp/USER/REVOKEKEY/',
  ];

  for (const path of protectedPaths) {
    for (const authenticated of [false, true]) {
      it(`denies ${authenticated ? 'researcher' : 'anonymous'} access to ${path}`, () => {
        let nextCalled = false;
        let status: number | undefined;
        const req = {
          path,
          headers: { 'content-type': 'application/json' },
          session: { branding: brand.name },
          isAuthenticated: () => authenticated,
          user: authenticated ? { roles: [researcher] } : undefined,
        } as unknown as Sails.Req;
        const response = {
          status: (value: number) => {
            status = value;
            return response;
          },
          json: () => response,
          send: () => response,
        };

        checkAuth(req, response as unknown as Sails.Res, () => {
          nextCalled = true;
        });

        assert.equal(status, 403);
        assert.equal(nextCalled, false);
      });
    }

    it(`retains administrator access to ${path}`, () => {
      const matches = service.getRulesFromPath(path, brand);
      assert.ok(matches);
      assert.equal(service.canRead(matches, [admin], brand.name), true);
    });
  }

  it('keeps rules scoped to the stored brand ID', () => {
    const otherBrand = Object.assign(new BrandingModel(), { id: 'brand-2', name: 'other' });
    assert.equal(service.getRulesFromPath('/other/rdmp/ADMIN/users/get', otherBrand), null);
  });

  it('matches configured trailing slashes and preserves public access', () => {
    for (const path of ['/default/rdmp/home', '/default/rdmp/HOME/']) {
      const matches = service.getRulesFromPath(path, brand);
      assert.ok(matches);
      assert.equal(service.canRead(matches, [guest], brand.name), true);
    }
  });
});
