import * as sinon from 'sinon';
import { of } from 'rxjs';
import { Controllers } from '../../src/controllers/AdminController';
import { createQueryObject } from '../services/testHelper';

let expect: Chai.ExpectStatic;

describe('AdminController', () => {
    let controller: Controllers.Admin;
    let originalSails: any;
    let originalUsersService: any;
    let originalBrandingService: any;
    let originalUser: any;
    let originalUserLink: any;

    before(async () => {
        const chai = await import('chai');
        expect = chai.expect;
    });

    beforeEach(() => {
        originalSails = (global as any).sails;
        originalUsersService = (global as any).UsersService;
        originalBrandingService = (global as any).BrandingService;
        originalUser = (global as any).User;
        originalUserLink = (global as any).UserLink;

        (global as any).sails = {
            config: {
                auth: {
                    hiddenUsers: [],
                    hiddenRoles: []
                }
            },
            log: {
                error: sinon.stub(),
                verbose: sinon.stub()
            }
        };
        (global as any).BrandingService = {
            getBrand: sinon.stub().returns({ id: 'brand-1', name: 'default' })
        };
        (global as any).RolesService = {
            getAdminFromBrand: sinon.stub().returns({ id: 'role-admin', name: 'Admin' })
        };
        (global as any).UsersService = {
            getUsersForBrand: sinon.stub().returns(of([
                { id: 'primary-1', username: 'primary-user', name: 'Primary User', roles: [{ branding: 'brand-1', name: 'Researcher' }], token: 'hashed' },
                { id: 'alias-1', username: 'alias-user', name: 'Alias User', linkedPrimaryUserId: 'primary-1', accountLinkState: 'linked-alias', roles: [] }
            ])),
            enrichUsersWithEffectiveDisabledState: sinon.stub().callsFake((users: any[]) => Promise.resolve(users.map((u: any) => ({ ...u, effectiveLoginDisabled: false })))),
            hasRole: sinon.stub().returns({ id: 'role-admin', name: 'Admin' }),
            getUserWithId: sinon.stub().returns(of({ id: 'user-1', username: 'target-user', password: 'secret', token: 'tok' })),
            getUserAudit: sinon.stub().resolves({
                records: [{ id: 'audit-1', action: 'login', details: 'User logged in' }],
                summary: { returnedCount: 1, truncated: false }
            }),
            searchLinkCandidates: sinon.stub().returns(of([{ id: 'candidate-1', username: 'candidate-user' }])),
            getLinkedAccounts: sinon.stub().returns(of({ primary: { id: 'primary-1', username: 'primary-user' }, linkedAccounts: [] })),
            linkAccounts: sinon.stub().returns(of({ primary: { id: 'primary-1', username: 'primary-user' }, linkedAccounts: [], impact: { rolesMerged: 1, recordsRewritten: 2 } })),
            disableUser: sinon.stub().resolves(),
            enableUser: sinon.stub().resolves()
        };
        (global as any).UserLink = {
            find: sinon.stub().returns(createQueryObject([
                { primaryUserId: 'primary-1', secondaryUserId: 'alias-1', brandId: 'brand-1', status: 'active' }
            ]))
        };
        (global as any).User = {
            find: sinon.stub().returns(createQueryObject([
                { id: 'primary-1', username: 'primary-user' }
            ]))
        };

        controller = new Controllers.Admin();
    });

    afterEach(() => {
        sinon.restore();
        (global as any).sails = originalSails;
        (global as any).UsersService = originalUsersService;
        (global as any).BrandingService = originalBrandingService;
        (global as any).User = originalUser;
        (global as any).UserLink = originalUserLink;
    });

    it('should enrich admin users with link metadata', async () => {
        const req = { session: { branding: 'default' }, query: {} } as unknown as Sails.Req;
        const res = {} as unknown as Sails.Res;
        const sendRespStub = sinon.stub(controller as any, 'sendResp');

        await controller.getUsers(req, res);

        expect(sendRespStub.called).to.be.true;
        const payload = sendRespStub.firstCall.args[2];
        expect(payload.data).to.have.length(2);
        expect(payload.data[0].linkedAccountCount).to.equal(1);
        expect(payload.data[1].effectivePrimaryUsername).to.equal('primary-user');
    });

    it('should skip primary user lookup when the User model is unavailable', async () => {
        const req = { session: { branding: 'default' }, query: {} } as unknown as Sails.Req;
        const res = {} as unknown as Sails.Res;
        const sendRespStub = sinon.stub(controller as any, 'sendResp');

        delete (global as any).User;

        await controller.getUsers(req, res);

        expect(sendRespStub.calledOnce).to.be.true;
        const payload = sendRespStub.firstCall.args[2];
        expect(payload.data[1].effectivePrimaryUsername).to.equal('alias-user');
    });

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

    it('should link accounts through the admin controller', async () => {
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

    it('should disable a user through the admin controller', async () => {
        const param = sinon.stub();
        param.withArgs('id').returns('user-2');
        const req = {
            session: { branding: 'default' },
            user: { id: 'admin-1', username: 'admin-user' },
            param
        } as unknown as Sails.Req;
        const res = {} as unknown as Sails.Res;
        const sendRespStub = sinon.stub(controller as any, 'sendResp');

        await controller.disableUser(req, res);

        expect((global as any).UsersService.disableUser.calledWith('user-2', 'admin-user', 'brand-1')).to.be.true;
        expect(sendRespStub.calledOnce).to.be.true;
        expect(sendRespStub.firstCall.args[2]?.data?.status).to.equal(true);
    });
});
