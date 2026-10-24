import * as sinon from 'sinon';
import { of, throwError } from 'rxjs';
import { httpIdentityFixture, accountHttpRoutes } from '../../helpers/httpIdentityFixture';
import { httpPagesFixture } from '../../helpers/httpPagesFixture';
import { UserAccountLinkError } from '../../../src/identity/Users';
let expect: Chai.ExpectStatic;
describe('Webservice UserManagementController', () => {
  let f: Awaited<ReturnType<typeof httpIdentityFixture>>;
  let users: Record<string, any>;
  let response: Awaited<ReturnType<typeof f.request>>;
  const makeReq = (value: any) => value;
  async function request(action: string, req: any) {
    const route = accountHttpRoutes.find(route => route.action === action && route.path.includes('/api/'))!;
    const params: Record<string, unknown> = { branding: 'default', portal: 'portal', ...req.params };
    for (const key of ['id', 'query', 'primaryUserId'])
      if (req.param?.(key) !== undefined) params[key] = req.param(key);
    const path = route.path.replace(/:([A-Za-z]+)/g, (_match, key) =>
      encodeURIComponent(String(params[key] ?? 'missing'))
    );
    const query = { ...req.query };
    for (const key of ['query', 'primaryUserId']) if (params[key] !== undefined) query[key] = params[key];
    response = await f.request(path + '?' + new URLSearchParams(query), {
      method: route.method.toUpperCase(),
      body: req.body,
      headers: { 'X-ReDBox-Api-Version': '2.0' },
    });
  }
  before(async () => {
    expect = (await import('chai')).expect;
  });
  beforeEach(async () => {
    f = await httpIdentityFixture();
    users = f.users;
    users.getUsersForBrand.returns(
      of([
        {
          id: 'bbbbbbbbbbbbbbbbbbbbbbbb',
          username: 'primary-user',
          name: 'Primary User',
          roles: [{ branding: 'brand-1', name: 'Researcher' }],
          hasApiKey: true,
        },
        {
          id: 'cccccccccccccccccccccccc',
          username: 'alias-user',
          name: 'Alias User',
          linkedPrimaryUserId: 'bbbbbbbbbbbbbbbbbbbbbbbb',
          accountLinkState: 'linked-alias',
          roles: [],
        },
      ])
    );
    f.repository.list.withArgs('userlink').resolves([
      {
        primaryUserId: 'bbbbbbbbbbbbbbbbbbbbbbbb',
        secondaryUserId: 'cccccccccccccccccccccccc',
        brandId: 'brand-1',
        status: 'active',
      },
    ]);
    f.repository.list.withArgs('user').resolves([{ id: 'bbbbbbbbbbbbbbbbbbbbbbbb', username: 'primary-user' }]);
  });
  afterEach(async () => {
    await f.close();
    sinon.restore();
  });

  it('should search link candidates', async () => {
    const req = makeReq({
      session: { branding: 'default' },
      user: { username: 'admin-user' },
      query: { query: 'candidate', primaryUserId: 'bbbbbbbbbbbbbbbbbbbbbbbb' },
    });

    await request('searchLinkCandidates', req);

    expect(users.searchLinkCandidates.calledWith('candidate', 'brand-1', 'bbbbbbbbbbbbbbbbbbbbbbbb')).to.be.true;
    expect(response.headers.get('Content-Type')).to.contain('json');
    expect(response.body.data).to.deep.equal([{ id: 'candidate-1', username: 'candidate-user' }]);
  });

  it('should reject link candidate searches when branding cannot be resolved', async () => {
    f.getBrand.resolves(null);
    const req = makeReq({
      session: { branding: 'default' },
      query: { query: 'candidate', primaryUserId: 'bbbbbbbbbbbbbbbbbbbbbbbb' },
    });

    await request('searchLinkCandidates', req);

    expect(users.searchLinkCandidates.called).to.be.false;
    expect(response.status).to.equal(404);
    expect(response.status).to.equal(404);
  });

  it('should get linked accounts through the service', async () => {
    const req = makeReq({
      session: { branding: 'default' },
      user: { username: 'admin-user' },
      params: { id: 'bbbbbbbbbbbbbbbbbbbbbbbb' },
    });

    await request('getUserLinks', req);

    expect(users.getLinkedAccounts.calledWith('bbbbbbbbbbbbbbbbbbbbbbbb')).to.be.true;
    expect(response.headers.get('Content-Type')).to.contain('json');
    expect(response.body.data?.primary?.id).to.equal('bbbbbbbbbbbbbbbbbbbbbbbb');
  });

  it('should reject linked account lookups when branding cannot be resolved', async () => {
    f.getBrand.resolves(null);
    const req = makeReq({
      session: { branding: 'default' },
      params: { id: 'bbbbbbbbbbbbbbbbbbbbbbbb' },
    });

    await request('getUserLinks', req);

    expect(users.getLinkedAccounts.called).to.be.false;
    expect(response.status).to.equal(404);
    expect(response.status).to.equal(404);
  });

  describe('getUserAudit', () => {
    it('should return audit data for an admin and sanitize the user payload', async () => {
      const req = makeReq({
        session: { branding: 'default' },
        user: { username: 'admin-user' },
        params: { id: '111111111111111111111111' },
      });

      await request('getUserAudit', req);

      expect(users.getUserWithId.calledWith('111111111111111111111111')).to.be.true;
      expect(users.getUserAudit.calledWith('111111111111111111111111')).to.be.true;
      expect(response.headers.get('Content-Type')).to.contain('json');
      expect(response.body.data?.user?.password).to.be.undefined;
      expect(response.body.data?.user?.token).to.be.undefined;
      expect(response.body.data?.summary?.returnedCount).to.equal(1);
    });

    it('should return 400 when the user id is missing', async () => {
      const req = makeReq({
        session: { branding: 'default' },
        user: { username: 'admin-user' },
        params: {},
      });

      await request('getUserAudit', req);

      expect(response.status).to.equal(400);
    });

    it('should return 404 when the user does not exist', async () => {
      users.getUserWithId = sinon.stub().returns(of(null));
      const req = makeReq({
        session: { branding: 'default' },
        user: { username: 'admin-user' },
        params: { id: 'dddddddddddddddddddddddd' },
      });

      await request('getUserAudit', req);

      expect(response.status).to.equal(404);
    });

    it('should return 400 when branding cannot be resolved', async () => {
      f.getBrand.resolves(null);
      const req = makeReq({
        session: { branding: 'default' },
        user: { username: 'admin-user' },
        params: { id: '111111111111111111111111' },
      });

      await request('getUserAudit', req);

      expect(users.getUserAudit.called).to.be.false;
      expect(response.status).to.equal(404);
    });

    it('should return 500 when the audit service fails', async () => {
      users.getUserAudit = sinon.stub().rejects(new Error('audit exploded'));
      const req = makeReq({
        session: { branding: 'default' },
        user: { username: 'admin-user' },
        params: { id: '111111111111111111111111' },
      });

      await request('getUserAudit', req);

      expect(response.status).to.equal(500);
    });
  });

  it('should link accounts through the service', async () => {
    const req = makeReq({
      session: { branding: 'default' },
      user: { username: 'admin-user' },
      body: { primaryUserId: 'bbbbbbbbbbbbbbbbbbbbbbbb', secondaryUserId: 'cccccccccccccccccccccccc' },
    });

    await request('linkAccounts', req);

    expect(
      users.linkAccounts.calledWith('bbbbbbbbbbbbbbbbbbbbbbbb', 'cccccccccccccccccccccccc', 'admin-user', 'brand-1')
    ).to.be.true;
    expect(response.headers.get('Content-Type')).to.contain('json');
    expect(response.body.data?.impact?.rolesMerged).to.equal(1);
  });

  it('should reject link requests with missing user ids', async () => {
    const req = makeReq({
      session: { branding: 'default' },
      user: { username: 'admin-user' },
      body: { primaryUserId: '', secondaryUserId: 'cccccccccccccccccccccccc' },
    });

    await request('linkAccounts', req);

    expect(users.linkAccounts.called).to.be.false;
    expect(response.status).to.equal(400);
  });

  it('should reject link requests where the same user is provided twice', async () => {
    const req = makeReq({
      session: { branding: 'default' },
      user: { username: 'admin-user' },
      body: { primaryUserId: '111111111111111111111111', secondaryUserId: '111111111111111111111111' },
    });

    await request('linkAccounts', req);

    expect(users.linkAccounts.called).to.be.false;
    expect(response.status).to.equal(400);
  });

  it('should reject link requests when branding cannot be resolved', async () => {
    f.getBrand.resolves(null);
    const req = makeReq({
      session: { branding: 'default' },
      user: { username: 'admin-user' },
      body: { primaryUserId: 'bbbbbbbbbbbbbbbbbbbbbbbb', secondaryUserId: 'cccccccccccccccccccccccc' },
    });

    await request('linkAccounts', req);

    expect(users.linkAccounts.called).to.be.false;
    expect(response.status).to.equal(404);
  });

  it('should map validation failures from the service to 400', async () => {
    users.linkAccounts = sinon
      .stub()
      .returns(throwError(() => new UserAccountLinkError('Primary user must already belong to the current brand')));
    const req = makeReq({
      session: { branding: 'default' },
      user: { username: 'admin-user' },
      body: { primaryUserId: 'bbbbbbbbbbbbbbbbbbbbbbbb', secondaryUserId: 'cccccccccccccccccccccccc' },
    });

    await request('linkAccounts', req);

    expect(response.status).to.equal(400);
  });

  it('should map unexpected service failures to 500', async () => {
    users.linkAccounts = sinon.stub().returns(throwError(() => new Error('database offline')));
    const req = makeReq({
      session: { branding: 'default' },
      user: { username: 'admin-user' },
      body: { primaryUserId: 'bbbbbbbbbbbbbbbbbbbbbbbb', secondaryUserId: 'cccccccccccccccccccccccc' },
    });

    await request('linkAccounts', req);

    expect(response.status).to.equal(500);
  });

  describe('disableUser', () => {
    it('should disable a user when called by admin', async () => {
      const req = makeReq({
        session: { branding: 'default' },
        user: { username: 'admin-user' },
        params: { id: '111111111111111111111111' },
      });

      await request('disableUser', req);

      expect(users.disableUser.calledWith('111111111111111111111111', 'admin-user', 'brand-1')).to.be.true;
      expect(response.headers.get('Content-Type')).to.contain('json');
      expect(response.body.data.status).to.be.true;
    });

    it('should reject when user id is missing', async () => {
      const req = makeReq({
        session: { branding: 'default' },
        user: { username: 'admin-user' },
        params: {},
      });

      await request('disableUser', req);

      expect(response.status).to.equal(400);
    });

    it('should reject self-disable attempts', async () => {
      const req = makeReq({
        session: { branding: 'default' },
        user: { id: 'aaaaaaaaaaaaaaaaaaaaaaaa', username: 'admin-user' },
        params: { id: 'aaaaaaaaaaaaaaaaaaaaaaaa' },
      });

      await request('disableUser', req);

      expect(users.disableUser.called).to.be.false;
      expect(response.status).to.equal(400);
    });
  });

  describe('enableUser', () => {
    it('should enable a user when called by admin', async () => {
      const req = makeReq({
        session: { branding: 'default' },
        user: { username: 'admin-user' },
        params: { id: '111111111111111111111111' },
      });

      await request('enableUser', req);

      expect(users.enableUser.calledWith('111111111111111111111111', 'admin-user', 'brand-1')).to.be.true;
      expect(response.headers.get('Content-Type')).to.contain('json');
      expect(response.body.data.status).to.be.true;
    });

    it('should reject when user id is missing', async () => {
      const req = makeReq({
        session: { branding: 'default' },
        user: { username: 'admin-user' },
        params: {},
      });

      await request('enableUser', req);

      expect(response.status).to.equal(400);
    });

    it('should reject enable requests when branding cannot be resolved', async () => {
      f.getBrand.resolves(null);
      const req = makeReq({
        session: { branding: 'default' },
        user: { username: 'admin-user' },
        params: { id: '111111111111111111111111' },
      });

      await request('enableUser', req);

      expect(users.enableUser.called).to.be.false;
      expect(response.status).to.equal(404);
    });
  });

  describe('brand-scoped user mutations', () => {
    it('rejects reusing a username owned by another brand', async () => {
      users.addLocalUser = sinon.stub().returns(throwError(() => new Error('Username already exists')));
      users.getUserWithUsername = sinon.stub().returns(
        of({
          id: 'eeeeeeeeeeeeeeeeeeeeeeee',
          username: 'existing-user',
          roles: [{ branding: { id: 'brand-2' } }],
        })
      );
      users.getUserWithId = sinon
        .stub()
        .returns(
          of({ id: 'eeeeeeeeeeeeeeeeeeeeeeee', username: 'existing-user', roles: [{ branding: { id: 'brand-2' } }] })
        );
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

      await request('createUser', req);
      await new Promise(resolve => setImmediate(resolve));

      expect(users.getUserWithUsername.calledOnceWithExactly('existing-user')).to.be.true;
      expect(response.status).to.equal(403);
    });
    it('rejects updating a user outside the current brand', async () => {
      users.getUserWithId = sinon.stub().returns(
        of({
          id: 'eeeeeeeeeeeeeeeeeeeeeeee',
          roles: [{ branding: { id: 'brand-2' } }],
        })
      );
      const req = makeReq({
        session: { branding: 'default' },
        user: { username: 'admin-user' },
        body: { id: 'eeeeeeeeeeeeeeeeeeeeeeee', name: 'Other User', email: '', password: '' },
      });

      await request('updateUser', req);

      expect(response.status).to.equal(403);
    });

    for (const method of ['generateAPIToken', 'revokeAPIToken'] as const) {
      it(`rejects ${method} for a user outside the current brand`, async () => {
        users.getUserWithId = sinon.stub().returns(
          of({
            id: 'eeeeeeeeeeeeeeeeeeeeeeee',
            roles: [{ branding: 'brand-2' }],
          })
        );
        const req = makeReq({
          session: { branding: 'default' },
          user: { username: 'admin-user' },
          query: { id: 'eeeeeeeeeeeeeeeeeeeeeeee' },
        });

        await request(method, req);

        expect(response.status).to.equal(403);
      });

      it(`allows ${method} for a user in the current brand`, async () => {
        users.setUserKey = sinon.stub().returns(
          of({
            id: '111111111111111111111111',
            username: 'target-user',
          })
        );
        const req = makeReq({
          session: { branding: 'default' },
          user: { username: 'admin-user' },
          query: { id: '111111111111111111111111' },
        });

        await request(method, req);

        expect(users.setUserKey.calledOnce).to.be.true;
        expect(users.setUserKey.firstCall.args[0]).to.equal('111111111111111111111111');
        expect(response.headers.get('Content-Type')).to.contain('json');
        expect(response.body.data.username).to.equal('target-user');
      });
    }
  });
});
