import assert from 'node:assert/strict';
import sinon from 'sinon';



import { repositoryFixtures } from '../../helpers/repositoryFixtures';
import { APP_CONFIG_SECRET_MASK, AppConfigs } from '../../../src/configuration/AppConfigs';
import { ConfigModelRegistry } from '../../../src/configuration/ConfigModelRegistry';
import { configurationFixtures } from '../../helpers/serviceRepositories';
import { createDomainFixture } from '../../services/testHelper';
import { normalizeSiemConfiguration, SiemConfigurationError } from '../../../src/configmodels/SiemConfiguration';
let expect: Chai.ExpectStatic;
import('chai').then(mod => (expect = mod.expect));
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
describe('SIEM shared header validation and generic AppConfig boundaries', function () {

let service: AppConfigs;
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

  });
afterEach(async () => {

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
afterEach(() => sinon.restore());
});
