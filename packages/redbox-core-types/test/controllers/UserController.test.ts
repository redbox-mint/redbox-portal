import { expect } from 'chai';
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
            getBrandFromReq: sinon.stub().returns('default'),
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
            const req = {};
            const res = {};
            const sendViewStub = sinon.stub(controller, 'sendView');

            controller.login(req, res);

            expect(sendViewStub.calledWith(req, res, '/login')).to.be.true;
        });
    });

    describe('info', () => {
        it('should return user info without token', () => {
            const req = {
                user: { id: '123', name: 'Test User', token: 'secret' }
            };
            const res = {
                json: sinon.stub()
            };

            controller.info(req, res);

            expect(res.json.calledWith({
                user: { id: '123', name: 'Test User' }
            })).to.be.true;
        });
    });

    describe('find', () => {
        it('should search for users and return mapped results', () => {
            const req = {
                session: { branding: 'default' },
                query: { name: 'test', source: 'local' }
            };
            const res = {};
            const mockUsers = [
                { id: '1', name: 'User 1', username: 'user1', email: 'u1@test.com' }
            ];
            (global as any).UsersService.findUsersWithName.returns(of(mockUsers));
            const ajaxOkStub = sinon.stub(controller as any, 'ajaxOk');

            controller.find(req, res);

            expect((global as any).UsersService.findUsersWithName.calledWith('test', 'brand-1', 'local')).to.be.true;
            expect(ajaxOkStub.calledWith(req, res, null, [
                { id: '1', name: 'User 1', username: 'user1' }
            ], true)).to.be.true;
        });
    });
});
