import {createSinonStubLogger} from "../logger.test";

let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);
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
          defaultPortal: 'portal'
        },
        appmode: {
          workspaces: true,
          dataPublication: true
        },
        brandingAware: sinon.stub().returns({
          menu: {
            items: [
              { labelKey: 'menu-home', href: '/dashboard', requiresAuth: true }
            ],
            showSearch: true
          },
          homePanels: {
            panels: []
          },
          adminSidebar: {
            sections: []
          }
        })
      },
      log: createSinonStubLogger(sinon),
    });

    setupServiceTestGlobals(mockSails);

    // Mock dependent services
    (global as any).BrandingService = {
      getBrandNameFromReq: sinon.stub().returns('default'),
      getBrand: sinon.stub().returns({ id: 'brand-1', name: 'default' }),
      getBrandAndPortalPath: sinon.stub().returns('/default/portal')
    };
    (global as any).RolesService = {
      getRoleByName: sinon.stub().returns({ name: 'Admin' })
    };
    (global as any).UsersService = {
      hasRole: sinon.stub().returns(true)
    };
    (global as any).TranslationService = {
      t: sinon.stub().callsFake((key: string) => key.replace(/-/g, ' '))
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
      const recordsSection = config.sections.find((section: any) => section.id === 'records');
      expect(recordsSection?.items).to.deep.include({ id: 'harvest-runs', labelKey: 'admin-nav-harvest-runs', href: '/admin/harvest-runs' });
    });
  });

  describe('resolveMenu', function () {
    it('should resolve menu for authenticated user', async function () {
      const mockReq = {
        isAuthenticated: sinon.stub().returns(true),
        user: { id: 'user-1', roles: ['Admin'] },
        path: '/dashboard',
        params: { branding: 'default', portal: 'portal' }
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
        params: { branding: 'default', portal: 'portal' }
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
        params: {}
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
        params: { branding: 'default', portal: 'portal' }
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
        params: {}
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
        params: { branding: 'default', portal: 'portal' }
      };

      const result = await NavigationService.resolveAdminSidebar(mockReq);

      expect(result).to.have.property('header');
      expect(result).to.have.property('sections');
      expect(result).to.have.property('footerLinks');
      expect(result.header).to.have.property('title');
      expect(result.header).to.have.property('iconClass');
    });

    it('uses one default layout for runtime branding and the config editor', function () {
      const { brandingConfigurationDefaults } = require('../../src/config/brandingConfigurationDefaults.config');
      expect(brandingConfigurationDefaults.adminSidebar).to.equal(NavigationService.getDefaultAdminSidebarConfig());
      expect(brandingConfigurationDefaults.adminSidebar.sections.map((section: any) => section.id))
        .to.deep.equal(['records', 'people', 'site', 'lookups', 'integrations', 'developer']);
      expect(brandingConfigurationDefaults.adminSidebar.footerLinks).to.deep.equal([]);
    });

    it('highlights every default route, including each app-config and report detail', async function () {
      mockSails.config.brandingAware.returns({});
      const config = NavigationService.getDefaultAdminSidebarConfig();
      for (const section of config.sections) {
        for (const item of section.items) {
          const result = await NavigationService.resolveAdminSidebar({
            isAuthenticated: () => true, user: { roles: ['Admin'] }, path: '/default/portal' + item.href
          });
          const active = result.sections.flatMap((resolved: any) => resolved.items).filter((link: any) => link.active);
          expect(active.map((link: any) => link.href), item.href).to.deep.equal(['/default/portal' + item.href]);
        }
      }
      const result = await NavigationService.resolveAdminSidebar({
        isAuthenticated: () => true, user: { roles: ['Admin'] }, path: '/default/portal/admin/report/example'
      });
      expect(result.sections.flatMap((section: any) => section.items).filter((link: any) => link.active)
        .map((link: any) => link.href)).to.deep.equal(['/default/portal/admin/reports']);
    });

    it('keeps records and reporting visible to other authenticated roles', async function () {
      mockSails.config.brandingAware.returns({});
      (global as any).UsersService.hasRole.returns(false);
      const result = await NavigationService.resolveAdminSidebar({
        isAuthenticated: () => true, user: { roles: ['Researcher'] }, path: '/default/portal/admin/reports'
      });
      expect(result.sections.map((section: any) => section.id)).to.deep.equal(['records']);
    });

    it('preserves saved sections, footer links and external links without marking them active', async function () {
      mockSails.config.brandingAware.returns({ adminSidebar: {
        sections: [{ id: 'custom', titleKey: 'custom', items: [
          { labelKey: 'custom', href: '/admin/users' },
          { labelKey: 'external', href: 'https://example.org/admin/users', external: true }
        ] }], footerLinks: [{ labelKey: 'footer', href: '/admin/branding' }]
      } });
      const result = await NavigationService.resolveAdminSidebar({
        isAuthenticated: () => true, user: { roles: ['Admin'] }, path: '/default/portal/admin/users'
      });
      expect(result.sections.map((section: any) => section.id)).to.deep.equal(['custom']);
      expect(result.sections[0].items.map((item: any) => item.active)).to.deep.equal([true, false]);
      expect(result.sections[0].items[1].target).to.equal('_blank');
      expect(result.footerLinks[0].href).to.equal('/default/portal/admin/branding');
    });

    it('should return minimal sidebar on error', async function () {
      (global as any).BrandingService.getBrandNameFromReq = sinon.stub().throws(new Error('Test error'));

      const mockReq = {
        isAuthenticated: sinon.stub().returns(false),
        user: null,
        path: '/',
        params: {}
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
});
