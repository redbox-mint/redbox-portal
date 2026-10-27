import { repositoryFixtures } from '../../helpers/repositoryFixtures';
import assert from 'node:assert/strict';
import * as sinon from 'sinon';
import { APP_CONFIG_SECRET_MASK, AppConfigs } from '../../../src/configuration/AppConfigs';
import { ConfigModelRegistry } from '../../../src/configuration/ConfigModelRegistry';
import { configurationFixtures } from '../../helpers/serviceRepositories';
import { httpRouteFixture } from '../../helpers/httpRouteFixture';
import { mountConfigurationWriteRoutes } from '../../../src/http/express/configurationWrites';
import { createDomainFixture } from '../../services/testHelper';
import { normalizeSiemConfiguration, SiemConfigurationError } from '../../../src/configmodels/SiemConfiguration';
import { validateApiRouteRequest } from '../../../src/api-routes/validation';
import { saveAppConfigByIdRoute } from '../../../src/api-routes/groups/appconfig';
const target = { id: 'one', adapterType: 'cef', endpointUrl: 'https://collector.example/ingest' };
const reservedNames = [
  'constructor',
  'Constructor',
  'CONSTRUCTOR',
  'prototype',
  'Prototype',
  'PROTOTYPE',
  '__proto__',
  '__Proto__',
  '__PROTO__',
];

describe('SIEM shared header validation and generic AppConfig boundaries', () => {
  let service: AppConfigs;
  let f: Awaited<ReturnType<typeof httpRouteFixture>>;
  let create: sinon.SinonStub;
  let updateOne: sinon.SinonStub;
  let set: sinon.SinonStub;
  const brand = { id: 'brand-1', name: 'default' };
  const stored = normalizeSiemConfiguration({ destinations: [{ ...target, token: 'stored-token' }] });

  beforeEach(async () => {
    const fixture = createDomainFixture();
    service = new AppConfigs({
      repository: configurationFixtures(),
      models: new ConfigModelRegistry(),
      config: fixture.config,
      log: fixture.log,
      availableBrands: () => ['default'],
      getBrand: () => brand as any,
    });
    create = sinon.stub().callsFake(async data => data);
    set = sinon.stub().callsFake(async data => data);
    updateOne = sinon.stub().returns({ set });
    Reflect.set(repositoryFixtures, 'AppConfig', {
      find: sinon.stub().resolves([{ configData: stored }]),
      create,
      updateOne,
    });
    sinon.stub(service, 'loadAppConfigurationModel').resolves({});
    f = await httpRouteFixture((router, input) =>
      mountConfigurationWriteRoutes(router, { ...input, appConfigs: service } as any)
    );
  });
  afterEach(async () => {
    await f.close();
    await service.close();
    sinon.restore();
    Reflect.deleteProperty(repositoryFixtures, 'AppConfig');
  });

  for (const name of reservedNames) {
    it(`rejects the own header ${name} through shared normalization and generic persistence`, async () => {
      // Computed properties create an own __proto__ key, unlike object-literal prototype syntax.
      const config = { destinations: [{ ...target, headers: { [name]: 'credential' } }] };
      assert.throws(() => normalizeSiemConfiguration(config), SiemConfigurationError);
      await assert.rejects(service.createOrUpdateConfig(brand as any, 'siem', config), SiemConfigurationError);
      Reflect.set(repositoryFixtures, 'AppConfig', { find: sinon.stub().resolves([]), create, updateOne });
      await assert.rejects(service.createConfig('default', 'siem', config), SiemConfigurationError);
      assert.equal(create.called, false);
      assert.equal(updateOne.called, false);
    });
  }

  it('masks and restores allowed arbitrary headers, including literal dotted property names', async () => {
    const headers = {
      'X-Api-Key': 'api-credential',
      'x-private': 'private-credential',
      'X.Custom.Secret': 'dotted-credential',
      'constructor.secret': 'constructor-dotted-credential',
      'prototype.secret': 'prototype-dotted-credential',
      '__proto__.secret': 'proto-dotted-credential',
      'X-Test': 'fixture-secret',
      Accept: 'application/json',
    };
    const config = normalizeSiemConfiguration({ destinations: [{ ...target, headers }] });
    Reflect.set(repositoryFixtures, 'AppConfig', {
      find: sinon.stub().resolves([{ configData: config }]),
      create,
      updateOne,
    });
    const masked = await service.getAppConfigByBrandAndKey(brand.id, 'siem');
    assert.deepEqual(
      Reflect.get(Object(masked), 'destinations')[0].headers,
      Object.fromEntries(
        Object.keys(headers).map(name => [name, name === 'Accept' ? 'application/json' : APP_CONFIG_SECRET_MASK])
      )
    );
    assert.deepEqual(config.destinations[0].headers, headers);
    await service.createOrUpdateConfig(brand as any, 'siem', { ...normalizeSiemConfiguration(masked) });
    assert.deepEqual(set.firstCall.args[0].configData.destinations[0].headers, headers);
  });

  const invalidBodies = [
    { label: 'invalid batch size', body: { delivery: { batchSize: -1 } }, message: 'batchSize' },
    {
      label: 'changed target with a mask',
      body: {
        destinations: [{ ...target, endpointUrl: 'https://changed.example/ingest', token: APP_CONFIG_SECRET_MASK }],
      },
      message: 'Replace or explicitly clear',
    },
    {
      label: 'reserved header',
      body: { destinations: [{ ...target, headers: { constructor: 'credential' } }] },
      message: 'Reserved header name',
    },
  ];
  for (const { label, body, message } of invalidBodies) {
    for (const [kind, path] of [
      ['REST', '/api/appconfig/siem'],
      ['admin form', '/appconfig/form/siem'],
    ]) {
      it(`returns ${kind} 400 for ${label} through the actual service without writes`, async () => {
        const validated = validateApiRouteRequest({ params: { appConfigId: 'siem' }, body }, saveAppConfigByIdRoute);
        assert.equal(validated.valid, true);
        const result = await f.request('/default/portal' + path, { method: 'POST', body });
        assert.equal(result.status, 400);
        assert.match(result.body.message, new RegExp(message));
        assert.equal(create.called, false);
        assert.equal(updateOne.called, false);
      });
    }
  }

  it('keeps unexpected REST storage failures as sanitized HTTP 500', async () => {
    updateOne.throws(new Error('storage unavailable'));
    const result = await f.request('/default/portal/api/appconfig/siem', {
      method: 'POST',
      body: { delivery: { batchSize: 2 } },
    });
    assert.equal(result.status, 500);
    assert.equal(result.body.message, 'Internal server error');
    assert(!result.text.includes('storage unavailable'));
  });
});
