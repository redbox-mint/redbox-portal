import assert from 'node:assert/strict';
import sinon from 'sinon';
import { createNamedQueryRoute, updateNamedQueryRoute } from '../../../src/api-routes/groups/named-query';
import { updateVocabularyRoute, syncVocabularyRoute } from '../../../src/api-routes/groups/vocabulary';
import { identityLinkRoutes } from '../../../src/http/identityRoutes';
import { integrationProviderFixture } from './integrationProviderFixture';
import { getMetaRoute } from '../../../src/api-routes/groups/records';
import { referenceOrigin, referenceProductionFixture } from './referenceProductionFixture';
import { wire, type Wire, settleMutationWork } from './mutationDifferentialSupport';
import { assertGolden, goldenControls } from './goldenContracts';
import { withoutSideEffects } from './noSideEffects';

const family = 'retirementTargetIsolation';
function stable(response: Wire) {
  const headers = { ...response.headers };
  for (const key of ['date', 'connection', 'keep-alive', 'x-request-id']) delete headers[key];
  if (headers['set-cookie'])
    headers['set-cookie'] = (headers['set-cookie'] as string[]).map(value =>
      value.replace(/^([^=]+)=[^;]+/, '$1=<session>').replace(/Expires=[^;]+/i, 'Expires=<time>')
    );
  return { ...response, headers };
}

describe('Target isolation through the production host', function () {
  this.timeout(120000);
  let f: Awaited<ReturnType<typeof referenceProductionFixture>>;
  let foreignVocabulary: string;
  let provider: Awaited<ReturnType<typeof integrationProviderFixture>>;
  before(async () => {
    provider = await integrationProviderFixture();
    f = await referenceProductionFixture(true, undefined, undefined, {
      configuration: provider.configuration,
      declarations: [
        createNamedQueryRoute,
        updateNamedQueryRoute,
        updateVocabularyRoute,
        syncVocabularyRoute,
        identityLinkRoutes.find(r => r.action === 'linkAccounts' && r.path.includes('/api/'))!,
      ],
    });
    const created = await f.data.reference.vocabulary.get().create({
      name: 'Do not disclose this vocabulary',
      slug: 'foreign',
      branding: f.otherBrand.id,
      source: 'rva',
      sourceId: '225',
      sourceVersionId: '1',
      entries: [],
    });
    foreignVocabulary = String(created.id);
    await settleMutationWork(f);
  });
  after(async () => {
    try {
      await f?.close();
    } finally {
      await provider?.close();
    }
  });
  for (const version of ['1.0', '2.0'])
    for (const label of [
      'account-self',
      'named-reserved',
      'named-mismatch',
      'named-illegal',
      'vocabulary-update',
      'vocabulary-sync',
    ] as const)
      it(`refuses ${label} in API ${version}`, async () => {
        const id = '000000000000000000000015';
        const cases = {
          'account-self': [
            'POST',
            '/api/users/link',
            { primaryUserId: id, secondaryUserId: id },
            400,
            /Cannot link a user account to itself/,
          ],
          'named-reserved': ['PUT', '/api/named-query/collections', {}, 400, /Invalid or reserved definition name/],
          'named-mismatch': [
            'PUT',
            '/api/named-query/allowed',
            { name: 'aDifferentName' },
            400,
            /Invalid or reserved definition name/,
          ],
          'named-illegal': ['PUT', '/api/named-query/bad.name', {}, 400, /Invalid or reserved definition name/],
          'vocabulary-update': [
            'PUT',
            `/api/vocabulary/${foreignVocabulary}`,
            { name: 'Do not write' },
            404,
            /Vocabulary not found/,
          ],
          'vocabulary-sync': [
            'POST',
            `/api/vocabulary/${foreignVocabulary}/sync`,
            { versionId: '1' },
            404,
            /Vocabulary not found/,
          ],
        } as const;
        const [method, path, body, status, detail] = cases[label];
        const db = f.client.db();
        const state = () =>
          Promise.all(
            ['user', 'useraudit', 'namedquery', 'vocabulary', 'vocabularyentry'].map(name =>
              db.collection(name).find().sort({ _id: 1 }).toArray()
            )
          );
        const before = await state();
        const observe = sinon.createSandbox();
        const catalog = observe.spy(f.data.reference.vocabulary.get(), 'update');
        const writeQuery = observe.spy(f.data.reference.queries.get(), 'update');
        const link = observe.spy(f.data.users.get(), 'linkAccounts');
        provider.reset();
        try {
          const result = await withoutSideEffects(
            f,
            () =>
              wire(
                f.url + '/default/rdmp' + path,
                method,
                {
                  Origin: referenceOrigin,
                  Authorization: 'Bearer pilot-api-token',
                  'Content-Type': 'application/json',
                  'X-ReDBox-API-Version': version,
                },
                JSON.stringify(body)
              ),
            { collections: ['namedquery', 'vocabulary', 'vocabularyentry'], ignorePorts: ['profile:linkAccounts'] }
          );
          assert.equal(result.status, status, result.text);
          assert.match(result.text, detail);
          assert.doesNotMatch(result.text, /Do not disclose this vocabulary/);
          assert.equal(result.headers.etag, undefined);
          await settleMutationWork(f);
          assert.deepEqual(await state(), before);
          assert.equal(catalog.callCount, 0);
          assert.equal(provider.calls.length, 0);
          for (const port of [writeQuery, link]) sinon.assert.notCalled(port);
          assertGolden(family, label + '/' + version, {
            wire: stable(result),
            state: { unchanged: true, catalog: 0, provider: 0 },
          });
        } finally {
          observe.restore();
        }
      });
  for (const version of ['1.0', '2.0'])
    it(`refuses a named query targeting an unregistered collection in API ${version}`, async () => {
      const db = f.client.db();
      const snapshot = () =>
        Promise.all(['namedquery', 'useraudit'].map(name => db.collection(name).find().sort({ _id: 1 }).toArray()));
      const before = await snapshot();
      const result = await withoutSideEffects(
        f,
        () =>
          wire(
            f.url + '/default/rdmp/api/named-query',
            'POST',
            {
              Authorization: 'Bearer pilot-api-token',
              Origin: referenceOrigin,
              'Content-Type': 'application/json',
              'X-ReDBox-Api-Version': version,
            },
            JSON.stringify({
              name: 'refuseForeignCollection',
              collectionName: 'private-collections-marker',
              mongoQuery: {},
              queryParams: {},
              resultObjectMapping: {},
            })
          ),
        { collections: ['namedquery'] }
      );
      const message = 'Unsupported named-query collection or expression.';
      assert.equal(result.status, 400, result.text);
      assert.deepEqual(
        JSON.parse(result.text),
        version === '2.0' ? { errors: [{ detail: message }], meta: {} } : { message, details: '' }
      );
      assert.equal(result.headers.etag, undefined);
      assert.doesNotMatch(result.text, /private-collections-marker|p3-r-operations/);
      await settleMutationWork(f);
      assert.deepEqual(await snapshot(), before);
    });
  it('refuses a malformed secondary identifier before selecting any account', async () => {
    const accounts = f.client.db().collection('user');
    const snapshot = () => accounts.find().sort({ _id: 1 }).toArray();
    const before = await snapshot();
    const membership = sinon.spy(f.data.users.get(), 'requireUserInBrand');
    const linking = sinon.spy(f.data.users.get(), 'linkAccounts');
    try {
      const result = await withoutSideEffects(
        f,
        () =>
          wire(
            f.url + '/default/rdmp/api/users/link',
            'POST',
            {
              Authorization: 'Bearer pilot-api-token',
              Origin: referenceOrigin,
              'Content-Type': 'application/json',
            },
            JSON.stringify({ primaryUserId: '000000000000000000000015', secondaryUserId: 'invalid-secondary' })
          ),
        { ignorePorts: ['profile:linkAccounts'] }
      );
      assert.equal(result.status, 400, result.text);
      assert.deepEqual(JSON.parse(result.text), { message: 'Invalid user identifier', details: '' });
      sinon.assert.notCalled(membership);
      sinon.assert.notCalled(linking);
      assert.deepEqual(await snapshot(), before);
    } finally {
      linking.restore();
      membership.restore();
    }
  });
});

describe('Brand resolution through the production host', function () {
  this.timeout(120000);
  it('does not resolve a syntactically valid unknown brand', async () => {
    const f = await referenceProductionFixture(true, undefined, undefined, { declarations: [getMetaRoute] });
    try {
      const get = (name: string) =>
        wire(f.url + `/${name}/rdmp/api/records/metadata/reference-record`, 'GET', {
          Authorization: 'Bearer pilot-api-token',
        });
      const control = await get('default');
      assert.equal(control.status, 200, control.text);
      assert.equal(JSON.parse(control.text).title, 'Reference');
      const rejected = await get('syntactically-valid-but-unknown-brand');
      assert.equal(rejected.status, 404, rejected.text);
      assert.equal(rejected.headers.etag, undefined);
      assert.doesNotMatch(rejected.text, /Reference|pilot-admin/);
      assertGolden(family, 'brand-lookup', [control, rejected].map(stable));
    } finally {
      await f.close();
    }
  });
});

goldenControls(family);
