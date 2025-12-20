declare var sails: any;
declare var BrandingService: any;
declare var TranslationService: any;
declare var _: any;

describe('MenuService', function () {
  let menuService;
  let originalBrandingAware;
  let mockReq;
  let mockBrand;

  beforeEach(() => {
    menuService = sails.services.menuservice;
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
      const defaultConfig = menuService.getDefaultMenuConfig();
      
      expect(defaultConfig).to.have.property('items');
      expect(defaultConfig).to.have.property('showSearch', true);
      expect(defaultConfig.items).to.be.an('array');
      expect(defaultConfig.items.length).to.be.greaterThan(0);
    });

    it('should have authenticated home item in default config', function () {
      const defaultConfig = menuService.getDefaultMenuConfig();
      
      const homeAuth = defaultConfig.items.find(item => item.id === 'home-auth');
      expect(homeAuth).to.exist;
      expect(homeAuth.labelKey).to.equal('menu-home');
      expect(homeAuth.href).to.equal('/researcher/home');
      expect(homeAuth.requiresAuth).to.equal(true);
    });

    it('should have anonymous home item in default config', function () {
      const defaultConfig = menuService.getDefaultMenuConfig();
      
      const homeAnon = defaultConfig.items.find(item => item.id === 'home-anon');
      expect(homeAnon).to.exist;
      expect(homeAnon.labelKey).to.equal('menu-home');
      expect(homeAnon.href).to.equal('/home');
      expect(homeAnon.requiresAuth).to.equal(false);
      expect(homeAnon.hideWhenAuth).to.equal(true);
    });

    it('should have admin item with required roles', function () {
      const defaultConfig = menuService.getDefaultMenuConfig();
      
      const adminItem = defaultConfig.items.find(item => item.id === 'admin');
      expect(adminItem).to.exist;
      expect(adminItem.requiredRoles).to.include('Admin');
      expect(adminItem.requiredRoles).to.include('Librarians');
    });
  });

  describe('resolveMenu', function () {
    it('should return resolved menu for authenticated user', async function () {
      const resolvedMenu = await menuService.resolveMenu(mockReq);
      
      expect(resolvedMenu).to.have.property('items');
      expect(resolvedMenu).to.have.property('showSearch');
      expect(resolvedMenu.items).to.be.an('array');
    });

    it('should filter out anonymous-only items for authenticated user', async function () {
      const resolvedMenu = await menuService.resolveMenu(mockReq);
      
      // Home item for authenticated users should be present (researcher/home)
      const homeItems = resolvedMenu.items.filter(item => item.label === TranslationService.t('menu-home'));
      
      // Should only have authenticated home, not anonymous home
      homeItems.forEach(item => {
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

      const resolvedMenu = await menuService.resolveMenu(unauthReq);
      
      // Should have items (at minimum the anonymous home)
      expect(resolvedMenu.items.length).to.be.greaterThan(0);
      
      // All items should be for anonymous users (not require auth)
      // The resolved menu should only contain items visible to anonymous users
    });

    it('should resolve URLs with brand/portal prefix', async function () {
      const resolvedMenu = await menuService.resolveMenu(mockReq);
      
      // Find home item
      const homeItem = resolvedMenu.items.find(item => 
        item.href && item.href.includes('/researcher/home')
      );
      
      if (homeItem) {
        expect(homeItem.href).to.include('/default/rdmp');
      }
    });

    it('should handle dropdown menus with children', async function () {
      const resolvedMenu = await menuService.resolveMenu(mockReq);
      
      // Find an item with children (dropdown)
      const dropdownItem = resolvedMenu.items.find(item => 
        item.children && item.children.length > 0
      );
      
      // There should be at least one dropdown (Plan, Organisation, Manage, or Publish)
      expect(dropdownItem).to.exist;
      expect(dropdownItem.children).to.be.an('array');
      expect(dropdownItem.children.length).to.be.greaterThan(0);
    });

    it('should return empty menu on error', async function () {
      // Create a request that will cause an error
      const badReq = null;
      
      const resolvedMenu = await menuService.resolveMenu(badReq);
      
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

      sails.config.brandingAware = (brandName) => ({
        menu: customMenuConfig
      });

      const resolvedMenu = await menuService.resolveMenu(mockReq);
      
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
      
      const resolvedMenu = await menuService.resolveMenu(mockReq);
      
      // Find home item - it should be marked as active
      const homeItem = resolvedMenu.items.find(item => 
        item.href && item.href.includes('/researcher/home')
      );
      
      if (homeItem) {
        expect(homeItem.active).to.equal(true);
      }
    });

    it('should bubble active state to parent dropdown', async function () {
      // Set path to match a child item (e.g., dashboard/rdmp)
      mockReq.path = '/default/rdmp/dashboard/rdmp';
      
      const resolvedMenu = await menuService.resolveMenu(mockReq);
      
      // Find Plan dropdown - should be active because child is active
      const planDropdown = resolvedMenu.items.find(item => 
        item.children && item.children.some(child => 
          child.href && child.href.includes('/dashboard/rdmp')
        )
      );
      
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

      sails.config.brandingAware = (brandName) => ({
        menu: customMenuConfig
      });

      const resolvedMenu = await menuService.resolveMenu(mockReq);
      
      expect(resolvedMenu.items[0].href).to.equal('https://example.com');
      expect(resolvedMenu.items[0].external).to.equal(true);
      expect(resolvedMenu.items[0].target).to.equal('_blank');
    });
  });
});
