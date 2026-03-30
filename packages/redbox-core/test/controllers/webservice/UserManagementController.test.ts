import * as sinon from 'sinon';
import { of, throwError } from 'rxjs';
import { Controllers } from '../../../src/controllers/webservice/UserManagementController';

let expect: Chai.ExpectStatic;

describe('Webservice UserManagementController', () => {
    let controller: Controllers.UserManagement;
    let originalSails: any;
    let originalUsersService: any;
    let originalBrandingService: any;
    let originalRolesService: any;

    before(async () => {
        const chai = await import('chai');
        expect = chai.expect;
    });

    beforeEach(() => {
        originalSails = (global as any).sails;
        originalUsersService = (global as any).UsersService;
        originalBrandingService = (global as any).BrandingService;
        originalRolesService = (global as any).RolesService;

        (global as any).sails = {
            log: {
                error: sinon.stub(),
                verbose: sinon.stub()
            }
        };
        (global as any).BrandingService = {
            getBrand: sinon.stub().returns({ id: 'brand-1', name: 'default' })
        };
        (global as any).UsersService = {
            getUserWithId: sinon.stub().returns(of({ id: 'user-1', username: 'target-user', password: 'secret', token: 'tok' })),
            getUserAudit: sinon.stub().resolves({
                records: [{ id: 'audit-1', action: 'login', details: 'User logged in' }],
                summary: { returnedCount: 1, truncated: false }
            }),
            searchLinkCandidates: sinon.stub().returns(of([{ id: 'candidate-1', username: 'candidate-user' }])),
            getLinkedAccounts: sinon.stub().returns(of({ primary: { id: 'primary-1', username: 'primary-user' }, linkedAccounts: [] })),
            linkAccounts: sinon.stub().returns(of({ primary: { id: 'primary-1', username: 'primary-user' }, linkedAccounts: [], impact: { rolesMerged: 1, recordsRewritten: 2 } })),
            enrichUsersWithEffectiveDisabledState: sinon.stub().callsFake((users: any[]) => Promise.resolve(users.map((u: any) => ({ ...u, effectiveLoginDisabled: false })))),
            disableUser: sinon.stub().resolves(),
            enableUser: sinon.stub().resolves()
        };

        controller = new Controllers.UserManagement();
    });

    afterEach(() => {
        sinon.restore();
        (global as any).sails = originalSails;
        (global as any).UsersService = originalUsersService;
        (global as any).BrandingService = originalBrandingService;
        (global as any).RolesService = originalRolesService;
    });

    it('should search link candidates', async () => {
        const param = sinon.stub();
        param.withArgs('query').returns('candidate');
        param.withArgs('primaryUserId').returns('primary-1');
        const req = {
            session: { branding: 'default' },
            user: { username: 'admin-user' },
            param
        } as unknown as Sails.Req;
        const res = {} as unknown as Sails.Res;
        const sendRespStub = sinon.stub(controller as any, 'sendResp');

        await controller.searchLinkCandidates(req, res);

        expect((global as any).UsersService.searchLinkCandidates.calledWith('candidate', 'brand-1', 'primary-1')).to.be.true;
        expect(sendRespStub.calledOnce).to.be.true;
        expect(sendRespStub.firstCall.args[2]?.data).to.deep.equal([{ id: 'candidate-1', username: 'candidate-user' }]);
    });

    it('should reject link candidate searches when branding cannot be resolved', async () => {
        (global as any).BrandingService.getBrand = sinon.stub().returns(null);
        const param = sinon.stub();
        param.withArgs('query').returns('candidate');
        param.withArgs('primaryUserId').returns('primary-1');
        const req = {
            session: { branding: 'default' },
            param
        } as unknown as Sails.Req;
        const res = {} as unknown as Sails.Res;
        const sendRespStub = sinon.stub(controller as any, 'sendResp');

        await controller.searchLinkCandidates(req, res);

        expect((global as any).UsersService.searchLinkCandidates.called).to.be.false;
        expect(sendRespStub.calledOnce).to.be.true;
        expect(sendRespStub.firstCall.args[2]?.status).to.equal(400);
    });

    it('should get linked accounts through the service', async () => {
        const param = sinon.stub();
        param.withArgs('id').returns('primary-1');
        const req = {
            session: { branding: 'default' },
            user: { username: 'admin-user' },
            param
        } as unknown as Sails.Req;
        const res = {} as unknown as Sails.Res;
        const sendRespStub = sinon.stub(controller as any, 'sendResp');

        await controller.getUserLinks(req, res);

        expect((global as any).UsersService.getLinkedAccounts.calledWith('primary-1')).to.be.true;
        expect(sendRespStub.calledOnce).to.be.true;
        expect(sendRespStub.firstCall.args[2]?.data?.primary?.id).to.equal('primary-1');
    });

    describe('getUserAudit', () => {
        it('should return audit data for an admin and sanitize the user payload', async () => {
            const param = sinon.stub();
            param.withArgs('id').returns('user-1');
            const req = {
                session: { branding: 'default' },
                user: { username: 'admin-user' },
                param
            } as unknown as Sails.Req;
            const res = {} as unknown as Sails.Res;
            const sendRespStub = sinon.stub(controller as any, 'sendResp');

            await controller.getUserAudit(req, res);

            expect((global as any).UsersService.getUserWithId.calledWith('user-1')).to.be.true;
            expect((global as any).UsersService.getUserAudit.calledWith('user-1')).to.be.true;
            expect(sendRespStub.calledOnce).to.be.true;
            expect(sendRespStub.firstCall.args[2]?.data?.user?.password).to.be.undefined;
            expect(sendRespStub.firstCall.args[2]?.data?.user?.token).to.be.undefined;
            expect(sendRespStub.firstCall.args[2]?.data?.summary?.returnedCount).to.equal(1);
        });

        it('should return 400 when the user id is missing', async () => {
            const param = sinon.stub().returns('');
            const req = {
                session: { branding: 'default' },
                user: { username: 'admin-user' },
                param
            } as unknown as Sails.Req;
            const res = {} as unknown as Sails.Res;
            const sendRespStub = sinon.stub(controller as any, 'sendResp');

            await controller.getUserAudit(req, res);

            expect(sendRespStub.firstCall.args[2]?.status).to.equal(400);
        });

        it('should return 404 when the user does not exist', async () => {
            (global as any).UsersService.getUserWithId = sinon.stub().returns(of(null));
            const param = sinon.stub();
            param.withArgs('id').returns('missing-user');
            const req = {
                session: { branding: 'default' },
                user: { username: 'admin-user' },
                param
            } as unknown as Sails.Req;
            const res = {} as unknown as Sails.Res;
            const sendRespStub = sinon.stub(controller as any, 'sendResp');

            await controller.getUserAudit(req, res);

            expect(sendRespStub.firstCall.args[2]?.status).to.equal(404);
        });

        it('should return 500 when the audit service fails', async () => {
            (global as any).UsersService.getUserAudit = sinon.stub().rejects(new Error('audit exploded'));
            const param = sinon.stub();
            param.withArgs('id').returns('user-1');
            const req = {
                session: { branding: 'default' },
                user: { username: 'admin-user' },
                param
            } as unknown as Sails.Req;
            const res = {} as unknown as Sails.Res;
            const sendRespStub = sinon.stub(controller as any, 'sendResp');

            await controller.getUserAudit(req, res);

            expect(sendRespStub.firstCall.args[2]?.status).to.equal(500);
        });
    });

    it('should link accounts through the service', async () => {
        const req = {
            session: { branding: 'default' },
            user: { username: 'admin-user' },
            body: { primaryUserId: 'primary-1', secondaryUserId: 'secondary-1' }
        } as unknown as Sails.Req;
        const res = {} as unknown as Sails.Res;
        const sendRespStub = sinon.stub(controller as any, 'sendResp');

        await controller.linkAccounts(req, res);

        expect((global as any).UsersService.linkAccounts.calledWith('primary-1', 'secondary-1', 'admin-user', 'brand-1')).to.be.true;
        expect(sendRespStub.calledOnce).to.be.true;
        expect(sendRespStub.firstCall.args[2]?.data?.impact?.rolesMerged).to.equal(1);
    });

    it('should reject link requests with missing user ids', async () => {
        const req = {
            session: { branding: 'default' },
            user: { username: 'admin-user' },
            body: { primaryUserId: '', secondaryUserId: 'secondary-1' }
        } as unknown as Sails.Req;
        const res = {} as unknown as Sails.Res;
        const sendRespStub = sinon.stub(controller as any, 'sendResp');

        await controller.linkAccounts(req, res);

        expect((global as any).UsersService.linkAccounts.called).to.be.false;
        expect(sendRespStub.firstCall.args[2]?.status).to.equal(400);
    });

    it('should reject link requests when branding cannot be resolved', async () => {
        (global as any).BrandingService.getBrand = sinon.stub().returns(null);
        const req = {
            session: { branding: 'default' },
            user: { username: 'admin-user' },
            body: { primaryUserId: 'primary-1', secondaryUserId: 'secondary-1' }
        } as unknown as Sails.Req;
        const res = {} as unknown as Sails.Res;
        const sendRespStub = sinon.stub(controller as any, 'sendResp');

        await controller.linkAccounts(req, res);

        expect((global as any).UsersService.linkAccounts.called).to.be.false;
        expect(sendRespStub.firstCall.args[2]?.status).to.equal(400);
    });

    it('should map validation failures from the service to 400', async () => {
        (global as any).UsersService.linkAccounts = sinon.stub().returns(throwError(() => new Error('Primary user must already belong to the current brand')));
        const req = {
            session: { branding: 'default' },
            user: { username: 'admin-user' },
            body: { primaryUserId: 'primary-1', secondaryUserId: 'secondary-1' }
        } as unknown as Sails.Req;
        const res = {} as unknown as Sails.Res;
        const sendRespStub = sinon.stub(controller as any, 'sendResp');

        await controller.linkAccounts(req, res);

        expect(sendRespStub.firstCall.args[2]?.status).to.equal(400);
    });

    it('should map unexpected service failures to 500', async () => {
        (global as any).UsersService.linkAccounts = sinon.stub().returns(throwError(() => new Error('database offline')));
        const req = {
            session: { branding: 'default' },
            user: { username: 'admin-user' },
            body: { primaryUserId: 'primary-1', secondaryUserId: 'secondary-1' }
        } as unknown as Sails.Req;
        const res = {} as unknown as Sails.Res;
        const sendRespStub = sinon.stub(controller as any, 'sendResp');

        await controller.linkAccounts(req, res);

        expect(sendRespStub.firstCall.args[2]?.status).to.equal(500);
    });

    describe('disableUser', () => {
        it('should disable a user when called by admin', async () => {
            const param = sinon.stub();
            param.withArgs('id').returns('user-1');
            const req = {
                session: { branding: 'default' },
                user: { username: 'admin-user' },
                param
            } as unknown as Sails.Req;
            const res = {} as unknown as Sails.Res;
            const apiRespondStub = sinon.stub(controller as any, 'apiRespond');

            await controller.disableUser(req, res);

            expect((global as any).UsersService.disableUser.calledWith('user-1', 'admin-user', 'brand-1')).to.be.true;
            expect(apiRespondStub.calledOnce).to.be.true;
            expect(apiRespondStub.firstCall.args[2]?.status).to.be.true;
        });

        it('should reject when user id is missing', async () => {
            const param = sinon.stub().returns('');
            const req = {
                session: { branding: 'default' },
                user: { username: 'admin-user' },
                param
            } as unknown as Sails.Req;
            const res = {} as unknown as Sails.Res;
            const sendRespStub = sinon.stub(controller as any, 'sendResp');

            await controller.disableUser(req, res);

            expect(sendRespStub.firstCall.args[2]?.status).to.equal(400);
        });

    });

    describe('enableUser', () => {
        it('should enable a user when called by admin', async () => {
            const param = sinon.stub();
            param.withArgs('id').returns('user-1');
            const req = {
                session: { branding: 'default' },
                user: { username: 'admin-user' },
                param
            } as unknown as Sails.Req;
            const res = {} as unknown as Sails.Res;
            const apiRespondStub = sinon.stub(controller as any, 'apiRespond');

            await controller.enableUser(req, res);

            expect((global as any).UsersService.enableUser.calledWith('user-1', 'admin-user', 'brand-1')).to.be.true;
            expect(apiRespondStub.calledOnce).to.be.true;
            expect(apiRespondStub.firstCall.args[2]?.status).to.be.true;
        });

        it('should reject when user id is missing', async () => {
            const param = sinon.stub().returns('');
            const req = {
                session: { branding: 'default' },
                user: { username: 'admin-user' },
                param
            } as unknown as Sails.Req;
            const res = {} as unknown as Sails.Res;
            const sendRespStub = sinon.stub(controller as any, 'sendResp');

            await controller.enableUser(req, res);

            expect(sendRespStub.firstCall.args[2]?.status).to.equal(400);
        });

    });
});
