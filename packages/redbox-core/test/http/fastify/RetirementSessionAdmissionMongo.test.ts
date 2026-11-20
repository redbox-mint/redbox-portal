import assert from 'node:assert/strict';
import { withoutSideEffects } from './noSideEffects';
import { Collection } from 'mongodb';
import sinon from 'sinon';
import { getMetaRoute } from '../../../src/api-routes/groups/records';
import { referenceProductionFixture } from './referenceProductionFixture';
import { wire, session, type Wire } from './mutationDifferentialSupport';
import { assertGolden, goldenControls } from './goldenContracts';

const family = 'retirementSessionAdmission';
function stable(response: Wire) {
  const headers = { ...response.headers };
  for (const name of ['date', 'connection', 'keep-alive', 'x-request-id']) delete headers[name];
  if (headers['set-cookie'])
    headers['set-cookie'] = (headers['set-cookie'] as string[]).map(value =>
      value.replace(/^([^=]+)=[^;]*/, '$1=<session>').replace(/Expires=[^;]+/i, 'Expires=<time>')
    );
  return { ...response, headers };
}

describe('Persisted credential admission through the production host', function () {
  this.timeout(120000);
  for (const reason of ['expired', 'wrong storage version', 'wrong storage namespace', 'malformed signature'] as const)
    it(`refuses a previously valid cookie with ${reason}`, async () => {
      const f = await referenceProductionFixture(true, undefined, undefined, { declarations: [getMetaRoute] });
      try {
        const url = f.url + '/default/rdmp/api/records/metadata/reference-record';
        const login = await session(f);
        const control = await wire(url, 'GET', login);
        assert.equal(control.status, 200, control.text);
        assert.equal(JSON.parse(control.text).title, 'Reference');
        const store = f.client.db().collection<{
          _id: string;
          session: string;
          version: number;
          expires: Date;
          generation: string;
        }>('referenceSessions');
        const row = (await store.find().toArray()).find(doc => JSON.parse(doc.session).passport?.user);
        assert(row);
        assert.equal(row.version, 1);
        assert.match(row._id, /^redbox-fastify-v1:/);
        if (reason === 'expired') {
          assert.equal((await store.updateOne({ _id: row._id }, { $set: { expires: new Date(1) } })).modifiedCount, 1);
        } else if (reason === 'wrong storage version') {
          assert.equal((await store.updateOne({ _id: row._id }, { $set: { version: 99 } })).modifiedCount, 1);
        } else if (reason === 'wrong storage namespace') {
          assert.equal((await store.deleteOne({ _id: row._id })).deletedCount, 1);
          await store.insertOne({ ...row, _id: row._id.replace(/^redbox-fastify-v1:/, 'unqualified:') });
        }
        const result = await wire(url, 'GET', {
          Cookie: reason === 'malformed signature' ? login.Cookie + 'bad-signature' : login.Cookie,
        });
        assert.equal(result.status, 401, result.text);
        assert.equal(result.headers['www-authenticate'], 'Bearer');
        assert.equal(result.headers['set-cookie'], undefined);
        assert.deepEqual(JSON.parse(result.text), { message: 'Authentication required', details: '' });
        if (reason === 'expired')
          assert.equal(await store.countDocuments({ _id: row._id, expires: { $gt: new Date() } }), 0);
        if (reason === 'wrong storage version') assert.equal((await store.findOne({ _id: row._id }))?.version, 99);
        if (reason === 'wrong storage namespace') assert.equal(await store.countDocuments({ _id: row._id }), 0);
        if (reason === 'malformed signature') {
          const again = await wire(url, 'GET', login);
          assert.equal(again.status, 200, again.text);
          assert.deepEqual(stable(again), stable(control));
        }
        assertGolden(family, reason, { wire: [control, result].map(stable), state: { replacementCookie: false } });
      } finally {
        await f.close();
      }
    });
  for (const mode of ['automatic touch', 'explicit save'] as const)
    it(`does not revive a deleted credential during ${mode}`, async () => {
      const f = await referenceProductionFixture(true, undefined, undefined, { declarations: [getMetaRoute] });
      const observe = sinon.createSandbox();
      try {
        const path = f.url + '/default/rdmp/api/records/metadata/reference-record';
        const login = await session(f);
        const headers = { Cookie: login.Cookie };
        const store = f.client.db().collection('referenceSessions');
        const row = (await store.find().toArray()).find(doc => JSON.parse(doc.session).passport?.user);
        assert(row);
        const native = Collection.prototype.updateOne;
        let attempts = 0;
        const writes = observe.stub(Collection.prototype, 'updateOne').callsFake(async function (
          this: Collection,
          filter,
          updates,
          options
        ) {
          if (
            this.collectionName === 'referenceSessions' &&
            filter._id === row._id &&
            filter.generation === row.generation
          ) {
            attempts++;
            assert.equal(attempts, 1);
            assert.equal(typeof Reflect.get(Object(updates), '$set').session === 'string', mode === 'explicit save');
            assert.equal((await store.deleteOne({ _id: row._id })).deletedCount, 1);
          }
          return native.call(this, filter, updates, options);
        });
        const result = await withoutSideEffects(
          f,
          () => wire(mode === 'explicit save' ? f.url + '/csrfToken' : path, 'GET', headers),
          { expectedRevokedSessionId: String(row._id) }
        );
        writes.restore();
        assert.equal(attempts, 1);
        assert.equal(result.status, mode === 'explicit save' ? 500 : 200, result.text);
        if (mode === 'automatic touch') assert.match(String(result.headers['set-cookie']), /^fm023\.sid=;/);
        else assert.equal(result.headers['set-cookie'], undefined);
        assert.equal(await store.countDocuments({ _id: row._id }), 0);
        const again = await wire(path, 'GET', headers);
        assert.equal(again.status, 401, again.text);
        assert.equal(again.headers['www-authenticate'], 'Bearer');
        assertGolden(family, mode, { wire: [result, again].map(stable), state: { attempts, revived: false } });
      } finally {
        observe.restore();
        await f.close();
      }
    });
  it('withholds a valid persisted credential outside its cookie path', async () => {
    const original = await referenceProductionFixture(true, undefined, undefined, { declarations: [getMetaRoute] });
    let scoped: Awaited<ReturnType<typeof referenceProductionFixture>> | undefined;
    try {
      const login = await session(original);
      const route = '/default/rdmp/api/records/metadata/reference-record';
      const control = await wire(original.url + route, 'GET', login);
      assert.equal(control.status, 200, control.text);
      scoped = await referenceProductionFixture(true, undefined, undefined, {
        declarations: [getMetaRoute],
        sessionCookie: { path: '/portal/user' },
      });
      const rows = await original.client.db().collection('referenceSessions').find().toArray();
      assert(rows.some(row => JSON.parse(row.session).passport?.user));
      const store = scoped.client.db().collection('referenceSessions');
      await store.insertMany(rows);
      const info = await wire(scoped.url + '/user/info', 'GET', login);
      assert.equal(info.status, 200, info.text);
      const refused = await wire(scoped.url + route, 'GET', login);
      assert.equal(refused.status, 401, refused.text);
      assert.equal(refused.headers['www-authenticate'], 'Bearer');
      assert.equal(refused.headers['set-cookie'], undefined);
      assertGolden(family, 'cookie-path', {
        wire: [control, refused].map(stable),
        state: { authenticatedWithinScope: true },
      });
    } finally {
      try {
        await scoped?.close();
      } finally {
        await original.close();
      }
    }
  });
  it('refuses the lower-level session proxy override in production configuration', async () => {
    await assert.rejects(async () => {
      const f = await referenceProductionFixture(true, undefined, undefined, {
        declarations: [getMetaRoute],
        configuration: { redboxSession: { proxy: false } },
      });
      await f.close();
    }, /redboxSession\.proxy: invalid configuration \(unrecognized_keys\)/);
  });
  for (const trustProxy of [false, true])
    it(`honors the trusted transport boundary when proxy trust is ${trustProxy} and cookie proxy is undefined`, async () => {
      const f = await referenceProductionFixture(true, undefined, undefined, {
        declarations: [getMetaRoute],
        sessionCookie: { secure: true },
        configuration: { server: { trustProxy } },
      });
      try {
        const response = await wire(f.url + '/csrfToken', 'GET', { 'X-Forwarded-Proto': 'https' });
        assert.equal(response.status, 200, response.text);
        const token = JSON.parse(response.text)._csrf;
        assert.match(token, /^[a-f0-9]{64}$/);
        const maySetCookie = trustProxy;
        if (maySetCookie) assert.match(String(response.headers['set-cookie']), /; Secure(?:;|$)/i);
        else assert.equal(response.headers['set-cookie'], undefined);
        const persisted = await f.client.db().collection('referenceSessions').find().toArray();
        assert.equal(persisted.length, 1);
        assert.equal(JSON.parse(persisted[0]!.session).cookie.secure, true);
        assertGolden(family, `trusted-proxy/${maySetCookie}`, {
          wire: stable({ ...response, text: response.text.replace(token, '0'.repeat(64)) }),
          state: { persisted: 1, secure: true },
        });
      } finally {
        await f.close();
      }
    });
});

goldenControls(family);
