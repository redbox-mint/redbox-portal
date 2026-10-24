import assert from 'node:assert/strict';
import { of } from 'rxjs';
import * as sinon from 'sinon';
import { httpRouteFixture } from '../../helpers/httpRouteFixture';
import { mountRecordTypeRoutes } from '../../../src/http/express/recordTypes';
import { recordSchemaCreateResolverUrl } from '../../../src/api-routes/record-schema-response';

describe('Record-type schema discovery through owned HTTP', () => {
  let f: Awaited<ReturnType<typeof httpRouteFixture>>;
  let enabled: unknown;
  let get: sinon.SinonStub;
  let getAll: sinon.SinonStub;
  beforeEach(async () => {
    enabled = true;
    get = sinon.stub();
    getAll = sinon.stub();
    f = await httpRouteFixture((router, input) =>
      mountRecordTypeRoutes(router, {
        ...input,
        recordTypes: { get, getAll },
        get recordSchema() {
          return { enabled };
        },
      })
    );
    f.getBrand.resolves({ id: f.brand.id, name: 'public-brand' });
  });
  afterEach(async () => {
    await f.close();
  });
  const base = '/public-brand/portal/api/recordtypes';
  it('adds a public create resolver without replacing stored fields', async () => {
    const stored = {
      name: 'data set',
      packageType: 'dataset-package',
      searchable: true,
      recordSchema: { unknownProperties: 'declared' },
    };
    get.returns(of(stored));
    const response = await f.request(base + '/get?name=data%20set');
    assert.equal(response.status, 200);
    assert.deepEqual(response.body, {
      ...stored,
      recordSchemaCreateResolver: '/public-brand/portal/api/records/schemas/create/data%20set',
    });
    assert.equal(Reflect.has(stored, 'recordSchemaCreateResolver'), false);
    assert(!response.text.includes('/api/forms/get'));
    assert.equal(
      recordSchemaCreateResolverUrl('public brand', 'portal/subpath', 'data set'),
      '/public%20brand/portal%2Fsubpath/api/records/schemas/create/data%20set'
    );
    assert.equal(get.firstCall.args[0].name, 'public-brand');
  });
  it('accepts the environment-string enabled flag', async () => {
    enabled = 'true';
    get.returns(of({ name: 'dataset', packageType: 'dataset-package' }));
    const response = await f.request(base + '/get?name=dataset');
    assert.equal(response.status, 200);
    assert.equal(response.body.recordSchemaCreateResolver, '/public-brand/portal/api/records/schemas/create/dataset');
  });
  it('adds bounded resolvers to listed types without exposing form configuration', async () => {
    const stored = [
      { name: 'dataset', packageType: 'dataset-package' },
      { name: 'publication', packageType: 'publication-package' },
    ];
    getAll.returns(of(stored));
    const response = await f.request(base);
    assert.equal(response.status, 200);
    assert.equal(response.body.summary.numFound, 2);
    assert.deepEqual(
      response.body.records.map(value => value.recordSchemaCreateResolver),
      [
        '/public-brand/portal/api/records/schemas/create/dataset',
        '/public-brand/portal/api/records/schemas/create/publication',
      ]
    );
    assert(!response.text.includes('/api/forms/get'));
    assert(!response.text.includes('configuration'));
    assert(!stored.some(value => Reflect.has(value, 'recordSchemaCreateResolver')));
  });
  for (const version of ['1.0', '2.0']) {
    it(`retains the ${version} response shape when schema discovery is disabled`, async () => {
      enabled = false;
      const stored = { name: 'dataset', packageType: 'dataset-package', searchable: true };
      const records = [stored, { name: 'publication', packageType: 'publication-package' }];
      get.returns(of(stored));
      getAll.returns(of(records));
      const options = { headers: { 'x-redbox-api-version': version } };
      const single = await f.request(base + '/get?name=dataset', options);
      const list = await f.request(base, options);
      assert.equal(single.status, 200);
      assert.equal(list.status, 200);
      const one = version === '2.0' ? single.body.data : single.body;
      const many = version === '2.0' ? list.body.data : list.body;
      assert.deepEqual(one, stored);
      assert(!Reflect.has(one, 'recordSchemaCreateResolver'));
      assert.equal(many.summary.numFound, 2);
      assert.deepEqual(many.records, records);
      assert(!many.records.some(value => Reflect.has(value, 'recordSchemaCreateResolver')));
    });
  }
});
