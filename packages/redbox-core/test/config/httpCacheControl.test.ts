let expect: Chai.ExpectStatic;
import('chai').then(mod => expect = mod.expect);
import * as path from 'path';
import { http } from '../../src/config/http.config';

type MockResponse = {
    statusCode: number;
    set: (name: string, value: string) => MockResponse;
    setHeader: (name: string, value: string) => void;
    getHeader: (name: string) => string | undefined;
    writeHead: (statusCode?: number) => MockResponse;
};

function createMockResponse(statusCode = 200): { res: MockResponse; getHeaders: () => Record<string, string>; } {
    const headers: Record<string, string> = {};
    const res: MockResponse = {
        statusCode,
        set(name: string, value: string) {
            headers[name] = value;
            return this;
        },
        setHeader(name: string, value: string) {
            headers[name] = value;
        },
        getHeader(name: string) {
            const headerName = Object.keys(headers).find(key => key.toLowerCase() === name.toLowerCase());
            return headerName ? headers[headerName] : undefined;
        },
        writeHead(nextStatusCode?: number) {
            if (typeof nextStatusCode === 'number') {
                this.statusCode = nextStatusCode;
            }
            return this;
        }
    };
    return {
        res,
        getHeaders: () => headers
    };
}

describe('http cacheControl middleware', function () {
    let originalSails: unknown;
    const appPath = path.resolve(__dirname, '../../../..');

    beforeEach(function () {
        originalSails = (global as any).sails;
        (global as any).sails = {
            config: {
                appPath,
                session: {
                    cookie: {
                        maxAge: 3600000
                    }
                },
                custom: {
                    cacheControl: {
                        noCache: [
                            'csrfToken',
                            'dynamic/apiClientConfig',
                            'login',
                            'login_local',
                            'login_aaf',
                            'begin_oidc',
                            'login_oidc',
                            'logout'
                        ]
                    }
                }
            }
        };
    });

    afterEach(function () {
        (global as any).sails = originalSails;
    });

    it('should keep normal 200 responses privately cacheable without a conflicting pragma header', function () {
        const req: any = { path: '/default/rdmp/home' };
        const { res, getHeaders } = createMockResponse();
        let nextCalled = false;

        http.middleware.cacheControl?.(req, res as any, () => { nextCalled = true; });
        res.writeHead(res.statusCode);

        expect(nextCalled).to.equal(true);
        const headers = getHeaders();
        expect(headers['Cache-Control']).to.equal('max-age=3600, private');
        expect(headers['Pragma']).to.be.undefined;
        expect(headers['Cross-Origin-Opener-Policy']).to.equal('same-origin-allow-popups');
    });

    it('should set baseline browser hardening headers for normal responses', function () {
        const req: any = { path: '/default/rdmp/home' };
        const { res, getHeaders } = createMockResponse();

        http.middleware.cacheControl?.(req, res as any, () => undefined);

        const headers = getHeaders();
        expect(headers['Cross-Origin-Opener-Policy']).to.equal('same-origin-allow-popups');
        expect(headers['Cross-Origin-Resource-Policy']).to.equal('same-origin');
        expect(headers['Permissions-Policy']).to.equal('accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()');
        expect(headers['Referrer-Policy']).to.equal('strict-origin-when-cross-origin');
        expect(headers['X-XSS-Protection']).to.equal('0');
    });

    it('should force strict no-store headers for 403 responses', function () {
        const req: any = { path: '/default/rdmp/api/users' };
        const { res, getHeaders } = createMockResponse();

        http.middleware.cacheControl?.(req, res as any, () => undefined);
        res.statusCode = 403;
        res.writeHead(res.statusCode);

        const headers = getHeaders();
        expect(headers['Cache-Control']).to.equal('no-store, no-cache, must-revalidate, proxy-revalidate');
        expect(headers['Pragma']).to.equal('no-cache');
        expect(headers['Expires']).to.equal('0');
    });

    it('should preserve explicit no-store headers set later in the request pipeline', function () {
        const req: any = { path: '/default/rdmp/home' };
        const { res, getHeaders } = createMockResponse();

        http.middleware.cacheControl?.(req, res as any, () => undefined);
        res.setHeader('Cache-Control', 'no-store');
        res.writeHead(res.statusCode);

        const headers = getHeaders();
        expect(headers['Cache-Control']).to.equal('no-store, no-cache, must-revalidate, proxy-revalidate');
        expect(headers['Pragma']).to.equal('no-cache');
        expect(headers['Expires']).to.equal('0');
    });

    it('should force strict no-store headers for configured auth-sensitive paths', function () {
        const req: any = { path: '/default/rdmp/dynamic/apiClientConfig' };
        const { res, getHeaders } = createMockResponse();

        http.middleware.cacheControl?.(req, res as any, () => undefined);
        res.writeHead(res.statusCode);

        const headers = getHeaders();
        expect(headers['Cache-Control']).to.equal('no-store, no-cache, must-revalidate, proxy-revalidate');
        expect(headers['Pragma']).to.equal('no-cache');
        expect(headers['Expires']).to.equal('0');
    });

    it('should force strict no-store headers for auth redirects to the login page', function () {
        const req: any = { path: '/default/rdmp/api/users' };
        const { res, getHeaders } = createMockResponse();

        http.middleware.cacheControl?.(req, res as any, () => undefined);
        res.statusCode = 302;
        res.setHeader('Location', '/default/rdmp/user/login?redirect=%2Fdefault%2Frdmp%2Fapi%2Fusers');
        res.writeHead(res.statusCode);

        const headers = getHeaders();
        expect(headers['Cache-Control']).to.equal('no-store, no-cache, must-revalidate, proxy-revalidate');
        expect(headers['Pragma']).to.equal('no-cache');
        expect(headers['Expires']).to.equal('0');
    });

    it('should serve robots.txt from bundled assets before the default static middleware', function () {
        const req: any = { path: '/robots.txt' };
        let sentFile: string | undefined;
        let nextCalled = false;
        const res: any = {
            sendFile(filePath: string) {
                sentFile = filePath;
                return this;
            }
        };

        http.middleware.securityStaticAssets?.(req, res, () => { nextCalled = true; });

        expect(nextCalled).to.equal(false);
        expect(sentFile).to.equal(path.join(appPath, 'assets', 'robots.txt'));
    });

    it('should serve security.txt from bundled assets before the default static middleware', function () {
        const req: any = { path: '/.well-known/security.txt' };
        let sentFile: string | undefined;
        let nextCalled = false;
        const res: any = {
            sendFile(filePath: string) {
                sentFile = filePath;
                return this;
            }
        };

        http.middleware.securityStaticAssets?.(req, res, () => { nextCalled = true; });

        expect(nextCalled).to.equal(false);
        expect(sentFile).to.equal(path.join(appPath, 'assets', '.well-known', 'security.txt'));
    });

    it('should fall through to later middleware for unrelated public asset paths', function () {
        const req: any = { path: '/favicon.ico' };
        let nextCalled = false;
        const res: any = {
            sendFile() {
                throw new Error('sendFile should not be called for unrelated paths');
            }
        };

        http.middleware.securityStaticAssets?.(req, res, () => { nextCalled = true; });

        expect(nextCalled).to.equal(true);
    });
});