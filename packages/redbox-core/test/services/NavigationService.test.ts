const collaborators: any = {};
import {createSinonStubLogger} from "../logger.test";

let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);
import * as sinon from 'sinon';
import { installRepositoryFixtures, restoreRepositoryFixtures, createDomainFixture } from './testHelper';

describe('NavigationService', function () {
  let fixture: any;
  let NavigationService: any;
  let input: any;
  function forRequest(req: any) {
    input.context = { isAuthenticated: req.isAuthenticated(), user: req.user, brand: collaborators.BrandingService.getBrand(), brandPortalPath: collaborators.BrandingService.getBrandAndPortalPath(), currentPath: req.path };
    return NavigationService;
  }

  beforeEach(function () {
    fixture = createDomainFixture({
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

    installRepositoryFixtures();

    // Mock dependent services
    collaborators.BrandingService = {
      getBrandNameFromReq: sinon.stub().returns('default'),
      getBrand: sinon.stub().returns({ id: 'brand-1', name: 'default' }),
      getBrandAndPortalPath: sinon.stub().returns('/default/portal')
    };
    collaborators.RolesService = {
      getRoleByName: sinon.stub().returns({ name: 'Admin' })
    };
    collaborators.UsersService = {
      hasRole: sinon.stub().returns(true)
    };
    collaborators.TranslationService = {
      t: sinon.stub().callsFake((key: string) => key.replace(/-/g, ' '))
    };

    // Import after mocks are set up
    const { Services } = require('../../src/services/NavigationService');
    input = { context: {}, get configuration() { return fixture.config.brandingAware(); }, appmode: fixture.config.appmode, log: fixture.log,
      translate: key => collaborators.TranslationService.t(key), hasRole: (...args) => collaborators.UsersService.hasRole(...args) };
    NavigationService = new Services.Navigation(input);
  });

  afterEach(function () {
    restoreRepositoryFixtures();
    delete collaborators.BrandingService;
    delete collaborators.RolesService;
    delete collaborators.UsersService;
    delete collaborators.TranslationService;
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
      expect(analyzeSection?.items).to.deep.include({ id: 'harvest-runs', labelKey: 'menu-harvest-runs', href: '/admin/harvest-runs' });
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

      const result = await forRequest(mockReq).resolveMenu();

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

      const result = await forRequest(mockReq).resolveMenu();

      expect(result).to.have.property('items');
      expect(result.items).to.be.an('array');
    });

    it('should return empty items on error', async function () {
      // Force an error by breaking the BrandingService
      fixture.config.brandingAware = sinon.stub().throws(new Error('Test error'));

      const mockReq = {
        isAuthenticated: sinon.stub().returns(false),
        user: null,
        path: '/',
        params: {}
      };

      const result = await forRequest(mockReq).resolveMenu();

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

      const result = await forRequest(mockReq).resolveHomePanels();

      expect(result).to.have.property('panels');
      expect(result.panels).to.be.an('array');
    });

    it('should return empty panels on error', async function () {
      // Stub console.error to suppress expected error output
      const consoleErrorStub = sinon.stub(console, 'error');

      fixture.config.brandingAware = sinon.stub().throws(new Error('Test error'));

      const mockReq = {
        isAuthenticated: sinon.stub().returns(false),
        user: null,
        path: '/',
        params: {}
      };

      try {
        const result = await forRequest(mockReq).resolveHomePanels();

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

      const result = await forRequest(mockReq).resolveAdminSidebar();

      expect(result).to.have.property('header');
      expect(result).to.have.property('sections');
      expect(result).to.have.property('footerLinks');
      expect(result.header).to.have.property('title');
      expect(result.header).to.have.property('iconClass');
    });

    it('should return minimal sidebar on error', async function () {
      fixture.config.brandingAware = sinon.stub().throws(new Error('Test error'));

      const mockReq = {
        isAuthenticated: sinon.stub().returns(false),
        user: null,
        path: '/',
        params: {}
      };

      const result = await forRequest(mockReq).resolveAdminSidebar();

      expect(result.header.title).to.equal('Admin');
      expect(result.sections).to.be.an('array');
    });
  });

  describe('public methods', function () {
    it('should export all public methods', function () {
      const exported = NavigationService;

      expect(exported).to.have.property('resolveMenu');
      expect(exported).to.have.property('resolveHomePanels');
      expect(exported).to.have.property('resolveAdminSidebar');
      expect(exported).to.have.property('getDefaultMenuConfig');
      expect(exported).to.have.property('getDefaultHomePanelConfig');
      expect(exported).to.have.property('getDefaultAdminSidebarConfig');
    });
  });
});
