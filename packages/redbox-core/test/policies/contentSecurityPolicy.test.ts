let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);
import { contentSecurityPolicy } from '../../src/policies/contentSecurityPolicy';

// Mock globals

(global as any).sails = {
    config: {},
    log: {
        verbose: () => { },
        warn: () => { }
    }
};

describe('contentSecurityPolicy policy', function () {
    let originalSails: any;

    beforeEach(function () {
        originalSails = (global as any).sails;
        (global as any).sails = {
            config: {},
            log: {
                verbose: () => { },
                warn: () => { }
            }
        };
    });

    afterEach(function () {
        (global as any).sails = originalSails;
    });

    function createMockReqRes(path: string = '/test') {
        const req: any = {
            path,
            options: {}
        };
        const headers: Record<string, string> = {};
        const res: any = {
            set: (name: string, value: string) => {
                headers[name] = value;
            }
        };
        return { req, res, getHeaders: () => headers };
    }

    it('should set Content-Security-Policy header by default', function () {
        const { req, res, getHeaders } = createMockReqRes();
        let nextCalled = false;

        contentSecurityPolicy(req, res, () => { nextCalled = true; });

        expect(nextCalled).to.be.true;
        const headers = getHeaders();
        expect(headers['Content-Security-Policy']).to.exist;
    });

    it('should generate a nonce and include it in script-src', function () {
        const { req, res, getHeaders } = createMockReqRes();

        contentSecurityPolicy(req, res, () => { });

        const csp = getHeaders()['Content-Security-Policy'];
        expect(csp).to.include('script-src');
        expect(csp).to.match(/'nonce-[A-Za-z0-9+/=]+'/);
    });

    it('should set the nonce in options.locals.contentSecurityPolicyNonce', function () {
        const { req, res } = createMockReqRes();

        contentSecurityPolicy(req, res, () => { });

        expect(req.options.locals.contentSecurityPolicyNonce).to.be.a('string');
        expect(req.options.locals.contentSecurityPolicyNonce.length).to.be.greaterThan(0);
    });

    it('should skip CSP when disabled in config', function () {
        (global as any).sails.config.csp = { enabled: false };

        const { req, res, getHeaders } = createMockReqRes();
        let nextCalled = false;

        contentSecurityPolicy(req, res, () => { nextCalled = true; });

        expect(nextCalled).to.be.true;
        expect(getHeaders()['Content-Security-Policy']).to.be.undefined;
    });

    it('should use report-only header when configured', function () {
        (global as any).sails.config.csp = { reportOnly: true };

        const { req, res, getHeaders } = createMockReqRes();

        contentSecurityPolicy(req, res, () => { });

        expect(getHeaders()['Content-Security-Policy-Report-Only']).to.exist;
        expect(getHeaders()['Content-Security-Policy']).to.be.undefined;
    });

    it('should merge custom directives from config', function () {
        (global as any).sails.config.csp = {
            directives: {
                'img-src': ["'self'", 'https://images.example.com']
            }
        };

        const { req, res, getHeaders } = createMockReqRes();

        contentSecurityPolicy(req, res, () => { });

        const csp = getHeaders()['Content-Security-Policy'];
        expect(csp).to.include('img-src');
        expect(csp).to.include('https://images.example.com');
    });

    it('should include extras from config', function () {
        (global as any).sails.config.csp = {
            extras: ['block-all-mixed-content']
        };

        const { req, res, getHeaders } = createMockReqRes();

        contentSecurityPolicy(req, res, () => { });

        const csp = getHeaders()['Content-Security-Policy'];
        expect(csp).to.include('block-all-mixed-content');
    });

    it('should omit upgrade-insecure-requests for an HTTP appUrl', function () {
        (global as any).sails.config.appUrl = 'http://redbox-portal.local:1500';

        const { res, getHeaders } = createMockReqRes();

        contentSecurityPolicy({} as any, res, () => { });

        expect(getHeaders()['Content-Security-Policy']).not.to.include('upgrade-insecure-requests');
    });

    it('should retain upgrade-insecure-requests for an HTTPS appUrl', function () {
        (global as any).sails.config.appUrl = 'https://portal.example.edu';

        const { res, getHeaders } = createMockReqRes();

        contentSecurityPolicy({} as any, res, () => { });

        expect(getHeaders()['Content-Security-Policy']).to.include('upgrade-insecure-requests');
    });

    it('should retain upgrade-insecure-requests for HTTP appUrl in production', function () {
        const originalNodeEnv = process.env.NODE_ENV;
        process.env.NODE_ENV = 'production';
        (global as any).sails.config.appUrl = 'http://portal.example.edu';

        const { res, getHeaders } = createMockReqRes();

        contentSecurityPolicy({} as any, res, () => { });

        if (originalNodeEnv === undefined) {
            delete process.env.NODE_ENV;
        } else {
            process.env.NODE_ENV = originalNodeEnv;
        }

        expect(getHeaders()['Content-Security-Policy']).to.include('upgrade-insecure-requests');
    });

    it('should include default directives', function () {
        const { req, res, getHeaders } = createMockReqRes();

        contentSecurityPolicy(req, res, () => { });

        const csp = getHeaders()['Content-Security-Policy'];
        expect(csp).to.include("default-src 'self'");
        expect(csp).to.include("object-src 'none'");
        expect(csp).to.include("frame-ancestors 'none'");
    });

    it('should include style-src with nonce', function () {
        const { req, res, getHeaders } = createMockReqRes();

        contentSecurityPolicy(req, res, () => { });

        const csp = getHeaders()['Content-Security-Policy'];
        expect(csp).to.include('style-src');
        // style-src should also have nonce by default
        const styleSrcMatch = csp.match(/style-src[^;]*/);
        expect(styleSrcMatch).to.exist;
        expect(styleSrcMatch![0]).to.match(/nonce-/);
    });

    it('should handle security.csp config location', function () {
        (global as any).sails.config.security = {
            csp: {
                reportOnly: true
            }
        };

        const { req, res, getHeaders } = createMockReqRes();

        contentSecurityPolicy(req, res, () => { });

        expect(getHeaders()['Content-Security-Policy-Report-Only']).to.exist;
    });

    it('should initialize options.locals if null', function () {
        const { req, res } = createMockReqRes();
        req.options.locals = null;

        contentSecurityPolicy(req, res, () => { });

        expect(req.options.locals).to.be.an('object');
        expect(req.options.locals.contentSecurityPolicyNonce).to.exist;
    });

    it('should include upgrade-insecure-requests by default', function () {
        const { req, res, getHeaders } = createMockReqRes();

        contentSecurityPolicy(req, res, () => { });

        const csp = getHeaders()['Content-Security-Policy'];
        expect(csp).to.include('upgrade-insecure-requests');
    });

    it('should relax Redoc-specific directives for admin api docs', function () {
        const { req, res, getHeaders } = createMockReqRes('/default/rdmp/admin/api-docs');

        contentSecurityPolicy(req, res, () => { });

        const csp = getHeaders()['Content-Security-Policy'];
        expect(csp).to.include("style-src");
        expect(csp).to.include("'unsafe-inline'");
        expect(csp).to.not.match(/nonce-/);
        expect(csp).to.include("worker-src");
        expect(csp).to.include('blob:');
        expect(csp).to.include("img-src");
        expect(csp).to.include('https://cdn.redoc.ly');
    });

    it('should end CSP header with semicolon', function () {
        const { req, res, getHeaders } = createMockReqRes();

        contentSecurityPolicy(req, res, () => { });

        const csp = getHeaders()['Content-Security-Policy'];
        expect(csp.endsWith(';')).to.be.true;
    });

    describe('web analytics allow-listing', function () {
        function withBrandingAnalytics(analytics: any) {
            (global as any).sails.config.brandingAware = () => ({ webAnalytics: analytics });
            (global as any).BrandingService = { getBrandNameFromReq: () => 'default' };
        }

        afterEach(function () {
            delete (global as any).BrandingService;
        });

        it('should allow-list Google Analytics domains when enabled for the branding', function () {
            withBrandingAnalytics({ enabled: true, provider: 'googleAnalytics', trackingId: 'G-ABC123' });
            const { req, res, getHeaders } = createMockReqRes();

            contentSecurityPolicy(req, res, () => { });

            const csp = getHeaders()['Content-Security-Policy'];
            expect(csp).to.include('https://www.googletagmanager.com');
            expect(csp).to.include('https://*.google-analytics.com');
            expect(csp).to.include('https://*.analytics.google.com');
            expect(csp).to.not.include("'strict-dynamic'");
        });

        it('should allow-list Google Tag Manager domains when enabled for the branding', function () {
            withBrandingAnalytics({ enabled: true, provider: 'googleTagManager', trackingId: 'GTM-XYZ' });
            const { req, res, getHeaders } = createMockReqRes();

            contentSecurityPolicy(req, res, () => { });

            const csp = getHeaders()['Content-Security-Policy'];
            const scriptSrc = csp.match(/script-src[^;]*/)?.[0] ?? '';
            const frameSrc = csp.match(/frame-src[^;]*/)?.[0] ?? '';
            expect(scriptSrc).to.include("'self'");
            expect(scriptSrc).to.include('https://www.googletagmanager.com');
            expect(scriptSrc).to.not.include("'strict-dynamic'");
            expect(frameSrc).to.include('https://www.googletagmanager.com');
        });

        it('should NOT allow-list analytics domains when disabled for the branding', function () {
            withBrandingAnalytics({ enabled: false, provider: 'googleAnalytics', trackingId: 'G-ABC123' });
            const { req, res, getHeaders } = createMockReqRes();

            contentSecurityPolicy(req, res, () => { });

            const csp = getHeaders()['Content-Security-Policy'];
            expect(csp).to.not.include('google-analytics.com');
            expect(csp).to.not.include('googletagmanager.com');
        });

        it('should NOT allow-list analytics domains when the tracking ID is empty', function () {
            withBrandingAnalytics({ enabled: true, provider: 'googleAnalytics', trackingId: '  ' });
            const { req, res, getHeaders } = createMockReqRes();

            contentSecurityPolicy(req, res, () => { });

            const csp = getHeaders()['Content-Security-Policy'];
            expect(csp).to.not.include('google-analytics.com');
            expect(csp).to.not.include('googletagmanager.com');
        });

        it('should NOT allow-list analytics domains when the tracking ID is invalid', function () {
            withBrandingAnalytics({ enabled: true, provider: 'googleAnalytics', trackingId: 'G-ABC<script>' });
            const { req, res, getHeaders } = createMockReqRes();

            contentSecurityPolicy(req, res, () => { });

            const csp = getHeaders()['Content-Security-Policy'];
            expect(csp).to.not.include('google-analytics.com');
            expect(csp).to.not.include('googletagmanager.com');
        });

        it('should not throw and still emit CSP when brandingAware is unavailable', function () {
            // brandingAware not a function -> helper is a no-op
            const { req, res, getHeaders } = createMockReqRes();

            contentSecurityPolicy(req, res, () => { });

            expect(getHeaders()['Content-Security-Policy']).to.exist;
        });
    });
});
