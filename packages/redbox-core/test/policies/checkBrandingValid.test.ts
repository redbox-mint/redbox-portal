let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);

// Mock globals BEFORE importing policy
(global as any)._ = require('lodash');

(global as any).sails = {
    config: {
        auth: {
            defaultBrand: 'default',
            defaultPortal: 'portal'
        }
    },
    log: {
        verbose: () => { }
    }
};

(global as any).BrandingService = {
    getAvailable: () => ['default', 'custom']
};

import { checkBrandingValid } from '../../src/policies/checkBrandingValid';

describe('checkBrandingValid policy', function () {
    let originalSails: any;
    let originalBrandingService: any;

    beforeEach(function () {
        originalSails = (global as any).sails;
        originalBrandingService = (global as any).BrandingService;

        (global as any).sails = {
            config: {
                auth: {
                    defaultBrand: 'default',
                    defaultPortal: 'portal'
                }
            },
            log: {
                verbose: () => { }
            }
        };

        (global as any).BrandingService = {
            getAvailable: () => ['default', 'custom']
        };
    });

    afterEach(function () {
        (global as any).sails = originalSails;
        (global as any).BrandingService = originalBrandingService;
    });

    function createMockReqRes(url: string, isSocket: boolean = false) {
        const req: any = {
            url,
            isSocket,
            options: { locals: {} }
        };
        let notFoundCalled = false;
        const res: any = {
            notFound: () => { notFoundCalled = true; return res; }
        };
        return { req, res, wasNotFound: () => notFoundCalled };
    }

    it('should call next for valid branding in URL', function () {
        const { req, res, wasNotFound } = createMockReqRes('/default/portal/page');
        let nextCalled = false;

        checkBrandingValid(req, res, () => { nextCalled = true; });

        expect(nextCalled).to.be.true;
        expect(wasNotFound()).to.be.false;
    });

    it('should call next for custom valid branding', function () {
        const { req, res, wasNotFound } = createMockReqRes('/custom/portal/page');
        let nextCalled = false;

        checkBrandingValid(req, res, () => { nextCalled = true; });

        expect(nextCalled).to.be.true;
        expect(wasNotFound()).to.be.false;
    });

    it('should return notFound for invalid branding', function () {
        const { req, res, wasNotFound } = createMockReqRes('/invalid/portal/page');
        let nextCalled = false;

        checkBrandingValid(req, res, () => { nextCalled = true; });

        expect(nextCalled).to.be.false;
        expect(wasNotFound()).to.be.true;
        expect(req.options.locals.branding).to.equal('default');
        expect(req.options.locals.portal).to.equal('portal');
    });

    it('should handle socket requests with adjusted indices', function () {
        // Socket URLs have 2 extra segments at the start
        const { req, res, wasNotFound } = createMockReqRes('/socket/io/default/portal/page', true);
        let nextCalled = false;

        checkBrandingValid(req, res, () => { nextCalled = true; });

        expect(nextCalled).to.be.true;
        expect(wasNotFound()).to.be.false;
    });

    it('should call next for URLs with too few segments', function () {
        const { req, res } = createMockReqRes('/short');
        let nextCalled = false;

        checkBrandingValid(req, res, () => { nextCalled = true; });

        expect(nextCalled).to.be.true;
    });

    it('should call next for exactly minimum length URL', function () {
        // /brand/portal requires minLength to pass
        const { req, res } = createMockReqRes('/default/portal');
        let nextCalled = false;

        checkBrandingValid(req, res, () => { nextCalled = true; });

        // Length is exactly minLength (3), not greater than, so should call next
        expect(nextCalled).to.be.true;
    });
});
