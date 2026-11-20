import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Collection } from 'mongodb';
import jwt from 'jsonwebtoken';
import sinon from 'sinon';
import { createPortalFastifyHost } from '../../../src/application/portal/host';
import { getMetaRoute } from '../../../src/api-routes/groups/records';
import { referenceProductionFixture } from './referenceProductionFixture';
import { wire, type Wire, session, settleMutationWork } from './mutationDifferentialSupport';
import { assertGolden, golden, goldenControls } from './goldenContracts';
import { aafAssertion, secret as aafSigningKey } from './authenticationFixture';
import { withoutSideEffects } from './noSideEffects';

const family = 'retirementBoundaryPolicy';
const recordPath = '/default/rdmp/api/records/metadata/reference-record';
function stable(response: Wire) {
  const headers = { ...response.headers };
  for (const key of ['date', 'connection', 'keep-alive', 'x-request-id']) delete headers[key];
  if (headers['set-cookie'])
    headers['set-cookie'] = (headers['set-cookie'] as string[]).map(value =>
      value.replace(/^([^=]+)=[^;]+/, '$1=<session>').replace(/Expires=[^;]+/i, 'Expires=<time>')
    );
  return { ...response, headers };
}

describe('Authorization boundaries under production faults', function () {
  this.timeout(120000);
  it('does not authenticate an AAF assertion without a provider signing key', async () => {
    const keyRequests: string[] = [];
    const f = await referenceProductionFixture(true, undefined, undefined, {
      declarations: [getMetaRoute],
      hostFactory: (portal, options) =>
        createPortalFastifyHost(portal, {
          ...options,
          authentication: () => ({
            ...options.authentication(),
            config: {
              active: ['local', 'aaf'],
              aaf: {
                opts: {
                  secretOrKeyProvider(_request: unknown, assertion: string, done: (error: Error) => void) {
                    keyRequests.push(assertion);
                    done(new Error('not-for-client-key-backend-error'));
                  },
                },
              },
            },
          }),
        }),
    });
    const verify = sinon.spy(jwt, 'verify');
    try {
      const result = await withoutSideEffects(f, () =>
        wire(
          f.url + '/user/login_aaf',
          'POST',
          { 'Content-Type': 'application/json', Accept: 'application/json' },
          JSON.stringify({ assertion: 'unverified-provider-assertion' })
        )
      );
      assert.equal(result.status, 403, result.text);
      assert.deepEqual(JSON.parse(result.text), { message: 'Authentication rejected', user: false });
      assert.deepEqual(keyRequests, ['unverified-provider-assertion']);
      sinon.assert.notCalled(verify);
      const db = f.client.db();
      assert.equal(await db.collection('useraudit').countDocuments({ action: 'login' }), 0);
      assert(
        !(await db.collection('referenceSessions').find().toArray()).some(row => JSON.parse(row.session).passport?.user)
      );
      assertGolden(family, 'aaf-key', {
        wire: stable(result),
        state: { keyRequests, audits: 0, authenticated: false },
      });
    } finally {
      verify.restore();
      await f.close();
    }
  });

  it('vetoes a matching AAF signing key returned with an error', async () => {
    const assertion = aafAssertion({
      sub: 'callback-error-veto',
      'https://aaf.edu.au/attributes': { mail: 'aaf@example.invalid', displayname: 'AAF Callback Control' },
    });
    const keyRequests: string[] = [];
    const providerError = new Error('private AAF key backend error');
    let veto = true;
    const f = await referenceProductionFixture(true, undefined, undefined, {
      declarations: [getMetaRoute],
      hostFactory: (portal, options) =>
        createPortalFastifyHost(portal, {
          ...options,
          authentication: () => ({
            ...options.authentication(),
            config: {
              active: ['local', 'aaf'],
              aaf: {
                opts: {
                  algorithms: ['HS256'],
                  secretOrKeyProvider(
                    _request: unknown,
                    token: string,
                    done: (error: Error | null, key: string) => void
                  ) {
                    keyRequests.push(token);
                    done(veto ? providerError : null, aafSigningKey);
                  },
                },
              },
            },
          }),
        }),
    });
    const sandbox = sinon.createSandbox();
    try {
      const verify = sandbox.spy(jwt, 'verify');
      const authenticate = sandbox.spy(f.data.accounts.get(), 'authenticateAaf');
      const audit = sandbox.spy(f.data.users.get(), 'addUserAuditEvent');
      const db = f.client.db();
      const authenticated = async () =>
        (await db.collection('referenceSessions').find().toArray()).filter(
          row => JSON.parse(row.session).passport?.user
        );
      const submit = () =>
        wire(
          f.url + '/user/login_aaf',
          'POST',
          { 'Content-Type': 'application/json', Accept: 'application/json' },
          JSON.stringify({ assertion })
        );
      const denied = await withoutSideEffects(f, submit);
      const archived = golden(family, 'aaf-key') as { wire: Wire };
      assert.equal(denied.status, 403);
      assert.deepEqual(stable(denied), archived.wire);
      assert.deepEqual(keyRequests, [assertion]);
      sinon.assert.notCalled(verify);
      sinon.assert.notCalled(authenticate);
      sinon.assert.notCalled(audit);
      assert.deepEqual(await authenticated(), []);
      assert.equal(await db.collection('useraudit').countDocuments({ action: 'login' }), 0);

      veto = false;
      const allowed = await submit();
      assert.equal(allowed.status, 302, allowed.text);
      assert.deepEqual(keyRequests, [assertion, assertion]);
      sinon.assert.calledOnce(verify);
      sinon.assert.calledOnce(authenticate);
      assert.equal((await authenticated()).length, 1);
      assert.equal(await db.collection('useraudit').countDocuments({ action: 'login' }), 1);
    } finally {
      sandbox.restore();
      await f.close();
    }
  });

  it('does not replace a bound tenant when the repeated branding policy resolves a different brand', async () => {
    let calls = 0;
    let substitute = false;
    const f = await referenceProductionFixture(
      true,
      { '*': ['brandingAndPortal', 'brandingAndPortal', 'browserActor', 'noCache'] },
      undefined,
      {
        declarations: [getMetaRoute],
        hostFactory: (portal, options) =>
          createPortalFastifyHost(portal, {
            ...options,
            policies: {
              ...options.policies,
              branding: {
                getBrand: async (filter, find) => {
                  if ('name' in filter && filter.name === 'default') {
                    calls++;
                    if (substitute && calls === 2) return options.policies.branding.getBrand({ name: 'other' }, find);
                  }
                  return options.policies.branding.getBrand(filter, find);
                },
              },
            },
          }),
      }
    );
    try {
      const headers = { Authorization: 'Bearer pilot-api-token' };
      const control = await wire(f.url + recordPath, 'GET', headers);
      assert.equal(control.status, 200, control.text);
      assert.equal(calls, 2);
      calls = 0;
      substitute = true;
      const result = await wire(f.url + recordPath, 'GET', headers);
      assert.equal(calls, 2);
      assert.equal(result.status, 500, result.text);
      assert.equal(result.headers.etag, undefined);
      assert.doesNotMatch(result.text, /brand has already been resolved|Reference|other/i);
      assertGolden(family, 'immutable-tenant', { wire: [control, result].map(stable), state: { lookups: calls } });
    } finally {
      await f.close();
    }
  });

  it('clears private headers buffered by an installed hook before a thrown response fails', async () => {
    const f = await referenceProductionFixture(true, undefined, undefined, {
      declarations: [getMetaRoute],
      artifacts: async directory => {
        const name = 'fm043-error-headers';
        const manifest = path.join(directory, 'package.json');
        const json = JSON.parse(await readFile(manifest, 'utf8'));
        json.dependencies[name] = '1.0.0';
        await writeFile(manifest, JSON.stringify(json));
        const module = path.join(directory, 'node_modules', name);
        await mkdir(module);
        await writeFile(
          path.join(module, 'package.json'),
          JSON.stringify({ name, main: 'index.cjs', redbox: { extension: './index.cjs' } })
        );
        await writeFile(
          path.join(module, 'index.cjs'),
          `exports.registerRedboxExtension=()=>({apiVersion:2,hooks:[{
          name:'fm043-buffered-headers',stage:'beforeAction',scope:{kind:'application'},async run(request,reply){
            if (request.headers['x-test-revoke']==='yes') {
              try { await request.session.save(); throw new Error('expected session loss'); }
              catch (error) { if (error.code !== 'ENOENT') throw error; }
              return reply.code(403).send({message:'Session revoked'});
            }
            if (request.headers['x-test-private']!=='yes') return;
            reply.headers({'X-Private-Record':'never-send-marker','ETag':'"private-validator"','Location':'/internal/sensitive',
              'Set-Cookie':'test-credential=private-marker; Path=/','WWW-Authenticate':'Private abc'});
            if (request.headers['x-test-fail']==='yes') throw new Error('private-fault-marker');
            if (request.headers['x-test-deny']==='yes') return reply.code(403).send({message:'Deliberate refusal'});
            }
          }]});`
        );
      },
    });
    try {
      const actor = await session(f);
      const baseline = await wire(f.url + recordPath, 'GET', actor);
      assert.equal(baseline.status, 200, baseline.text);
      const control = await wire(f.url + recordPath, 'GET', { ...actor, 'X-Test-Private': 'yes' });
      assert.equal(control.status, 200, control.text);
      assert.equal(control.headers['x-private-record'], 'never-send-marker');
      const result = await wire(f.url + recordPath, 'GET', { ...actor, 'X-Test-Private': 'yes', 'X-Test-Fail': 'yes' });
      assert.equal(result.status, 500, result.text);
      assert.doesNotMatch(result.text, /private-fault-marker|Reference/);
      for (const header of ['x-private-record', 'etag', 'location', 'set-cookie', 'www-authenticate'])
        assert.equal(result.headers[header], undefined);
      await settleMutationWork(f);
      assert.equal((await f.data.storage().getMeta('reference-record'))?.metadata?.title, 'Reference');
      assertGolden(family, 'private-server-headers', {
        wire: [baseline, control, result].map(stable),
        state: { unchanged: true },
      });
      const denied = await wire(f.url + recordPath, 'GET', { ...actor, 'X-Test-Private': 'yes', 'X-Test-Deny': 'yes' });
      assert.equal(denied.status, 403, denied.text);
      assert.deepEqual(JSON.parse(denied.text), { message: 'Deliberate refusal' });
      for (const header of ['x-private-record', 'location', 'set-cookie'])
        assert.equal(denied.headers[header], undefined);
      const store = f.client.db().collection('referenceSessions');
      const persisted = (await store.find().toArray()).find(row => JSON.parse(row.session).passport?.user);
      assert(persisted);
      const update = Collection.prototype.updateOne;
      let updates = 0;
      const race = sinon.stub(Collection.prototype, 'updateOne').callsFake(async function (
        this: Collection,
        filter,
        values,
        options
      ) {
        if (this.collectionName === 'referenceSessions' && filter._id === persisted._id) {
          updates++;
          if (updates === 1) assert.equal((await store.deleteOne({ _id: persisted._id })).deletedCount, 1);
        }
        return update.call(this, filter, values, options);
      });
      try {
        const refused = await wire(f.url + recordPath, 'GET', { ...actor, 'X-Test-Revoke': 'yes' });
        assert.equal(refused.status, 403, refused.text);
        assert.deepEqual(JSON.parse(refused.text), { message: 'Session revoked' });
        assert.equal(refused.headers['set-cookie'], undefined);
        assert.equal(updates, 1, 'send pipeline must not attempt to touch a revoked session');
        assert.equal(await store.countDocuments({ _id: persisted._id }), 0);
        const again = await wire(f.url + recordPath, 'GET', actor);
        assert.equal(again.status, 401, again.text);
        assert.equal(again.headers['www-authenticate'], 'Bearer');
      } finally {
        race.restore();
      }
    } finally {
      await f.close();
    }
  });
});

goldenControls(family);
