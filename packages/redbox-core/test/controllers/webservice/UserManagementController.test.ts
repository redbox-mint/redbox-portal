import * as sinon from 'sinon';
import { of, throwError } from 'rxjs';
import { Controllers } from '../../../src/controllers/webservice/UserManagementController';

let expect: Chai.ExpectStatic;

function makeReq(req: Record<string, unknown>): Sails.Req {
    return {
        ...req,
        apiRequest: (req.apiRequest as Sails.Req['apiRequest']) ?? {
            params: (req.params ?? {}) as Record<string, unknown>,
            query: (req.query ?? {}) as Record<string, unknown>,
            body: req.body,
            files: (req.files as Record<string, unknown[]>) ?? {},
        },
    } as Sails.Req;
}

describe('Webservice UserManagementController', () => {
    let controller: Controllers.UserManagement;
    let originalSails: any;
    let originalUsersService: any;
    let originalBrandingService: any;
    let originalRolesService: any;
    let originalUserLink: any;

    before(async () => {
        const chai = await import('chai');
        expect = chai.expect;
    });

    beforeEach(() => {
        originalSails = (global as any).sails;
        originalUsersService = (global as any).UsersService;
        originalBrandingService = (global as any).BrandingService;
        originalRolesService = (global as any).RolesService;
        originalUserLink = (global as any).UserLink;

        (global as any).sails = {
            log: {
                error: sinon.stub(),
                verbose: sinon.stub()
            }
        };
        (global as any).BrandingService = {
            getBrand: sinon.stub().returns({ id: 'brand-1', name: 'default' })
        };
        (global as any).UserLink = {
            findOne: sinon.stub().resolves(null)
        };
        (global as any).UsersService = {
            getUserWithId: sinon.stub().returns(of({
                id: 'user-1',
                username: 'target-user',
                password: 'secret',
                token: 'tok',
                roles: [{ branding: 'brand-1' }]
            })),
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
        (global as any).UserLink = originalUserLink;
    });

    it('should search link candidates', async () => {
        const req = makeReq({
            session: { branding: 'default' },
            user: { username: 'admin-user' },
            query: { query: 'candidate', primaryUserId: 'primary-1' }
        });
        const res = {} as unknown as Sails.Res;
        const sendRespStub = sinon.stub(controller as any, 'sendResp');

        await controller.searchLinkCandidates(req, res);

        expect((global as any).UsersService.searchLinkCandidates.calledWith('candidate', 'brand-1', 'primary-1')).to.be.true;
        expect(sendRespStub.calledOnce).to.be.true;
        expect(sendRespStub.firstCall.args[2]?.data).to.deep.equal([{ id: 'candidate-1', username: 'candidate-user' }]);
    });

    it('should reject link candidate searches when branding cannot be resolved', async () => {
        (global as any).BrandingService.getBrand = sinon.stub().returns(null);
        const req = makeReq({
            session: { branding: 'default' },
            query: { query: 'candidate', primaryUserId: 'primary-1' }
        });
        const res = {} as unknown as Sails.Res;
        const sendRespStub = sinon.stub(controller as any, 'sendResp');

        await controller.searchLinkCandidates(req, res);

        expect((global as any).UsersService.searchLinkCandidates.called).to.be.false;
        expect(sendRespStub.calledOnce).to.be.true;
        expect(sendRespStub.firstCall.args[2]?.status).to.equal(400);
    });

    it('should get linked accounts through the service', async () => {
        const req = makeReq({
            session: { branding: 'default' },
            user: { username: 'admin-user' },
            params: { id: 'primary-1' }
        });
        const res = {} as unknown as Sails.Res;
        const sendRespStub = sinon.stub(controller as any, 'sendResp');

        await controller.getUserLinks(req, res);

        expect((global as any).UsersService.getLinkedAccounts.calledWith('primary-1')).to.be.true;
        expect(sendRespStub.calledOnce).to.be.true;
        expect(sendRespStub.firstCall.args[2]?.data?.primary?.id).to.equal('primary-1');
    });

    it('should reject linked account lookups when branding cannot be resolved', async () => {
        (global as any).BrandingService.getBrand = sinon.stub().returns(null);
        const req = makeReq({
            session: { branding: 'default' },
            params: { id: 'primary-1' }
        });
        const res = {} as unknown as Sails.Res;
        const sendRespStub = sinon.stub(controller as any, 'sendResp');

        await controller.getUserLinks(req, res);

        expect((global as any).UsersService.getLinkedAccounts.called).to.be.false;
        expect(sendRespStub.calledOnce).to.be.true;
        expect(sendRespStub.firstCall.args[2]?.status).to.equal(400);
    });

    describe('getUserAudit', () => {
        it('should return audit data for an admin and sanitize the user payload', async () => {
            const req = makeReq({
                session: { branding: 'default' },
                user: { username: 'admin-user' },
                params: { id: 'user-1' }
            });
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
            const req = makeReq({
                session: { branding: 'default' },
                user: { username: 'admin-user' },
                params: {}
            });
            const res = {} as unknown as Sails.Res;
            const sendRespStub = sinon.stub(controller as any, 'sendResp');

            await controller.getUserAudit(req, res);

            expect(sendRespStub.firstCall.args[2]?.status).to.equal(400);
        });

        it('should return 404 when the user does not exist', async () => {
            (global as any).UsersService.getUserWithId = sinon.stub().returns(of(null));
            const req = makeReq({
                session: { branding: 'default' },
                user: { username: 'admin-user' },
                params: { id: 'missing-user' }
            });
            const res = {} as unknown as Sails.Res;
            const sendRespStub = sinon.stub(controller as any, 'sendResp');

            await controller.getUserAudit(req, res);

            expect(sendRespStub.firstCall.args[2]?.status).to.equal(404);
        });

        it('should return 400 when branding cannot be resolved', async () => {
            (global as any).BrandingService.getBrand = sinon.stub().returns(null);
            const req = makeReq({
                session: { branding: 'default' },
                user: { username: 'admin-user' },
                params: { id: 'user-1' }
            });
            const res = {} as unknown as Sails.Res;
            const sendRespStub = sinon.stub(controller as any, 'sendResp');

            await controller.getUserAudit(req, res);

            expect((global as any).UsersService.getUserAudit.called).to.be.false;
            expect(sendRespStub.firstCall.args[2]?.status).to.equal(400);
        });

        it('should return 500 when the audit service fails', async () => {
            (global as any).UsersService.getUserAudit = sinon.stub().rejects(new Error('audit exploded'));
            const req = makeReq({
                session: { branding: 'default' },
                user: { username: 'admin-user' },
                params: { id: 'user-1' }
            });
            const res = {} as unknown as Sails.Res;
            const sendRespStub = sinon.stub(controller as any, 'sendResp');

            await controller.getUserAudit(req, res);

            expect(sendRespStub.firstCall.args[2]?.status).to.equal(500);
        });
    });

    it('should link accounts through the service', async () => {
        const req = makeReq({
            session: { branding: 'default' },
            user: { username: 'admin-user' },
            body: { primaryUserId: 'primary-1', secondaryUserId: 'secondary-1' }
        });
        const res = {} as unknown as Sails.Res;
        const sendRespStub = sinon.stub(controller as any, 'sendResp');

        await controller.linkAccounts(req, res);

        expect((global as any).UsersService.linkAccounts.calledWith('primary-1', 'secondary-1', 'admin-user', 'brand-1')).to.be.true;
        expect(sendRespStub.calledOnce).to.be.true;
        expect(sendRespStub.firstCall.args[2]?.data?.impact?.rolesMerged).to.equal(1);
    });

    it('should reject link requests with missing user ids', async () => {
        const req = makeReq({
            session: { branding: 'default' },
            user: { username: 'admin-user' },
            body: { primaryUserId: '', secondaryUserId: 'secondary-1' }
        });
        const res = {} as unknown as Sails.Res;
        const sendRespStub = sinon.stub(controller as any, 'sendResp');

        await controller.linkAccounts(req, res);

        expect((global as any).UsersService.linkAccounts.called).to.be.false;
        expect(sendRespStub.firstCall.args[2]?.status).to.equal(400);
    });

    it('should reject link requests where the same user is provided twice', async () => {
        const req = makeReq({
            session: { branding: 'default' },
            user: { username: 'admin-user' },
            body: { primaryUserId: 'user-1', secondaryUserId: 'user-1' }
        });
        const res = {} as unknown as Sails.Res;
        const sendRespStub = sinon.stub(controller as any, 'sendResp');

        await controller.linkAccounts(req, res);

        expect((global as any).UsersService.linkAccounts.called).to.be.false;
        expect(sendRespStub.firstCall.args[2]?.status).to.equal(400);
    });

    it('should reject link requests when branding cannot be resolved', async () => {
        (global as any).BrandingService.getBrand = sinon.stub().returns(null);
        const req = makeReq({
            session: { branding: 'default' },
            user: { username: 'admin-user' },
            body: { primaryUserId: 'primary-1', secondaryUserId: 'secondary-1' }
        });
        const res = {} as unknown as Sails.Res;
        const sendRespStub = sinon.stub(controller as any, 'sendResp');

        await controller.linkAccounts(req, res);

        expect((global as any).UsersService.linkAccounts.called).to.be.false;
        expect(sendRespStub.firstCall.args[2]?.status).to.equal(400);
    });

    it('should map validation failures from the service to 400', async () => {
        (global as any).UsersService.linkAccounts = sinon.stub().returns(throwError(() => new Error('Primary user must already belong to the current brand')));
        const req = makeReq({
            session: { branding: 'default' },
            user: { username: 'admin-user' },
            body: { primaryUserId: 'primary-1', secondaryUserId: 'secondary-1' }
        });
        const res = {} as unknown as Sails.Res;
        const sendRespStub = sinon.stub(controller as any, 'sendResp');

        await controller.linkAccounts(req, res);

        expect(sendRespStub.firstCall.args[2]?.status).to.equal(400);
    });

    it('should map unexpected service failures to 500', async () => {
        (global as any).UsersService.linkAccounts = sinon.stub().returns(throwError(() => new Error('database offline')));
        const req = makeReq({
            session: { branding: 'default' },
            user: { username: 'admin-user' },
            body: { primaryUserId: 'primary-1', secondaryUserId: 'secondary-1' }
        });
        const res = {} as unknown as Sails.Res;
        const sendRespStub = sinon.stub(controller as any, 'sendResp');

        await controller.linkAccounts(req, res);

        expect(sendRespStub.firstCall.args[2]?.status).to.equal(500);
    });

    describe('disableUser', () => {
        it('should disable a user when called by admin', async () => {
            const req = makeReq({
                session: { branding: 'default' },
                user: { username: 'admin-user' },
                params: { id: 'user-1' }
            });
            const res = {} as unknown as Sails.Res;
            const apiRespondStub = sinon.stub(controller as any, 'apiRespond');

            await controller.disableUser(req, res);

            expect((global as any).UsersService.disableUser.calledWith('user-1', 'admin-user', 'brand-1')).to.be.true;
            expect(apiRespondStub.calledOnce).to.be.true;
            expect(apiRespondStub.firstCall.args[2]?.status).to.be.true;
        });

        it('should reject when user id is missing', async () => {
            const req = makeReq({
                session: { branding: 'default' },
                user: { username: 'admin-user' },
                params: {}
            });
            const res = {} as unknown as Sails.Res;
            const sendRespStub = sinon.stub(controller as any, 'sendResp');

            await controller.disableUser(req, res);

            expect(sendRespStub.firstCall.args[2]?.status).to.equal(400);
        });

        it('should reject self-disable attempts', async () => {
            const req = makeReq({
                session: { branding: 'default' },
                user: { id: 'admin-1', username: 'admin-user' },
                params: { id: 'admin-1' }
            });
            const res = {} as unknown as Sails.Res;
            const sendRespStub = sinon.stub(controller as any, 'sendResp');

            await controller.disableUser(req, res);

            expect((global as any).UsersService.disableUser.called).to.be.false;
            expect(sendRespStub.firstCall.args[2]?.status).to.equal(400);
        });

        it('should reject a roleless user without an active brand link', async () => {
            (global as any).UsersService.getUserWithId = sinon.stub().returns(of({
                id: 'roleless-user',
                username: 'roleless',
                roles: []
            }));
            const req = makeReq({
                session: { branding: 'default' },
                user: { username: 'admin-user' },
                params: { id: 'roleless-user' }
            });
            const res = {} as unknown as Sails.Res;
            const sendRespStub = sinon.stub(controller as any, 'sendResp');

            await controller.disableUser(req, res);

            expect((global as any).UserLink.findOne.calledOnce).to.be.true;
            expect((global as any).UsersService.disableUser.called).to.be.false;
            expect(sendRespStub.firstCall.args[2]?.status).to.equal(403);
        });

    });

    describe('enableUser', () => {
        it('should enable a user when called by admin', async () => {
            const req = makeReq({
                session: { branding: 'default' },
                user: { username: 'admin-user' },
                params: { id: 'user-1' }
            });
            const res = {} as unknown as Sails.Res;
            const apiRespondStub = sinon.stub(controller as any, 'apiRespond');

            await controller.enableUser(req, res);

            expect((global as any).UsersService.enableUser.calledWith('user-1', 'admin-user', 'brand-1')).to.be.true;
            expect(apiRespondStub.calledOnce).to.be.true;
            expect(apiRespondStub.firstCall.args[2]?.status).to.be.true;
        });

        it('should reject when user id is missing', async () => {
            const req = makeReq({
                session: { branding: 'default' },
                user: { username: 'admin-user' },
                params: {}
            });
            const res = {} as unknown as Sails.Res;
            const sendRespStub = sinon.stub(controller as any, 'sendResp');

            await controller.enableUser(req, res);

            expect(sendRespStub.firstCall.args[2]?.status).to.equal(400);
        });

        it('should reject enable requests when branding cannot be resolved', async () => {
            (global as any).BrandingService.getBrand = sinon.stub().returns(null);
            const req = makeReq({
                session: { branding: 'default' },
                user: { username: 'admin-user' },
                params: { id: 'user-1' }
            });
            const res = {} as unknown as Sails.Res;
            const sendRespStub = sinon.stub(controller as any, 'sendResp');

            await controller.enableUser(req, res);

            expect((global as any).UsersService.enableUser.called).to.be.false;
            expect(sendRespStub.firstCall.args[2]?.status).to.equal(400);
        });

        it('should accept populated brand roles and reject cross-brand users', async () => {
            (global as any).UsersService.getUserWithId.returns(of({
                id: 'user-1',
                username: 'target-user',
                roles: [{ branding: { id: 'brand-1' } }]
            }));
            const req = makeReq({
                session: { branding: 'default' },
                user: { username: 'admin-user' },
                params: { id: 'user-1' }
            });
            const apiRespondStub = sinon.stub(controller as any, 'apiRespond');

            await controller.enableUser(req, {} as Sails.Res);

            expect(apiRespondStub.calledOnce).to.be.true;

            (global as any).UsersService.getUserWithId.returns(of({
                id: 'user-1',
                username: 'target-user',
                roles: [{ branding: 'brand-2' }]
            }));
            const sendRespStub = sinon.stub(controller as any, 'sendResp');

            await controller.enableUser(req, {} as Sails.Res);

            expect((global as any).UsersService.enableUser.calledOnce).to.be.true;
            expect(sendRespStub.firstCall.args[2]?.status).to.equal(403);
        });

    });

    describe('brand-scoped user mutations', () => {
        it('replaces current-brand roles while preserving roles from other brands', () => {
            const roleIds = (controller as any).mergeBrandRoleIds({
                roles: [
                    { id: 'brand-1-old', branding: 'brand-1' },
                    { id: 'brand-2-role', branding: { id: 'brand-2' } },
                    { id: 'global-role' }
                ]
            }, 'brand-1', ['brand-1-new']);

            expect(roleIds).to.deep.equal(['brand-2-role', 'global-role', 'brand-1-new']);
        });

        it('rejects reusing a username owned by another brand', async () => {
            (global as any).UsersService.addLocalUser = sinon.stub().returns(
                throwError(() => new Error('Username already exists'))
            );
            (global as any).UsersService.getUserWithUsername = sinon.stub().returns(of({
                id: 'other-user',
                username: 'existing-user',
                roles: [{ branding: { id: 'brand-2' } }]
            }));
            const sendRespStub = sinon.stub(controller as any, 'sendResp');
            const req = makeReq({
                session: { branding: 'default' },
                user: { username: 'admin-user' },
                body: {
                    username: 'existing-user',
                    name: 'Existing User',
                    email: 'existing@example.org',
                    password: 'secret'
                }
            });

            controller.createUser(req, {} as Sails.Res);
            await new Promise((resolve) => setImmediate(resolve));

            expect((global as any).UsersService.getUserWithUsername.calledOnceWithExactly('existing-user')).to.be.true;
            expect(sendRespStub.firstCall.args[2]?.status).to.equal(403);
        });

        it('allows a linked roleless user to be updated', async () => {
            const linkedUser = { id: 'linked-user', username: 'linked', roles: [] };
            (global as any).UsersService.getUserWithId = sinon.stub().returns(of(linkedUser));
            (global as any).UserLink.findOne.resolves({ id: 'link-1', status: 'active' });
            (global as any).UsersService.updateUserDetails = sinon.stub().returns(of([[linkedUser]]));
            const req = makeReq({
                session: { branding: 'default' },
                user: { username: 'admin-user' },
                body: { id: 'linked-user', name: 'Linked User', email: 'linked@example.org' }
            });
            const apiRespondStub = sinon.stub(controller as any, 'apiRespond');

            await controller.updateUser(req, {} as Sails.Res);

            expect((global as any).UserLink.findOne.calledOnce).to.be.true;
            expect((global as any).UsersService.updateUserDetails.calledOnce).to.be.true;
            expect(apiRespondStub.calledOnce).to.be.true;
        });

        it('rejects updating a user outside the current brand', async () => {
            (global as any).UsersService.getUserWithId = sinon.stub().returns(of({
                id: 'other-user',
                roles: [{ branding: { id: 'brand-2' } }]
            }));
            const sendRespStub = sinon.stub(controller as any, 'sendResp');
            const req = makeReq({
                session: { branding: 'default' },
                user: { username: 'admin-user' },
                body: { id: 'other-user', name: 'Other User' }
            });

            await controller.updateUser(req, {} as Sails.Res);

            expect(sendRespStub.firstCall.args[2]?.status).to.equal(403);
        });

        for (const method of ['generateAPIToken', 'revokeAPIToken'] as const) {
            it(`rejects ${method} for a user outside the current brand`, async () => {
                (global as any).UsersService.getUserWithId = sinon.stub().returns(of({
                    id: 'other-user',
                    roles: [{ branding: 'brand-2' }]
                }));
                const sendRespStub = sinon.stub(controller as any, 'sendResp');
                const req = makeReq({
                    session: { branding: 'default' },
                    user: { username: 'admin-user' },
                    query: { id: 'other-user' }
                });

                await controller[method](req, {} as Sails.Res);

                expect(sendRespStub.firstCall.args[2]?.status).to.equal(403);
            });

            it(`allows ${method} for a user in the current brand`, async () => {
                (global as any).UsersService.setUserKey = sinon.stub().returns(of({
                    id: 'user-1',
                    username: 'target-user'
                }));
                const apiRespondStub = sinon.stub(controller as any, 'apiRespond');
                const req = makeReq({
                    session: { branding: 'default' },
                    user: { username: 'admin-user' },
                    query: { id: 'user-1' }
                });

                await controller[method](req, {} as Sails.Res);

                expect((global as any).UsersService.setUserKey.calledOnce).to.be.true;
                expect((global as any).UsersService.setUserKey.firstCall.args[0]).to.equal('user-1');
                expect(apiRespondStub.calledOnce).to.be.true;
                expect(apiRespondStub.firstCall.args[2]?.username).to.equal('target-user');
            });
        }
    });
});
