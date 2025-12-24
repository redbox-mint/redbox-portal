declare var NavigationService: any;

describe('menuResolver policy', function () {
  const policy = require('../../../../api/policies/menuResolver');
  let originalNavigationService;

  beforeEach(() => {
    originalNavigationService = NavigationService;
  });

  afterEach(() => {
    NavigationService = originalNavigationService;
  });

  it('should attach resolved navigation data to locals', async function () {
    const resolvedMenu = { items: [{ label: 'Home' }], showSearch: false };
    const resolvedHomePanels = { panels: [{ id: 'panel' }] };
    const resolvedAdminSidebar = {
      header: { title: 'Admin', iconClass: 'fa' },
      sections: [],
      footerLinks: []
    };

    NavigationService = {
      resolveMenu: async () => resolvedMenu,
      resolveHomePanels: async () => resolvedHomePanels,
      resolveAdminSidebar: async () => resolvedAdminSidebar
    };

    const req: any = { options: {} };
    const res: any = {};
    let nextCalled = false;

    await policy(req, res, () => { nextCalled = true; });

    expect(res.locals.menu).to.equal(resolvedMenu);
    expect(res.locals.homePanels).to.equal(resolvedHomePanels);
    expect(res.locals.adminSidebar).to.equal(resolvedAdminSidebar);

    expect(req.options.locals.menu).to.equal(resolvedMenu);
    expect(req.options.locals.homePanels).to.equal(resolvedHomePanels);
    expect(req.options.locals.adminSidebar).to.equal(resolvedAdminSidebar);
    expect(nextCalled).to.equal(true);
  });

  it('should provide empty structures on error', async function () {
    NavigationService = {
      resolveMenu: async () => { throw new Error('boom'); },
      resolveHomePanels: async () => { throw new Error('boom'); },
      resolveAdminSidebar: async () => { throw new Error('boom'); }
    };

    const req: any = { options: {} };
    const res: any = {};
    let nextCalled = false;

    await policy(req, res, () => { nextCalled = true; });

    expect(res.locals.menu.items).to.deep.equal([]);
    expect(res.locals.homePanels.panels).to.deep.equal([]);
    expect(res.locals.adminSidebar.sections).to.deep.equal([]);
    expect(res.locals.adminSidebar.footerLinks).to.deep.equal([]);
    expect(nextCalled).to.equal(true);
  });
});
