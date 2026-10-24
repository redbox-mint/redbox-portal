import * as sinon from 'sinon';
import { of, throwError } from 'rxjs';
import { httpIdentityFixture, accountHttpRoutes } from '../helpers/httpIdentityFixture';
import { httpPagesFixture } from '../helpers/httpPagesFixture';
import { UserAccountLinkError } from '../../src/identity/Users';
let expect: Chai.ExpectStatic;
describe('AdminController', () => {
  let f: Awaited<ReturnType<typeof httpIdentityFixture>>;
  let users: Record<string, any>;
  let response: Awaited<ReturnType<typeof f.request>>;
  const makeReq = (value: any) => value;
  async function request(action: string, req: any) {
    const route = accountHttpRoutes.find(route => route.action === action && !route.path.includes('/api/'))!;
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

  it('should enrich admin users with link metadata', async () => {
    const req = { session: { branding: 'default' }, query: {} };

    await request('getUsers', req);

    expect(response.headers.get('Content-Type')).to.contain('json');
    const payload = { data: response.body.data };
    expect(payload.data).to.have.length(2);
    expect(payload.data[0].linkedAccountCount).to.equal(1);
    expect(payload.data[1].effectivePrimaryUsername).to.equal('primary-user');
  });

  it('renders the harvest runs admin page', async () => {
    const page = await httpPagesFixture();
    try {
      const result = await page.request('/default/portal/admin/harvest-runs');
      expect(result.status).to.equal(200);
      expect(result.text).to.contain('harvest-runs');
    } finally {
      await page.close();
    }
  });

  it('falls back to alias username when the primary repository returns no users', async () => {
    const req = { session: { branding: 'default' }, query: {} };

    f.repository.list.withArgs('user').resolves([]);

    await request('getUsers', req);

    expect(response.headers.get('Content-Type')).to.contain('json');
    const payload = { data: response.body.data };
    expect(payload.data[1].effectivePrimaryUsername).to.equal('alias-user');
  });

  it('should return audit data for an admin and sanitize the user payload', async () => {
    const param = sinon.stub();
    param.withArgs('id').returns('111111111111111111111111');
    const req = {
      session: { branding: 'default' },
      user: { username: 'admin-user' },
      param,
    };

    await request('getUserAudit', req);

    expect(users.getUserWithId.calledWith('111111111111111111111111')).to.be.true;
    expect(users.getUserAudit.calledWith('111111111111111111111111')).to.be.true;
    expect(response.headers.get('Content-Type')).to.contain('json');
    expect(response.body.data?.user?.password).to.be.undefined;
    expect(response.body.data?.user?.token).to.be.undefined;
    expect(response.body.data?.summary?.returnedCount).to.equal(1);
  });

  it('should reject link candidate searches when branding cannot be resolved', async () => {
    f.getBrand.resolves(null);
    const param = sinon.stub();
    param.withArgs('query').returns('candidate');
    param.withArgs('primaryUserId').returns('bbbbbbbbbbbbbbbbbbbbbbbb');
    const req = {
      session: { branding: 'default' },
      param,
    };

    await request('searchLinkCandidates', req);

    expect(users.searchLinkCandidates.called).to.be.false;
    expect(response.status).to.equal(404);
    expect(response.status).to.equal(404);
  });

  it('should reject user audit requests when branding cannot be resolved', async () => {
    f.getBrand.resolves(null);
    const param = sinon.stub();
    param.withArgs('id').returns('111111111111111111111111');
    const req = {
      session: { branding: 'default' },
      user: { username: 'admin-user' },
      param,
    };

    await request('getUserAudit', req);

    expect(users.getUserAudit.called).to.be.false;
    expect(response.status).to.equal(404);
    expect(response.status).to.equal(404);
  });

  it('should link accounts through the admin controller', async () => {
    const req = {
      session: { branding: 'default' },
      user: { username: 'admin-user' },
      body: { primaryUserId: 'bbbbbbbbbbbbbbbbbbbbbbbb', secondaryUserId: 'cccccccccccccccccccccccc' },
    };

    await request('linkAccounts', req);

    expect(
      users.linkAccounts.calledWith('bbbbbbbbbbbbbbbbbbbbbbbb', 'cccccccccccccccccccccccc', 'admin-user', 'brand-1')
    ).to.be.true;
    expect(response.headers.get('Content-Type')).to.contain('json');
    expect(response.body.data?.impact?.rolesMerged).to.equal(1);
  });

  it('should reject link requests when a user is linked to itself', async () => {
    const req = {
      session: { branding: 'default' },
      user: { username: 'admin-user' },
      body: { primaryUserId: '111111111111111111111111', secondaryUserId: '111111111111111111111111' },
    };

    await request('linkAccounts', req);

    expect(users.linkAccounts.called).to.be.false;
    expect(response.headers.get('Content-Type')).to.contain('json');
    expect(response.status).to.equal(400);
  });

  it('should disable a user through the admin controller', async () => {
    const param = sinon.stub();
    param.withArgs('id').returns('222222222222222222222222');
    const req = {
      session: { branding: 'default' },
      user: { id: 'aaaaaaaaaaaaaaaaaaaaaaaa', username: 'admin-user' },
      param,
    };

    await request('disableUser', req);

    expect(users.disableUser.calledWith('222222222222222222222222', 'admin-user', 'brand-1')).to.be.true;
    expect(response.headers.get('Content-Type')).to.contain('json');
    expect(response.body.data?.status).to.equal(true);
  });

  it('should reject disabling your own admin account', async () => {
    const param = sinon.stub();
    param.withArgs('id').returns('aaaaaaaaaaaaaaaaaaaaaaaa');
    const req = {
      session: { branding: 'default' },
      user: { id: 'aaaaaaaaaaaaaaaaaaaaaaaa', username: 'admin-user' },
      param,
    };

    await request('disableUser', req);

    expect(users.disableUser.called).to.be.false;
    expect(response.headers.get('Content-Type')).to.contain('json');
    expect(response.status).to.equal(400);
  });

  it('should enable a user through the admin controller', async () => {
    const param = sinon.stub();
    param.withArgs('id').returns('222222222222222222222222');
    const req = {
      session: { branding: 'default' },
      user: { id: 'aaaaaaaaaaaaaaaaaaaaaaaa', username: 'admin-user' },
      param,
    };

    await request('enableUser', req);

    expect(users.enableUser.calledWith('222222222222222222222222', 'admin-user', 'brand-1')).to.be.true;
    expect(response.headers.get('Content-Type')).to.contain('json');
    expect(response.body.data?.status).to.equal(true);
  });
});
