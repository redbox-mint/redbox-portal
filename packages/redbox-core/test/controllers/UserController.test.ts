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
                appUrl: 'http://localhost'
            },
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
            getBrand: sinon.stub().returns({ local: { postLoginRedir: 'home' } })
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
});
