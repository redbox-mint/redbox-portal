import assert from 'node:assert/strict';
import sinon from 'sinon';
import { getMetaRoute } from '../../../src/api-routes/groups/records';
import { HttpIdentity } from '../../../src/authentication/HttpIdentity';
import { referenceOrigin, referenceProductionFixture } from './referenceProductionFixture';
import { session, wire, type Fixture, type Wire, settleMutationWork } from './mutationDifferentialSupport';
import { assertGolden, goldenControls } from './goldenContracts';
import { withoutSideEffects } from './noSideEffects';

const family = 'retirementCredentials';
const reads = '/default/rdmp/api/records/metadata/reference-record';
const pid = '000000000000000000000015';
function stable(response: Wire) {
  const headers = { ...response.headers };
  for (const key of ['date', 'connection', 'keep-alive', 'x-request-id']) delete headers[key];
  if (headers['set-cookie'])
    headers['set-cookie'] = (headers['set-cookie'] as string[]).map(value =>
      value.replace(/^([^=]+)=[^;]+/, '$1=<session>').replace(/Expires=[^;]+/i, 'Expires=<time>')
    );
  const text = response.text.replace(
    /("(?:createdAt|updatedAt|lastLogin)":")\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z(?=")/g,
    (_match, field: string) => field + '0000-00-00T00:00:00.000Z'
  );
  return { ...response, headers, text };
}
async function bootstrap() {
  return referenceProductionFixture(true, undefined, undefined, { declarations: [getMetaRoute] });
}
async function csrf(f: Fixture) {
  const response = await wire(f.url + '/csrfToken', 'GET');
  assert.equal(response.status, 200, response.text);
  const value = String((response.headers['set-cookie'] as string[])[0]).split(';')[0];
  assert.match(JSON.parse(response.text)._csrf, /^[a-f0-9]{64}$/);
  return { Cookie: value, Origin: referenceOrigin, 'X-CSRF-Token': JSON.parse(response.text)._csrf as string };
}
function expectBearerDenial(response: Wire) {
  assert.equal(response.status, 401, response.text);
  assert.equal(response.headers['www-authenticate'], 'Bearer');
  assert.deepEqual(JSON.parse(response.text), { message: 'Authentication required', details: '' });
  assert.equal(response.headers.etag, undefined);
}

describe('Authentication rejects malformed and competing credentials on the production host', function () {
  this.timeout(120000);
  let f: Fixture;
  let login: Awaited<ReturnType<typeof session>>;
  before(async () => {
    f = await bootstrap();
    login = await session(f);
    await settleMutationWork(f);
  });
  after(async () => f?.close());
  for (const [kind, header, query] of [
    ['malformed bearer format', 'Bearer', ''],
    ['non-Bearer scheme', 'Basic pilot-api-token', ''],
    ['competing header and query tokens', 'Bearer pilot-api-token', '?access_token=pilot-api-token'],
    ['invalid bearer despite a valid session', 'Bearer not-a-valid-token', ''],
  ] as const)
    it('rejects ' + kind, async () => {
      const control = await wire(f.url + reads, 'GET', login);
      assert.equal(control.status, 200, control.text);
      assert.equal(JSON.parse(control.text).title, 'Reference');
      const bearer = sinon.spy(HttpIdentity.prototype, 'bearer');
      try {
        const send = (authorization: string) =>
          wire(f.url + reads + query, 'GET', {
            Cookie: login.Cookie,
            Authorization: authorization,
          });
        const result = await send(header);
        expectBearerDenial(result);
        assertGolden(family, kind, { wire: [control, result].map(stable) });
        if (kind === 'malformed bearer format') {
          const extra = await send('Bearer pilot-api-token extra');
          expectBearerDenial(extra);
          assertGolden(family, kind, { wire: [control, extra].map(stable) });
        }
        if (kind === 'invalid bearer despite a valid session')
          sinon.assert.calledOnceWithExactly(bearer, 'not-a-valid-token');
        else sinon.assert.notCalled(bearer);
      } finally {
        bearer.restore();
      }
    });
  it('rejects a structured query token without handing it to the identity provider', async () => {
    const spy = sinon.spy(HttpIdentity.prototype, 'bearer');
    try {
      const result = await wire(f.url + reads + '?access_token[secret]=input-not-for-logs', 'GET');
      assert.equal(result.status, 500, result.text);
      assert.doesNotMatch(result.text, /input-not-for-logs|Invalid credential input/);
      assert.equal(result.headers.etag, undefined);
      sinon.assert.notCalled(spy);
      assertGolden(family, 'structured-query-token', { wire: stable(result), state: { providerCalls: spy.callCount } });
    } finally {
      spy.restore();
    }
  });
  for (const kind of ['outdated', 'malformed principal', 'missing account'] as const)
    it(`rejects ${kind} authentication in a previously valid signed session`, async () => {
      const store = f.client.db().collection('referenceSessions');
      const previousIds = (await store.find().project({ _id: 1 }).toArray()).map(row => row._id);
      const fresh = await session(f);
      const current = await wire(f.url + reads, 'GET', fresh);
      assert.equal(current.status, 200, current.text);
      const newSessions = await store.find({ _id: { $nin: previousIds } }).toArray();
      assert.equal(newSessions.length, 1);
      const [persisted] = newSessions;
      assert(persisted);
      const saved = JSON.parse(persisted.session);
      assert.equal(saved.authenticationVersion, 6);
      assert.equal(saved.passport.user, pid);
      if (kind === 'outdated') saved.authenticationVersion = 5;
      if (kind === 'malformed principal') saved.passport.user = [pid];
      if (kind === 'missing account') saved.passport.user = '000000000000000000000098';
      assert.equal(
        (await store.updateOne({ _id: persisted._id }, { $set: { session: JSON.stringify(saved) } })).modifiedCount,
        1
      );
      const result = await wire(f.url + reads, 'GET', fresh);
      expectBearerDenial(result);
      const removed = (await store.countDocuments({ _id: persisted._id })) === 0;
      assert.equal(removed, kind === 'outdated');
      assertGolden(family, `signed-session/${kind}`, { wire: [current, result].map(stable), state: { removed } });
    });
});

describe('Login and logout rejections on the production host', function () {
  this.timeout(120000);
  let f: Fixture;
  before(async () => {
    f = await bootstrap();
  });
  after(async () => f?.close());
  const events = () => f.client.db().collection('useraudit').find().sort({ _id: 1 }).toArray();
  it('keeps a successful local login on the configured mount when the return target is external', async () => {
    const authenticate = async (target: string) =>
      wire(
        f.url + '/user/login_local?redirUrl=' + encodeURIComponent(target),
        'POST',
        { ...(await csrf(f)), 'Content-Type': 'application/x-www-form-urlencoded' },
        new URLSearchParams({ username: 'pilot-admin', password: 'pilot-password' }).toString()
      );
    const before = await events();
    const deniedTarget = await authenticate('https://external.invalid/');
    assert.equal(deniedTarget.status, 302, deniedTarget.text);
    assert.equal(deniedTarget.headers.location, '/portal/default/rdmp/home');
    assert.equal(deniedTarget.text, 'Found. Redirecting to /portal/default/rdmp/home');
    const validPath = '/portal/default/rdmp/researcher/home';
    const allowedTarget = await authenticate(validPath);
    assert.equal(allowedTarget.status, 302, allowedTarget.text);
    assert.equal(allowedTarget.headers.location, validPath);
    assert.equal(allowedTarget.text, 'Found. Redirecting to ' + validPath);
    assert.deepEqual(
      (await events()).slice(before.length).map(event => event.action),
      ['login', 'login']
    );
  });
  it('rejects an OIDC callback without a stored portal context', async () => {
    const result = await withoutSideEffects(f, () =>
      wire(f.url + '/user/login_oidc?code=invalid&state=invalid', 'GET')
    );
    assert.equal(result.status, 400, result.text);
    assert.equal(result.headers.location, undefined);
    assert.deepEqual(JSON.parse(result.text), { message: 'Invalid branding or portal' });
  });
  it('rejects valid local credentials in a brand with no account role', async () => {
    const credentials = await csrf(f);
    const result = await withoutSideEffects(
      f,
      () =>
        wire(
          f.url + '/user/login_local',
          'POST',
          { ...credentials, 'Content-Type': 'application/x-www-form-urlencoded' },
          new URLSearchParams({ username: 'pilot-admin', password: 'pilot-password', branding: 'other' }).toString()
        ),
      { expectedCredentialTimestamp: 'pilot-admin' }
    );
    assert.equal(result.status, 200, result.text);
    assert.equal(result.headers.location, undefined);
    assert.deepEqual(JSON.parse(result.text), { message: 'Incorrect username/password', user: false });
  });
  for (const [label, route, status, authenticated] of [
    ['logout without a session actor', '/default/rdmp/user/logout', 403, false],
    ['logout in another brand', '/other/rdmp/user/logout', 403, true],
    ['logout with an invalid context', '/missing/rdmp/user/logout', 400, true],
  ] as const)
    it('rejects ' + label, async () => {
      const state = authenticated ? await session(f) : await csrf(f);
      const before = await events();
      const result = await withoutSideEffects(f, () =>
        wire(f.url + route, 'POST', { Origin: referenceOrigin, ...state })
      );
      assert.equal(result.status, status, result.text);
      assert.equal(result.text, '');
      assert.equal(result.headers.location, undefined);
      const control = await wire(f.url + '/user/info', 'GET', { Cookie: state.Cookie });
      assert.equal(control.status, authenticated ? 200 : 403, control.text);
      assert.deepEqual(await events(), before);
      assertGolden(family, label, { wire: [result, control].map(stable), state: { auditUnchanged: true } });
    });
  for (const [label, route, method, headers, body, status] of [
    ['invalid OIDC branding', '/user/begin_oidc?branding=missing', 'GET', {}, '', 400],
    ['unconfigured OIDC provider', '/user/begin_oidc?id=missing', 'GET', {}, '', 500],
    [
      'unconfigured AAF provider',
      '/user/login_aaf',
      'POST',
      { 'Content-Type': 'application/json' },
      '{"assertion":"ignored"}',
      500,
    ],
  ] as const)
    it('rejects ' + label, async () => {
      const before = await events();
      const send = () => wire(f.url + route, method, headers, body);
      const result = await withoutSideEffects(f, send);
      assert.equal(result.status, status, result.text);
      assert.doesNotMatch(result.text, /Unknown OIDC provider|AAF is not configured|ignored/);
      assert.equal(result.headers.location, undefined);
      assert.deepEqual(await events(), before);
      assertGolden(family, label, { wire: stable(result), state: { auditUnchanged: true } });
    });
  it('rejects local login when the resolved actor disappears before profile lookup', async () => {
    const live = HttpIdentity.prototype.profile;
    const users = f.client.db().collection('user');
    const before = await users.findOne({ username: 'pilot-admin' });
    assert(before);
    const profile = sinon.stub(HttpIdentity.prototype, 'profile').callsFake(async function (this: HttpIdentity, id) {
      assert.equal(id, pid);
      assert.equal((await users.deleteOne({ _id: before._id })).deletedCount, 1);
      return live.call(this, id);
    });
    try {
      const audits = await events();
      const header = await csrf(f);
      const getAuthenticated = async () =>
        (await f.client.db().collection('referenceSessions').find().toArray())
          .map(row => JSON.parse(row.session).passport?.user)
          .filter(Boolean)
          .sort();
      const beforeSessions = await getAuthenticated();
      const result = await withoutSideEffects(
        f,
        () =>
          wire(
            f.url + '/user/login_local',
            'POST',
            { ...header, 'Content-Type': 'application/json' },
            JSON.stringify({ username: 'pilot-admin', password: 'pilot-password' })
          ),
        { expectedRemovedAccount: 'pilot-admin' }
      );
      assert.equal(result.status, 403, result.text);
      assert.equal(result.text, '');
      assert.equal(result.headers.location, undefined);
      sinon.assert.calledOnce(profile);
      assert.equal(await users.countDocuments({ _id: before._id }), 0);
      assert.deepEqual(await events(), audits);
      assert.deepEqual(await getAuthenticated(), beforeSessions);
      assertGolden(family, 'disappearing-profile', {
        wire: stable(result),
        state: { createdAuthentication: false, auditUnchanged: true },
      });
    } finally {
      profile.restore();
      await users.replaceOne({ _id: before._id }, before, { upsert: true });
    }
  });
});
goldenControls(family);
