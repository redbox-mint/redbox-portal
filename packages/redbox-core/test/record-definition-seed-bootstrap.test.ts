import { strict as assert } from 'node:assert';
import { of } from 'rxjs';
import { coreBootstrap } from '../src/bootstrap';
import { seedManifest } from './helpers/record-definition-seed-fixture';
import { setupServiceTestGlobals, cleanupServiceTestGlobals, createMockSails } from './services/testHelper';

describe('B10 core bootstrap orchestration', function () {
  afterEach(cleanupServiceTestGlobals);
  it('passes the complete configured multi-brand manifest to the seed adapter before loading definitions', async function () {
    const calls: string[] = [];
    const manifest = { schemaVersion: 1, seeds: [...seedManifest().seeds, ...seedManifest('brand-b').seeds] };
    const sails = createMockSails() as any;
    sails.config.recordDefinitionSeeds = manifest;
    sails.config.crontab = { enabled: false };
    const fallback = new Proxy({}, { get: () => () => of(null) });
    sails.services = new Proxy(
      {
        brandingservice: { bootstrap: () => of({ id: 'brand-a' }), getDefault: () => ({ id: 'brand-a' }) },
        usersservice: { bootstrap: () => of({ defUser: null, defRoles: [] }) },
        recorddefinitionseedservice: {
          seed: async (input: any) => {
            assert.equal(input, manifest);
            calls.push('seed');
            return { created: 0, skipped: 0, outcomes: [] };
          },
        },
        recordtypesservice: {
          bootstrap: async () => {
            calls.push('types');
            return [];
          },
        },
        workflowstepsservice: { bootstrap: async () => [] },
        recordsservice: {
          auditRecordValidationRollout: async () => {},
          bootstrapData: async () => {},
          checkRedboxRunning: async () => true,
        },
      },
      { get: (target: any, key) => target[key] ?? fallback }
    );
    setupServiceTestGlobals(sails);
    (global as any).AppConfigService = { getAppConfigurationForBrand: () => ({}) };
    try {
      await coreBootstrap();
      assert.deepEqual(calls, ['seed', 'types']);
    } finally {
      delete (global as any).AppConfigService;
    }
  });
});
