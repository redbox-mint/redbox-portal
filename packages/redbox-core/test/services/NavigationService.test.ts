let expect: Chai.ExpectStatic;
import('chai').then(mod => (expect = mod.expect));
import * as sinon from 'sinon';
import { setupServiceTestGlobals, cleanupServiceTestGlobals, createMockSails } from './testHelper';

describe('NavigationService', function () {
  let mockSails: any;
  let NavigationService: any;

  beforeEach(function () {
    mockSails = createMockSails({
      config: {
        appPath: '/app',
        http: { rootContext: '' },
        appUrl: 'http://localhost:1500',
        auth: {
          defaultBrand: 'default',
          defaultPortal: 'portal',
        },
        appmode: {
          workspaces: true,
          dataPublication: true,
        },
        brandingAware: sinon.stub().returns({
          menu: {
            items: [{ labelKey: 'menu-home', href: '/dashboard', requiresAuth: true }],
            showSearch: true,
          },
          homePanels: {
            panels: [],
          },
          adminSidebar: {
            sections: [],
          },
        }),
      },
      log: {
        verbose: sinon.stub(),
        debug: sinon.stub(),
        info: sinon.stub(),
        warn: sinon.stub(),
        error: sinon.stub(),
      },
    });

    setupServiceTestGlobals(mockSails);

    // Mock dependent services
    (global as any).BrandingService = {
      getBrandNameFromReq: sinon.stub().returns('default'),
      getBrand: sinon.stub().returns({ id: 'brand-1', name: 'default' }),
      getBrandAndPortalPath: sinon.stub().returns('/default/portal'),
    };
    (global as any).RolesService = {
      getRoleByName: sinon.stub().returns({ name: 'Admin' }),
    };
    (global as any).UsersService = {
      hasRole: sinon.stub().returns(true),
    };
    (global as any).TranslationService = {
      t: sinon.stub().callsFake((key: string) => key.replace(/-/g, ' ')),
    };

    // Import after mocks are set up
    const { Services } = require('../../src/services/NavigationService');
    NavigationService = new Services.Navigation();
  });

  afterEach(function () {
    cleanupServiceTestGlobals();
    delete (global as any).BrandingService;
    delete (global as any).RolesService;
    delete (global as any).UsersService;
    delete (global as any).TranslationService;
    sinon.restore();
  });

  describe('getDefaultMenuConfig', function () {
    it('should return the default menu configuration', function () {
      const config = NavigationService.getDefaultMenuConfig();

      expect(config).to.have.property('items');
      expect(config).to.have.property('showSearch');
      expect(config.items).to.be.an('array');
    });
  });

  describe('getDefaultHomePanelConfig', function () {
    it('should return the default home panel configuration', function () {
      const config = NavigationService.getDefaultHomePanelConfig();

      expect(config).to.have.property('panels');
      expect(config.panels).to.be.an('array');
    });
  });

  describe('getDefaultAdminSidebarConfig', function () {
    it('should return the default admin sidebar configuration', function () {
      const config = NavigationService.getDefaultAdminSidebarConfig();

      expect(config).to.have.property('sections');
      expect(config.sections).to.be.an('array');
      const analyzeSection = config.sections.find((section: any) => section.id === 'analyze');
      expect(analyzeSection?.items).to.deep.include({
        id: 'harvest-runs',
        labelKey: 'menu-harvest-runs',
        href: '/admin/harvest-runs',
        requiredScope: 'harvest.read',
      });
    });
  });

  describe('resolveMenu', function () {
    it('should resolve menu for authenticated user', async function () {
      const mockReq = {
        isAuthenticated: sinon.stub().returns(true),
        user: { id: 'user-1', roles: ['Admin'] },
        path: '/dashboard',
        params: { branding: 'default', portal: 'portal' },
      };

      const result = await NavigationService.resolveMenu(mockReq);

      expect(result).to.have.property('items');
      expect(result).to.have.property('showSearch');
    });

    it('should resolve menu for unauthenticated user', async function () {
      const mockReq = {
        isAuthenticated: sinon.stub().returns(false),
        user: null,
        path: '/',
        params: { branding: 'default', portal: 'portal' },
      };

      const result = await NavigationService.resolveMenu(mockReq);

      expect(result).to.have.property('items');
      expect(result.items).to.be.an('array');
    });

    it('should return empty items on error', async function () {
      // Force an error by breaking the BrandingService
      (global as any).BrandingService.getBrandNameFromReq = sinon.stub().throws(new Error('Test error'));

      const mockReq = {
        isAuthenticated: sinon.stub().returns(false),
        user: null,
        path: '/',
        params: {},
      };

      const result = await NavigationService.resolveMenu(mockReq);

      expect(result.items).to.be.an('array');
      expect(result.items).to.have.lengthOf(0);
    });
  });

  describe('resolveHomePanels', function () {
    it('should resolve home panels for authenticated user', async function () {
      const mockReq = {
        isAuthenticated: sinon.stub().returns(true),
        user: { id: 'user-1', roles: ['Admin'] },
        path: '/home',
        params: { branding: 'default', portal: 'portal' },
      };

      const result = await NavigationService.resolveHomePanels(mockReq);

      expect(result).to.have.property('panels');
      expect(result.panels).to.be.an('array');
    });

    it('should return empty panels on error', async function () {
      // Stub console.error to suppress expected error output
      const consoleErrorStub = sinon.stub(console, 'error');

      (global as any).BrandingService.getBrandNameFromReq = sinon.stub().throws(new Error('Test error'));

      const mockReq = {
        isAuthenticated: sinon.stub().returns(false),
        user: null,
        path: '/',
        params: {},
      };

      try {
        const result = await NavigationService.resolveHomePanels(mockReq);

        expect(result.panels).to.be.an('array');
        expect(result.panels).to.have.lengthOf(0);
        expect(consoleErrorStub.calledWithMatch(/Error resolving home panels/)).to.be.true;
      } finally {
        consoleErrorStub.restore();
      }
    });
  });

  describe('resolveAdminSidebar', function () {
    it('should resolve admin sidebar for authenticated admin user', async function () {
      const mockReq = {
        isAuthenticated: sinon.stub().returns(true),
        user: { id: 'user-1', roles: ['Admin'] },
        path: '/admin',
        params: { branding: 'default', portal: 'portal' },
      };

      const result = await NavigationService.resolveAdminSidebar(mockReq);

      expect(result).to.have.property('header');
      expect(result).to.have.property('sections');
      expect(result).to.have.property('footerLinks');
      expect(result.header).to.have.property('title');
      expect(result.header).to.have.property('iconClass');
    });

    it('should return minimal sidebar on error', async function () {
      (global as any).BrandingService.getBrandNameFromReq = sinon.stub().throws(new Error('Test error'));

      const mockReq = {
        isAuthenticated: sinon.stub().returns(false),
        user: null,
        path: '/',
        params: {},
      };

      const result = await NavigationService.resolveAdminSidebar(mockReq);

      expect(result.header.title).to.equal('Admin');
      expect(result.sections).to.be.an('array');
    });
  });

  describe('exports', function () {
    it('should export all public methods', function () {
      const exported = NavigationService.exports();

      expect(exported).to.have.property('resolveMenu');
      expect(exported).to.have.property('resolveHomePanels');
      expect(exported).to.have.property('resolveAdminSidebar');
      expect(exported).to.have.property('getDefaultMenuConfig');
      expect(exported).to.have.property('getDefaultHomePanelConfig');
      expect(exported).to.have.property('getDefaultAdminSidebarConfig');
    });
  });

  describe('requiredScope navigation gates', function () {
    const authorizationContext = {
      principal: { category: 'authenticated', authMethod: 'session', active: true, userId: 'user-1' },
      brand: { id: 'brand-1' },
      roleKeys: ['Guest'],
      grantedScopeKeys: [],
      effectiveScopeKeys: [],
      contextType: 'request',
      tokenScopeCeiling: undefined,
      compatibilityRoles: [],
    } as unknown as Record<string, unknown>;

    function configureAuthorization(
      mode: string | undefined,
      options: { hasScope?: boolean; known?: boolean } = {}
    ): void {
      mockSails.config.authorization = mode === undefined ? undefined : { mode };
      (mockSails.services as any).authorizationservice = {
        hasScope: sinon.stub().returns(options.hasScope ?? false),
      };
      (mockSails.services as any).authorizationscopeservice = {
        getRegistry: () => ({ isActive: () => options.known ?? true }),
      };
    }

    function scopeMenuReq(): Record<string, unknown> {
      return {
        isAuthenticated: sinon.stub().returns(true),
        user: { id: 'user-1' },
        path: '/dashboard',
        authorization: authorizationContext,
        authorizationRequestId: 'request-1',
        params: { branding: 'default', portal: 'portal' },
      };
    }

    function scopedItemMenuConfig(): void {
      mockSails.config.brandingAware = sinon.stub().returns({
        menu: {
          items: [
            {
              id: 'scoped-entry',
              labelKey: 'scoped-entry',
              href: '/admin',
              requiresAuth: true,
              requiredScope: 'record.read',
            },
          ],
          showSearch: true,
        },
        homePanels: { panels: [] },
        adminSidebar: { sections: [] },
      });
    }

    it('keeps requiredScope advisory in legacy mode', async function () {
      configureAuthorization('legacy', { hasScope: false });
      scopedItemMenuConfig();

      const result = await NavigationService.resolveMenu(scopeMenuReq());

      expect(result.items.some((item: { href: string }) => item.href.endsWith('/admin'))).to.equal(true);
    });

    it('keeps requiredScope advisory in shadow mode when the scope engine denies', async function () {
      configureAuthorization('shadow', { hasScope: false });
      scopedItemMenuConfig();

      const result = await NavigationService.resolveMenu(scopeMenuReq());

      expect(result.items.some((item: { href: string }) => item.href.endsWith('/admin'))).to.equal(true);
    });

    it('hides requiredScope items in enforce mode when the scope is not effective', async function () {
      configureAuthorization('enforce', { hasScope: false });
      scopedItemMenuConfig();

      const result = await NavigationService.resolveMenu(scopeMenuReq());

      expect(result.items.some((item: { href: string }) => item.href.endsWith('/admin'))).to.equal(false);
    });

    it('shows requiredScope items in enforce mode when the context grants the scope', async function () {
      configureAuthorization('enforce', { hasScope: true });
      scopedItemMenuConfig();

      const result = await NavigationService.resolveMenu(scopeMenuReq());

      expect(result.items.some((item: { href: string }) => item.href.endsWith('/admin'))).to.equal(true);
    });

    it('fails closed in enforce mode when the requiredScope is unknown to the registry', async function () {
      configureAuthorization('enforce', { hasScope: true, known: false });
      scopedItemMenuConfig();

      const result = await NavigationService.resolveMenu(scopeMenuReq());

      expect(result.items.some((item: { href: string }) => item.href.endsWith('/admin'))).to.equal(false);
      expect((mockSails.log.warn as sinon.SinonStub).called).to.equal(true);
    });

    it('fails closed in enforce mode when no authorization context is attached', async function () {
      configureAuthorization('enforce', { hasScope: true });
      scopedItemMenuConfig();
      const req = scopeMenuReq();
      delete req.authorization;

      const result = await NavigationService.resolveMenu(req);

      expect(result.items.some((item: { href: string }) => item.href.endsWith('/admin'))).to.equal(false);
    });

    it('keeps the legacy role gate authoritative alongside requiredScope in enforce mode', async function () {
      configureAuthorization('enforce', { hasScope: true });
      (global as any).UsersService.hasRole = sinon.stub().returns(false);
      mockSails.config.brandingAware = sinon.stub().returns({
        menu: {
          items: [
            {
              id: 'gated-entry',
              labelKey: 'gated-entry',
              href: '/admin',
              requiresAuth: true,
              requiredRoles: ['Admin'],
              requiredScope: 'record.read',
            },
          ],
          showSearch: true,
        },
        homePanels: { panels: [] },
        adminSidebar: { sections: [] },
      });

      const result = await NavigationService.resolveMenu(scopeMenuReq());

      expect(result.items.some((item: { href: string }) => item.href.endsWith('/admin'))).to.equal(false);
    });

    it('records a bounded shadow mismatch when role and scope visibility disagree', async function () {
      configureAuthorization('shadow', { hasScope: false });
      const updateOne = sinon.stub().resolves({});
      (global as any).AuthorizationShadowMismatch = {
        tableName: 'authorizationshadowmismatch',
        getDatastore: () => ({
          manager: {
            collection: () => ({
              updateOne,
              find: () => ({ limit: () => ({ toArray: async () => [] }) }),
              deleteMany: async () => ({ deletedCount: 0 }),
            }),
          },
        }),
      };
      mockSails.config.brandingAware = sinon.stub().returns({
        menu: {
          items: [
            {
              id: 'dual-gated',
              labelKey: 'dual-gated',
              href: '/admin',
              requiresAuth: true,
              requiredRoles: ['Admin'],
              requiredScope: 'record.read',
            },
          ],
          showSearch: true,
        },
        homePanels: { panels: [] },
        adminSidebar: { sections: [] },
      });

      await NavigationService.resolveMenu(scopeMenuReq());
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(updateOne.calledOnce).to.equal(true);
      const criteria = updateOne.firstCall.args[0];
      const update = updateOne.firstCall.args[1];
      expect(criteria).to.have.property('fingerprint').that.is.a('string');
      expect(update.$setOnInsert).to.include({ legacyOutcome: 'allow', scopeOutcome: 'deny' });
      expect(update.$setOnInsert.routeId).to.equal('navigation:menu:dual-gated');
      expect(JSON.stringify(update)).to.not.include('user-1');
      delete (global as any).AuthorizationShadowMismatch;
    });

    it('migrates default navigation entries to destination-route scopes', function () {
      const { coreRouteAuthorization, declaredScope } = require('../../src/authorization/legacy-route-scope-map');
      const { DEFAULT_MENU_CONFIG } = require('../../src/configmodels/MenuConfig');
      const { DEFAULT_ADMIN_SIDEBAR_CONFIG } = require('../../src/configmodels/AdminSidebarConfig');

      const adminItem = DEFAULT_MENU_CONFIG.items.find((item: { id?: string }) => item.id === 'admin');
      expect(adminItem.requiredScope).to.equal(
        declaredScope(coreRouteAuthorization('/:branding/:portal/admin', undefined, undefined))
      );

      const expectations: Array<[string, string, string | undefined, string | undefined]> = [
        ['roles', '/:branding/:portal/admin/roles', 'AdminController', 'rolesIndex'],
        ['users', '/:branding/:portal/admin/users', 'AdminController', 'usersIndex'],
        ['reports', 'get /:branding/:portal/admin/reports', 'ReportsController', 'render'],
        ['harvest-runs', 'get /:branding/:portal/admin/harvest-runs', 'AdminController', 'harvestRunsIndex'],
        ['export', 'get /:branding/:portal/admin/export', 'ExportController', 'index'],
        ['deleted', 'get /:branding/:portal/admin/deletedRecords', 'RecordController', 'renderDeletedRecords'],
        ['branding', 'get /:branding/:portal/admin/branding', undefined, undefined],
        ['translation', '/:branding/:portal/admin/translation', undefined, undefined],
        ['party', '/dashboard/party', 'RecordController', 'renderDashboardView'],
      ];
      const allItems = DEFAULT_ADMIN_SIDEBAR_CONFIG.sections
        .flatMap((section: { items: Array<{ id?: string; requiredScope?: string }> }) => section.items)
        .concat(DEFAULT_ADMIN_SIDEBAR_CONFIG.footerLinks);
      for (const [itemId, pattern, controller, action] of expectations) {
        const item = allItems.find((candidate: { id?: string }) => candidate.id === itemId);
        expect(item, itemId).to.not.equal(undefined);
        expect(item.requiredScope, itemId).to.equal(declaredScope(coreRouteAuthorization(pattern, controller, action)));
      }
      for (const item of allItems) {
        expect(item.requiredScope, item.id).to.not.equal(undefined);
      }
    });
  });
});
