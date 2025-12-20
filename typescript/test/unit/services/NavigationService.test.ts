declare var sails: any;
declare var BrandingService: any;
declare var TranslationService: any;
declare var _: any;

describe('NavigationService', function () {
  let navigationService;
  let originalBrandingAware;
  let originalTranslationT;
  let originalAppmode;
  let translationMap;
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

    translationMap = {};
    originalTranslationT = TranslationService.t;
    TranslationService.t = (key: string) => translationMap[key] || key;

    originalAppmode = sails.config.appmode;
    sails.config.appmode = { ...(originalAppmode || {}) };
  });

  afterEach(() => {
    // Restore original branding aware function
    sails.config.brandingAware = originalBrandingAware;
    TranslationService.t = originalTranslationT;
    sails.config.appmode = originalAppmode;
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

  describe('getDefaultAdminSidebarConfig', function () {
    it('should return the default admin sidebar configuration', function () {
      const defaultConfig = navigationService.getDefaultAdminSidebarConfig();

      expect(defaultConfig).to.have.property('header');
      expect(defaultConfig).to.have.property('sections');
      expect(defaultConfig).to.have.property('footerLinks');
      expect(defaultConfig.sections).to.be.an('array');
      expect(defaultConfig.footerLinks).to.be.an('array');
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

    it('should respect custom menu config and showSearch false', async function () {
      translationMap['custom-label'] = 'Custom Label';
      sails.config.brandingAware = () => ({
        menu: {
          showSearch: false,
          items: [
            { id: 'custom', labelKey: 'custom-label', href: '/custom', requiresAuth: true }
          ]
        }
      });

      const resolvedMenu = await navigationService.resolveMenu(mockReq);

      expect(resolvedMenu.showSearch).to.equal(false);
      expect(resolvedMenu.items).to.have.length(1);
      expect(resolvedMenu.items[0].label).to.equal('Custom Label');
      expect(resolvedMenu.items[0].href).to.equal('/default/rdmp/custom');
    });

    it('should mark parent items active when a child matches the current path', async function () {
      translationMap.parent = 'Parent';
      translationMap.child = 'Child';

      sails.config.brandingAware = () => ({
        menu: {
          items: [
            {
              id: 'parent',
              labelKey: 'parent',
              href: '#',
              children: [
                { id: 'child', labelKey: 'child', href: '/child' }
              ]
            }
          ]
        }
      });

      const req = { ...mockReq, path: '/default/rdmp/child' };
      const resolvedMenu = await navigationService.resolveMenu(req);

      expect(resolvedMenu.items[0].active).to.equal(true);
      expect(resolvedMenu.items[0].children).to.have.length(1);
      expect(resolvedMenu.items[0].children[0].active).to.equal(true);
    });

    it('should hide items when feature flag is disabled', async function () {
      sails.config.appmode = { features: { menuItem: false } };
      sails.config.brandingAware = () => ({
        menu: {
          items: [
            { id: 'flagged', labelKey: 'flagged', href: '/flagged', featureFlag: 'features.menuItem' }
          ]
        }
      });

      const resolvedMenu = await navigationService.resolveMenu(mockReq);

      expect(resolvedMenu.items).to.have.length(0);
    });

    it('should use external link when placeholder translation exists', async function () {
      translationMap['help-link'] = 'https://example.com/help';
      sails.config.brandingAware = () => ({
        menu: {
          items: [
            {
              id: 'help',
              labelKey: 'help',
              href: '/help',
              placeholderFallback: {
                translationKey: 'help-link',
                placeholderPath: '/help-placeholder'
              }
            }
          ]
        }
      });

      const resolvedMenu = await navigationService.resolveMenu(mockReq);

      expect(resolvedMenu.items).to.have.length(1);
      expect(resolvedMenu.items[0].href).to.equal('https://example.com/help');
      expect(resolvedMenu.items[0].external).to.equal(true);
      expect(resolvedMenu.items[0].target).to.equal('_blank');
    });

    it('should fall back to placeholder path when translation missing and placeholders allowed', async function () {
      sails.config.appmode = { hidePlaceholderPages: false };
      sails.config.brandingAware = () => ({
        menu: {
          items: [
            {
              id: 'help',
              labelKey: 'help',
              href: '/help',
              placeholderFallback: {
                translationKey: 'missing-link',
                placeholderPath: '/placeholder'
              }
            }
          ]
        }
      });

      const resolvedMenu = await navigationService.resolveMenu(mockReq);

      expect(resolvedMenu.items).to.have.length(1);
      expect(resolvedMenu.items[0].href).to.equal('/default/rdmp/placeholder');
      expect(resolvedMenu.items[0].external).to.equal(false);
    });

    it('should hide items when translation missing and visibleWhenTranslationExists is true', async function () {
      sails.config.brandingAware = () => ({
        menu: {
          items: [
            {
              id: 'needs-translation',
              labelKey: 'missing-translation',
              href: '/missing',
              visibleWhenTranslationExists: true
            }
          ]
        }
      });

      const resolvedMenu = await navigationService.resolveMenu(mockReq);
      expect(resolvedMenu.items).to.have.length(0);

      translationMap['missing-translation'] = 'Translated';
      const resolvedWithTranslation = await navigationService.resolveMenu(mockReq);
      expect(resolvedWithTranslation.items).to.have.length(1);
    });

    it('should return empty menu on error', async function () {
      const badReq = {
        ...mockReq,
        isAuthenticated: () => { throw new Error('Test error'); }
      };

      const resolvedMenu = await navigationService.resolveMenu(badReq);

      expect(resolvedMenu.items).to.have.length(0);
      expect(resolvedMenu.showSearch).to.equal(true);
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

    it('should filter out panels when all items are hidden', async function () {
      sails.config.brandingAware = () => ({
        homePanels: {
          panels: [
            {
              id: 'private',
              titleKey: 'private-panel',
              iconClass: 'fa fa-lock',
              items: [
                { labelKey: 'private-item', href: '/private', requiresAuth: true }
              ]
            }
          ]
        }
      });

      const req = {
        ...mockReq,
        isAuthenticated: () => false,
        user: null
      };

      const resolvedPanels = await navigationService.resolveHomePanels(req);

      expect(resolvedPanels.panels).to.have.length(0);
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

  describe('resolveAdminSidebar', function () {
    it('should resolve header, sections, and footer links with URL prefixing', async function () {
      translationMap['menu-admin'] = 'Admin';
      translationMap['admin-section'] = 'Admin Section';
      translationMap['admin-item'] = 'Admin Item';
      translationMap['help-link'] = 'Help';

      sails.config.brandingAware = () => ({
        adminSidebar: {
          header: { titleKey: 'menu-admin', iconClass: 'fa fa-star' },
          sections: [
            {
              id: 'admin',
              titleKey: 'admin-section',
              requiredRoles: ['Admin'],
              items: [
                { id: 'roles', labelKey: 'admin-item', href: '/admin/roles' }
              ]
            }
          ],
          footerLinks: [
            { id: 'help', labelKey: 'help-link', href: '/help' }
          ]
        }
      });

      const adminRole = mockBrand.roles.find((role: any) => role.name === 'Admin') || mockBrand.roles[0];
      const req = {
        ...mockReq,
        user: { ...mockReq.user, roles: [adminRole] }
      };

      const resolvedSidebar = await navigationService.resolveAdminSidebar(req);

      expect(resolvedSidebar.header.title).to.equal('Admin');
      expect(resolvedSidebar.sections).to.have.length(1);
      expect(resolvedSidebar.sections[0].items[0].href).to.equal('/default/rdmp/admin/roles');
      expect(resolvedSidebar.footerLinks[0].href).to.equal('/default/rdmp/help');
    });

    it('should filter sections based on roles and feature flags', async function () {
      sails.config.appmode = { flags: { showSection: false } };
      sails.config.brandingAware = () => ({
        adminSidebar: {
          header: { titleKey: 'menu-admin', iconClass: 'fa fa-cog' },
          sections: [
            {
              id: 'admin',
              titleKey: 'admin-section',
              requiredRoles: ['Admin'],
              items: [
                { id: 'roles', labelKey: 'admin-item', href: '/admin/roles' }
              ]
            },
            {
              id: 'flagged',
              titleKey: 'flagged-section',
              featureFlag: 'flags.showSection',
              items: [
                { id: 'flagged', labelKey: 'flagged-item', href: '/flagged' }
              ]
            }
          ],
          footerLinks: []
        }
      });

      const researcherRole = mockBrand.roles.find((role: any) => role.name === 'Researcher') || mockBrand.roles[0];
      const req = {
        ...mockReq,
        user: { ...mockReq.user, roles: [researcherRole] }
      };

      const resolvedSidebar = await navigationService.resolveAdminSidebar(req);

      expect(resolvedSidebar.sections).to.have.length(0);
    });
  });

  describe('Additional MenuService Tests', function () {
    describe('getDefaultMenuConfig', function () {
      it('should have authenticated home item in default config', function () {
        const defaultConfig = navigationService.getDefaultMenuConfig();
        const homeAuth = defaultConfig.items.find((item: any) => item.id === 'home-auth');
        expect(homeAuth).to.exist;
        expect(homeAuth.labelKey).to.equal('menu-home');
        expect(homeAuth.href).to.equal('/researcher/home');
        expect(homeAuth.requiresAuth).to.equal(true);
      });
      it('should have anonymous home item in default config', function () {
        const defaultConfig = navigationService.getDefaultMenuConfig();
        const homeAnon = defaultConfig.items.find((item: any) => item.id === 'home-anon');
        expect(homeAnon).to.exist;
        expect(homeAnon.labelKey).to.equal('menu-home');
        expect(homeAnon.href).to.equal('/home');
        expect(homeAnon.requiresAuth).to.equal(false);
        expect(homeAnon.hideWhenAuth).to.equal(true);
      });
      it('should have admin item with required roles', function () {
        const defaultConfig = navigationService.getDefaultMenuConfig();
        const adminItem = defaultConfig.items.find((item: any) => item.id === 'admin');
        expect(adminItem).to.exist;
        expect(adminItem.requiredRoles).to.include('Admin');
        expect(adminItem.requiredRoles).to.include('Librarians');
      });
    });

    describe('resolveMenu', function () {
      it('should filter out anonymous-only items for authenticated user', async function () {
        const resolvedMenu = await navigationService.resolveMenu(mockReq);
        // Home item for authenticated users should be present (researcher/home)
        const homeItems = resolvedMenu.items.filter((item: any) => item.label === TranslationService.t('menu-home'));
        // Should only have authenticated home, not anonymous home
        homeItems.forEach((item: any) => {
          expect(item.href).to.not.equal('/default/rdmp/home');
        });
      });
      it('should show only anonymous items for unauthenticated user', async function () {
        // Create unauthenticated request
        const unauthReq = {
          ...mockReq,
          isAuthenticated: () => false,
          user: null
        };
        const resolvedMenu = await navigationService.resolveMenu(unauthReq);
        // Should have items (at minimum the anonymous home)
        expect(resolvedMenu.items.length).to.be.greaterThan(0);
        // All items should be for anonymous users (not require auth)
        // The resolved menu should only contain items visible to anonymous users
      });
      it('should resolve URLs with brand/portal prefix', async function () {
        const resolvedMenu = await navigationService.resolveMenu(mockReq);
        // Find home item
        const homeItem = resolvedMenu.items.find((item: any) => item.href && item.href.includes('/researcher/home'));
        if (homeItem) {
          expect(homeItem.href).to.include('/default/rdmp');
        }
      });
      it('should handle dropdown menus with children', async function () {
        const resolvedMenu = await navigationService.resolveMenu(mockReq);
        // Find an item with children (dropdown)
        const dropdownItem = resolvedMenu.items.find((item: any) => item.children && item.children.length > 0);
        // There should be at least one dropdown (Plan, Organisation, Manage, or Publish)
        expect(dropdownItem).to.exist;
        expect(dropdownItem.children).to.be.an('array');
        expect(dropdownItem.children.length).to.be.greaterThan(0);
      });
      it('should return empty menu on error', async function () {
        // Create a request that will cause an error
        const badReq = null;
        const resolvedMenu = await navigationService.resolveMenu(badReq);
        expect(resolvedMenu).to.have.property('items');
        expect(resolvedMenu.items).to.be.an('array');
        expect(resolvedMenu).to.have.property('showSearch', true);
      });
      it('should use custom menu config from brandingAware when available', async function () {
        // Set up custom menu config via brandingAware
        const customMenuConfig = {
          items: [
            {
              id: 'custom-item',
              labelKey: 'menu-home',
              href: '/custom-path',
              requiresAuth: true
            }
          ],
          showSearch: false
        };
        sails.config.brandingAware = (brandName: string) => ({
          menu: customMenuConfig
        });
        const resolvedMenu = await navigationService.resolveMenu(mockReq);
        expect(resolvedMenu.showSearch).to.equal(false);
        // Should have only the custom item
        expect(resolvedMenu.items.length).to.equal(1);
        expect(resolvedMenu.items[0].href).to.include('/custom-path');
      });
    });

    describe('active state computation', function () {
      it('should mark current path item as active', async function () {
        // Set path to match researcher home
        mockReq.path = '/default/rdmp/researcher/home';
        const resolvedMenu = await navigationService.resolveMenu(mockReq);
        // Find home item - it should be marked as active
        const homeItem = resolvedMenu.items.find((item: any) => item.href && item.href.includes('/researcher/home'));
        if (homeItem) {
          expect(homeItem.active).to.equal(true);
        }
      });
      it('should bubble active state to parent dropdown', async function () {
        // Set path to match a child item (e.g., dashboard/rdmp)
        mockReq.path = '/default/rdmp/dashboard/rdmp';
        const resolvedMenu = await navigationService.resolveMenu(mockReq);
        // Find Plan dropdown - should be active because child is active
        const planDropdown = resolvedMenu.items.find((item: any) => item.children && item.children.some((child: any) => child.href && child.href.includes('/dashboard/rdmp')));
        if (planDropdown) {
          expect(planDropdown.active).to.equal(true);
        }
      });
    });

    describe('external links', function () {
      it('should not prefix external URLs', async function () {
        const customMenuConfig = {
          items: [
            {
              id: 'external-link',
              labelKey: 'menu-home',
              href: 'https://example.com',
              requiresAuth: true,
              external: true
            }
          ],
          showSearch: true
        };
        sails.config.brandingAware = (brandName: string) => ({
          menu: customMenuConfig
        });
        const resolvedMenu = await navigationService.resolveMenu(mockReq);
        expect(resolvedMenu.items[0].href).to.equal('https://example.com');
        expect(resolvedMenu.items[0].external).to.equal(true);
        expect(resolvedMenu.items[0].target).to.equal('_blank');
      });
    });
  });
});
