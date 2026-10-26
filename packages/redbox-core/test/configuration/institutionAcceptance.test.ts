import { nothingLogger } from '@researchdatabox/sails-ng-common';
import assert from 'node:assert/strict';
import {
  convertLegacyDeployment,
  resolveStartupConfiguration,
  deploymentSchema,
  deploymentDefaults,
} from '../../src/configuration';
import { loadPortalConfiguration } from '../../src/configuration/portal';
import { Services } from '../../src/storage/StorageManager';
import { FigsharePublishing } from '../../src/configmodels/FigsharePublishing';
import { resolveFigsharePublishingConfigData } from '../../src/queries/FigshareStatus';

const env = { REDBOX_SESSION_SECRET: 'institution-acceptance-disposable-session-secret' };
const load = (config: Record<string, unknown>) =>
  loadPortalConfiguration({
    env,
    extensions: { providers: [{ name: 'institution', root: '.', declaration: { apiVersion: 1, config } }] },
  });

describe('institution startup acceptance', () => {
  it('retains omitted S3 credentials through conversion, validation and actual driver selection', async () => {
    // JCU, SCU, UON and UWA omit these optional properties for instance/task roles.
    for (const credentials of [{}, { key: '', secret: '' }, { key: 'fixture-key', secret: 'fixture-secret' }]) {
      const primary = { driver: 's3', config: { bucket: 'fixture-bucket', region: 'ap-southeast-2', ...credentials } };
      const converted = convertLegacyDeployment({ storage: { disks: { objects: primary }, primaryDisk: 'objects' } });
      const deployment = resolveStartupConfiguration({
        schema: deploymentSchema,
        core: deploymentDefaults(),
        application: converted,
      });
      assert.deepEqual(deployment.storage.disks?.objects, primary);
      const portal = await load(converted.values);
      assert.deepEqual(portal.storage.disks?.objects, primary);
      let selected: Record<string, unknown> | undefined;
      const service = new Services.StorageManager({
        config: { primaryDisk: 'objects', stagingDisk: 'objects', disks: { objects: portal.storage.disks.objects } },
        log: nothingLogger,
      });
      Reflect.set(
        service,
        '_S3Driver',
        class {
          constructor(options: Record<string, unknown>) {
            selected = options;
          }
        }
      );
      Reflect.set(service, '_DiskConstructor', class {});
      await service.bootstrap();
      assert(selected);
      assert.deepEqual(
        selected.credentials,
        credentials.key ? { accessKeyId: credentials.key, secretAccessKey: credentials.secret } : undefined
      );
    }
    for (const field of ['key', 'secret']) {
      await assert.rejects(
        load({
          storage: {
            disks: {
              objects: { driver: 's3', config: { bucket: 'fixture-bucket', region: 'ap-southeast-2', [field]: 123 } },
            },
          },
        }),
        new RegExp(field)
      );
    }
  });

  it('retains the legacy default Figshare embargo scope when an institution omits its binding', async () => {
    // CQU and UON supply the remaining bindings and rely on the model's article default.
    const publishing = new FigsharePublishing();
    publishing.enabled = true;
    Reflect.deleteProperty(publishing.embargo.accessRights, 'embargoType');
    publishing.embargo.accessRights.accessRights = { kind: 'path', path: 'metadata.institutionAccess', defaultValue: '' };
    const supplied = JSON.parse(JSON.stringify(publishing));
    const config = await load({ brandingConfigurationDefaults: { figsharePublishing: supplied } });
    assert.deepEqual(config.brandingConfigurationDefaults.figsharePublishing, supplied);
    const resolved = resolveFigsharePublishingConfigData(
      config.brandingConfigurationDefaults,
      config.figshareDev,
      'production',
      { requireToken: false }
    );
    assert(resolved);
    assert.deepEqual(
      resolved.embargo.accessRights.embargoType,
      new FigsharePublishing().embargo.accessRights.embargoType
    );
    assert.deepEqual(resolved.embargo.accessRights.accessRights, supplied.embargo.accessRights.accessRights);
    for (const embargoType of [123, { kind: 'invalid' }]) {
      await assert.rejects(
        load({
          brandingConfigurationDefaults: {
            figsharePublishing: {
              ...supplied,
              embargo: { ...supplied.embargo, accessRights: { ...supplied.embargo.accessRights, embargoType } },
            },
          },
        }),
        /invalid domain data/
      );
    }
  });
});
