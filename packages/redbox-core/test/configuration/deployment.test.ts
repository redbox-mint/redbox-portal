import assert from 'node:assert/strict';
import {
  convertLegacyDeployment,
  convertLegacyEnvironment,
  deploymentDefaults,
  deploymentEnvironmentInputs,
  deploymentSchema,
  loadDeploymentConfiguration,
  resolveStartupConfiguration,
} from '../../src/configuration';

describe('deployment conversion', () => {
  it('retains distinct datastores, session/auth and storage and converts host/proxy/root paths', () => {
    const legacy = {
      port: 1600,
      host: '127.0.0.1',
      appUrl: 'https://portal.example.invalid/research',
      http: { rootContext: '/research', trustProxy: ['loopback'] },
      session: false,
      datastores: {
        mongodb: { url: 'mongodb://localhost:27017/core' },
        redboxStorage: { url: 'mongodb://storage:27017/bytes' },
      },
      redboxSession: {
        name: 'redbox.v6.sid',
        adapter: 'mongo',
        secret: 'test-only-secret-01234567890123456789',
        mongoUrl: 'mongodb://sessions:27017/sessions',
        cookie: { secure: true, sameSite: 'lax' },
      },
      auth: { defaultBrand: 'example', defaultPortal: 'rdmp' },
      brandingConfigurationDefaults: {
        auth: { active: ['local', 'oidc'], oidc: { opts: { issuer: 'https://id.example.invalid' } } },
      },
      storage: {
        primaryDisk: 'objects',
        disks: { objects: { driver: 'gridfs', config: { datastore: 'redboxStorage' } } },
      },
    };
    const config = resolveStartupConfiguration({
      schema: deploymentSchema,
      core: deploymentDefaults('production'),
      application: convertLegacyDeployment(legacy),
    });
    assert.equal(config.server.port, 1600);
    assert.equal(config.server.rootContext, '/research');
    assert.deepEqual(config.server.trustProxy, ['loopback']);
    assert.equal(config.datastores.redboxStorage.url, legacy.datastores.redboxStorage.url);
    assert.deepEqual(config.redboxSession, legacy.redboxSession);
    assert.deepEqual(config.brandingConfigurationDefaults, legacy.brandingConfigurationDefaults);
    assert.equal(config.storage.disks?.objects.driver, 'gridfs');
    assert(!Object.isFrozen(legacy.datastores));
  });
  it('converts the named env aliases with explicit canonical precedence', async () => {
    const env = convertLegacyEnvironment({
      sails_port: '1601',
      sails_datastores__mongodb__url: 'mongodb://localhost/test',
      REDBOX_PORT: '1700',
      sails__agendaQueue_options_backend: 'mongodb',
      sails_agendaQueue__options__historyRetentionHours: '12.5',
      NODE_ENV: 'test',
    });
    const config = await loadDeploymentConfiguration({
      environment: 'test',
      env,
      argv: ['--root-context=/institution'],
    });
    assert.equal(config.server.port, 1700);
    assert.equal(config.datastores.mongodb.url, 'mongodb://localhost/test');
    assert.equal(config.server.rootContext, '/institution');
    assert.equal(config.environment, 'test');
    assert.equal(config.agendaQueue.options.historyRetentionHours, 12.5);
    assert.throws(
      () => convertLegacyEnvironment({ sails__redboxSession_secret: 'one', sails_redboxSession__secret: 'two' }),
      /ambiguous/
    );
  });
  it('fails unsupported and malformed meaningful inputs before constructing an owner, without exposing credentials', () => {
    for (const values of [{ models: { password: 'do-not-expose' } }, { http: { middleware: 'do-not-expose' } }])
      assert.throws(
        () => convertLegacyDeployment(values),
        error => error instanceof Error && !error.message.includes('do-not-expose')
      );
    for (const values of [
      { datastores: { mongodb: { url: 'mongodb://user:do-not-expose@localhost/core', adapter: 'sails-mongo' } } },
      { server: { publicUrl: 'do-not-expose' } },
      { redboxSession: { secret: 'do-not-expose', client: 'external' } },
    ])
      assert.throws(
        () =>
          resolveStartupConfiguration({
            schema: deploymentSchema,
            core: deploymentDefaults(),
            local: { source: 'local', values },
          }),
        error => error instanceof Error && error.message.includes('local') && !error.message.includes('do-not-expose')
      );
    assert.throws(() => convertLegacyEnvironment({ sails_unknown: 'do-not-expose' }), /unsupported legacy input/);
    assert.throws(
      () =>
        resolveStartupConfiguration({
          schema: deploymentSchema,
          core: deploymentDefaults(),
          env: { REDBOX_PORT: '-1' },
          environmentInputs: deploymentEnvironmentInputs,
        }),
      /invalid input/
    );
  });
});
