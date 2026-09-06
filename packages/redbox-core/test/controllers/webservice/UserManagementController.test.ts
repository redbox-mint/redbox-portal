import * as sinon from 'sinon';
import { map, of, throwError } from 'rxjs';
import { Controllers } from '../../../src/controllers/webservice/UserManagementController';
import { AuthorizationAdministrationError } from '../../../src/authorization/errors';

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
  let originalRoleAdministrationService: any;

  before(async () => {
    const chai = await import('chai');
    expect = chai.expect;
  });

  beforeEach(() => {
    originalSails = (global as any).sails;
    originalUsersService = (global as any).UsersService;
    originalBrandingService = (global as any).BrandingService;
    originalRolesService = (global as any).RolesService;
    originalRoleAdministrationService = (global as any).RoleAdministrationService;

    (global as any).sails = {
      log: {
        error: sinon.stub(),
        verbose: sinon.stub(),
      },
    };
    (global as any).BrandingService = {
      getBrand: sinon.stub().returns({ id: 'brand-1', name: 'default' }),
      getBrandFromReq: sinon.stub().callsFake(() => (global as any).BrandingService.getBrand()),
    };
    (global as any).UsersService = {
      getUserWithId: sinon.stub().returns(
        of({
          id: 'user-1',
          username: 'target-user',
          password: 'secret',
          token: 'tok',
          roles: [{ name: 'Researcher', branding: 'brand-1' }],
        })
      ),
      getUserForBrand: sinon
        .stub()
        .callsFake((id: string, brandId: string) =>
          (global as any).UsersService.getUserWithId(id).pipe(
            map((user: any) =>
              user?.roles?.some(
                (role: any) => String(typeof role.branding === 'object' ? role.branding?.id : role.branding) === brandId
              )
                ? user
                : null
            )
          )
        ),
      findUserForBrand: sinon
        .stub()
        .callsFake((_field: string, _value: string) => (global as any).UsersService.getUserWithId('user-1')),
      getUsersForBrand: sinon.stub().returns(of([])),
      getUserAudit: sinon.stub().resolves({
        records: [{ id: 'audit-1', action: 'login', details: 'User logged in' }],
        summary: { returnedCount: 1, truncated: false },
      }),
      getUserAuditForBrand: sinon.stub().callsFake((id: string) => (global as any).UsersService.getUserAudit(id)),
      searchLinkCandidates: sinon.stub().returns(of([{ id: 'candidate-1', username: 'candidate-user' }])),
      getLinkedAccounts: sinon
        .stub()
        .returns(of({ primary: { id: 'primary-1', username: 'primary-user' }, linkedAccounts: [] })),
      getLinkedAccountsForBrand: sinon
        .stub()
        .callsFake((id: string) => (global as any).UsersService.getLinkedAccounts(id)),
      linkAccounts: sinon.stub().returns(
        of({
          primary: { id: 'primary-1', username: 'primary-user' },
          linkedAccounts: [],
          impact: { rolesMerged: 1, recordsRewritten: 2 },
        })
      ),
      enrichUsersWithEffectiveDisabledState: sinon
        .stub()
        .callsFake((users: any[]) => Promise.resolve(users.map((u: any) => ({ ...u, effectiveLoginDisabled: false })))),
      disableUser: sinon.stub().resolves(),
      disableUserForBrand: sinon
        .stub()
        .callsFake((...args: unknown[]) => (global as any).UsersService.disableUser(...args)),
      enableUser: sinon.stub().resolves(),
      enableUserForBrand: sinon
        .stub()
        .callsFake((...args: unknown[]) => (global as any).UsersService.enableUser(...args)),
      setUserKey: sinon.stub().returns(of({ id: 'user-1', username: 'target-user' })),
      setUserKeyForBrand: sinon
        .stub()
        .callsFake((id: string, token: string) => (global as any).UsersService.setUserKey(id, token)),
      updateUserDetails: sinon.stub().returns(of([])),
      updateUserDetailsForBrand: sinon
        .stub()
        .callsFake((...args: unknown[]) => (global as any).UsersService.updateUserDetails(...args)),
      // AUTH-SAGA-001 fail-closed outbox fakes: the controller persists the
      // saga row BEFORE mutating and fails closed (503/409, no mutation)
      // when persistence rejects. These resolve by default; suites override
      // per test to prove the fail-closed path.
      beginUserMutationOperation: sinon.stub().callsFake(async (input: any) => ({
        operationId: input.operationId,
        kind: input.kind,
        brandId: input.brandId,
        username: input.username,
        status: 'pending',
        attemptCount: 0,
        roleIds: input.roleIds ?? [],
        requestId: input.requestId,
      })),
      markUserMutationRunning: sinon.stub().callsFake(async (operationId: string) => ({
        operationId,
        status: 'running',
        attemptCount: 1,
        roleIds: [],
      })),
      completeUserMutationOperation: sinon.stub().resolves({ status: 'completed' }),
      failUserMutationOperation: sinon.stub().resolves({ status: 'failed' }),
      destroyNewlyCreatedUserRecord: sinon.stub().resolves('compensated'),
      compensateUserDetailsForBrand: sinon.stub().returns(of([])),
    };

    controller = new Controllers.UserManagement();
  });

  afterEach(() => {
    sinon.restore();
    (global as any).sails = originalSails;
    (global as any).UsersService = originalUsersService;
    (global as any).BrandingService = originalBrandingService;
    (global as any).RolesService = originalRolesService;
    (global as any).RoleAdministrationService = originalRoleAdministrationService;
  });

  it('should search link candidates', async () => {
    const req = makeReq({
      session: { branding: 'default' },
      user: { username: 'admin-user' },
      query: { query: 'candidate', primaryUserId: 'primary-1' },
    });
    const res = {} as unknown as Sails.Res;
    const sendRespStub = sinon.stub(controller as any, 'sendResp');

    await controller.searchLinkCandidates(req, res);

    expect((global as any).UsersService.searchLinkCandidates.calledWith('candidate', 'brand-1', 'primary-1')).to.be
      .true;
    expect(sendRespStub.calledOnce).to.be.true;
    expect(sendRespStub.firstCall.args[2]?.data).to.deep.equal([{ id: 'candidate-1', username: 'candidate-user' }]);
  });

  it('should reject link candidate searches when branding cannot be resolved', async () => {
    (global as any).BrandingService.getBrand = sinon.stub().returns(null);
    const req = makeReq({
      session: { branding: 'default' },
      query: { query: 'candidate', primaryUserId: 'primary-1' },
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
      params: { id: 'primary-1' },
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
      params: { id: 'primary-1' },
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
        params: { id: 'user-1' },
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
        params: {},
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
        params: { id: 'missing-user' },
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
        params: { id: 'user-1' },
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
        params: { id: 'user-1' },
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
      body: { primaryUserId: 'primary-1', secondaryUserId: 'secondary-1' },
    });
    const res = {} as unknown as Sails.Res;
    const sendRespStub = sinon.stub(controller as any, 'sendResp');

    await controller.linkAccounts(req, res);

    expect((global as any).UsersService.linkAccounts.calledWith('primary-1', 'secondary-1', 'admin-user', 'brand-1')).to
      .be.true;
    expect(sendRespStub.calledOnce).to.be.true;
    expect(sendRespStub.firstCall.args[2]?.data?.impact?.rolesMerged).to.equal(1);
  });

  it('should reject link requests with missing user ids', async () => {
    const req = makeReq({
      session: { branding: 'default' },
      user: { username: 'admin-user' },
      body: { primaryUserId: '', secondaryUserId: 'secondary-1' },
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
      body: { primaryUserId: 'user-1', secondaryUserId: 'user-1' },
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
      body: { primaryUserId: 'primary-1', secondaryUserId: 'secondary-1' },
    });
    const res = {} as unknown as Sails.Res;
    const sendRespStub = sinon.stub(controller as any, 'sendResp');

    await controller.linkAccounts(req, res);

    expect((global as any).UsersService.linkAccounts.called).to.be.false;
    expect(sendRespStub.firstCall.args[2]?.status).to.equal(400);
  });

  it('should map validation failures from the service to 400', async () => {
    (global as any).UsersService.linkAccounts = sinon
      .stub()
      .returns(throwError(() => new Error('Primary user must already belong to the current brand')));
    const req = makeReq({
      session: { branding: 'default' },
      user: { username: 'admin-user' },
      body: { primaryUserId: 'primary-1', secondaryUserId: 'secondary-1' },
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
      body: { primaryUserId: 'primary-1', secondaryUserId: 'secondary-1' },
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
        params: { id: 'user-1' },
        body: { expectedVersion: 2, reason: 'offboard' },
      });
      const res = {} as unknown as Sails.Res;
      const sendRespStub = sinon.stub(controller as any, 'sendResp');

      await controller.disableUser(req, res);

      expect((global as any).UsersService.disableUser.calledWith('user-1', 'admin-user', 'brand-1')).to.be.true;
      expect(sendRespStub.calledOnce).to.be.true;
      expect(sendRespStub.firstCall.args[2]?.data?.status).to.be.true;
    });

    it('should reject disabling without a CAS expectedVersion', async () => {
      const req = makeReq({
        session: { branding: 'default' },
        user: { username: 'admin-user' },
        params: { id: 'user-1' },
        body: {},
      });
      const res = {} as unknown as Sails.Res;
      const sendRespStub = sinon.stub(controller as any, 'sendResp');

      await controller.disableUser(req, res);

      expect((global as any).UsersService.disableUser.called).to.be.false;
      expect(sendRespStub.firstCall.args[2]?.status).to.equal(422);
    });

    it('should reject when user id is missing', async () => {
      const req = makeReq({
        session: { branding: 'default' },
        user: { username: 'admin-user' },
        params: {},
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
        params: { id: 'admin-1' },
      });
      const res = {} as unknown as Sails.Res;
      const sendRespStub = sinon.stub(controller as any, 'sendResp');

      await controller.disableUser(req, res);

      expect((global as any).UsersService.disableUser.called).to.be.false;
      expect(sendRespStub.firstCall.args[2]?.status).to.equal(400);
    });
  });

  describe('enableUser', () => {
    it('should enable a user when called by admin', async () => {
      const req = makeReq({
        session: { branding: 'default' },
        user: { username: 'admin-user' },
        params: { id: 'user-1' },
        body: { expectedVersion: 3 },
      });
      const res = {} as unknown as Sails.Res;
      const sendRespStub = sinon.stub(controller as any, 'sendResp');

      await controller.enableUser(req, res);

      expect((global as any).UsersService.enableUser.calledWith('user-1', 'admin-user', 'brand-1')).to.be.true;
      expect(sendRespStub.calledOnce).to.be.true;
      expect(sendRespStub.firstCall.args[2]?.data?.status).to.be.true;
    });

    it('should reject enabling without a CAS expectedVersion', async () => {
      const req = makeReq({
        session: { branding: 'default' },
        user: { username: 'admin-user' },
        params: { id: 'user-1' },
        body: {},
      });
      const res = {} as unknown as Sails.Res;
      const sendRespStub = sinon.stub(controller as any, 'sendResp');

      await controller.enableUser(req, res);

      expect((global as any).UsersService.enableUser.called).to.be.false;
      expect(sendRespStub.firstCall.args[2]?.status).to.equal(422);
    });

    it('should reject when user id is missing', async () => {
      const req = makeReq({
        session: { branding: 'default' },
        user: { username: 'admin-user' },
        params: {},
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
        params: { id: 'user-1' },
      });
      const res = {} as unknown as Sails.Res;
      const sendRespStub = sinon.stub(controller as any, 'sendResp');

      await controller.enableUser(req, res);

      expect((global as any).UsersService.enableUser.called).to.be.false;
      expect(sendRespStub.firstCall.args[2]?.status).to.equal(400);
    });
  });

  describe('brand-scoped user mutations', () => {
    it('rejects reusing a username owned by another brand', async () => {
      (global as any).UsersService.addLocalUser = sinon
        .stub()
        .returns(throwError(() => new Error('Username already exists')));
      (global as any).UsersService.getUserWithUsername = sinon.stub().returns(
        of({
          id: 'other-user',
          username: 'existing-user',
          roles: [{ branding: { id: 'brand-2' } }],
        })
      );
      const sendRespStub = sinon.stub(controller as any, 'sendResp');
      const req = makeReq({
        session: { branding: 'default' },
        user: { username: 'admin-user' },
        body: {
          username: 'existing-user',
          name: 'Existing User',
          email: 'existing@example.org',
          password: 'secret',
        },
      });

      controller.createUser(req, {} as Sails.Res);
      await new Promise(resolve => setImmediate(resolve));
      await Promise.resolve();

      expect((global as any).UsersService.getUserWithUsername.calledOnceWithExactly('existing-user')).to.be.true;
      expect(sendRespStub.firstCall.args[2]?.status).to.equal(404);
    });
    it('fails closed without mutating when the saga outbox is unavailable', async () => {
      const sagaError = new AuthorizationAdministrationError(
        'authorization.saga-unavailable',
        503,
        'The user mutation saga store is unavailable.'
      );
      (global as any).UsersService.beginUserMutationOperation = sinon.stub().rejects(sagaError);
      (global as any).UsersService.addLocalUser = sinon.stub().returns(of({ id: 'user-new' }));
      // The fail-closed path answers through the Problem Details sender
      // (not sendResp), so the response fake must offer the status/type/json
      // chain the sender uses.
      const jsonStub = sinon.stub();
      const typeStub = sinon.stub().returns({ json: jsonStub });
      const statusStub = sinon.stub().returns({ type: typeStub });
      const res = { status: statusStub } as unknown as Sails.Res;
      const req = makeReq({
        path: '/default/rdmp/api/users',
        session: { branding: 'default' },
        user: { username: 'admin-user' },
        body: {
          username: 'new-user',
          name: 'New User',
          email: 'new@example.org',
          password: 'secret',
        },
      });

      await controller.createUser(req, res);

      expect((global as any).UsersService.addLocalUser.called).to.be.false;
      expect(statusStub.firstCall.args[0]).to.equal(503);
      expect(jsonStub.firstCall.args[0]?.code).to.equal('authorization.saga-unavailable');
    });
    it('rejects updating a user outside the current brand', async () => {
      (global as any).UsersService.getUserWithId = sinon.stub().returns(
        of({
          id: 'other-user',
          roles: [{ branding: { id: 'brand-2' } }],
        })
      );
      const sendRespStub = sinon.stub(controller as any, 'sendResp');
      const req = makeReq({
        session: { branding: 'default' },
        user: { username: 'admin-user' },
        body: { id: 'other-user', name: 'Other User' },
      });

      await controller.updateUser(req, {} as Sails.Res);

      expect(sendRespStub.firstCall.args[2]?.status).to.equal(404);
    });

    it('rejects updating a user without a CAS expectedVersion', async () => {
      const sendRespStub = sinon.stub(controller as any, 'sendResp');
      const req = makeReq({
        session: { branding: 'default' },
        user: { username: 'admin-user' },
        body: { id: 'user-1', name: 'Renamed' },
      });

      await controller.updateUser(req, {} as Sails.Res);

      expect((global as any).UsersService.updateUserDetails.called).to.be.false;
      expect(sendRespStub.firstCall.args[2]?.status).to.equal(422);
    });

    for (const method of ['generateAPIToken', 'revokeAPIToken'] as const) {
      it(`rejects ${method} for a user outside the current brand`, async () => {
        (global as any).UsersService.getUserWithId = sinon.stub().returns(
          of({
            id: 'other-user',
            roles: [{ branding: 'brand-2' }],
          })
        );
        const sendRespStub = sinon.stub(controller as any, 'sendResp');
        const req = makeReq({
          session: { branding: 'default' },
          user: { username: 'admin-user' },
          query: { id: 'other-user' },
        });

        await controller[method](req, {} as Sails.Res);

        expect(sendRespStub.firstCall.args[2]?.status).to.equal(404);
      });

      it(`allows ${method} for a user in the current brand`, async () => {
        (global as any).UsersService.setUserKey = sinon.stub().returns(
          of({
            id: 'user-1',
            username: 'target-user',
          })
        );
        const sendRespStub = sinon.stub(controller as any, 'sendResp');
        const req = makeReq({
          session: { branding: 'default' },
          user: { username: 'admin-user' },
          query: { id: 'user-1', expectedVersion: '2' },
        });

        await controller[method](req, {} as Sails.Res);

        expect((global as any).UsersService.setUserKey.calledOnce).to.be.true;
        expect((global as any).UsersService.setUserKey.firstCall.args[0]).to.equal('user-1');
        expect((global as any).UsersService.setUserKeyForBrand.firstCall.args[3]?.expectedVersion).to.equal(2);
        expect(sendRespStub.calledOnce).to.be.true;
        expect(sendRespStub.firstCall.args[2]?.data?.username).to.equal('target-user');
      });

      it(`rejects ${method} without a CAS expectedVersion`, async () => {
        const sendRespStub = sinon.stub(controller as any, 'sendResp');
        const req = makeReq({
          session: { branding: 'default' },
          user: { username: 'admin-user' },
          query: { id: 'user-1' },
        });

        await controller[method](req, {} as Sails.Res);

        expect(sendRespStub.firstCall.args[2]?.status).to.equal(422);
      });
    }
  });

  describe('system roles (sendResp contract)', () => {
    it('lists brand roles through sendResp with the declared list shape', async () => {
      (global as any).BrandingService.getBrand = sinon.stub().returns({
        id: 'brand-1',
        name: 'default',
        roles: [{ id: 'role-1', name: 'Researcher' }],
      });
      const req = makeReq({ session: { branding: 'default' }, user: { username: 'admin-user' } });
      const sendRespStub = sinon.stub(controller as any, 'sendResp');

      await controller.listSystemRoles(req, {} as Sails.Res);

      expect(sendRespStub.calledOnce).to.be.true;
      expect(sendRespStub.firstCall.args[2]?.data?.summary?.numFound).to.equal(1);
      expect(sendRespStub.firstCall.args[2]?.data?.records).to.deep.equal([{ id: 'role-1', name: 'Researcher' }]);
    });

    it('creates a system role through sendResp and never uses apiRespond', async () => {
      const createRole = sinon.stub().resolves({ version: 1 });
      (global as any).RoleAdministrationService = { createRole };
      const apiRespondStub = sinon.stub(controller as any, 'apiRespond');
      const sendRespStub = sinon.stub(controller as any, 'sendResp');
      const req = makeReq({
        session: { branding: 'default' },
        user: { username: 'admin-user' },
        body: { roleName: 'librarian' },
        authorization: { contextType: 'brand' },
      });

      await controller.createSystemRole(req, {} as Sails.Res);

      expect(createRole.calledOnce).to.be.true;
      expect(apiRespondStub.called).to.be.false;
      expect(sendRespStub.calledOnce).to.be.true;
      expect(sendRespStub.firstCall.args[2]?.data?.message).to.contain('librarian');
    });

    it('rejects role creation without a role name with 400 through sendResp', async () => {
      const apiRespondStub = sinon.stub(controller as any, 'apiRespond');
      const sendRespStub = sinon.stub(controller as any, 'sendResp');
      const req = makeReq({
        session: { branding: 'default' },
        user: { username: 'admin-user' },
        body: {},
        query: {},
      });

      await controller.createSystemRole(req, {} as Sails.Res);

      expect(apiRespondStub.called).to.be.false;
      expect(sendRespStub.firstCall.args[2]?.status).to.equal(400);
    });
  });
});
