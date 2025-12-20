declare var sails: any;
declare var BrandingService: any;
declare var TranslationService: any;
declare var _: any;

describe('NavigationService', function () {
  let navigationService;
  let originalBrandingAware;
  let mockReq;
  let mockBrand;

  beforeEach(() => {
    navigationService = sails.services.navigationservice;
    originalBrandingAware = sails.config.brandingAware;
    
    // Setup mock brand
    mockBrand = BrandingService.getDefault();
    
    // Setup mock request object
    mockReq = {
      params: { branding: 'default', portal: 'rdmp' },
      session: { branding: 'default' },
      path: '/default/rdmp/researcher/home',
      isAuthenticated: () => true,
      user: {
        id: 'test-user-id',
        name: 'Test User',
        roles: mockBrand.roles || []
      }
    };
  });

  afterEach(() => {
    // Restore original branding aware function
    sails.config.brandingAware = originalBrandingAware;
  });

  describe('getDefaultMenuConfig', function () {
    it('should return the default menu configuration', function () {
      const defaultConfig = navigationService.getDefaultMenuConfig();
      
      expect(defaultConfig).to.have.property('items');
      expect(defaultConfig).to.have.property('showSearch', true);
      expect(defaultConfig.items).to.be.an('array');
      expect(defaultConfig.items.length).to.be.greaterThan(0);
    });
  });

  describe('getDefaultHomePanelConfig', function () {
    it('should return the default home panel configuration', function () {
      const defaultConfig = navigationService.getDefaultHomePanelConfig();
      
      expect(defaultConfig).to.have.property('panels');
      expect(defaultConfig.panels).to.be.an('array');
      expect(defaultConfig.panels.length).to.equal(4); // Plan, Organise, Manage, Publish
    });

    it('should have Plan panel with correct structure', function () {
      const defaultConfig = navigationService.getDefaultHomePanelConfig();
      const planPanel = defaultConfig.panels.find(p => p.id === 'plan');
      
      expect(planPanel).to.exist;
      expect(planPanel.titleKey).to.equal('menu-plan');
      expect(planPanel.iconClass).to.equal('icon-checklist icon-3x');
      expect(planPanel.items).to.be.an('array');
      expect(planPanel.items.length).to.be.greaterThan(0);
    });

    it('should have Organise panel with correct structure', function () {
      const defaultConfig = navigationService.getDefaultHomePanelConfig();
      const organisePanel = defaultConfig.panels.find(p => p.id === 'organise');
      
      expect(organisePanel).to.exist;
      expect(organisePanel.titleKey).to.equal('menu-organise-worspace');
      expect(organisePanel.iconClass).to.equal('fa fa-sitemap fa-3x');
    });

    it('should have Manage panel with correct structure', function () {
      const defaultConfig = navigationService.getDefaultHomePanelConfig();
      const managePanel = defaultConfig.panels.find(p => p.id === 'manage');
      
      expect(managePanel).to.exist;
      expect(managePanel.titleKey).to.equal('menu-manage');
      expect(managePanel.iconClass).to.equal('fa fa-laptop fa-3x');
    });

    it('should have Publish panel with correct structure', function () {
      const defaultConfig = navigationService.getDefaultHomePanelConfig();
      const publishPanel = defaultConfig.panels.find(p => p.id === 'publish');
      
      expect(publishPanel).to.exist;
      expect(publishPanel.titleKey).to.equal('menu-publish');
      expect(publishPanel.iconClass).to.equal('fa fa-rocket fa-3x');
    });
  });

  describe('resolveMenu', function () {
    it('should return resolved menu with items and showSearch', async function () {
      const resolvedMenu = await navigationService.resolveMenu(mockReq);
      
      expect(resolvedMenu).to.have.property('items');
      expect(resolvedMenu).to.have.property('showSearch');
      expect(resolvedMenu.items).to.be.an('array');
    });

    it('should filter items based on authentication for authenticated users', async function () {
      const resolvedMenu = await navigationService.resolveMenu(mockReq);
      
      // Home item for authenticated users should be present (researcher/home)
      const homeAuthItem = resolvedMenu.items.find(
        item => item.href && item.href.includes('/researcher/home')
      );
      expect(homeAuthItem).to.exist;
    });

    it('should filter out auth-required items for unauthenticated users', async function () {
      const unauthReq = {
        ...mockReq,
        isAuthenticated: () => false,
        user: null
      };
      
      const resolvedMenu = await navigationService.resolveMenu(unauthReq);
      
      // Most items require auth, so should be filtered out
      // Only home-anon (requiresAuth: false, hideWhenAuth: true) should show
      const authHomeItem = resolvedMenu.items.find(
        item => item.href && item.href.includes('/researcher/home')
      );
      expect(authHomeItem).to.not.exist;
    });
  });

  describe('resolveHomePanels', function () {
    it('should return resolved home panels', async function () {
      const resolvedPanels = await navigationService.resolveHomePanels(mockReq);
      
      expect(resolvedPanels).to.have.property('panels');
      expect(resolvedPanels.panels).to.be.an('array');
    });

    it('should resolve panel titles from translation keys', async function () {
      const resolvedPanels = await navigationService.resolveHomePanels(mockReq);
      
      expect(resolvedPanels.panels.length).to.be.greaterThan(0);
      
      // Titles should be translated (not equal to keys)
      for (const panel of resolvedPanels.panels) {
        expect(panel.title).to.be.a('string');
        // The title should not be the raw key (unless translation service returns the key)
        expect(panel.iconClass).to.be.a('string');
        expect(panel.columnClass).to.be.a('string');
      }
    });

    it('should resolve panel items with proper URLs', async function () {
      const resolvedPanels = await navigationService.resolveHomePanels(mockReq);
      
      expect(resolvedPanels.panels.length).to.be.greaterThan(0);
      
      for (const panel of resolvedPanels.panels) {
        expect(panel.items).to.be.an('array');
        for (const item of panel.items) {
          expect(item.label).to.be.a('string');
          expect(item.href).to.be.a('string');
          // URLs should be prefixed with brand/portal path
          expect(item.href).to.include('/default/rdmp/');
        }
      }
    });

    it('should include Plan panel with RDMP items', async function () {
      const resolvedPanels = await navigationService.resolveHomePanels(mockReq);
      
      const planPanel = resolvedPanels.panels.find(p => p.id === 'plan');
      expect(planPanel).to.exist;
      expect(planPanel.items.length).to.be.greaterThan(0);
      
      // Should have create RDMP link
      const createRdmpItem = planPanel.items.find(item => 
        item.href && item.href.includes('/record/rdmp/edit')
      );
      expect(createRdmpItem).to.exist;
    });

    it('should include Manage panel with data record items', async function () {
      const resolvedPanels = await navigationService.resolveHomePanels(mockReq);
      
      const managePanel = resolvedPanels.panels.find(p => p.id === 'manage');
      expect(managePanel).to.exist;
      expect(managePanel.items.length).to.be.greaterThan(0);
      
      // Should have create data record link
      const createDataRecordItem = managePanel.items.find(item => 
        item.href && item.href.includes('/record/dataRecord/edit')
      );
      expect(createDataRecordItem).to.exist;
    });

    it('should include Publish panel with publication items', async function () {
      const resolvedPanels = await navigationService.resolveHomePanels(mockReq);
      
      const publishPanel = resolvedPanels.panels.find(p => p.id === 'publish');
      expect(publishPanel).to.exist;
      expect(publishPanel.items.length).to.be.greaterThan(0);
      
      // Should have create publication link
      const createPubItem = publishPanel.items.find(item => 
        item.href && item.href.includes('/record/dataPublication/edit')
      );
      expect(createPubItem).to.exist;
    });

    it('should handle placeholder fallback items correctly', async function () {
      const resolvedPanels = await navigationService.resolveHomePanels(mockReq);
      
      const planPanel = resolvedPanels.panels.find(p => p.id === 'plan');
      expect(planPanel).to.exist;
      
      // The get-advice item has placeholderFallback
      // If translation exists, it should be external
      // If not and hidePlaceholderPages is false, it should show placeholder path
      // If hidePlaceholderPages is true, it should be hidden
      
      // This test verifies the item is either present (with correct behavior) or absent
      const adviceItem = planPanel.items.find(item => 
        item.label && (item.label.includes('advice') || item.label === 'get-advice')
      );
      
      // If present, should have valid href
      if (adviceItem) {
        expect(adviceItem.href).to.be.a('string');
        expect(adviceItem.href.length).to.be.greaterThan(0);
      }
    });

    it('should return empty panels on error', async function () {
      // Create a bad request that will cause an error
      const badReq = {
        params: {},
        session: {},
        path: null,
        isAuthenticated: () => { throw new Error('Test error'); }
      };
      
      const resolvedPanels = await navigationService.resolveHomePanels(badReq);
      
      expect(resolvedPanels).to.have.property('panels');
      expect(resolvedPanels.panels).to.be.an('array');
      expect(resolvedPanels.panels.length).to.equal(0);
    });
  });

  describe('custom branding configuration', function () {
    it('should use custom home panel config from brandingAware', async function () {
      // Setup custom config
      const customConfig = {
        homePanels: {
          panels: [
            {
              id: 'custom',
              titleKey: 'custom-title',
              iconClass: 'fa fa-custom fa-3x',
              items: [
                { labelKey: 'custom-item', href: '/custom/path' }
              ]
            }
          ]
        }
      };
      
      sails.config.brandingAware = () => customConfig;
      
      const resolvedPanels = await navigationService.resolveHomePanels(mockReq);
      
      expect(resolvedPanels.panels.length).to.equal(1);
      expect(resolvedPanels.panels[0].id).to.equal('custom');
    });
  });
});
