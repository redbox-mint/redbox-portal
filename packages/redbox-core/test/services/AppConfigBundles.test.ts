import { expect } from 'chai';
import * as sinon from 'sinon';
import { CreateSecretCommand, GetSecretValueCommand, PutSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { APP_CONFIG_SECRET_CLEAR, APP_CONFIG_SECRET_MASK, Services } from '../../src/services/AppConfigService';
import { ConfigModels } from '../../src/configmodels/ConfigModels';
import { createMockSails, setupServiceTestGlobals, cleanupServiceTestGlobals } from './testHelper';

describe('AppConfig per-brand JSON bundles', function () {
  const brand = { id: 'brand1', name: 'default' };
  type Row = { branding: string; configKey: string; configData: Record<string, unknown> };
  let service: Services.AppConfigs;
  let rows: Row[];
  let secrets: Map<string, { arn: string; value: string }>;
  let send: sinon.SinonStub;
  let persist: sinon.SinonStub;

  beforeEach(function () {
    const mockSails = createMockSails();
    mockSails.config.appConfigSecrets = { provider: 'aws-secrets-manager', layout: 'brand-json', region: 'ap-southeast-2', namePrefix: 'test/appconfig' };
    setupServiceTestGlobals(mockSails);
    rows = [];
    secrets = new Map();
    persist = sinon.stub().callsFake(async (criteria, data) => {
      const row = rows.find(row => row.configKey === criteria.configKey)!;
      Object.assign(row, data);
      return row;
    });
    const globals = globalThis as unknown as Record<string, unknown>;
    globals.BrandingService = { getBrand: () => brand };
    globals.AppConfig = {
      find: async (criteria: { configKey?: string }) => rows.filter(row => !criteria.configKey || row.configKey === criteria.configKey),
      create: async (data: Row) => { rows.push(data); return data; },
      updateOne: (criteria: object) => ({ set: (data: object) => persist(criteria, data) }),
      getDatastore: () => ({ manager: { collection: () => ({ updateOne: async () => ({}), deleteOne: async () => ({}) }) } })
    };
    sinon.stub(ConfigModels, 'getConfigKeys').returns([]);
    sinon.stub(ConfigModels, 'getModelInfo').returns({ modelName: 'BundleModel', class: class {}, schema: {}, secretFields: ['connection.token', 'connection.password', 'sites.*.ingestion.adminToken'] });
    send = sinon.stub(SecretsManagerClient.prototype, 'send').callsFake(async command => {
      if (command instanceof CreateSecretCommand) {
        const name = command.input.Name!;
        const secret = { arn: `arn:aws:secretsmanager:ap-southeast-2:123456789012:secret:${name}-123456`, value: command.input.SecretString! };
        secrets.set(name, secret);
        secrets.set(secret.arn, secret);
        return { ARN: secret.arn, Name: name };
      }
      const secret = secrets.get(command.input.SecretId);
      if (!secret) throw Object.assign(new Error('Missing'), { name: 'ResourceNotFoundException' });
      if (command instanceof PutSecretValueCommand) secret.value = command.input.SecretString!;
      return { ARN: secret.arn, SecretString: secret.value };
    });
    service = new Services.AppConfigs();
  });

  afterEach(function () {
    sinon.restore();
    cleanupServiceTestGlobals();
    const globals = globalThis as unknown as Record<string, unknown>;
    delete globals.AppConfig;
    delete globals.BrandingService;
  });

  function calls(type: typeof CreateSecretCommand | typeof GetSecretValueCommand | typeof PutSecretValueCommand): number {
    return send.getCalls().filter(call => call.args[0] instanceof type).length;
  }

  function stored(key: string, field = 'connection.token') {
    return _.get(rows.find(row => row.configKey === key)!.configData, field).$appConfigSecret;
  }

  it('shares one secret across configurations and reads it once on reload', async function () {
    await service.createConfig('default', 'first', { connection: { token: 'one', password: 'two' } });
    await service.createConfig('default', 'second', { connection: { token: 'three' } });
    expect(stored('first').arn).to.equal(stored('second').arn);
    expect(stored('first').key).not.to.equal(stored('second').key);
    expect(calls(CreateSecretCommand)).to.equal(1);
    expect(calls(PutSecretValueCommand)).to.equal(1);
    expect(JSON.stringify(rows)).not.to.contain('"token":"one"');
    send.resetHistory();
    const loaded = await service.loadAppConfigurationModel('brand1');
    expect(_.get(loaded, 'first.connection.token')).to.equal('one');
    expect(_.get(loaded, 'first.connection.password')).to.equal('two');
    expect(_.get(loaded, 'second.connection.token')).to.equal('three');
    await service.getAppConfigByBrandAndKey('brand1', 'first');
    expect(calls(GetSecretValueCommand)).to.equal(1);
    expect(send.callCount).to.equal(1);
  });

  it('makes zero AWS calls for masked saves and identical plaintext submissions', async function () {
    await service.createConfig('default', 'first', { connection: { token: 'one', password: 'two' } });
    send.resetHistory();
    for (let attempt = 0; attempt < 3; attempt++) {
      await service.createOrUpdateConfig(brand, 'first', { connection: { token: APP_CONFIG_SECRET_MASK, password: APP_CONFIG_SECRET_MASK }, label: 'edited' });
      await service.createOrUpdateConfig(brand, 'first', { connection: { token: 'one', password: 'two' } });
    }
    expect(send.called).to.equal(false);
    expect(_.get(service.getAppConfigurationForBrand('default'), 'first.connection.token')).to.equal('one');
  });

  it('updates several changed passwords with one read and one put, using the same ARN', async function () {
    await service.createConfig('default', 'first', { connection: { token: 'one', password: 'two' } });
    const arn = stored('first').arn;
    send.resetHistory();
    const response = await service.createOrUpdateConfig(brand, 'first', { connection: { token: 'changed-one', password: 'changed-two' } });
    expect(response).to.deep.equal({ connection: { token: APP_CONFIG_SECRET_MASK, password: APP_CONFIG_SECRET_MASK } });
    expect(stored('first').arn).to.equal(arn);
    expect(calls(GetSecretValueCommand)).to.equal(1);
    expect(calls(PutSecretValueCommand)).to.equal(1);
    expect(send.callCount).to.equal(2);
    expect(_.get(service.getAppConfigurationForBrand('default'), 'first.connection.password')).to.equal('changed-two');
  });

  it('removes cleared and omitted fields while preserving other configurations and literal site keys', async function () {
    await service.createConfig('default', 'first', { connection: { token: 'one', password: 'two' }, sites: { 'site.one[2]': { ingestion: { adminToken: 'site-token' } } } });
    await service.createConfig('default', 'second', { connection: { token: 'keep' } });
    const arn = stored('first').arn;
    await service.createOrUpdateConfig(brand, 'first', { connection: { token: APP_CONFIG_SECRET_CLEAR }, sites: { 'site.one[2]': { ingestion: { adminToken: APP_CONFIG_SECRET_MASK } } } });
    expect(JSON.parse(secrets.get(arn)!.value).values).to.deep.equal({
      '["first","sites","site.one[2]","ingestion","adminToken"]': 'site-token',
      '["second","connection","token"]': 'keep'
    });
  });

  it('migrates masked field secrets into the bundle on save', async function () {
    const arn = 'arn:aws:secretsmanager:ap-southeast-2:123456789012:secret:legacy-123456';
    const reference = { $appConfigSecret: { provider: 'aws-secrets-manager', arn } };
    secrets.set(arn, { arn, value: 'legacy-token' });
    rows.push({ branding: 'brand1', configKey: 'first', configData: { connection: { token: reference } } });
    service.brandingAppConfigMap.default = await service.loadAppConfigurationModel('brand1');
    await service.createOrUpdateConfig(brand, 'first', { connection: { token: APP_CONFIG_SECRET_MASK } });
    expect(stored('first').arn).not.to.equal(arn);
    expect(stored('first').key).to.equal('["first","connection","token"]');
    expect(_.get(service.getAppConfigurationForBrand('default'), 'first.connection.token')).to.equal('legacy-token');
    expect(secrets.has(arn)).to.equal(true);
  });

  it('serializes different configuration keys within one brand without losing fields', async function () {
    await Promise.all([
      service.createConfig('default', 'first', { connection: { token: 'one' } }),
      service.createConfig('default', 'second', { connection: { token: 'two' } })
    ]);
    expect(stored('first').arn).to.equal(stored('second').arn);
    const values = JSON.parse(secrets.get(stored('first').arn)!.value).values;
    expect(values).to.deep.equal({ '["first","connection","token"]': 'one', '["second","connection","token"]': 'two' });
    expect(calls(CreateSecretCommand)).to.equal(1);
  });

  it('recovers forward after a database failure without writing the same secret again', async function () {
    await service.createConfig('default', 'first', { connection: { token: 'one' } });
    const arn = stored('first').arn;
    persist.onFirstCall().rejects(new Error('Database failed'));
    try { await service.createOrUpdateConfig(brand, 'first', { connection: { token: 'changed' } }); expect.fail('Expected rejection'); }
    catch (error) { expect(String(error)).to.contain('Database failed'); }
    expect(_.get(service.getAppConfigurationForBrand('default'), 'first.connection.token')).to.equal('one');
    expect(JSON.parse(secrets.get(arn)!.value).values['["first","connection","token"]']).to.equal('changed');
    send.resetHistory();
    await service.createOrUpdateConfig(brand, 'first', { connection: { token: 'changed' } });
    expect(send.called).to.equal(false);
    expect(_.get(service.getAppConfigurationForBrand('default'), 'first.connection.token')).to.equal('changed');
  });
});
