import { expect } from 'chai';
import * as sinon from 'sinon';
import { CreateSecretCommand, GetSecretValueCommand, PutSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { APP_CONFIG_SECRET_CLEAR, APP_CONFIG_SECRET_MASK, Services } from '../../src/services/AppConfigService';
import { ConfigModels } from '../../src/configmodels/ConfigModels';
import { createMockSails, setupServiceTestGlobals, cleanupServiceTestGlobals, createBundleLockCollection } from './testHelper';

describe('AppConfig per-brand JSON bundles', function () {
  const brand = { id: 'brand1', name: 'default' };
  type Row = { branding: string; configKey: string; configData: Record<string, unknown> };
  let service: Services.AppConfigs;
  let rows: Row[];
  let secrets: Map<string, { arn: string; name?: string; value: string }>;
  let send: sinon.SinonStub;
  let persist: sinon.SinonStub;
  let modelInfo: sinon.SinonStub;
  let locks: ReturnType<typeof createBundleLockCollection>;

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
    locks = createBundleLockCollection();
    globals.BrandingService = { getBrand: () => brand };
    globals.AppConfig = {
      find: async (criteria: { configKey?: string }) => rows.filter(row => !criteria.configKey || row.configKey === criteria.configKey),
      create: async (data: Row) => { rows.push(data); return data; },
      updateOne: (criteria: object) => ({ set: (data: object) => persist(criteria, data) }),
      getDatastore: () => ({ manager: { collection: () => locks } })
    };
    sinon.stub(ConfigModels, 'getConfigKeys').returns([]);
    modelInfo = sinon.stub(ConfigModels, 'getModelInfo').returns({ modelName: 'BundleModel', class: class {}, schema: {}, secretFields: ['connection.token', 'connection.password', 'sites.*.ingestion.adminToken'] });
    send = sinon.stub(SecretsManagerClient.prototype, 'send').callsFake(async command => {
      if (command instanceof CreateSecretCommand) {
        const name = command.input.Name!;
        const secret = { arn: `arn:aws:secretsmanager:ap-southeast-2:123456789012:secret:${name}-123456`, name, value: command.input.SecretString! };
        secrets.set(name, secret);
        secrets.set(secret.arn, secret);
        return { ARN: secret.arn, Name: name };
      }
      const secret = secrets.get(command.input.SecretId);
      if (!secret) throw Object.assign(new Error('Missing'), { name: 'ResourceNotFoundException' });
      if (command instanceof PutSecretValueCommand) secret.value = command.input.SecretString!;
      return { ARN: secret.arn, Name: secret.name, SecretString: secret.value };
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

  it('refreshes stale bundled passwords on masked saves after another node changes them', async function () {
    await service.createConfig('default', 'first', { connection: { token: 'one' } });
    const otherProcess = new Services.AppConfigs();
    await otherProcess.createOrUpdateConfig(brand, 'first', { connection: { token: 'two' } });
    send.resetHistory();
    await service.createOrUpdateConfig(brand, 'first', { connection: { token: APP_CONFIG_SECRET_MASK }, label: 'edited' });
    expect(_.get(service.getAppConfigurationForBrand('default'), 'first.connection.token')).to.equal('two');
    expect(calls(GetSecretValueCommand)).to.equal(1);
    expect(calls(PutSecretValueCommand)).to.equal(0);
    send.resetHistory();
    await service.createOrUpdateConfig(brand, 'first', { connection: { token: 'two' } });
    expect(send.called).to.equal(false);
  });

  it('resubmits an older plaintext value after another node changes the password', async function () {
    await service.createConfig('default', 'first', { connection: { token: 'one' } });
    const otherProcess = new Services.AppConfigs();
    await otherProcess.createOrUpdateConfig(brand, 'first', { connection: { token: 'two' } });
    send.resetHistory();
    await service.createOrUpdateConfig(brand, 'first', { connection: { token: 'one' } });
    expect(JSON.parse(secrets.get(stored('first').arn)!.value).values['["first","connection","token"]']).to.equal('one');
    expect(_.get(service.getAppConfigurationForBrand('default'), 'first.connection.token')).to.equal('one');
    expect(calls(GetSecretValueCommand)).to.equal(1);
    expect(calls(PutSecretValueCommand)).to.equal(1);
  });

  it('clears a password added by another node after this node loaded the brand', async function () {
    await service.createConfig('default', 'first', { connection: { token: 'one' } });
    const arn = stored('first').arn;
    const otherProcess = new Services.AppConfigs();
    await otherProcess.createOrUpdateConfig(brand, 'first', { connection: { token: APP_CONFIG_SECRET_MASK, password: 'two' } });
    send.resetHistory();
    await service.createOrUpdateConfig(brand, 'first', { connection: { token: APP_CONFIG_SECRET_MASK, password: APP_CONFIG_SECRET_CLEAR } });
    expect(JSON.parse(secrets.get(arn)!.value).values).to.deep.equal({ '["first","connection","token"]': 'one' });
    expect(calls(GetSecretValueCommand)).to.equal(1);
    expect(calls(PutSecretValueCommand)).to.equal(1);
  });

  it('keeps unchanged saves free of AWS calls after an explicit reload', async function () {
    await service.createConfig('default', 'first', { connection: { token: 'one' } });
    const otherProcess = new Services.AppConfigs();
    otherProcess.brandingAppConfigMap.default = await otherProcess.loadAppConfigurationModel('brand1');
    send.resetHistory();
    await otherProcess.createOrUpdateConfig(brand, 'first', { connection: { token: 'one' } });
    await otherProcess.createOrUpdateConfig(brand, 'first', { connection: { token: APP_CONFIG_SECRET_MASK } });
    expect(send.called).to.equal(false);
  });

  it('loads during a foreign write and refreshes its untrusted snapshot on the next save', async function () {
    await service.createConfig('default', 'first', { connection: { token: 'one' } });
    const arn = stored('first').arn;
    const lock = [...locks.documents.values()][0];
    Object.assign(lock, { owner: 'foreign-writer', expiresAt: new Date(Date.now() + 120_000), cacheToken: 'write-already-dispatched' });
    const startingProcess = new Services.AppConfigs();
    send.resetHistory();
    startingProcess.brandingAppConfigMap.default = await startingProcess.loadAppConfigurationModel('brand1');
    expect(_.get(startingProcess.getAppConfigurationForBrand('default'), 'first.connection.token')).to.equal('one');
    expect(calls(GetSecretValueCommand)).to.equal(1);
    try { await startingProcess.createOrUpdateConfig(brand, 'first', { connection: { token: APP_CONFIG_SECRET_MASK } }); expect.fail('Expected rejection'); }
    catch (error) { expect(String(error)).to.contain('update is in progress'); }
    // The in-flight AWS write finishes after startup's read, without changing
    // its already-published token again.
    secrets.get(arn)!.value = JSON.stringify({ format: 'redbox-appconfig-v1', values: { '["first","connection","token"]': 'two' } });
    delete lock.owner;
    lock.expiresAt = new Date(0);
    send.resetHistory();
    await startingProcess.createOrUpdateConfig(brand, 'first', { connection: { token: APP_CONFIG_SECRET_MASK } });
    expect(_.get(startingProcess.getAppConfigurationForBrand('default'), 'first.connection.token')).to.equal('two');
    expect(calls(GetSecretValueCommand)).to.equal(1);
    expect(send.callCount).to.equal(1);
    send.resetHistory();
    await startingProcess.createOrUpdateConfig(brand, 'first', { connection: { token: 'two' } });
    expect(send.called).to.equal(false);
  });

  it('saves non-secret keys without lock access during a foreign write or with an invalid prefix', async function () {
    await service.createConfig('default', 'first', { connection: { token: 'one' } });
    Object.assign([...locks.documents.values()][0], { owner: 'foreign-writer', expiresAt: new Date(Date.now() + 120_000) });
    modelInfo.withArgs('ordinary').returns({ modelName: 'Ordinary', class: class {}, schema: {}, secretFields: [] });
    const lockRead = sinon.spy(locks, 'findOne');
    sails.config.appConfigSecrets.namePrefix = 'invalid prefix';
    send.resetHistory();
    await service.createConfig('default', 'ordinary', { label: 'created' });
    await service.createOrUpdateConfig(brand, 'ordinary', { label: 'updated' });
    expect(_.get(service.getAppConfigurationForBrand('default'), 'ordinary.label')).to.equal('updated');
    expect(lockRead.called).to.equal(false);
    expect(send.called).to.equal(false);
  });

  it('skips lock checks when registered secret paths are absent from incoming and existing data', async function () {
    await service.createConfig('default', 'first', { connection: { token: 'one' } });
    Object.assign([...locks.documents.values()][0], { owner: 'foreign-writer', expiresAt: new Date(Date.now() + 120_000) });
    const lockRead = sinon.spy(locks, 'findOne');
    send.resetHistory();
    await service.createConfig('default', 'second', { label: 'created' });
    await service.createOrUpdateConfig(brand, 'second', { label: 'updated' });
    expect(lockRead.called).to.equal(false);
    expect(send.called).to.equal(false);
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
