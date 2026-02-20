let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);
import { noCache } from '../../src/policies/noCache';

// Mock sails
(global as any).sails = {
    config: {
        views: {
            noCache: []
        }
    },
    log: {
        verbose: () => { }
    }
};

describe('noCache policy', function () {
    let originalSails: any;

    beforeEach(function () {
        originalSails = (global as any).sails;
        (global as any).sails = {
            config: {
                views: {
                    noCache: []
                }
            },
            log: {
                verbose: () => { }
            }
        };
    });

    afterEach(function () {
        (global as any).sails = originalSails;
    });

    function createMockReqRes(path: string, viewLocals?: any) {
        const req: any = {
            path,
            options: viewLocals !== undefined ? { locals: { view: viewLocals } } : { locals: {} }
        };
        const headers: Record<string, string> = {};
        const res: any = {
            setHeader: (name: string, value: string) => {
                headers[name] = value;
            }
        };
        return { req, res, getHeaders: () => headers };
    }

    it('should set cache-control headers for non-view requests', function () {
        const { req, res, getHeaders } = createMockReqRes('/api/data');
        let nextCalled = false;

        noCache(req, res, () => { nextCalled = true; });

        expect(nextCalled).to.be.true;
        const headers = getHeaders();
        expect(headers['Cache-Control']).to.include('no-store');
        expect(headers['Cache-Control']).to.include('no-cache');
        expect(headers['Pragma']).to.equal('no-cache');
        expect(headers['Expires']).to.equal('0');
        expect(headers['Surrogate-Control']).to.equal('no-store');
    });

    it('should not set headers for view controller requests by default', function () {
        const { req, res, getHeaders } = createMockReqRes('/dashboard', 'home');
        let nextCalled = false;

        noCache(req, res, () => { nextCalled = true; });

        expect(nextCalled).to.be.true;
        const headers = getHeaders();
        expect(headers['Cache-Control']).to.be.undefined;
    });

    it('should set headers for view paths in noCache config', function () {
        (global as any).sails.config.views.noCache = ['/dashboard'];

        const { req, res, getHeaders } = createMockReqRes('/dashboard', 'home');
        let nextCalled = false;

        noCache(req, res, () => { nextCalled = true; });

        expect(nextCalled).to.be.true;
        const headers = getHeaders();
        expect(headers['Cache-Control']).to.include('no-store');
    });

    it('should not set headers for view paths not in noCache config', function () {
        (global as any).sails.config.views.noCache = ['/other'];

        const { req, res, getHeaders } = createMockReqRes('/dashboard', 'home');
        let nextCalled = false;

        noCache(req, res, () => { nextCalled = true; });

        expect(nextCalled).to.be.true;
        const headers = getHeaders();
        expect(headers['Cache-Control']).to.be.undefined;
    });

    it('should set headers when view local is null', function () {
        const { req, res, getHeaders } = createMockReqRes('/api/test');
        req.options.locals.view = null;
        let nextCalled = false;

        noCache(req, res, () => { nextCalled = true; });

        expect(nextCalled).to.be.true;
        const headers = getHeaders();
        expect(headers['Cache-Control']).to.include('no-store');
    });

    it('should always call next', function () {
        const { req, res } = createMockReqRes('/any');
        let nextCalled = false;

        noCache(req, res, () => { nextCalled = true; });

        expect(nextCalled).to.be.true;
    });
});
