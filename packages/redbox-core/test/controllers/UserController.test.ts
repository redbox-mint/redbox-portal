let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);
import * as sinon from 'sinon';
import { of } from 'rxjs';
import { Controllers } from '../../src/controllers/UserController';

describe('UserController', () => {
    let controller: Controllers.User;
    let mockSails: any;
    let originalSails: any;
    let originalBrandingService: any;
    let originalUsersService: any;

    beforeEach(() => {
        originalSails = (global as any).sails;
        originalBrandingService = (global as any).BrandingService;
        originalUsersService = (global as any).UsersService;

        mockSails = {
            config: {
                auth: {
                    loginPath: '/login',
                    postLogoutRedir: '/logout-success'
                },
                http: { rootContext: '' },
                appUrl: 'http://localhost',
                passport: {
                    authenticate: sinon.stub()
                }
            },
            getActions: sinon.stub().returns({ 'user/redirpostlogin': sinon.stub() }),
            log: { debug: sinon.stub(), verbose: sinon.stub(), error: sinon.stub() }
        };

        (global as any).sails = mockSails;
        (global as any).BrandingService = {
            getBrandAndPortalPath: sinon.stub().returns('/default/portal'),
            getBrandNameFromReq: sinon.stub().returns('default'),
            getBrand: sinon.stub().returns({ id: 'brand-1' })
        };
        (global as any).UsersService = {
            addUserAuditEvent: sinon.stub().resolves(),
            updateUserDetails: sinon.stub().returns(of({})),
            findUsersWithName: sinon.stub().returns(of([]))
        };
        (global as any).ConfigService = {
            getBrand: sinon.stub().returns({
                local: { postLoginRedir: 'home' },
                oidc: { opts: { issuer: 'https://oidc.example.com' } }
            })
        };

        controller = new Controllers.User();
    });

    afterEach(() => {
        sinon.restore();
        (global as any).sails = originalSails;
        (global as any).BrandingService = originalBrandingService;
        (global as any).UsersService = originalUsersService;
    });

    describe('login', () => {
        it('should send the login view', () => {
            const req = {} as unknown as Sails.Req;
            const res = {} as unknown as Sails.Res;
            const sendViewStub = sinon.stub(controller, 'sendView');

            controller.login(req, res);

            expect(sendViewStub.calledWith(req, res, '/login')).to.be.true;
        });
    });

    describe('info', () => {
        it('should return user info without token', () => {
            const jsonStub = sinon.stub();
            const req = {
                user: { id: '123', name: 'Test User', token: 'secret' }
            } as unknown as Sails.Req;
            const res = {
                json: jsonStub
            } as unknown as Sails.Res;

            controller.info(req, res);

            expect(jsonStub.calledWith({
                user: { id: '123', name: 'Test User' }
            })).to.be.true;
        });
    });

    describe('resolveSafeRedirectUrl', () => {
        it('should normalize same-origin absolute redirects to internal paths', () => {
            const req = {
                session: {},
                query: {}
            } as unknown as Sails.Req;

            const redirectUrl = (controller as any).resolveSafeRedirectUrl(
                req,
                'http://localhost/default/portal/records?tab=files#details',
                '/default/portal/home'
            );

            expect(redirectUrl).to.equal('/default/portal/records?tab=files#details');
        });

        it('should reject unsafe redirect candidates and fall back to an internal path', () => {
            const req = {
                session: {},
                query: {}
            } as unknown as Sails.Req;

            for (const candidate of [
                'https://attacker.example/x',
                'javascript:alert(1)',
                '//attacker.example/x',
                '/default/portal/home\nLocation:https://attacker.example'
            ]) {
                const redirectUrl = (controller as any).resolveSafeRedirectUrl(req, candidate, '/default/portal/home');
                expect(redirectUrl).to.equal('/default/portal/home');
            }
        });
    });

    describe('getPostLoginUrl', () => {
        it('should ignore an unsafe session redirect and use a safe query redirect', () => {
            const req = {
                session: { redirUrl: 'https://attacker.example/steal' },
                query: { redirUrl: 'http://localhost/default/portal/dashboard?tab=activity' }
            } as unknown as Sails.Req;

            const redirectUrl = (controller as any).getPostLoginUrl(req, {} as Sails.Res);

            expect(redirectUrl).to.equal('/default/portal/dashboard?tab=activity');
        });
    });

    describe('find', () => {
        it('should search for users and return mapped results', () => {
            const req = {
                session: { branding: 'default' },
                query: { name: 'test', source: 'local' }
            } as unknown as Sails.Req;
            const res = {} as unknown as Sails.Res;
            const mockUsers = [
                { id: '1', name: 'User 1', username: 'user1', email: 'u1@test.com' }
            ];
            (global as any).UsersService.findUsersWithName.returns(of(mockUsers));
            const sendRespStub = sinon.stub(controller as any, 'sendResp');

            controller.find(req, res);

            expect((global as any).UsersService.findUsersWithName.calledWith('test', 'brand-1', 'local')).to.be.true;
            expect(sendRespStub.calledWith(req, res, sinon.match({
                data: [
                    { id: '1', name: 'User 1', username: 'user1' }
                ]
            }))).to.be.true;
        });
    });

    describe('logout', () => {
        it('should fall back to the internal home page when postLogoutRedir is unsafe', () => {
            mockSails.config.auth.postLogoutRedir = 'https://attacker.example/logout';
            const redirectStub = sinon.stub();
            const req = {
                session: {},
                user: { id: '123' },
                logout: (callback: (err?: unknown) => void) => callback(),
                app: undefined,
                baseUrl: '',
                body: {},
                cookies: {},
                fresh: false,
                hostname: 'localhost',
                ip: '127.0.0.1',
                ips: [],
                method: 'GET',
                originalUrl: '/default/portal/user/logout',
                params: {},
                path: '/default/portal/user/logout',
                protocol: 'http',
                query: {},
                route: undefined,
                secure: false,
                stale: false,
                subdomains: [],
                xhr: false,
                headers: {},
                url: '/default/portal/user/logout',
                rawHeaders: []
            } as unknown as Sails.Req;
            const res = {
                redirect: redirectStub,
                status: sinon.stub().returnsThis(),
                send: sinon.stub()
            } as unknown as Sails.Res;

            controller.logout(req, res);

            expect(redirectStub.calledWith('/default/portal/home')).to.be.true;
        });

        it('should allow trusted oidc logout endpoints with safe post-logout redirects', () => {
            const redirectStub = sinon.stub();
            const req = {
                session: {
                    user: { id: '123', type: 'oidc' },
                    logoutUrl: 'https://oidc.example.com/logout?post_logout_redirect_uri=/default/portal/home'
                },
                user: { id: '123', type: 'oidc' },
                logout: (callback: (err?: unknown) => void) => callback(),
                app: undefined,
                baseUrl: '',
                body: {},
                cookies: {},
                fresh: false,
                hostname: 'localhost',
                ip: '127.0.0.1',
                ips: [],
                method: 'GET',
                originalUrl: '/default/portal/user/logout',
                params: {},
                path: '/default/portal/user/logout',
                protocol: 'http',
                query: {},
                route: undefined,
                secure: false,
                stale: false,
                subdomains: [],
                xhr: false,
                headers: {},
                url: '/default/portal/user/logout',
                rawHeaders: []
            } as unknown as Sails.Req;
            const res = {
                redirect: redirectStub,
                status: sinon.stub().returnsThis(),
                send: sinon.stub()
            } as unknown as Sails.Res;

            controller.logout(req, res);

            expect(redirectStub.calledWith('https://oidc.example.com/logout?post_logout_redirect_uri=http%3A%2F%2Flocalhost%2Fdefault%2Fportal%2Fhome')).to.be.true;
        });
    });

    describe('aafLogin', () => {
        it('should return 400 when assertion is missing', () => {
            const badRequestStub = sinon.stub();
            const req = {
                body: {},
                session: {}
            } as unknown as Sails.Req;
            const res = {
                badRequest: badRequestStub
            } as unknown as Sails.Res;

            controller.aafLogin(req, res);

            expect(badRequestStub.calledWith({ message: 'invalid-aaf-login-request' })).to.be.true;
            expect(mockSails.config.passport.authenticate.called).to.be.false;
            expect(req.session['data']).to.be.undefined;
        });

        it('should return 400 for malformed JWT assertion errors', () => {
            const badRequestStub = sinon.stub();
            mockSails.config.passport.authenticate.callsFake((_strategy: string, callback: (err: Error | string | null, user: Record<string, unknown> | false, info: Record<string, unknown> | string | Error | undefined) => void) => {
                return (_req: Sails.Req, _res: Sails.Res) => callback(new Error('jwt malformed'), false, undefined);
            });
            const req = {
                body: { assertion: 'not-a-jwt' },
                session: {}
            } as unknown as Sails.Req;
            const res = {
                badRequest: badRequestStub,
                serverError: sinon.stub()
            } as unknown as Sails.Res;

            controller.aafLogin(req, res);

            expect(badRequestStub.calledWith({ message: 'invalid-aaf-login-request' })).to.be.true;
            expect(req.session['data']).to.be.undefined;
        });

        it('should preserve forbidden for authorized email denied', () => {
            const forbiddenStub = sinon.stub();
            mockSails.config.passport.authenticate.callsFake((_strategy: string, callback: (err: Error | string | null, user: Record<string, unknown> | false, info: Record<string, unknown> | string | Error | undefined) => void) => {
                return (_req: Sails.Req, _res: Sails.Res) => callback('authorized-email-denied', false, undefined);
            });
            const req = {
                body: { assertion: 'header.payload.signature' },
                session: {}
            } as unknown as Sails.Req;
            const res = {
                forbidden: forbiddenStub
            } as unknown as Sails.Res;

            controller.aafLogin(req, res);

            expect(forbiddenStub.calledOnce).to.be.true;
            expect(req.session['data']).to.deep.equal({
                message: 'error-auth',
                detailedMessage: 'authorized-email-denied'
            });
        });

        it('should not store raw passport errors in session data', () => {
            const serverErrorStub = sinon.stub();
            mockSails.config.passport.authenticate.callsFake((_strategy: string, callback: (err: Error | string | null, user: Record<string, unknown> | false, info: Record<string, unknown> | string | Error | undefined) => void) => {
                return (_req: Sails.Req, _res: Sails.Res) => callback(new Error('unexpected-aaf-error'), false, 'internal-details');
            });
            const req = {
                body: { assertion: 'header.payload.signature' },
                session: {}
            } as unknown as Sails.Req;
            const res = {
                serverError: serverErrorStub
            } as unknown as Sails.Res;

            controller.aafLogin(req, res);

            expect(serverErrorStub.calledOnce).to.be.true;
            expect(req.session['data']).to.deep.equal({
                message: 'error-auth',
                detailedMessage: 'There was an issue with your user credentials, please try again.'
            });
        });
    });
});
