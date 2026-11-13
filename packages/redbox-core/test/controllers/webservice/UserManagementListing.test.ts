import * as sinon from 'sinon';
import { Controllers } from '../../../src/controllers/webservice/UserManagementController';

let expect: Chai.ExpectStatic;

describe('Webservice UserManagement listUsers membership boundaries', () => {
  let controller: Controllers.UserManagement;
  let sandbox: sinon.SinonSandbox;
  let roleFind: sinon.SinonStub;
  let populate: sinon.SinonStub;
  let linkFind: sinon.SinonStub;
  let userFind: sinon.SinonStub;
  let getBrand: sinon.SinonStub;
  let enrichDisabled: sinon.SinonStub;
  let respond: sinon.SinonStub;
  let sendError: sinon.SinonStub;
  const globalNames = ['Role', 'UserLink', 'User', 'BrandingService', 'UsersService'] as const;
  let originalGlobals: Array<PropertyDescriptor | undefined>;

  before(async () => {
    expect = (await import('chai')).expect;
  });

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    originalGlobals = globalNames.map(name => Object.getOwnPropertyDescriptor(globalThis, name));
    populate = sandbox.stub().resolves([]);
    roleFind = sandbox.stub().returns({ populate });
    linkFind = sandbox.stub().resolves([]);
    // Unexpected or unscoped user queries must not silently succeed.
    userFind = sandbox.stub().rejects(new Error('Unexpected User.find query'));
    getBrand = sandbox.stub().returns({ id: 'brand-1' });
    enrichDisabled = sandbox.stub().callsFake(async users => users);
    Object.assign(globalThis, {
      Role: { find: roleFind },
      UserLink: { find: linkFind },
      User: { find: userFind },
      BrandingService: { getBrand },
      UsersService: { enrichUsersWithEffectiveDisabledState: enrichDisabled },
    });
    controller = new Controllers.UserManagement();
    respond = sandbox.stub(controller as any, 'apiRespond');
    sendError = sandbox.stub(controller as any, 'sendResp');
  });

  afterEach(() => {
    sandbox.restore();
    globalNames.forEach((name, index) => {
      const descriptor = originalGlobals[index];
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    });
  });

  async function list(query: Record<string, unknown> = {}) {
    await controller.listUsers(
      {
        session: { branding: 'default' },
        apiRequest: { params: {}, query, body: {}, files: {} },
      } as Sails.Req,
      {} as Sails.Res
    );
    expect(sendError.called, 'listing should not return an error').to.equal(false);
    expect(respond.calledOnce).to.equal(true);
    return respond.firstCall.args[2];
  }

  for (const brand of [null, {}, { id: '' }]) {
    it(`fails closed without querying membership or users for brand ${JSON.stringify(brand)}`, async () => {
      getBrand.returns(brand);

      const result = await list({ includeDisabled: true });

      expect(result.records).to.deep.equal([]);
      expect(result.summary.numFound).to.equal(0);
      expect(roleFind.called).to.equal(false);
      expect(linkFind.called).to.equal(false);
      expect(userFind.called).to.equal(false);
      expect(enrichDisabled.called).to.equal(false);
    });
  }

  it('returns role members when the optional UserLink model is unavailable', async () => {
    Reflect.deleteProperty(globalThis, 'UserLink');
    populate.resolves([{ users: [{ id: 'member', username: 'member' }] }]);

    const result = await list();

    expect(roleFind.calledOnceWithExactly({ branding: 'brand-1' })).to.equal(true);
    expect(populate.calledOnceWithExactly('users', { where: { loginDisabled: { '!=': true } } })).to.equal(true);
    expect(result.records).to.deep.equal([
      {
        id: 'member',
        username: 'member',
        accountLinkState: 'active',
        linkedAccountCount: 0,
        effectivePrimaryUsername: 'member',
      },
    ]);
    expect(result.summary.numFound).to.equal(1);
    expect(userFind.called).to.equal(false);
  });

  it('treats absent, null and empty populated users as empty membership', async () => {
    populate.resolves([{}, { users: null }, { users: [] }]);

    const result = await list();

    expect(result.records).to.deep.equal([]);
    expect(result.summary.numFound).to.equal(0);
    expect(linkFind.calledOnceWithExactly({ brandId: 'brand-1', status: 'active' })).to.equal(true);
    expect(userFind.called).to.equal(false);
  });

  for (const includeDisabled of [false, true]) {
    it(`scopes roleless aliases to active brand links and search with includeDisabled=${includeDisabled}`, async () => {
      populate.resolves([{ users: [] }]);
      linkFind.resolves([{ primaryUserId: 'primary', secondaryUserId: 'alias' }]);
      const filter = includeDisabled
        ? { email: 'alias@example.test' }
        : { email: 'alias@example.test', loginDisabled: { '!=': true } };
      userFind
        .withArgs({ where: { and: [filter, { id: ['alias'] }] } })
        .resolves([
          { id: 'alias', username: 'alias', linkedPrimaryUserId: 'primary', password: 'secret', token: 'secret' },
        ]);
      userFind.withArgs({ id: ['primary'] }).resolves([{ id: 'primary', username: 'primary-name' }]);

      const result = await list({ searchBy: 'email', query: 'alias@example.test', includeDisabled });

      expect(roleFind.calledOnceWithExactly({ branding: 'brand-1' })).to.equal(true);
      expect(populate.calledOnceWithExactly('users', { where: filter })).to.equal(true);
      expect(linkFind.calledOnceWithExactly({ brandId: 'brand-1', status: 'active' })).to.equal(true);
      expect(userFind.calledTwice).to.equal(true);
      expect(result.summary.numFound).to.equal(1);
      expect(result.records).to.deep.equal([
        {
          id: 'alias',
          username: 'alias',
          linkedPrimaryUserId: 'primary',
          accountLinkState: 'active',
          linkedAccountCount: 0,
          effectivePrimaryUsername: 'primary-name',
        },
      ]);
    });
  }

  it('deduplicates role members and linked aliases before counting and pagination', async () => {
    const member = { id: 'member', username: 'member' };
    populate.resolves([{ users: [member] }, { users: [{ ...member }] }]);
    linkFind.resolves([
      { primaryUserId: 'primary', secondaryUserId: 'member' },
      { primaryUserId: 'primary', secondaryUserId: 'alias' },
      { primaryUserId: 'primary', secondaryUserId: 'alias' },
    ]);
    userFind.withArgs({ where: { and: [{}, { id: ['alias'] }] } }).resolves([{ id: 'alias', username: 'alias' }]);
    userFind.withArgs({ id: ['primary'] }).resolves([]);

    const result = await list({ includeDisabled: true, page: 2, pageSize: 1 });

    expect(userFind.calledTwice).to.equal(true);
    expect(enrichDisabled.firstCall.args[0].map((user: { id: string }) => user.id)).to.deep.equal(['member', 'alias']);
    expect(result.summary.numFound).to.equal(2);
    expect(result.summary.page).to.equal(2);
    expect(result.records.map((user: { id: string }) => user.id)).to.deep.equal(['alias']);
  });

  it('does not fetch an alias again when it already has a brand role', async () => {
    populate.resolves([{ users: [{ id: 'alias', username: 'alias', linkedPrimaryUserId: 'missing-primary' }] }]);
    linkFind.resolves([{ primaryUserId: 'missing-primary', secondaryUserId: 'alias' }]);
    userFind.withArgs({ id: ['missing-primary'] }).resolves([]);

    const result = await list();

    expect(userFind.calledOnceWithExactly({ id: ['missing-primary'] })).to.equal(true);
    expect(result.summary.numFound).to.equal(1);
    expect(result.records[0].effectivePrimaryUsername).to.equal('alias');
  });

  it('ignores dangling secondary links without listing their primary as a member', async () => {
    linkFind.resolves([{ primaryUserId: 'foreign-primary', secondaryUserId: 'deleted-alias' }]);
    userFind.withArgs({ where: { and: [{}, { id: ['deleted-alias'] }] } }).resolves([]);
    userFind.withArgs({ id: ['foreign-primary'] }).resolves([{ id: 'foreign-primary', username: 'foreign' }]);

    const result = await list({ includeDisabled: true });

    expect(userFind.calledTwice).to.equal(true);
    expect(result.records).to.deep.equal([]);
    expect(result.summary.numFound).to.equal(0);
  });

  it('excludes inherited disabled state before computing counts and slicing pages', async () => {
    populate.resolves([
      {
        users: [
          { id: 'disabled-alias', username: 'disabled-alias' },
          { id: 'active', username: 'active' },
        ],
      },
    ]);
    enrichDisabled.resolves([
      { id: 'disabled-alias', effectiveLoginDisabled: true },
      { id: 'active', effectiveLoginDisabled: false },
    ]);

    const result = await list({ pageSize: 1 });

    expect(result.summary.numFound).to.equal(1);
    expect(result.records).to.deep.equal([{ id: 'active', effectiveLoginDisabled: false }]);
    expect(userFind.called).to.equal(false);
  });
});
