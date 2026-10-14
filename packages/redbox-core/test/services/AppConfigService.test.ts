let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);
import * as sinon from 'sinon';
import { CreateSecretCommand, GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Services as ConfigServices } from '../../src/services/ConfigService';
import { Controllers as WebserviceControllers } from '../../src/controllers/webservice/AdminController';
import { APP_CONFIG_SECRET_CLEAR } from '../../src/services/AppConfigService';
import { APP_CONFIG_SECRET_MASK, Services } from '../../src/services/AppConfigService';
import { ConfigModels } from '../../src/configmodels/ConfigModels';
import { DoiPublishing, fromDoiPublishingFormModel, toDoiPublishingFormModel } from '../../src/configmodels/DoiPublishing';
import { setupServiceTestGlobals, cleanupServiceTestGlobals, createMockSails } from './testHelper';

describe('AppConfigService', function () {
  let service: Services.AppConfigs;
  let mockSails: any;

  beforeEach(function () {
    mockSails = createMockSails();
    setupServiceTestGlobals(mockSails);

    const mockDeferred = (result: unknown) => {
      const p: any = Promise.resolve(result);
      p.exec = sinon.stub().yields(null, result);
      return p;
    };

    (global as any).AppConfig = {
      find: sinon.stub().callsFake(() => mockDeferred([])),
      findOne: sinon.stub().callsFake(() => mockDeferred(null)),
      create: sinon.stub().callsFake((data: Record<string, unknown>) => mockDeferred({ configData: {}, ...data })),
      updateOne: sinon.stub().returns({ set: sinon.stub().callsFake(() => mockDeferred({ configData: {} })) })
    };

    (global as any).BrandingService = {
      getAvailable: sinon.stub().returns(['default']),
      getBrand: sinon.stub().returns({ id: 'brand1', name: 'default' })
    };

    sinon.stub(ConfigModels, 'getConfigKeys').returns([]);
    sinon.stub(ConfigModels, 'getModelInfo').returns({ modelName: 'MockModel', class: class MockModel { } });

    service = new Services.AppConfigs();
    service.brandingAppConfigMap = {};
  });

  afterEach(function () {
    cleanupServiceTestGlobals();
    delete (global as any).AppConfig;
    delete (global as any).BrandingService;
    sinon.restore(); // Restores ConfigModels stubs
  });

  describe('AWS secret storage', function () {
    const arn = 'arn:aws:secretsmanager:ap-southeast-2:123456789012:secret:test-123456';
    const reference = { $appConfigSecret: { provider: 'aws-secrets-manager', arn } };
    let send: sinon.SinonStub;

    beforeEach(function () {
      mockSails.config.appConfigSecrets = { provider: 'aws-secrets-manager', namePrefix: 'test/appconfig', region: 'ap-southeast-2' };
      (ConfigModels.getModelInfo as sinon.SinonStub).returns({
        modelName: 'SecretModel', class: class {}, secretFields: ['connection.token']
      });
      send = sinon.stub(SecretsManagerClient.prototype, 'send');
      send.callsFake(async (command: unknown) => {
        if (command instanceof CreateSecretCommand) return { ARN: arn };
        if (command instanceof GetSecretValueCommand) return { SecretString: 'aws-secret' };
        throw new Error('Unexpected AWS command');
      });
    });

    it('replaces an unreadable old ARN in AWS mode without persisting plaintext', async function () {
      const oldArn = arn + '-deleted';
      (AppConfig.find as unknown as sinon.SinonStub).resolves([{ configKey: 'test', configData: { connection: { token: { $appConfigSecret: { provider: 'aws-secrets-manager', arn: oldArn } } } } }]);
      send.callsFake(async command => {
        if (command instanceof CreateSecretCommand) return { ARN: arn };
        if (command instanceof GetSecretValueCommand && command.input.SecretId === oldArn) throw new Error('old secret deleted');
        return { SecretString: 'replacement' };
      });
      const set = sinon.stub().callsFake(async data => ({ configData: data.configData }));
      (AppConfig.updateOne as unknown as sinon.SinonStub).returns({ set });
      const result = await service.createOrUpdateConfig(BrandingService.getBrand('default'), 'test', { connection: { token: 'replacement' } });
      expect(set.firstCall.args[0].configData.connection.token).to.deep.equal(reference);
      expect(result).to.deep.equal({ connection: { token: APP_CONFIG_SECRET_MASK } });
      expect(_.get(service.getAppConfigurationForBrand('default'), 'test.connection.token')).to.equal('replacement');
    });

    it('does not downgrade an unreadable ARN in database mode', async function () {
      mockSails.config.appConfigSecrets.provider = 'database';
      (AppConfig.find as unknown as sinon.SinonStub).resolves([{ configKey: 'test', configData: { connection: { token: reference } } }]);
      send.rejects(new Error('old secret deleted'));
      try {
        await service.createOrUpdateConfig(BrandingService.getBrand('default'), 'test', { connection: { token: 'replacement' } });
        expect.fail('Expected rejection');
      } catch (error) { expect(String(error)).to.contain('Unable to resolve'); }
      expect((AppConfig.updateOne as unknown as sinon.SinonStub).called).to.equal(false);
      expect(send.getCalls().every(call => call.args[0] instanceof GetSecretValueCommand)).to.equal(true);
    });

    it('rejects path-like config keys before AWS, DB or cache changes', async function () {
      const cache = { connection: { token: 'original' } };
      Object.assign(service.brandingAppConfigMap, { default: { test: cache } });
      for (const key of ['test.connection', 'test[connection]', '__proto__', 'constructor']) {
        for (const write of [
          () => service.createConfig('default', key, { token: 'replacement' }),
          () => service.createOrUpdateConfig(BrandingService.getBrand('default'), key, { token: 'replacement' })
        ]) {
          try { await write(); expect.fail('Expected rejection'); }
          catch (error) { expect(String(error)).to.contain('single safe configuration name'); }
        }
      }
      expect(cache.connection.token).to.equal('original');
      expect((AppConfig.find as unknown as sinon.SinonStub).called).to.equal(false);
      expect((AppConfig.create as unknown as sinon.SinonStub).called).to.equal(false);
      expect(send.called).to.equal(false);
    });

    for (const provider of ['database', 'aws-secrets-manager']) {
      for (const operation of ['create', 'update']) {
        it(`preserves masked deployment defaults on ${operation} in ${provider} mode`, async function () {
          mockSails.config.appConfigSecrets.provider = provider;
          mockSails.config.brandingConfigurationDefaults = { test: { connection: { token: 'aws-secret' } } };
          const data = { connection: { token: APP_CONFIG_SECRET_MASK } };
          const result = operation === 'create'
            ? await service.createConfig('default', 'test', data)
            : await service.createOrUpdateConfig(BrandingService.getBrand('default'), 'test', data);
          const stored = (AppConfig.create as unknown as sinon.SinonStub).firstCall.args[0].configData;
          expect(stored.connection.token).to.deep.equal(provider === 'database' ? 'aws-secret' : reference);
          expect(result).to.deep.equal(data);
          expect(_.get(service.getAppConfigurationForBrand('default'), 'test.connection.token')).to.equal('aws-secret');
          expect(mockSails.config.brandingConfigurationDefaults.test.connection.token).to.equal('aws-secret');
        });
      }
    }

    it('hydrates and masks legacy own constructor site keys while refusing new writes', async function () {
      (ConfigModels.getModelInfo as sinon.SinonStub).returns({ modelName: 'SecretModel', class: class {}, secretFields: ['sites.*.ingestion.adminToken'] });
      const data = JSON.parse(JSON.stringify({ sites: { constructor: { ingestion: { adminToken: reference } } } }));
      (AppConfig.find as unknown as sinon.SinonStub).resolves([{ configKey: 'test', configData: data }]);
      const loaded = await service.loadAppConfigurationModel('brand1');
      expect(_.get(loaded, ['test', 'sites', 'constructor', 'ingestion', 'adminToken'])).to.equal('aws-secret');
      const masked = await service.getAppConfigByBrandAndKey('brand1', 'test');
      expect(_.get(masked, ['sites', 'constructor', 'ingestion', 'adminToken'])).to.equal(APP_CONFIG_SECRET_MASK);
      expect(data.sites.constructor.ingestion.adminToken).to.deep.equal(reference);
      try {
        await service.createOrUpdateConfig(BrandingService.getBrand('default'), 'test', { sites: { constructor: { ingestion: { adminToken: 'new' } } } });
        expect.fail('Expected rejection');
      } catch (error) { expect(String(error)).to.contain('Unsafe'); }
      expect(Object.prototype).not.to.have.property('ingestion');
    });

    it('excludes legacy dotted rows from backend configuration, admin views and forms', async function () {
      (ConfigModels.getConfigKeys as sinon.SinonStub).returns(['test']);
      (ConfigModels.getModelInfo as sinon.SinonStub).callsFake((key: string) => key === 'test'
        ? { modelName: 'SecretModel', class: class {}, schema: {}, secretFields: ['connection.token'] }
        : undefined);
      const rows = [
        { configKey: 'test', configData: { connection: { token: reference } } },
        { configKey: 'test.js', configData: { connection: { token: 'legacy-plaintext' } } },
        { configKey: 'test[0]', configData: { token: 'legacy-plaintext' } }
      ];
      (AppConfig.find as unknown as sinon.SinonStub).resolves(rows);
      const loaded = await service.loadAppConfigurationModel('brand1');
      expect(_.get(loaded, 'test.connection.token')).to.equal('aws-secret');
      expect(_.get(loaded, 'test.js')).to.equal(undefined);
      expect(JSON.stringify(loaded)).not.to.contain('legacy-plaintext');
      Object.assign(service.brandingAppConfigMap, { default: loaded });
      const masked = service.getMaskedAppConfigurationForBrand('default');
      expect(_.get(masked, 'test.connection.token')).to.equal(APP_CONFIG_SECRET_MASK);
      expect(JSON.stringify(masked)).not.to.contain('legacy-plaintext');
      const form = await service.getAppConfigForm(BrandingService.getBrand('default'), 'test');
      expect(_.get(form.model, 'connection.token')).to.equal(APP_CONFIG_SECRET_MASK);
      expect(JSON.stringify(form.model)).not.to.contain('legacy-plaintext');
      expect([...Reflect.get(loaded, Symbol.for('redbox.appConfig.presentKeys'))]).to.deep.equal(['test']);
      expect(mockSails.log.warn.calledWithMatch('Skipping legacy AppConfig row')).to.equal(true);
      try { await service.getAppConfigByBrandAndKey('brand1', 'test.js'); expect.fail('Expected rejection'); }
      catch (error) { expect(String(error)).to.contain('single safe configuration name'); }
    });

    it('stores only an ARN in the database and masks the create response', async function () {
      const incoming = { connection: { token: 'aws-secret' }, url: 'example' };
      const result = await service.createConfig('default', 'test', incoming);
      expect((AppConfig.create as unknown as sinon.SinonStub).firstCall.args[0].configData)
        .to.deep.equal({ connection: { token: reference }, url: 'example' });
      expect(result).to.deep.equal({ connection: { token: APP_CONFIG_SECRET_MASK }, url: 'example' });
      expect(incoming.connection.token).to.equal('aws-secret');
      const command = send.firstCall.args[0] as CreateSecretCommand;
      expect(command.input.SecretString).to.equal('aws-secret');
      expect(command.input.Name).to.match(/^test\/appconfig\/[a-f0-9]+\//);
    });

    for (const provider of ['database', 'aws-secrets-manager']) {
      it(`preserves the ARN on unchanged plaintext resubmission in ${provider} mode`, async function () {
        mockSails.config.appConfigSecrets.provider = provider;
        (AppConfig.find as unknown as sinon.SinonStub).resolves([{ configKey: 'test', configData: { connection: { token: reference } } }]);
        const set = sinon.stub().callsFake(async data => ({ configData: data.configData }));
        (AppConfig.updateOne as unknown as sinon.SinonStub).returns({ set });
        const result = await service.createOrUpdateConfig(BrandingService.getBrand('default'), 'test', { connection: { token: 'aws-secret' } });
        expect(set.firstCall.args[0].configData.connection.token).to.deep.equal(reference);
        expect(result).to.deep.equal({ connection: { token: APP_CONFIG_SECRET_MASK } });
        expect(send.getCalls().every(call => call.args[0] instanceof GetSecretValueCommand)).to.equal(true);
        expect(_.get(service.getAppConfigurationForBrand('default'), 'test.connection.token')).to.equal('aws-secret');
      });
    }

    it('updates only the saved cache key and preserves defaults and present-key metadata', async function () {
      const symbol = Symbol.for('redbox.appConfig.presentKeys');
      mockSails.config.brandingConfigurationDefaults = { defaultOnly: { enabled: true } };
      await service.createConfig('default', 'first', { connection: { token: 'aws-secret' } });
      const cache = service.getAppConfigurationForBrand('default');
      const unrelated = { connection: { token: 'previously-hydrated' } };
      Object.assign(cache, { unrelated });
      send.resetHistory();
      send.callsFake(async command => {
        if (command instanceof GetSecretValueCommand) throw new Error('unrelated secret unavailable');
        return { ARN: arn };
      });
      const result = await service.createConfig('default', 'second', { enabled: true });
      const updated = service.getAppConfigurationForBrand('default');
      expect(result).to.deep.equal({ enabled: true });
      expect(_.get(updated, 'second.enabled')).to.equal(true);
      expect(_.get(updated, 'defaultOnly.enabled')).to.equal(true);
      expect(_.get(updated, 'unrelated')).to.equal(unrelated);
      expect([...Reflect.get(updated, symbol)]).to.deep.equal(['first', 'second']);
      expect(send.called).to.equal(false);
    });

    it('retains cache changes from concurrent saves to different keys', async function () {
      let releaseFirst: () => void;
      const firstWritten = new Promise<void>(resolve => { releaseFirst = resolve; });
      (AppConfig.create as unknown as sinon.SinonStub).callsFake(async data => {
        if (data.configKey === 'first') await firstWritten;
        return data;
      });
      const first = service.createConfig('default', 'first', { value: 1 });
      await new Promise(resolve => setImmediate(resolve));
      await service.createConfig('default', 'second', { value: 2 });
      releaseFirst!();
      await first;
      expect(_.get(service.getAppConfigurationForBrand('default'), 'first.value')).to.equal(1);
      expect(_.get(service.getAppConfigurationForBrand('default'), 'second.value')).to.equal(2);
      expect([...Reflect.get(service.getAppConfigurationForBrand('default'), Symbol.for('redbox.appConfig.presentKeys'))]).to.have.members(['first', 'second']);
    });

    it('serializes same-key updates through DB replies and cache publication', async function () {
      mockSails.config.appConfigSecrets.provider = 'database';
      let persisted = { configKey: 'test', configData: { connection: { token: 'original-secret' }, value: 0 } };
      (AppConfig.find as unknown as sinon.SinonStub).callsFake(async () => [persisted]);
      let releaseFirst!: () => void;
      const firstReply = new Promise<void>(resolve => { releaseFirst = resolve; });
      const set = sinon.stub().callsFake(async data => {
        persisted = { configKey: 'test', configData: data.configData };
        if (data.configData.value === 1) await firstReply;
        return persisted;
      });
      (AppConfig.updateOne as unknown as sinon.SinonStub).returns({ set });
      const brand = BrandingService.getBrand('default');
      const first = service.createOrUpdateConfig(brand, 'test', { connection: { token: 'new-secret' }, value: 1 });
      await new Promise(resolve => setImmediate(resolve));
      const second = service.createOrUpdateConfig(brand, 'test', { connection: { token: APP_CONFIG_SECRET_MASK }, value: 2 });
      await new Promise(resolve => setImmediate(resolve));
      expect(set.callCount).to.equal(1);
      expect((AppConfig.find as unknown as sinon.SinonStub).callCount).to.equal(1);
      releaseFirst();
      await Promise.all([first, second]);
      expect(set.callCount).to.equal(2);
      expect(persisted.configData).to.deep.equal({ connection: { token: 'new-secret' }, value: 2 });
      expect(_.get(service.getAppConfigurationForBrand('default'), 'test')).to.deep.equal(persisted.configData);
    });

    it('uses the same write gate for creation and updates of one key', async function () {
      let persisted: Record<string, unknown> | undefined;
      (AppConfig.find as unknown as sinon.SinonStub).callsFake(async () => persisted ? [persisted] : []);
      let releaseCreate!: () => void;
      const createReply = new Promise<void>(resolve => { releaseCreate = resolve; });
      (AppConfig.create as unknown as sinon.SinonStub).callsFake(async data => {
        persisted = data;
        await createReply;
        return data;
      });
      const set = sinon.stub().callsFake(async data => {
        persisted = { configKey: 'test', configData: data.configData };
        return persisted;
      });
      (AppConfig.updateOne as unknown as sinon.SinonStub).returns({ set });
      const create = service.createConfig('default', 'test', { value: 1 });
      await new Promise(resolve => setImmediate(resolve));
      const update = service.createOrUpdateConfig(BrandingService.getBrand('default'), 'test', { value: 2 });
      await new Promise(resolve => setImmediate(resolve));
      expect(set.called).to.equal(false);
      releaseCreate();
      await Promise.all([create, update]);
      expect((AppConfig.create as unknown as sinon.SinonStub).callCount).to.equal(1);
      expect(set.calledOnce).to.equal(true);
      expect(_.get(service.getAppConfigurationForBrand('default'), 'test.value')).to.equal(2);
    });

    it('releases the same-key write gate after failures', async function () {
      (AppConfig.create as unknown as sinon.SinonStub).onFirstCall().rejects(new Error('database failed'));
      const first = service.createConfig('default', 'test', { value: 1 });
      const failed = first.then(() => expect.fail('Expected rejection'), error => expect(error.message).to.equal('database failed'));
      const second = service.createConfig('default', 'test', { value: 2 });
      await Promise.all([failed, second]);
      expect((AppConfig.create as unknown as sinon.SinonStub).callCount).to.equal(2);
      expect(_.get(service.getAppConfigurationForBrand('default'), 'test.value')).to.equal(2);
    });

    it('does not persist or update the cache when hydration of a newly created reference fails', async function () {
      const cache = service.brandingAppConfigMap;
      send.withArgs(sinon.match.instanceOf(GetSecretValueCommand)).rejects(new Error('KMS AccessDenied arn:private'));
      try {
        await service.createConfig('default', 'test', { connection: { token: 'aws-secret' } });
        expect.fail('Expected rejection');
      } catch (error) {
        expect(String(error)).to.equal('Error: Unable to resolve AppConfig secret in AWS Secrets Manager');
      }
      expect((AppConfig.create as unknown as sinon.SinonStub).called).to.equal(false);
      expect(service.brandingAppConfigMap).to.equal(cache);
      expect(JSON.stringify(mockSails.log.error.args)).not.to.contain('arn:private');
    });

    it('handles nested wildcard secrets with literal dynamic keys through their full lifecycle', async function () {
      (ConfigModels.getModelInfo as sinon.SinonStub).returns({ modelName: 'Sites', class: class {}, secretFields: ['sites.*.ingestion.adminToken'] });
      const incoming = { sites: {
        'site.one[2]': { ingestion: { adminToken: 'aws-secret', endpoint: 'one' }, enabled: true },
        'site-two': { ingestion: { adminToken: 'aws-secret', endpoint: 'two' } }
      }, label: 'unchanged' };
      await service.createConfig('default', 'test', incoming);
      const stored = (AppConfig.create as unknown as sinon.SinonStub).firstCall.args[0].configData;
      expect(stored.sites['site.one[2]'].ingestion.adminToken).to.deep.equal(reference);
      expect(stored.sites['site-two'].ingestion.adminToken).to.deep.equal(reference);
      expect(stored.sites['site.one[2]'].ingestion.endpoint).to.equal('one');
      const masked = service.getMaskedAppConfigurationForBrand('default', 'test') as typeof incoming;
      expect(masked.sites['site.one[2]'].ingestion.adminToken).to.equal(APP_CONFIG_SECRET_MASK);
      expect(incoming.sites['site.one[2]'].ingestion.adminToken).to.equal('aws-secret');
      (AppConfig.find as unknown as sinon.SinonStub).resolves([{ configKey: 'test', configData: stored }]);
      const set = sinon.stub().callsFake(async data => ({ configData: data.configData }));
      (AppConfig.updateOne as unknown as sinon.SinonStub).returns({ set });
      send.resetHistory();
      masked.sites['site-two'].ingestion.adminToken = APP_CONFIG_SECRET_CLEAR;
      await service.createOrUpdateConfig(BrandingService.getBrand('default'), 'test', masked);
      const saved = set.firstCall.args[0].configData;
      expect(saved.sites['site.one[2]'].ingestion.adminToken).to.deep.equal(reference);
      expect(saved.sites['site-two'].ingestion).to.deep.equal({ endpoint: 'two' });
      expect(saved.label).to.equal('unchanged');
      expect(send.getCalls().every(call => call.args[0] instanceof GetSecretValueCommand)).to.equal(true);
      const loaded = await service.loadAppConfigurationModel('brand1');
      expect(_.get(loaded, ['test', 'sites', 'site.one[2]', 'ingestion', 'adminToken'])).to.equal('aws-secret');
      for (const value of [reference, 42]) {
        try {
          await service.createOrUpdateConfig(BrandingService.getBrand('default'), 'test', { sites: { 'site.one[2]': { ingestion: { adminToken: value } } } });
          expect.fail('Expected rejection');
        } catch (error) { expect(String(error)).to.contain('must be a string'); }
      }
      (AppConfig.find as unknown as sinon.SinonStub).resolves([]);
      try {
        await service.createConfig('default', 'other', JSON.parse('{"sites":{"__proto__":{"ingestion":{"adminToken":"secret"}}}}'));
        expect.fail('Expected rejection');
      } catch (error) { expect(String(error)).to.contain('Unsafe'); }
      expect(Object.prototype).not.to.have.property('ingestion');
    });

    it('applies unchanged hook overrides repeatedly without creating secrets and catches override failures', async function () {
      const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'appconfig-override-'));
      const override = path.join(temporary, 'node_modules/test-hook/branded-config/default/override');
      fs.mkdirSync(override, { recursive: true });
      const file = path.join(override, 'test.js');
      fs.writeFileSync(file, 'module.exports = { connection: { token: "aws-secret" } };');
      (ConfigModels.getModelInfo as sinon.SinonStub).callsFake((key: string) => key === 'test' ? { modelName: 'SecretModel', class: class {}, secretFields: ['connection.token'] } : undefined);
      mockSails.config.appPath = temporary;
      (AppConfig.find as unknown as sinon.SinonStub).resolves([{ configKey: 'test', configData: { connection: { token: reference } } }]);
      const set = sinon.stub().callsFake(async data => ({ configData: data.configData }));
      (AppConfig.updateOne as unknown as sinon.SinonStub).returns({ set });
      const globals = globalThis as unknown as Record<string, unknown>;
      const original = globals.AppConfigService;
      globals.AppConfigService = service;
      try {
        const configService = new ConfigServices.Config();
        for (let i = 0; i < 2; i++) {
          configService.mergeHookConfig('test-hook', {}, []);
          await new Promise(resolve => setImmediate(resolve));
        }
        expect(set.callCount).to.equal(2);
        expect(send.getCalls().every(call => call.args[0] instanceof GetSecretValueCommand)).to.equal(true);
        expect(set.secondCall.args[0].configData.connection.token).to.deep.equal(reference);
        send.rejects(new Error('AccessDenied private ARN'));
        configService.mergeHookConfig('test-hook', {}, []);
        await new Promise(resolve => setImmediate(resolve));
        expect(mockSails.log.error.calledWithMatch('Failed to apply branded AppConfig override')).to.equal(true);
        expect(set.callCount).to.equal(2);
      } finally {
        globals.AppConfigService = original;
        delete require.cache[file];
        fs.rmSync(temporary, { recursive: true, force: true });
      }
    });

    it('rejects duplicate normalized hook keys per tree before loading files while allowing keys across trees', async function () {
      const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'appconfig-duplicates-'));
      const root = path.join(temporary, 'node_modules/test-hook/branded-config/default');
      const globals = globalThis as unknown as Record<string, unknown>;
      const original = globals.AppConfigService;
      const create = sinon.stub().resolves({});
      const update = sinon.stub().resolves({});
      globals.AppConfigService = { createConfig: create, createOrUpdateConfig: update };
      const files: string[] = [];
      try {
        for (const tree of ['init-only', 'override']) {
          const directory = path.join(root, tree);
          fs.mkdirSync(path.join(directory, 'nested'), { recursive: true });
          const duplicateJs = path.join(directory, 'duplicate.js');
          const duplicateJson = path.join(directory, 'nested/duplicate.json');
          const shared = path.join(directory, 'shared.json');
          files.push(duplicateJs, duplicateJson, shared);
          // Collision detection must run before either conflicting module is required.
          fs.writeFileSync(duplicateJs, 'throw new Error("conflicting module must not load");');
          fs.writeFileSync(duplicateJson, '{"value":"duplicate"}');
          fs.writeFileSync(shared, '{"value":"shared"}');
        }
        mockSails.config.appPath = temporary;
        new ConfigServices.Config().mergeHookConfig('test-hook', {}, []);
        await new Promise(resolve => setImmediate(resolve));
        expect(create.calledOnce).to.equal(true);
        expect(update.calledOnce).to.equal(true);
        expect(create.firstCall.args.slice(0, 2)).to.deep.equal(['default', 'shared']);
        expect(update.firstCall.args[1]).to.equal('shared');
        expect(mockSails.log.error.callCount).to.equal(2);
        expect(mockSails.log.error.firstCall.args[0]).to.contain("Duplicate branded AppConfig key 'duplicate'");
        expect(mockSails.log.error.firstCall.args[0]).to.contain('init-only');
        expect(mockSails.log.error.secondCall.args[0]).to.contain('override');
      } finally {
        globals.AppConfigService = original;
        for (const file of files) delete require.cache[file];
        fs.rmSync(temporary, { recursive: true, force: true });
      }
    });

    it('masks webservice single/all responses without mutating the cache and accepts masked round trips', async function () {
      await service.createConfig('default', 'test', { connection: { token: 'aws-secret' }, visible: true });
      (AppConfig.find as unknown as sinon.SinonStub).resolves([{ configKey: 'test', configData: { connection: { token: reference }, visible: true } }]);
      const set = sinon.stub().callsFake(async data => ({ configData: data.configData }));
      (AppConfig.updateOne as unknown as sinon.SinonStub).returns({ set });
      const globals = globalThis as unknown as Record<string, unknown>;
      const original = globals.AppConfigService;
      globals.AppConfigService = service;
      Object.assign(BrandingService, { getBrandNameFromReq: () => 'default' });
      const controller = new WebserviceControllers.Admin();
      const respond = sinon.stub(controller, 'apiRespond');
      try {
        for (const configKey of [undefined, 'test', 'test.connection.token']) {
          const req = { apiRequest: { params: { configKey }, body: {}, query: {} } } as unknown as Sails.Req;
          await controller.getAppConfig(req, {} as Sails.Res);
          const result = respond.lastCall.args[2];
          expect(configKey === 'test.connection.token' ? result : _.get(result, configKey ? 'connection.token' : 'test.connection.token')).to.equal(APP_CONFIG_SECRET_MASK);
          expect(JSON.stringify(result)).not.to.contain('aws-secret');
          expect(JSON.stringify(result)).not.to.contain(arn);
          expect(_.get(service.getAppConfigurationForBrand('default'), 'test.connection.token')).to.equal('aws-secret');
        }
        const masked = service.getMaskedAppConfigurationForBrand('default', 'test');
        send.resetHistory();
        await controller.setAppConfig({ apiRequest: { params: { configKey: 'test' }, body: masked, query: {} } } as unknown as Sails.Req, {} as Sails.Res);
        expect(set.lastCall.args[0].configData.connection.token).to.deep.equal(reference);
        expect(send.getCalls().every(call => call.args[0] instanceof GetSecretValueCommand)).to.equal(true);
      } finally { globals.AppConfigService = original; }
    });

    for (const operation of ['store', 'resolve']) {
      it(`returns a generic API error for AWS ${operation} failures`, async function () {
        const globals = globalThis as unknown as Record<string, unknown>;
        const original = globals.AppConfigService;
        globals.AppConfigService = service;
        Object.assign(BrandingService, { getBrandNameFromReq: () => 'default' });
        if (operation === 'resolve') {
          (AppConfig.find as unknown as sinon.SinonStub).resolves([{ configKey: 'test', configData: { connection: { token: reference } } }]);
        }
        const error = new Error('Access denied for arn:aws:iam::123456789012:role/private; value=aws-secret');
        error.name = 'AccessDeniedException';
        send.rejects(error);
        const controller = new WebserviceControllers.Admin();
        const respond = sinon.stub(controller, 'sendResp');
        sinon.stub(controller, 'getNoCacheHeaders').returns({});
        try {
          await controller.setAppConfig({ apiRequest: { params: { configKey: 'test' }, body: { connection: { token: operation === 'resolve' ? APP_CONFIG_SECRET_MASK : 'aws-secret' } }, query: {} } } as unknown as Sails.Req, {} as Sails.Res);
          const response = JSON.stringify(respond.lastCall.args[2]);
          expect(response).to.contain(`Unable to ${operation} AppConfig secret`);
          expect(response).not.to.contain('arn:');
          expect(response).not.to.contain('aws-secret');
          expect(JSON.stringify(mockSails.log.error.args)).to.contain('AccessDeniedException');
          expect(JSON.stringify(mockSails.log.error.args)).not.to.contain('arn:');
          expect((AppConfig.create as unknown as sinon.SinonStub).called).to.equal(false);
          expect((AppConfig.updateOne as unknown as sinon.SinonStub).called).to.equal(false);
        } finally { globals.AppConfigService = original; }
      });
    }

    it('hydrates backend configuration without mutating stored references', async function () {
      const record = { configKey: 'test', configData: { connection: { token: reference } } };
      (AppConfig.find as unknown as sinon.SinonStub).resolves([record]);
      const loaded = await service.loadAppConfigurationModel('brand1');
      expect(_.get(loaded, 'test.connection.token')).to.equal('aws-secret');
      expect(record.configData.connection.token).to.deep.equal(reference);
      const result = await service.getAppConfigByBrandAndKey('brand1', 'test');
      expect(result).to.deep.equal({ connection: { token: APP_CONFIG_SECRET_MASK } });
      expect(send.calledOnce).to.equal(true); // Admin reads do not need AWS.
    });

    it('preserves masked references without creating another secret', async function () {
      (AppConfig.find as unknown as sinon.SinonStub).resolves([{ configKey: 'test', configData: { connection: { token: reference } } }]);
      const set = sinon.stub().resolves({ configData: { connection: { token: reference } } });
      (AppConfig.updateOne as unknown as sinon.SinonStub).returns({ set });
      await service.createOrUpdateConfig(BrandingService.getBrand('default'), 'test', { connection: { token: APP_CONFIG_SECRET_MASK } });
      expect(set.firstCall.args[0].configData.connection.token).to.deep.equal(reference);
      expect(send.getCalls().every(call => call.args[0] instanceof GetSecretValueCommand)).to.equal(true);
    });

    it('migrates a preserved plaintext secret on the next save', async function () {
      (AppConfig.find as unknown as sinon.SinonStub).resolves([{ configKey: 'test', configData: { connection: { token: 'legacy-secret' } } }]);
      const set = sinon.stub().resolves({ configData: { connection: { token: reference } } });
      (AppConfig.updateOne as unknown as sinon.SinonStub).returns({ set });
      await service.createOrUpdateConfig(BrandingService.getBrand('default'), 'test', { connection: { token: APP_CONFIG_SECRET_MASK } });
      expect((send.firstCall.args[0] as CreateSecretCommand).input.SecretString).to.equal('legacy-secret');
      expect(set.firstCall.args[0].configData.connection.token).to.deep.equal(reference);
    });

    it('clears references and leaves empty fields without writing AWS secrets', async function () {
      const result = await service.createConfig('default', 'test', { connection: { token: APP_CONFIG_SECRET_CLEAR } });
      expect(result).to.deep.equal({ connection: {} });
      await service.createConfig('default', 'test', { connection: { token: '' } });
      expect(send.called).to.equal(false);
    });

    it('refuses client-supplied references', async function () {
      try {
        await service.createConfig('default', 'test', { connection: { token: reference } });
        expect.fail('Expected rejection');
      } catch (error) {
        expect(String(error)).to.contain('must be a string');
      }
      expect((AppConfig.create as unknown as sinon.SinonStub).called).to.equal(false);
    });

    it('does not write plaintext to the database when AWS fails', async function () {
      send.rejects(new Error('AWS unavailable'));
      try {
        await service.createConfig('default', 'test', { connection: { token: 'aws-secret' } });
        expect.fail('Expected rejection');
      } catch (error) {
        expect(String(error)).to.contain('AppConfig secret in AWS Secrets Manager');
      }
      expect((AppConfig.create as unknown as sinon.SinonStub).called).to.equal(false);
    });

    it('keeps an old ARN intact when a replacement database write fails', async function () {
      const existing = { configKey: 'test', configData: { connection: { token: reference } } };
      service.brandingAppConfigMap = { default: { test: { connection: { token: 'aws-secret' } } } } as unknown as typeof service.brandingAppConfigMap;
      const previousCache = service.getAppConfigurationForBrand('default');
      (AppConfig.find as unknown as sinon.SinonStub).resolves([existing]);
      const set = sinon.stub().rejects(new Error('Database unavailable'));
      (AppConfig.updateOne as unknown as sinon.SinonStub).returns({ set });
      send.withArgs(sinon.match.instanceOf(CreateSecretCommand)).resolves({ ARN: arn + '-new' });
      try {
        await service.createOrUpdateConfig(BrandingService.getBrand('default'), 'test', { connection: { token: 'replacement' } });
        expect.fail('Expected rejection');
      } catch (error) {
        expect(String(error)).to.contain('Database unavailable');
      }
      expect(set.firstCall.args[0].configData.connection.token.$appConfigSecret.arn).to.equal(arn + '-new');
      expect(existing.configData.connection.token.$appConfigSecret.arn).to.equal(arn);
      expect(service.getAppConfigurationForBrand('default')).to.equal(previousCache);
      expect(send.getCalls().some(call => call.args[0] instanceof CreateSecretCommand)).to.equal(true);
    });

    it('resolves existing references in database mode but refuses a plaintext downgrade', async function () {
      mockSails.config.appConfigSecrets.provider = 'database';
      (AppConfig.find as unknown as sinon.SinonStub).resolves([{ configKey: 'test', configData: { connection: { token: reference } } }]);
      const loaded = await service.loadAppConfigurationModel('brand1');
      expect(_.get(loaded, 'test.connection.token')).to.equal('aws-secret');
      try {
        await service.createOrUpdateConfig(BrandingService.getBrand('default'), 'test', { connection: { token: 'replacement' } });
        expect.fail('Expected rejection');
      } catch (error) {
        expect(String(error)).to.contain('Enable AWS Secrets Manager');
      }
      expect((AppConfig.updateOne as unknown as sinon.SinonStub).called).to.equal(false);
    });

    it('fails hydration rather than returning an unresolved reference', async function () {
      (AppConfig.find as unknown as sinon.SinonStub).resolves([{ configKey: 'test', configData: { connection: { token: reference } } }]);
      send.rejects(new Error('AWS unavailable'));
      try {
        await service.loadAppConfigurationModel('brand1');
        expect.fail('Expected rejection');
      } catch (error) {
        expect(String(error)).to.contain('AppConfig secret in AWS Secrets Manager');
      }
    });
  });

  it('registers Oni ingestion tokens as scoped wildcard secrets', function () {
    (ConfigModels.getModelInfo as sinon.SinonStub).restore();
    expect(ConfigModels.getModelInfo('oniPublishing')?.secretFields).to.include('sites.*.ingestion.adminToken');
  });

  describe('bootstrap', function () {
    it('should load config for brands', async function () {
      await service.bootstrap();
      // Should populate brandingAppConfigMap
      const config = service.getAppConfigurationForBrand('default');
      expect(config).to.not.be.undefined;
    });
  });

  describe('createConfig', function () {
    it('should create new config', async function () {
      // Need to populate map first or mock refreshBrandingAppConfigMap
      // We can just rely on refreshBrandingAppConfigMap calling loadAppConfigurationModel which works with mocks

      const data = { key: 'val' };
      const result = await service.createConfig('default', 'key', data);

      expect(result).to.deep.equal(data);
      expect((global as any).AppConfig.create.called).to.be.true;
    });

    it('should throw if config exists', async function () {
      const mockDeferred = (result: unknown) => {
        const p: any = Promise.resolve(result);
        p.exec = sinon.stub().yields(null, result);
        return p;
      };

      (global as any).AppConfig.find.callsFake(() => mockDeferred([{}]));
      try {
        await service.createConfig('default', 'key', {});
        expect.fail('Should have thrown');
      } catch (e: unknown) {
        expect(e instanceof Error ? e.message : String(e)).to.contain('already exists');
      }
    });
  });

  describe('retired dashboard keys', function () {
    it('refuses generic writes to legacy dashboard configuration keys', async function () {
      for (const configKey of ['dashboardTableConfig', 'dashboardConfigLegacySnapshot']) {
        for (const write of [
          () => service.createOrUpdateConfig({ id: 'brand1', name: 'default' } as any, configKey, { recordTypes: {} }),
          () => service.createConfig('default', configKey, { recordTypes: {} })
        ]) {
          try {
            await write();
            expect.fail('write should be refused');
          } catch (error: any) {
            expect(error.status).to.equal(410);
            expect(error.code).to.equal('legacy-operation-retired');
          }
        }
      }
      expect((global as any).AppConfig.create.called).to.equal(false);
      expect((global as any).AppConfig.updateOne.called).to.equal(false);
    });
  });

  describe('secret fields', function () {
    it('should mask secret fields when reading config', async function () {
      class SecretModel {
        connection = { token: 'secret-token' };
      }
      (ConfigModels.getModelInfo as sinon.SinonStub).returns({
        modelName: 'SecretModel',
        class: SecretModel,
        secretFields: ['connection.token']
      });
      (global as any).AppConfig.findOne = sinon.stub().callsFake(() => {
        const p: any = Promise.resolve({ configData: { connection: { token: 'secret-token' } } });
        p.exec = sinon.stub().yields(null, { configData: { connection: { token: 'secret-token' } } });
        return p;
      });

      const result: any = await service.getAppConfigByBrandAndKey('brand1', 'figsharePublishing');
      expect(result.connection.token).to.equal(APP_CONFIG_SECRET_MASK);
    });

    it('should preserve existing secrets when the mask placeholder is submitted', async function () {
      class SecretModel {
        connection = { token: '' };
      }
      (ConfigModels.getModelInfo as sinon.SinonStub).returns({
        modelName: 'SecretModel',
        class: SecretModel,
        secretFields: ['connection.token']
      });

      const existingRecord = { configData: { connection: { token: 'secret-token' } } };
      const updateSet = sinon.stub().callsFake((data: Record<string, unknown>) => {
        const updatedRecord = { configData: data.configData };
        const p: any = Promise.resolve(updatedRecord);
        p.exec = sinon.stub().yields(null, updatedRecord);
        return p;
      });

      (global as any).AppConfig.find = sinon.stub().callsFake(() => {
        const p: any = Promise.resolve([existingRecord]);
        p.exec = sinon.stub().yields(null, [existingRecord]);
        return p;
      });
      (global as any).AppConfig.updateOne = sinon.stub().returns({ set: updateSet });

      const result: any = await service.createOrUpdateConfig(
        { id: 'brand1', name: 'default' } as any,
        'figsharePublishing',
        { connection: { token: APP_CONFIG_SECRET_MASK } }
      );

      expect(updateSet.calledOnce).to.be.true;
      expect(updateSet.firstCall.args[0]).to.deep.equal({
        configData: { connection: { token: 'secret-token' } }
      });
      expect(result.connection.token).to.equal(APP_CONFIG_SECRET_MASK);
    });

    it('should prefer the most recently updated duplicate config record when loading app config', async function () {
      (ConfigModels.getConfigKeys as sinon.SinonStub).returns(['doiPublishing']);
      (ConfigModels.getModelInfo as sinon.SinonStub).callsFake((key: string) => {
        if (key === 'doiPublishing') {
          return {
            modelName: 'DoiPublishing',
            class: DoiPublishing
          };
        }
        return {
          modelName: 'MockModel',
          class: class MockModel { }
        };
      });

      const duplicateRecords = [
        {
          branding: 'brand1',
          configKey: 'doiPublishing',
          updatedAt: '2026-04-15T03:00:00.000Z',
          configData: {
            enabled: true,
            defaultProfile: 'dataPublication',
            connection: {
              baseUrl: 'https://api.test.datacite.org',
              username: 'old-user',
              password: null,
              timeoutMs: 30000,
              retry: {
                maxAttempts: 3,
                baseDelayMs: 500,
                maxDelayMs: 4000,
                retryOnStatusCodes: [408, 429, 500, 502, 503, 504],
                retryOnMethods: ['get', 'put', 'patch', 'delete']
              }
            },
            operations: {
              createEvent: 'publish',
              updateEvent: 'publish',
              allowDeleteDraft: true,
              allowStateChange: true
            },
            profiles: {}
          }
        },
        {
          branding: 'brand1',
          configKey: 'doiPublishing',
          updatedAt: '2026-04-15T03:04:11.122Z',
          configData: {
            enabled: true,
            defaultProfile: 'dataPublication',
            connection: {
              baseUrl: 'https://api.test.datacite.org',
              username: 'new-user',
              password: 'new-password',
              timeoutMs: 30000,
              retry: {
                maxAttempts: 3,
                baseDelayMs: 500,
                maxDelayMs: 4000,
                retryOnStatusCodes: [408, 429, 500, 502, 503, 504],
                retryOnMethods: ['get', 'put', 'patch', 'delete']
              }
            },
            operations: {
              createEvent: 'publish',
              updateEvent: 'publish',
              allowDeleteDraft: true,
              allowStateChange: true
            },
            profiles: {}
          }
        }
      ];

      (global as any).AppConfig.find = sinon.stub().callsFake((criteria: Record<string, unknown>) => {
        const records = duplicateRecords.filter((record) => {
          return Object.entries(criteria).every(([key, value]) => (record as Record<string, unknown>)[key] === value);
        });
        const p: any = Promise.resolve(records);
        p.exec = sinon.stub().yields(null, records);
        return p;
      });

      const loaded: any = await service.loadAppConfigurationModel('brand1');

      expect(loaded.doiPublishing.connection.username).to.equal('new-user');
      expect(loaded.doiPublishing.connection.password).to.equal('new-password');
    });
  });

  describe('form adapters', function () {
    it('should convert doiPublishing profiles between map and array form shapes', async function () {
      class DoiPublishingFormMock {
        static getFieldOrder() {
          return ['profiles'];
        }
      }

      (ConfigModels.getModelInfo as sinon.SinonStub).callsFake((key: string) => {
        if (key === 'doiPublishing') {
          return {
            modelName: 'DoiPublishing',
            class: DoiPublishingFormMock,
            schema: {
              type: 'object',
              properties: {
                profiles: {
                  type: 'array'
                }
              }
            },
            formAdapter: {
              toForm: toDoiPublishingFormModel,
              fromForm: fromDoiPublishingFormModel
            }
          };
        }
        return {
          modelName: 'MockModel',
          class: class MockModel { }
        };
      });

      const doiPublishing = new DoiPublishing();
      doiPublishing.profiles = {
        dataPublication: {
          enabled: true,
          label: 'Data Publication',
          metadata: {} as any,
          writeBack: {
            citationUrlPath: 'metadata.citation_url',
            citationDoiPath: 'metadata.citation_doi'
          },
          validation: {
            requireUrl: true,
            requirePublisher: true,
            requirePublicationYear: true,
            requireCreators: true,
            requireTitles: true
          }
        } as any
      };
      service.brandingAppConfigMap = {
        default: {
          doiPublishing
        }
      } as any;

      const branding = { id: 'brand1', name: 'default' } as any;
      const appConfigForm: any = await service.getAppConfigForm(branding, 'doiPublishing');

      expect(Array.isArray(appConfigForm.model.profiles)).to.equal(true);
      expect(appConfigForm.model.profiles[0].name).to.equal('dataPublication');

      const savedConfig: any = await service.createConfig('default', 'doiPublishing', appConfigForm.model);
      expect(savedConfig.profiles.dataPublication).to.exist;
      expect(savedConfig.profiles.dataPublication.name).to.be.undefined;
    });
  });
});
