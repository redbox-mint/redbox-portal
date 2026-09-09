import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { seedManifest } from '../../../packages/redbox-core/test/helpers/record-definition-seed-fixture';
import type { RecordDefinitionSeedServiceExports } from '../../../packages/redbox-core/src/services/RecordDefinitionSeedService';
import { activeRecordDefinitions } from '../../../packages/redbox-core/src/services/RecordDefinitionRuntimeService';
import { Services as TypeServices } from '../../../packages/redbox-core/src/services/RecordTypesService';
import { Services as StepServices } from '../../../packages/redbox-core/src/services/WorkflowStepsService';
import { Services as PublicationServices } from '../../../packages/redbox-core/src/services/RecordDefinitionPublicationService';

// Run with the generated-app Mongo bootstrap; this suite never falls back to mocks or skips.
describe('B10 generated service / native Mongo create-only seeds', function () {
  this.timeout(90000);
  const globals = global as any;
  let seed: RecordDefinitionSeedServiceExports;
  let originalBootstrapAlways: boolean;
  async function brand(): Promise<string> {
    const row = await globals.BrandingConfig.create({ name: `b10-${randomUUID()}`, variables: {} }).fetch();
    const id = String(row.id);
    await globals.Role.create({ name: 'Admin', branding: id }).fetch();
    await globals.Form.create({ name: 'dataset-form', branding: id, configuration: {} }).fetch();
    return id;
  }
  before(function () {
    assert.ok(process.env.RECORD_DEFINITION_TEST_MONGO_URL, 'disposable Mongo URL required');
    originalBootstrapAlways = globals.sails.config.appmode.bootstrapAlways;
    seed = globals.sails.services.recorddefinitionseedservice;
    assert.equal(typeof seed?.seed, 'function', 'loader must discover the emitted service');
  });

  after(function () { globals.sails.config.appmode.bootstrapAlways = originalBootstrapAlways; });

  it('seeds two brands, projects active stages, and preserves Admin retirement on restart', async function () {
    const a = await brand();
    const b = await brand();
    const manifest = { schemaVersion: 1 as const, seeds: [...seedManifest(a).seeds, ...seedManifest(b).seeds] };
    assert.equal((await seed.seed(manifest)).created, 2);
    globals.sails.config.appmode.bootstrapAlways = true;
    const row = await globals.RecordType.findOne({ branding: a, name: 'dataset' });
    const projected = await activeRecordDefinitions().project(row);
    assert.equal(projected.name, 'dataset');
    const stages = await new StepServices.WorkflowSteps().bootstrap([projected]);
    assert.equal(stages.length, 1);
    assert.equal(stages[0].name, 'draft');
    const history = await new PublicationServices.RecordDefinitionPublication().listHistory(a, 'dataset');
    assert.equal(history.length, 1);
    assert.equal(history[0].source.operation, 'bootstrap');
    const retired = await new PublicationServices.RecordDefinitionPublication().retire(
      a,
      'dataset',
      {
        schemaVersion: 1,
        expectedIdentityVersion: 1,
      },
      { id: 'admin-b10' }
    );
    assert.equal(retired.ok, true);
    const before = await globals.RecordType.findOne({ id: row.id });
    assert.equal((await seed.seed(manifest)).skipped, 2);
    assert.deepEqual(await globals.RecordType.findOne({ id: row.id }), before);
    const other = await new TypeServices.RecordTypes().bootstrap({ id: b } as any);
    assert.equal(other.length, 1);
    assert.equal(String(other[0].branding), b);
  });

  it('enforces unique identity/revision/history under simultaneous native inserts', async function () {
    const id = await brand();
    const manifest = seedManifest(id);
    const results = await Promise.all(Array.from({ length: 8 }, () => seed.seed(manifest)));
    assert.equal(
      results.reduce((count, report) => count + report.created, 0),
      1
    );
    assert.equal(
      results.reduce((count, report) => count + report.skipped, 0),
      7
    );
    for (const model of [globals.RecordType, globals.RecordDefinitionRevision, globals.RecordDefinitionHistory]) {
      assert.equal(await model.count({ branding: id }), 1);
    }
    const identity = await globals.RecordType.findOne({ branding: id, name: 'dataset' });
    assert.equal(await globals.WorkflowStep.count({ recordType: identity.id }), 0);
  });

  it('rejects a malformed later aggregate before writing any definition in either brand', async function () {
    const a = await brand();
    const b = await brand();
    const manifest: any = { schemaVersion: 1, seeds: [...seedManifest(a).seeds, ...seedManifest(b).seeds] };
    manifest.seeds[1].definition.stages[0].starting = false;
    await assert.rejects(seed.seed(manifest), /Invalid record-definition seed/);
    for (const id of [a, b]) {
      for (const model of [globals.RecordType, globals.RecordDefinitionRevision, globals.RecordDefinitionHistory]) {
        assert.equal(await model.count({ branding: id }), 0);
      }
    }
  });
});
