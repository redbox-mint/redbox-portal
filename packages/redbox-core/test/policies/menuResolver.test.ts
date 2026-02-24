let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);
import { menuResolver } from '../../src/policies/menuResolver';

// Mock globals

(global as any).sails = {
    log: {
        warn: () => { }
    }
};

(global as any).NavigationService = {
    resolveMenu: async () => ({ items: [], showSearch: true }),
    resolveHomePanels: async () => ({ panels: [] }),
    resolveAdminSidebar: async () => ({ header: { title: 'Admin', iconClass: 'fa fa-cog' }, sections: [], footerLinks: [] })
};

describe('menuResolver policy', function () {
    let originalSails: any;
    let originalNavigationService: any;

    beforeEach(function () {
        originalSails = (global as any).sails;
        originalNavigationService = (global as any).NavigationService;

        (global as any).sails = {
            log: {
                warn: () => { }
            }
        };
    });

    afterEach(function () {
        (global as any).sails = originalSails;
        (global as any).NavigationService = originalNavigationService;
    });

    function createMockReqRes() {
        const req: any = { options: {} };
        const res: any = {};
        return { req, res };
    }

    it('should attach resolved menu to res.locals and req.options.locals', async function () {
        const resolvedMenu = { items: [{ label: 'Home' }], showSearch: false };
        const resolvedHomePanels = { panels: [{ id: 'panel1' }] };
        const resolvedAdminSidebar = { header: { title: 'Admin', iconClass: 'fa fa-gear' }, sections: [{ id: 's1' }], footerLinks: [] };

        (global as any).NavigationService = {
            resolveMenu: async () => resolvedMenu,
            resolveHomePanels: async () => resolvedHomePanels,
            resolveAdminSidebar: async () => resolvedAdminSidebar
        };

        const { req, res } = createMockReqRes();
        let nextCalled = false;

        await menuResolver(req, res, () => { nextCalled = true; });

        expect(nextCalled).to.be.true;
        expect(res.locals.menu).to.deep.equal(resolvedMenu);
        expect(res.locals.homePanels).to.deep.equal(resolvedHomePanels);
        expect(res.locals.adminSidebar).to.deep.equal(resolvedAdminSidebar);
        expect(req.options.locals.menu).to.deep.equal(resolvedMenu);
        expect(req.options.locals.homePanels).to.deep.equal(resolvedHomePanels);
        expect(req.options.locals.adminSidebar).to.deep.equal(resolvedAdminSidebar);
    });

    it('should provide empty structures on NavigationService error', async function () {
        (global as any).NavigationService = {
            resolveMenu: async () => { throw new Error('Menu error'); },
            resolveHomePanels: async () => { throw new Error('Panels error'); },
            resolveAdminSidebar: async () => { throw new Error('Sidebar error'); }
        };

        const { req, res } = createMockReqRes();
        let nextCalled = false;

        await menuResolver(req, res, () => { nextCalled = true; });

        expect(nextCalled).to.be.true;
        expect(res.locals.menu).to.deep.equal({ items: [], showSearch: true });
        expect(res.locals.homePanels).to.deep.equal({ panels: [] });
        expect(res.locals.adminSidebar.sections).to.deep.equal([]);
        expect(res.locals.adminSidebar.footerLinks).to.deep.equal([]);
    });

    it('should initialize res.locals if undefined', async function () {
        (global as any).NavigationService = {
            resolveMenu: async () => ({ items: [], showSearch: true }),
            resolveHomePanels: async () => ({ panels: [] }),
            resolveAdminSidebar: async () => ({ header: {}, sections: [], footerLinks: [] })
        };

        const req: any = { options: {} };
        const res: any = {}; // No locals
        let nextCalled = false;

        await menuResolver(req, res, () => { nextCalled = true; });

        expect(nextCalled).to.be.true;
        expect(res.locals).to.be.an('object');
        expect(res.locals.menu).to.exist;
    });

    it('should handle missing req.options gracefully in error case', async function () {
        (global as any).NavigationService = {
            resolveMenu: async () => { throw new Error('fail'); },
            resolveHomePanels: async () => { throw new Error('fail'); },
            resolveAdminSidebar: async () => { throw new Error('fail'); }
        };

        const req: any = {}; // No options
        const res: any = {};
        let nextCalled = false;

        await menuResolver(req, res, () => { nextCalled = true; });

        expect(nextCalled).to.be.true;
        expect(res.locals.menu).to.exist;
    });

    it('should log warning on error', async function () {
        let warningLogged = false;
        (global as any).sails.log.warn = () => { warningLogged = true; };
        (global as any).NavigationService = {
            resolveMenu: async () => { throw new Error('Test error'); },
            resolveHomePanels: async () => ({}),
            resolveAdminSidebar: async () => ({})
        };

        const { req, res } = createMockReqRes();

        await menuResolver(req, res, () => { });

        expect(warningLogged).to.be.true;
    });
});
