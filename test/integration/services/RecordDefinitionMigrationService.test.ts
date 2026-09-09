import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  RecordDefinitionMigrationService,
  RECORD_DEFINITION_MIGRATION_NAME,
} from '../../../packages/redbox-core/src/services/RecordDefinitionMigrationService';
import { runPendingMigrations } from '../../../packages/redbox-core/src/loader/MigrationRunner';
import {
  deriveRecordDefinitionDraftId,
  deriveRecordDefinitionId,
  hashRecordDefinition,
} from '../../../packages/redbox-core/src/record-workflow-administration';
import { seedManifest } from '../../../packages/redbox-core/test/helpers/record-definition-seed-fixture';
import { Services as DraftServices } from '../../../packages/redbox-core/src/services/RecordDefinitionDraftService';
import { Services as PublicationServices } from '../../../packages/redbox-core/src/services/RecordDefinitionPublicationService';
import database from '../../../packages/redbox-core/test/fixtures/legacy-record-actions/b11-database.json';

describe('B11 generated loader and native Mongo migration', function () {
  this.timeout(90000);
  const globals = global as any;
  const identities: any[] = [];
  before(async function () {
    assert.ok(process.env.RECORD_DEFINITION_TEST_MONGO_URL);
    for (let index = 0; index < 2; index++) {
      const brand = await globals.BrandingConfig.create({ name: `b11-${randomUUID()}`, variables: {} }).fetch();
      await globals.Role.create({ name: 'Admin', branding: brand.id }).fetch();
      await globals.Form.create({ name: 'dataset-form', branding: brand.id, configuration: {} }).fetch();
      const type = await globals.RecordType.create({
        branding: brand.id,
        name: 'dataset',
        packageType: 'dataset',
        searchable: index === 0,
        hooks: database.recordTypes[index].hooks,
      }).fetch();
      identities.push(type);
      for (const step of database.workflowSteps.filter(step => step.recordType === database.recordTypes[index].id)) {
        await globals.WorkflowStep.create({
          name: step.name,
          recordType: type.id,
          starting: step.starting,
          hidden: step.hidden,
          config: step.config,
        }).fetch();
      }
    }
  });

  it('discovers the emitted migration and runs it through MigrationRunner/Umzug', async function () {
    const migrations = globals.sails.config.migrations;
    assert.ok(migrations.some((entry: any) => entry.name === RECORD_DEFINITION_MIGRATION_NAME));
    const service = new RecordDefinitionMigrationService();
    const report = await service.preflight();
    const cliOutput = execFileSync(process.execPath, ['support/integration-testing/record-definition-preflight.cjs'], {
      encoding: 'utf8',
      env: { ...process.env, RECORD_DEFINITION_PREFLIGHT_MONGO_URL: process.env.RECORD_DEFINITION_TEST_MONGO_URL },
      timeout: 30000,
    });
    const cliReport = JSON.parse(cliOutput);
    assert.deepEqual(cliReport, report);
    assert.equal(await globals.RecordDefinitionRevision.count({}), 0);
    const manager = globals.RecordType.getDatastore().manager;
    const identityCollection = manager.collection('recordtype');
    const legacy = await identityCollection.findOne({ key: identities[1].key });
    assert.ok(legacy);
    const collections = ['recordtype', 'recorddefinitionrevision', 'recorddefinitionhistory'];
    const snapshotIndexes = async () => {
      const existing: { name: string }[] = await manager.listCollections({ name: { $in: collections } }).toArray();
      return Promise.all(
        existing
          .sort((left, right) => left.name.localeCompare(right.name))
          .map(async ({ name }) => ({
            name,
            indexes: await manager.collection(name).listIndexes().toArray(),
          }))
      );
    };
    const indexesBefore = await snapshotIndexes();
    try {
      await identityCollection.updateOne(
        { _id: legacy._id },
        {
          $set: {
            retiredAt: null,
            retiredBy: { id: 'B11-SECRET-SENTINEL' },
            retirementReason: { password: 'B11-SECRET-SENTINEL' },
          },
        }
      );
      const before = await identityCollection.findOne({ _id: legacy._id });
      for (const run of [() => service.preflight(), () => service.migrate()]) {
        await assert.rejects(run(), error => {
          assert.match(String(error), /invalid-retirement/);
          assert.ok(String(error).length < 256);
          assert.ok(!String(error).includes('B11-SECRET-SENTINEL'));
          return true;
        });
      }
      const cli = spawnSync(process.execPath, ['support/integration-testing/record-definition-preflight.cjs'], {
        encoding: 'utf8',
        timeout: 30000,
        env: { ...process.env, RECORD_DEFINITION_PREFLIGHT_MONGO_URL: process.env.RECORD_DEFINITION_TEST_MONGO_URL },
      });
      assert.equal(cli.status, 1);
      assert.match(cli.stdout + cli.stderr, /invalid-retirement/);
      assert.ok((cli.stdout + cli.stderr).length < 512);
      assert.ok(!(cli.stdout + cli.stderr).includes('B11-SECRET-SENTINEL'));
      assert.equal(await globals.RecordDefinitionRevision.count({}), 0);
      assert.equal(await globals.RecordDefinitionHistory.count({}), 0);
      assert.equal(await globals.RecordType.count({ activeRevisionNumber: 1 }), 0);
      assert.deepEqual(await identityCollection.findOne({ _id: legacy._id }), before);
      assert.deepEqual(await snapshotIndexes(), indexesBefore);
    } finally {
      await identityCollection.replaceOne({ _id: legacy._id }, legacy);
    }
    const historyCollection = globals.RecordType.getDatastore().manager.collection('recorddefinitionhistory');
    const operationId = `rdh_${deriveRecordDefinitionId({
      brandId: identities[1].branding,
      recordTypeKey: identities[1].name,
    }).slice(4)}`;
    const occupied = await historyCollection.insertOne({
      operationId,
      recordType: 'different-identity',
      resultingIdentityVersion: 9,
      occurredAt: { password: 'B11-SECRET-SENTINEL' },
    });
    try {
      const before = await historyCollection.findOne({ _id: occupied.insertedId });
      await assert.rejects(service.preflight(), /conflicting-migration-history/);
      await assert.rejects(service.migrate(), /conflicting-migration-history/);
      const cli = spawnSync(process.execPath, ['support/integration-testing/record-definition-preflight.cjs'], {
        encoding: 'utf8',
        timeout: 30000,
        env: { ...process.env, RECORD_DEFINITION_PREFLIGHT_MONGO_URL: process.env.RECORD_DEFINITION_TEST_MONGO_URL },
      });
      assert.equal(cli.status, 1);
      assert.ok(!(cli.stdout + cli.stderr).includes('B11-SECRET-SENTINEL'));
      assert.equal(await globals.RecordDefinitionRevision.count({}), 0);
      assert.equal(await globals.RecordDefinitionHistory.count({}), 1);
      assert.equal(await globals.RecordType.count({ activeRevisionNumber: 1 }), 0);
      assert.deepEqual(await historyCollection.findOne({ _id: occupied.insertedId }), before);
    } finally {
      await historyCollection.deleteOne({ _id: occupied.insertedId });
    }
    const createHistory = globals.RecordDefinitionHistory.create;
    try {
      globals.RecordDefinitionHistory.create = () => {
        throw new Error('injected-history-write-failure');
      };
      await assert.rejects(service.migrate(), /history-write-unconfirmed/);
    } finally {
      globals.RecordDefinitionHistory.create = createHistory;
    }
    assert.equal(await globals.RecordDefinitionRevision.count({}), 1);
    assert.equal(await globals.RecordDefinitionHistory.count({}), 0);
    assert.equal(await globals.RecordType.count({ activeRevisionNumber: 1 }), 0);
    // Native corruption bypasses Waterline's create guards, as persisted attacker data can.
    const revisionCollection = globals.RecordType.getDatastore().manager.collection('recorddefinitionrevision');
    const orphan = await revisionCollection.findOne({});
    const originalWarn = console.warn;
    let warnings = 0;
    try {
      console.warn = () => {
        warnings++;
      };
      for (const patch of [
        { publishedBy: { id: 'CORRUPT-ACTOR' } },
        { publishedAt: null },
        { publishedAt: 0 },
        { publishedAt: { password: 'B11-SECRET-SENTINEL' } },
      ]) {
        try {
          await revisionCollection.updateOne({ _id: orphan._id }, { $set: patch });
          const before = await revisionCollection.findOne({ _id: orphan._id });
          await assert.rejects(service.preflight());
          await assert.rejects(service.migrate());
          const cli = spawnSync(process.execPath, ['support/integration-testing/record-definition-preflight.cjs'], {
            encoding: 'utf8',
            timeout: 30000,
            env: {
              ...process.env,
              RECORD_DEFINITION_PREFLIGHT_MONGO_URL: process.env.RECORD_DEFINITION_TEST_MONGO_URL,
            },
          });
          assert.equal(cli.status, 1, cli.stdout + cli.stderr);
          assert.ok(!(cli.stdout + cli.stderr).includes('B11-SECRET-SENTINEL'));
          assert.deepEqual(await revisionCollection.findOne({ _id: orphan._id }), before);
          assert.equal(await globals.RecordDefinitionHistory.count({}), 0);
        } finally {
          await revisionCollection.replaceOne({ _id: orphan._id }, orphan);
        }
      }
    } finally {
      console.warn = originalWarn;
    }
    assert.equal(warnings, 0, 'B11 must not delegate raw-value diagnostics to Waterline');
    await runPendingMigrations(migrations.filter((entry: any) => entry.name === RECORD_DEFINITION_MIGRATION_NAME));
    assert.equal(await globals.Migration.count({ name: RECORD_DEFINITION_MIGRATION_NAME }), 1);
    assert.equal(await globals.RecordDefinitionRevision.count({}), 2);
    assert.equal(await globals.RecordDefinitionHistory.count({ operation: 'migration' }), 2);
    for (const type of identities) {
      const active = await globals.RecordType.findOne({ id: type.id });
      assert.equal(active.version, 1);
      const revision = await globals.RecordDefinitionRevision.findOne({ id: active.activeRevisionId });
      assert.equal(revision.branding, type.branding);
      assert.equal(revision.definition.recordType.searchable, type.searchable);
    }
    assert.deepEqual(await service.migrate(), report);
    assert.equal(await globals.RecordDefinitionRevision.count({}), 2);
  });

  it('rejects native active-pointer, revision and history corruption without writes', async function () {
    const manager = globals.RecordType.getDatastore().manager;
    const identity = await manager.collection('recordtype').findOne({ key: identities[0].key });
    const revision = await manager.collection('recorddefinitionrevision').findOne({ _id: identity.activeRevisionId });
    const history = await manager.collection('recorddefinitionhistory').findOne({ revision: revision._id });
    for (const [table, original, patch] of [
      ['recordtype', identity, { activeRevisionId: 'invalid' }],
      ['recordtype', identity, { activeRevisionNumber: 999 }],
      ['recordtype', identity, { version: -1 }],
      ['recordtype', identity, { draftId: 'invalid' }],
      ['recorddefinitionrevision', revision, { source: { operation: 'invalid', sourceRevisionNumber: null } }],
      ['recorddefinitionrevision', revision, { definition: {} }],
      ['recorddefinitionrevision', revision, { publishedAt: null }],
      ['recorddefinitionrevision', revision, { createdBy: { id: 'CORRUPT' } }],
      ['recorddefinitionhistory', history, { occurredAt: null }],
      ['recorddefinitionhistory', history, { occurredAt: 0 }],
      ['recorddefinitionhistory', history, { expectedIdentityVersion: -1 }],
      ['recorddefinitionhistory', history, { actor: { id: 'CORRUPT' } }],
    ] as any[]) {
      const collection = manager.collection(table);
      try {
        await collection.updateOne({ _id: original._id }, { $set: patch });
        const before = await collection.findOne({ _id: original._id });
        const service = new RecordDefinitionMigrationService();
        const errors: string[] = [];
        for (const run of [() => service.preflight(), () => service.migrate()]) {
          await assert.rejects(run(), error => {
            errors.push(String(error));
            return true;
          });
        }
        assert.equal(errors[0], errors[1]);
        assert.deepEqual(await collection.findOne({ _id: original._id }), before);
        assert.equal(await globals.RecordDefinitionRevision.count({}), 2);
        assert.equal(await globals.RecordDefinitionHistory.count({}), 2);
      } finally {
        await collection.replaceOne({ _id: original._id }, original);
      }
    }
  });

  it('preserves native B10 publications, managed draft edits and retirement', async function () {
    const brand = await globals.BrandingConfig.create({ name: `b11-managed-${randomUUID()}`, variables: {} }).fetch();
    await globals.Role.create({ name: 'Admin', branding: brand.id }).fetch();
    await globals.Form.create({ name: 'dataset-form', branding: brand.id, configuration: {} }).fetch();
    const seeded = await globals.sails.services.recorddefinitionseedservice.seed(seedManifest(brand.id));
    assert.equal(seeded.created, 1);
    const service = new RecordDefinitionMigrationService();
    assert.equal((await service.preflight()).skipped, 1);
    const lifecycle = new DraftServices.RecordDefinitionDraftLifecycle();
    const owner = await globals.RecordType.findOne({ branding: brand.id, name: 'dataset' });
    const draftId = deriveRecordDefinitionDraftId({ brandId: brand.id, recordTypeKey: 'dataset' });
    await globals.RecordDefinitionDraft.create({
      id: draftId,
      schemaVersion: 1,
      branding: brand.id,
      recordType: owner.id,
      recordTypeId: owner.definitionId,
      recordTypeKey: 'dataset',
      version: 0,
      baseRevisionId: owner.activeRevisionId,
      baseRevisionNumber: 1,
      definition: { ...seedManifest(brand.id).seeds[0].definition, definitionState: 'draft-incomplete' },
      createdBy: { id: 'b11-admin' },
      updatedBy: { id: 'b11-admin' },
      validation: null,
    }).fetch();
    await globals.RecordType.getDatastore()
      .manager.collection('recordtype')
      .updateOne({ key: owner.key }, { $set: { draftId } });
    const draft = await lifecycle.get(brand.id, 'dataset');
    assert.ok(draft);
    const saved = await lifecycle.save(
      brand.id,
      'dataset',
      {
        schemaVersion: 1,
        expectedDraftVersion: draft.version,
        expectedActiveRevisionNumber: 1,
        definition: draft.definition,
      },
      { id: 'b11-admin' }
    );
    assert.equal(saved.ok, true);
    const before = await globals.RecordType.findOne({ branding: brand.id, name: 'dataset' });
    assert.equal((await service.preflight()).skipped, 1);
    const cli = JSON.parse(
      execFileSync(process.execPath, ['support/integration-testing/record-definition-preflight.cjs'], {
        encoding: 'utf8',
        timeout: 30000,
        env: { ...process.env, RECORD_DEFINITION_PREFLIGHT_MONGO_URL: process.env.RECORD_DEFINITION_TEST_MONGO_URL },
      })
    );
    assert.deepEqual(cli, await service.preflight());
    assert.equal((await service.migrate()).skipped, 1);
    assert.deepEqual(await globals.RecordType.findOne({ id: before.id }), before);
    const retired = await new PublicationServices.RecordDefinitionPublication().retire(
      brand.id,
      'dataset',
      {
        schemaVersion: 1,
        expectedIdentityVersion: before.version,
      },
      { id: 'b11-admin' }
    );
    assert.equal(retired.ok, true);
    assert.equal((await service.preflight()).skipped, 1);
    assert.equal((await service.migrate()).skipped, 1);
    // A legitimate draft save after retirement advances identity.version without
    // retirement history. Preflight/migrate must locate the retirement event and
    // allow the gap instead of rejecting with missing-identity-history.
    const retiredRow = await globals.RecordType.findOne({ branding: brand.id, name: 'dataset' });
    const draftAfterRetire = await lifecycle.get(brand.id, 'dataset');
    assert.ok(draftAfterRetire);
    const savedAfterRetire = await lifecycle.save(
      brand.id,
      'dataset',
      {
        schemaVersion: 1,
        expectedDraftVersion: draftAfterRetire.version,
        expectedActiveRevisionNumber: 1,
        definition: draftAfterRetire.definition,
      },
      { id: 'b11-admin' }
    );
    assert.equal(savedAfterRetire.ok, true);
    const afterSave = await globals.RecordType.findOne({ branding: brand.id, name: 'dataset' });
    assert.ok(afterSave.version > retiredRow.version);
    assert.ok(afterSave.retiredAt);
    const revisionCount = await globals.RecordDefinitionRevision.count({});
    const historyCount = await globals.RecordDefinitionHistory.count({});
    assert.equal((await service.preflight()).skipped, 1);
    assert.deepEqual(
      JSON.parse(
        execFileSync(process.execPath, ['support/integration-testing/record-definition-preflight.cjs'], {
          encoding: 'utf8',
          timeout: 30000,
          env: { ...process.env, RECORD_DEFINITION_PREFLIGHT_MONGO_URL: process.env.RECORD_DEFINITION_TEST_MONGO_URL },
        })
      ),
      await service.preflight()
    );
    assert.equal((await service.migrate()).skipped, 1);
    assert.equal(await globals.RecordDefinitionRevision.count({}), revisionCount);
    assert.equal(await globals.RecordDefinitionHistory.count({}), historyCount);
    assert.deepEqual(await globals.RecordType.findOne({ id: afterSave.id }), afterSave);
  });

  it('rejects secret-bearing malformed authority values without logging raw values and without writes', async function () {
    const brand = await globals.BrandingConfig.create({ name: `b11-auth-${randomUUID()}`, variables: {} }).fetch();
    await globals.Role.create({ name: 'Admin', branding: brand.id }).fetch();
    await globals.Form.create({ name: 'dataset-form', branding: brand.id, configuration: {} }).fetch();
    const seeded = await globals.sails.services.recorddefinitionseedservice.seed(seedManifest(brand.id));
    assert.equal(seeded.created, 1);
    const service = new RecordDefinitionMigrationService();
    const manager = globals.RecordType.getDatastore().manager;
    const roleCollection = manager.collection('role');
    const sentinel = 'B11-AUTHORITY-SECRET-SENTINEL';
    // Reuse the stored branding ObjectId instance from the driver's own bson
    // version; constructing one from the top-level mongodb package breaks
    // sails-mongo serialization (BSONVersionError).
    const adminRoles = await roleCollection.find({ name: 'Admin' }).toArray();
    const template = adminRoles.find(entry => String(entry.branding) === String(brand.id));
    assert.ok(template);
    const malicious = await roleCollection.insertOne({
      branding: template.branding,
      name: { password: sentinel },
    });
    const originalWarn = console.warn;
    let warnings: string[] = [];
    try {
      console.warn = (...args: any[]) => {
        warnings.push(args.map(String).join(' '));
      };
      const revisionCount = await globals.RecordDefinitionRevision.count({});
      const historyCount = await globals.RecordDefinitionHistory.count({});
      for (const run of [() => service.preflight(), () => service.migrate()]) {
        await assert.rejects(run(), error => {
          const message = String(error);
          assert.ok(message.length < 512);
          assert.ok(!message.includes(sentinel));
          return true;
        });
      }
      const cli = spawnSync(process.execPath, ['support/integration-testing/record-definition-preflight.cjs'], {
        encoding: 'utf8',
        timeout: 30000,
        env: { ...process.env, RECORD_DEFINITION_PREFLIGHT_MONGO_URL: process.env.RECORD_DEFINITION_TEST_MONGO_URL },
      });
      assert.equal(cli.status, 1);
      assert.ok(!(cli.stdout + cli.stderr).includes(sentinel));
      assert.ok((cli.stdout + cli.stderr).length < 1024);
      assert.equal(await globals.RecordDefinitionRevision.count({}), revisionCount);
      assert.equal(await globals.RecordDefinitionHistory.count({}), historyCount);
      assert.ok(
        warnings.every(message => !message.includes(sentinel)),
        'authority reads must not log raw persisted values'
      );
    } finally {
      console.warn = originalWarn;
      await roleCollection.deleteOne({ _id: malicious.insertedId });
    }
    assert.equal((await service.preflight()).skipped >= 1, true);
  });

  it('accepts a real clone-publish retained draft base across preflight, CLI and migrate', async function () {
    const brand = identities[0].branding;
    const lifecycle = new DraftServices.RecordDefinitionDraftLifecycle();
    const publication = new PublicationServices.RecordDefinitionPublication();
    // B04 clone creates the draft with a null base.
    const cloned = await lifecycle.clone(brand, 'dataset', 'reviewclone', { id: 'b11-admin' });
    assert.equal(cloned.draft.baseRevisionNumber, null);
    // B05 publication retains the draft's original null base.
    const published = await publication.publish(
      brand,
      'reviewclone',
      {
        schemaVersion: 1,
        expectedIdentityVersion: 0,
        expectedDraftVersion: 0,
        expectedActiveRevisionNumber: null,
      },
      { id: 'b11-admin' }
    );
    assert.equal(published.ok, true);
    const retained = await lifecycle.get(brand, 'reviewclone');
    assert.ok(retained);
    assert.equal(retained.baseRevisionNumber, null);
    const identity = await globals.RecordType.findOne({ branding: brand, name: 'reviewclone' });
    assert.equal(identity.activeRevisionNumber, 1);
    assert.equal(identity.version, 1);
    const service = new RecordDefinitionMigrationService();
    const revisionCount = await globals.RecordDefinitionRevision.count({});
    const historyCount = await globals.RecordDefinitionHistory.count({});
    const report = await service.preflight();
    const cliReport = JSON.parse(
      execFileSync(process.execPath, ['support/integration-testing/record-definition-preflight.cjs'], {
        encoding: 'utf8',
        timeout: 30000,
        env: { ...process.env, RECORD_DEFINITION_PREFLIGHT_MONGO_URL: process.env.RECORD_DEFINITION_TEST_MONGO_URL },
      })
    );
    assert.deepEqual(cliReport, report);
    assert.deepEqual(await service.migrate(), report);
    assert.equal(await globals.RecordDefinitionRevision.count({}), revisionCount);
    assert.equal(await globals.RecordDefinitionHistory.count({}), historyCount);
    assert.deepEqual(await globals.RecordType.findOne({ id: identity.id }), identity);
  });

  it('accepts a real rollback history across preflight, CLI and migrate', async function () {
    const brand = identities[0].branding;
    const publication = new PublicationServices.RecordDefinitionPublication();
    const before = await globals.RecordType.findOne({ branding: brand, name: 'reviewclone' });
    const rolled = await publication.rollback(
      brand,
      'reviewclone',
      {
        schemaVersion: 1,
        expectedIdentityVersion: before.version,
        expectedActiveRevisionNumber: before.activeRevisionNumber,
        sourceRevisionNumber: 1,
        reason: 'B11 rollback verification',
      },
      { id: 'b11-admin' }
    );
    assert.equal(rolled.ok, true);
    const after = await globals.RecordType.findOne({ branding: brand, name: 'reviewclone' });
    assert.equal(after.activeRevisionNumber, 2);
    const histories = await globals.RecordDefinitionHistory.find({ recordType: after.id, operation: 'rollback' });
    assert.equal(histories.length, 1);
    assert.equal(histories[0].validation.scope, 'rollback');
    assert.equal(histories[0].expectedDraftVersion, null);
    assert.equal(histories[0].revisionNumber, 2);
    const service = new RecordDefinitionMigrationService();
    const revisionCount = await globals.RecordDefinitionRevision.count({});
    const historyCount = await globals.RecordDefinitionHistory.count({});
    const report = await service.preflight();
    const cliReport = JSON.parse(
      execFileSync(process.execPath, ['support/integration-testing/record-definition-preflight.cjs'], {
        encoding: 'utf8',
        timeout: 30000,
        env: { ...process.env, RECORD_DEFINITION_PREFLIGHT_MONGO_URL: process.env.RECORD_DEFINITION_TEST_MONGO_URL },
      })
    );
    assert.deepEqual(cliReport, report);
    assert.deepEqual(await service.migrate(), report);
    assert.equal(await globals.RecordDefinitionRevision.count({}), revisionCount);
    assert.equal(await globals.RecordDefinitionHistory.count({}), historyCount);
    assert.deepEqual(await globals.RecordType.findOne({ id: after.id }), after);
    assert.deepEqual(
      await globals.RecordDefinitionHistory.find({ recordType: after.id, operation: 'rollback' }),
      histories
    );
  });

  it('rejects mixed-brand authority rows in the standalone CLI without writes', async function () {
    const manager = globals.RecordType.getDatastore().manager;
    const identityCollection = manager.collection('recordtype');
    const rawA = await identityCollection.findOne({ key: identities[0].key });
    const rawB = await identityCollection.findOne({ key: identities[1].key });
    const roleCollection = manager.collection('role');
    const formCollection = manager.collection('form');
    const service = new RecordDefinitionMigrationService();
    const runCli = () =>
      spawnSync(process.execPath, ['support/integration-testing/record-definition-preflight.cjs'], {
        encoding: 'utf8',
        timeout: 30000,
        env: { ...process.env, RECORD_DEFINITION_PREFLIGHT_MONGO_URL: process.env.RECORD_DEFINITION_TEST_MONGO_URL },
      });
    const revisionCount = await globals.RecordDefinitionRevision.count({});
    const historyCount = await globals.RecordDefinitionHistory.count({});
    // Reported exit-0 gap shape: string elements pass the generic row guard
    // and match the native brand filter while carrying a foreign brand. The
    // scalar ownership check must reject them before projection.
    const mixedRole = await roleCollection.insertOne({
      branding: [String(rawA.branding), String(rawB.branding)],
      name: 'Reviewer',
    });
    const mixedForm = await formCollection.insertOne({
      branding: [String(rawA.branding), String(rawB.branding)],
      name: 'review-form',
      configuration: {},
    });
    try {
      // In-process and CLI reads observe the same brand filter; neither entry
      // point may write.
      await service.preflight().catch(() => undefined);
      await service.migrate().catch(() => undefined);
      const cli = runCli();
      assert.equal(cli.status, 1);
      assert.match(cli.stdout + cli.stderr, /invalid-authority/);
      assert.ok((cli.stdout + cli.stderr).length < 1024);
      assert.equal(await globals.RecordDefinitionRevision.count({}), revisionCount);
      assert.equal(await globals.RecordDefinitionHistory.count({}), historyCount);
    } finally {
      await roleCollection.deleteOne({ _id: mixedRole.insertedId });
      await formCollection.deleteOne({ _id: mixedForm.insertedId });
    }
    // ObjectId elements are observed by both readers and must fail closed on
    // both entry points with bounded diagnostics and zero writes.
    const oidRole = await roleCollection.insertOne({ branding: [rawA.branding, rawB.branding], name: 'Reviewer' });
    const oidForm = await formCollection.insertOne({
      branding: [rawA.branding, rawB.branding],
      name: 'review-form',
      configuration: {},
    });
    try {
      const errors: string[] = [];
      for (const run of [() => service.preflight(), () => service.migrate()]) {
        await assert.rejects(run(), error => {
          const message = String(error);
          assert.ok(message.length < 512);
          errors.push(message);
          return true;
        });
      }
      assert.equal(errors[0], errors[1]);
      const cli = runCli();
      assert.equal(cli.status, 1);
      assert.ok((cli.stdout + cli.stderr).length < 1024);
      assert.equal(await globals.RecordDefinitionRevision.count({}), revisionCount);
      assert.equal(await globals.RecordDefinitionHistory.count({}), historyCount);
    } finally {
      await roleCollection.deleteOne({ _id: oidRole.insertedId });
      await formCollection.deleteOne({ _id: oidForm.insertedId });
    }
    // Valid rows remain accepted by both entry points with identical reports.
    const report = await service.preflight();
    const cliReport = JSON.parse(
      execFileSync(process.execPath, ['support/integration-testing/record-definition-preflight.cjs'], {
        encoding: 'utf8',
        timeout: 30000,
        env: { ...process.env, RECORD_DEFINITION_PREFLIGHT_MONGO_URL: process.env.RECORD_DEFINITION_TEST_MONGO_URL },
      })
    );
    assert.deepEqual(cliReport, report);
    assert.deepEqual(await service.migrate(), report);
  });

  it('accepts a real clone-publish-save retained draft across preflight, CLI and migrate', async function () {
    const brand = identities[0].branding;
    const lifecycle = new DraftServices.RecordDefinitionDraftLifecycle();
    const publication = new PublicationServices.RecordDefinitionPublication();
    // B04 clone creates the draft with a null base.
    const cloned = await lifecycle.clone(brand, 'dataset', 'saveretain', { id: 'b11-admin' });
    assert.equal(cloned.draft.baseRevisionNumber, null);
    // B05 publication retains the draft's original null base.
    const published = await publication.publish(
      brand,
      'saveretain',
      {
        schemaVersion: 1,
        expectedIdentityVersion: 0,
        expectedDraftVersion: 0,
        expectedActiveRevisionNumber: null,
      },
      { id: 'b11-admin' }
    );
    assert.equal(published.ok, true);
    // The B04 save of the retained draft stamps its validation report from
    // the current active revision while keeping the null base.
    const before = await lifecycle.get(brand, 'saveretain');
    assert.ok(before);
    const saved = await lifecycle.save(
      brand,
      'saveretain',
      {
        schemaVersion: 1,
        expectedDraftVersion: before.version,
        expectedActiveRevisionNumber: 1,
        definition: before.definition,
      },
      { id: 'b11-admin' }
    );
    assert.equal(saved.ok, true);
    const retained = await lifecycle.get(brand, 'saveretain');
    assert.ok(retained);
    assert.equal(retained.baseRevisionNumber, null);
    assert.equal(retained.version, 1);
    assert.equal(retained.validation.validatedDraftVersion, 1);
    assert.equal(retained.validation.validatedActiveRevisionNumber, 1);
    const identity = await globals.RecordType.findOne({ branding: brand, name: 'saveretain' });
    assert.equal(identity.activeRevisionNumber, 1);
    const service = new RecordDefinitionMigrationService();
    const revisionCount = await globals.RecordDefinitionRevision.count({});
    const historyCount = await globals.RecordDefinitionHistory.count({});
    const report = await service.preflight();
    const cliReport = JSON.parse(
      execFileSync(process.execPath, ['support/integration-testing/record-definition-preflight.cjs'], {
        encoding: 'utf8',
        timeout: 30000,
        env: { ...process.env, RECORD_DEFINITION_PREFLIGHT_MONGO_URL: process.env.RECORD_DEFINITION_TEST_MONGO_URL },
      })
    );
    assert.deepEqual(cliReport, report);
    assert.deepEqual(await service.migrate(), report);
    assert.equal(await globals.RecordDefinitionRevision.count({}), revisionCount);
    assert.equal(await globals.RecordDefinitionHistory.count({}), historyCount);
    assert.deepEqual(await globals.RecordType.findOne({ id: identity.id }), identity);
    // A tampered save-time report fails closed on every entry point with
    // bounded diagnostics and zero writes.
    const manager = globals.RecordType.getDatastore().manager;
    const draftCollection = manager.collection('recorddefinitiondraft');
    const raw = await draftCollection.findOne({ _id: retained.id });
    assert.ok(raw);
    try {
      await draftCollection.updateOne({ _id: raw._id }, { $set: { 'validation.validatedActiveRevisionNumber': 999 } });
      const tampered = await draftCollection.findOne({ _id: raw._id });
      const errors: string[] = [];
      for (const run of [() => service.preflight(), () => service.migrate()]) {
        await assert.rejects(run(), error => {
          const message = String(error);
          assert.ok(message.length < 512);
          assert.match(message, /invalid-managed-draft/);
          errors.push(message);
          return true;
        });
      }
      assert.equal(errors[0], errors[1]);
      const cli = spawnSync(process.execPath, ['support/integration-testing/record-definition-preflight.cjs'], {
        encoding: 'utf8',
        timeout: 30000,
        env: { ...process.env, RECORD_DEFINITION_PREFLIGHT_MONGO_URL: process.env.RECORD_DEFINITION_TEST_MONGO_URL },
      });
      assert.equal(cli.status, 1);
      assert.match(cli.stdout + cli.stderr, /invalid-managed-draft/);
      assert.ok((cli.stdout + cli.stderr).length < 1024);
      assert.deepEqual(await draftCollection.findOne({ _id: raw._id }), tampered);
      assert.equal(await globals.RecordDefinitionRevision.count({}), revisionCount);
      assert.equal(await globals.RecordDefinitionHistory.count({}), historyCount);
    } finally {
      await draftCollection.replaceOne({ _id: raw._id }, raw);
    }
    assert.deepEqual(
      JSON.parse(
        execFileSync(process.execPath, ['support/integration-testing/record-definition-preflight.cjs'], {
          encoding: 'utf8',
          timeout: 30000,
          env: { ...process.env, RECORD_DEFINITION_PREFLIGHT_MONGO_URL: process.env.RECORD_DEFINITION_TEST_MONGO_URL },
        })
      ),
      await service.preflight()
    );
  });

  it('rejects a cleared retirement without an unretire event across preflight, CLI and migrate', async function () {
    const brand = await globals.BrandingConfig.create({ name: `b11-gap-${randomUUID()}`, variables: {} }).fetch();
    await globals.Role.create({ name: 'Admin', branding: brand.id }).fetch();
    await globals.Form.create({ name: 'dataset-form', branding: brand.id, configuration: {} }).fetch();
    const seeded = await globals.sails.services.recorddefinitionseedservice.seed(seedManifest(brand.id));
    assert.equal(seeded.created, 1);
    const lifecycle = new DraftServices.RecordDefinitionDraftLifecycle();
    const publication = new PublicationServices.RecordDefinitionPublication();
    const service = new RecordDefinitionMigrationService();
    const owner = await globals.RecordType.findOne({ branding: brand.id, name: 'dataset' });
    const draftId = deriveRecordDefinitionDraftId({ brandId: brand.id, recordTypeKey: 'dataset' });
    await globals.RecordDefinitionDraft.create({
      id: draftId,
      schemaVersion: 1,
      branding: brand.id,
      recordType: owner.id,
      recordTypeId: owner.definitionId,
      recordTypeKey: 'dataset',
      version: 0,
      baseRevisionId: owner.activeRevisionId,
      baseRevisionNumber: 1,
      definition: { ...seedManifest(brand.id).seeds[0].definition, definitionState: 'draft-incomplete' },
      createdBy: { id: 'b11-admin' },
      updatedBy: { id: 'b11-admin' },
      validation: null,
    }).fetch();
    await globals.RecordType.getDatastore()
      .manager.collection('recordtype')
      .updateOne({ key: owner.key }, { $set: { draftId } });
    const draft = await lifecycle.get(brand.id, 'dataset');
    assert.ok(draft);
    const saved = await lifecycle.save(
      brand.id,
      'dataset',
      {
        schemaVersion: 1,
        expectedDraftVersion: draft.version,
        expectedActiveRevisionNumber: 1,
        definition: draft.definition,
      },
      { id: 'b11-admin' }
    );
    assert.equal(saved.ok, true);
    const preRetire = await globals.RecordType.findOne({ branding: brand.id, name: 'dataset' });
    const retired = await publication.retire(
      brand.id,
      'dataset',
      { schemaVersion: 1, expectedIdentityVersion: preRetire.version },
      { id: 'b11-admin' }
    );
    assert.equal(retired.ok, true);
    // A legitimate draft save after retirement advances identity.version
    // without retirement history.
    const retiredRow = await globals.RecordType.findOne({ branding: brand.id, name: 'dataset' });
    const draftAfterRetire = await lifecycle.get(brand.id, 'dataset');
    assert.ok(draftAfterRetire);
    const savedAfterRetire = await lifecycle.save(
      brand.id,
      'dataset',
      {
        schemaVersion: 1,
        expectedDraftVersion: draftAfterRetire.version,
        expectedActiveRevisionNumber: 1,
        definition: draftAfterRetire.definition,
      },
      { id: 'b11-admin' }
    );
    assert.equal(savedAfterRetire.ok, true);
    const afterSave = await globals.RecordType.findOne({ branding: brand.id, name: 'dataset' });
    assert.ok(afterSave.version > retiredRow.version);
    assert.ok(afterSave.retiredAt);
    assert.equal((await service.preflight()).skipped >= 1, true);
    // Clear the retirement without an unretire event: the latest durable
    // history event remains retire, so every entry point must fail closed.
    const manager = globals.RecordType.getDatastore().manager;
    const identityCollection = manager.collection('recordtype');
    const raw = await identityCollection.findOne({ key: afterSave.key });
    assert.ok(raw);
    const revisionCount = await globals.RecordDefinitionRevision.count({});
    const historyCount = await globals.RecordDefinitionHistory.count({});
    try {
      await identityCollection.updateOne(
        { _id: raw._id },
        { $set: { retiredAt: null, retiredBy: null, retirementReason: null } }
      );
      const cleared = await identityCollection.findOne({ _id: raw._id });
      assert.equal(cleared.retiredAt, null);
      const errors: string[] = [];
      for (const run of [() => service.preflight(), () => service.migrate()]) {
        await assert.rejects(run(), error => {
          const message = String(error);
          assert.ok(message.length < 512);
          assert.match(message, /invalid-identity-history/);
          errors.push(message);
          return true;
        });
      }
      assert.equal(errors[0], errors[1]);
      const cli = spawnSync(process.execPath, ['support/integration-testing/record-definition-preflight.cjs'], {
        encoding: 'utf8',
        timeout: 30000,
        env: { ...process.env, RECORD_DEFINITION_PREFLIGHT_MONGO_URL: process.env.RECORD_DEFINITION_TEST_MONGO_URL },
      });
      assert.equal(cli.status, 1);
      assert.match(cli.stdout + cli.stderr, /invalid-identity-history/);
      assert.ok((cli.stdout + cli.stderr).length < 1024);
      assert.deepEqual(await identityCollection.findOne({ _id: raw._id }), cleared);
      assert.equal(await globals.RecordDefinitionRevision.count({}), revisionCount);
      assert.equal(await globals.RecordDefinitionHistory.count({}), historyCount);
    } finally {
      await identityCollection.replaceOne({ _id: raw._id }, raw);
    }
    // The restored retired state is accepted again with identical reports.
    const restored = await globals.RecordType.findOne({ id: afterSave.id });
    assert.deepEqual(restored.retiredBy, afterSave.retiredBy);
    const report = await service.preflight();
    assert.deepEqual(
      JSON.parse(
        execFileSync(process.execPath, ['support/integration-testing/record-definition-preflight.cjs'], {
          encoding: 'utf8',
          timeout: 30000,
          env: { ...process.env, RECORD_DEFINITION_PREFLIGHT_MONGO_URL: process.env.RECORD_DEFINITION_TEST_MONGO_URL },
        })
      ),
      report
    );
    assert.deepEqual(await service.migrate(), report);
    // A proper unretire followed by a draft-only advance is accepted.
    const unretired = await publication.unretire(
      brand.id,
      'dataset',
      { schemaVersion: 1, expectedIdentityVersion: restored.version },
      { id: 'b11-admin' }
    );
    assert.equal(unretired.ok, true);
    const current = await lifecycle.get(brand.id, 'dataset');
    assert.ok(current);
    const resaved = await lifecycle.save(
      brand.id,
      'dataset',
      {
        schemaVersion: 1,
        expectedDraftVersion: current.version,
        expectedActiveRevisionNumber: 1,
        definition: current.definition,
      },
      { id: 'b11-admin' }
    );
    assert.equal(resaved.ok, true);
    const finalIdentity = await globals.RecordType.findOne({ branding: brand.id, name: 'dataset' });
    assert.equal(finalIdentity.retiredAt, null);
    const finalReport = await service.preflight();
    assert.deepEqual(
      JSON.parse(
        execFileSync(process.execPath, ['support/integration-testing/record-definition-preflight.cjs'], {
          encoding: 'utf8',
          timeout: 30000,
          env: { ...process.env, RECORD_DEFINITION_PREFLIGHT_MONGO_URL: process.env.RECORD_DEFINITION_TEST_MONGO_URL },
        })
      ),
      finalReport
    );
    assert.deepEqual(await service.migrate(), finalReport);
    assert.deepEqual(await globals.RecordType.findOne({ id: finalIdentity.id }), finalIdentity);
  });

  it('accepts unretire before later publish with save across preflight, CLI and migrate', async function () {
    const brand = identities[0].branding;
    const lifecycle = new DraftServices.RecordDefinitionDraftLifecycle();
    const publication = new PublicationServices.RecordDefinitionPublication();
    const key = 'unretirepublish';
    const cloned = await lifecycle.clone(brand, 'dataset', key, { id: 'b11-admin' });
    assert.equal(cloned.draft.baseRevisionNumber, null);
    let identity = await globals.RecordType.findOne({ branding: brand, name: key });
    let draft = await lifecycle.get(brand, key);
    assert.ok(draft);
    const published1 = await publication.publish(
      brand,
      key,
      {
        schemaVersion: 1,
        expectedIdentityVersion: identity.version,
        expectedDraftVersion: draft.version,
        expectedActiveRevisionNumber: null,
      },
      { id: 'b11-admin' }
    );
    assert.equal(published1.ok, true);
    draft = await lifecycle.get(brand, key);
    assert.ok(draft);
    const saved1 = await lifecycle.save(
      brand,
      key,
      {
        schemaVersion: 1,
        expectedDraftVersion: draft.version,
        expectedActiveRevisionNumber: 1,
        definition: draft.definition,
      },
      { id: 'b11-admin' }
    );
    assert.equal(saved1.ok, true);
    identity = await globals.RecordType.findOne({ branding: brand, name: key });
    const retired = await publication.retire(
      brand,
      key,
      { schemaVersion: 1, expectedIdentityVersion: identity.version },
      { id: 'b11-admin' }
    );
    assert.equal(retired.ok, true);
    identity = await globals.RecordType.findOne({ branding: brand, name: key });
    assert.ok(identity.retiredAt);
    const unretired = await publication.unretire(
      brand,
      key,
      { schemaVersion: 1, expectedIdentityVersion: identity.version },
      { id: 'b11-admin' }
    );
    assert.equal(unretired.ok, true);
    identity = await globals.RecordType.findOne({ branding: brand, name: key });
    draft = await lifecycle.get(brand, key);
    assert.ok(draft);
    const published2 = await publication.publish(
      brand,
      key,
      {
        schemaVersion: 1,
        expectedIdentityVersion: identity.version,
        expectedDraftVersion: draft.version,
        expectedActiveRevisionNumber: 1,
      },
      { id: 'b11-admin' }
    );
    assert.equal(published2.ok, true);
    draft = await lifecycle.get(brand, key);
    assert.ok(draft);
    const saved2 = await lifecycle.save(
      brand,
      key,
      {
        schemaVersion: 1,
        expectedDraftVersion: draft.version,
        expectedActiveRevisionNumber: 2,
        definition: draft.definition,
      },
      { id: 'b11-admin' }
    );
    assert.equal(saved2.ok, true);
    const finalIdentity = await globals.RecordType.findOne({ branding: brand, name: key });
    assert.equal(finalIdentity.activeRevisionNumber, 2);
    assert.equal(finalIdentity.retiredAt, null);
    assert.equal(finalIdentity.version, 6);
    const histories = await globals.RecordDefinitionHistory.find({ recordType: finalIdentity.id });
    const retireHistory = histories.find((entry: any) => entry.operation === 'retire');
    const unretireHistory = histories.find((entry: any) => entry.operation === 'unretire');
    assert.equal(retireHistory.resultingIdentityVersion, 3);
    assert.equal(unretireHistory.resultingIdentityVersion, 4);
    const service = new RecordDefinitionMigrationService();
    const revisionCount = await globals.RecordDefinitionRevision.count({});
    const historyCount = await globals.RecordDefinitionHistory.count({});
    const report = await service.preflight();
    const cliReport = JSON.parse(
      execFileSync(process.execPath, ['support/integration-testing/record-definition-preflight.cjs'], {
        encoding: 'utf8',
        timeout: 30000,
        env: { ...process.env, RECORD_DEFINITION_PREFLIGHT_MONGO_URL: process.env.RECORD_DEFINITION_TEST_MONGO_URL },
      })
    );
    assert.deepEqual(cliReport, report);
    assert.deepEqual(await service.migrate(), report);
    assert.equal(await globals.RecordDefinitionRevision.count({}), revisionCount);
    assert.equal(await globals.RecordDefinitionHistory.count({}), historyCount);
    assert.deepEqual(await globals.RecordType.findOne({ id: finalIdentity.id }), finalIdentity);
  });

  it('accepts unretire before later rollback with save across preflight, CLI and migrate', async function () {
    const brand = identities[0].branding;
    const lifecycle = new DraftServices.RecordDefinitionDraftLifecycle();
    const publication = new PublicationServices.RecordDefinitionPublication();
    const key = 'unretirerollback';
    const cloned = await lifecycle.clone(brand, 'dataset', key, { id: 'b11-admin' });
    assert.equal(cloned.draft.baseRevisionNumber, null);
    let identity = await globals.RecordType.findOne({ branding: brand, name: key });
    let draft = await lifecycle.get(brand, key);
    assert.ok(draft);
    const published1 = await publication.publish(
      brand,
      key,
      {
        schemaVersion: 1,
        expectedIdentityVersion: identity.version,
        expectedDraftVersion: draft.version,
        expectedActiveRevisionNumber: null,
      },
      { id: 'b11-admin' }
    );
    assert.equal(published1.ok, true);
    draft = await lifecycle.get(brand, key);
    assert.ok(draft);
    const saved1 = await lifecycle.save(
      brand,
      key,
      {
        schemaVersion: 1,
        expectedDraftVersion: draft.version,
        expectedActiveRevisionNumber: 1,
        definition: draft.definition,
      },
      { id: 'b11-admin' }
    );
    assert.equal(saved1.ok, true);
    identity = await globals.RecordType.findOne({ branding: brand, name: key });
    const retired = await publication.retire(
      brand,
      key,
      { schemaVersion: 1, expectedIdentityVersion: identity.version },
      { id: 'b11-admin' }
    );
    assert.equal(retired.ok, true);
    identity = await globals.RecordType.findOne({ branding: brand, name: key });
    const unretired = await publication.unretire(
      brand,
      key,
      { schemaVersion: 1, expectedIdentityVersion: identity.version },
      { id: 'b11-admin' }
    );
    assert.equal(unretired.ok, true);
    identity = await globals.RecordType.findOne({ branding: brand, name: key });
    const rolled = await publication.rollback(
      brand,
      key,
      {
        schemaVersion: 1,
        expectedIdentityVersion: identity.version,
        expectedActiveRevisionNumber: 1,
        sourceRevisionNumber: 1,
        reason: 'B11 unretire rollback verification',
      },
      { id: 'b11-admin' }
    );
    assert.equal(rolled.ok, true);
    draft = await lifecycle.get(brand, key);
    assert.ok(draft);
    const saved2 = await lifecycle.save(
      brand,
      key,
      {
        schemaVersion: 1,
        expectedDraftVersion: draft.version,
        expectedActiveRevisionNumber: 2,
        definition: draft.definition,
      },
      { id: 'b11-admin' }
    );
    assert.equal(saved2.ok, true);
    const finalIdentity = await globals.RecordType.findOne({ branding: brand, name: key });
    assert.equal(finalIdentity.activeRevisionNumber, 2);
    assert.equal(finalIdentity.retiredAt, null);
    assert.equal(finalIdentity.version, 6);
    const service = new RecordDefinitionMigrationService();
    const revisionCount = await globals.RecordDefinitionRevision.count({});
    const historyCount = await globals.RecordDefinitionHistory.count({});
    const report = await service.preflight();
    const cliReport = JSON.parse(
      execFileSync(process.execPath, ['support/integration-testing/record-definition-preflight.cjs'], {
        encoding: 'utf8',
        timeout: 30000,
        env: { ...process.env, RECORD_DEFINITION_PREFLIGHT_MONGO_URL: process.env.RECORD_DEFINITION_TEST_MONGO_URL },
      })
    );
    assert.deepEqual(cliReport, report);
    assert.deepEqual(await service.migrate(), report);
    assert.equal(await globals.RecordDefinitionRevision.count({}), revisionCount);
    assert.equal(await globals.RecordDefinitionHistory.count({}), historyCount);
    assert.deepEqual(await globals.RecordType.findOne({ id: finalIdentity.id }), finalIdentity);
  });

  it('rejects a forged unretire active revision after successive real publications', async function () {
    const brand = identities[0].branding;
    const lifecycle = new DraftServices.RecordDefinitionDraftLifecycle();
    const publication = new PublicationServices.RecordDefinitionPublication();
    const key = 'unretireforge31';
    const cloned = await lifecycle.clone(brand, 'dataset', key, { id: 'b11-admin' });
    assert.equal(cloned.draft.baseRevisionNumber, null);
    const publishRev = async (expectedActive: number | null) => {
      const identity = await globals.RecordType.findOne({ branding: brand, name: key });
      const draft = await lifecycle.get(brand, key);
      assert.ok(draft);
      const published = await publication.publish(
        brand,
        key,
        {
          schemaVersion: 1,
          expectedIdentityVersion: identity.version,
          expectedDraftVersion: draft.version,
          expectedActiveRevisionNumber: expectedActive,
        },
        { id: 'b11-admin' }
      );
      assert.equal(published.ok, true);
    };
    const saveRev = async (expectedActive: number) => {
      const draft = await lifecycle.get(brand, key);
      assert.ok(draft);
      const saved = await lifecycle.save(
        brand,
        key,
        {
          schemaVersion: 1,
          expectedDraftVersion: draft.version,
          expectedActiveRevisionNumber: expectedActive,
          definition: draft.definition,
        },
        { id: 'b11-admin' }
      );
      assert.equal(saved.ok, true);
    };
    // Publish revisions 1, 2 and 3 with saves between them.
    await publishRev(null);
    await saveRev(1);
    await publishRev(1);
    await saveRev(2);
    await publishRev(2);
    let identity = await globals.RecordType.findOne({ branding: brand, name: key });
    assert.equal(identity.activeRevisionNumber, 3);
    const retired = await publication.retire(
      brand,
      key,
      { schemaVersion: 1, expectedIdentityVersion: identity.version },
      { id: 'b11-admin' }
    );
    assert.equal(retired.ok, true);
    identity = await globals.RecordType.findOne({ branding: brand, name: key });
    const unretired = await publication.unretire(
      brand,
      key,
      { schemaVersion: 1, expectedIdentityVersion: identity.version },
      { id: 'b11-admin' }
    );
    assert.equal(unretired.ok, true);
    await publishRev(3);
    await saveRev(4);
    const finalIdentity = await globals.RecordType.findOne({ branding: brand, name: key });
    assert.equal(finalIdentity.activeRevisionNumber, 4);
    assert.equal(finalIdentity.retiredAt, null);
    const histories = await globals.RecordDefinitionHistory.find({ recordType: finalIdentity.id });
    const unretireHistory = histories.find((entry: any) => entry.operation === 'unretire');
    assert.equal(unretireHistory.expectedActiveRevisionNumber, 3);
    const service = new RecordDefinitionMigrationService();
    const revisionCount = await globals.RecordDefinitionRevision.count({});
    const historyCount = await globals.RecordDefinitionHistory.count({});
    const report = await service.preflight();
    assert.deepEqual(
      JSON.parse(
        execFileSync(process.execPath, ['support/integration-testing/record-definition-preflight.cjs'], {
          encoding: 'utf8',
          timeout: 30000,
          env: { ...process.env, RECORD_DEFINITION_PREFLIGHT_MONGO_URL: process.env.RECORD_DEFINITION_TEST_MONGO_URL },
        })
      ),
      report
    );
    assert.deepEqual(await service.migrate(), report);
    assert.deepEqual(await globals.RecordType.findOne({ id: finalIdentity.id }), finalIdentity);
    // Forge the unretire reference from the live revision 3 to the stale revision 1.
    const manager = globals.RecordType.getDatastore().manager;
    const historyCollection = manager.collection('recorddefinitionhistory');
    const raw = await historyCollection.findOne({ _id: unretireHistory.id });
    assert.ok(raw);
    const runCli = () =>
      spawnSync(process.execPath, ['support/integration-testing/record-definition-preflight.cjs'], {
        encoding: 'utf8',
        timeout: 30000,
        env: { ...process.env, RECORD_DEFINITION_PREFLIGHT_MONGO_URL: process.env.RECORD_DEFINITION_TEST_MONGO_URL },
      });
    try {
      await historyCollection.updateOne({ _id: raw._id }, { $set: { expectedActiveRevisionNumber: 1 } });
      const forged = await historyCollection.findOne({ _id: raw._id });
      assert.equal(forged.expectedActiveRevisionNumber, 1);
      const errors: string[] = [];
      for (const run of [() => service.preflight(), () => service.migrate()]) {
        await assert.rejects(run(), error => {
          const message = String(error);
          assert.ok(message.length < 512);
          assert.match(message, /invalid-identity-history/);
          errors.push(message);
          return true;
        });
      }
      assert.equal(errors[0], errors[1]);
      const cli = runCli();
      assert.equal(cli.status, 1, cli.stdout + cli.stderr);
      assert.match(cli.stdout + cli.stderr, /invalid-identity-history/);
      assert.ok((cli.stdout + cli.stderr).length < 1024);
      assert.deepEqual(await historyCollection.findOne({ _id: raw._id }), forged);
      assert.equal(await globals.RecordDefinitionRevision.count({}), revisionCount);
      assert.equal(await globals.RecordDefinitionHistory.count({}), historyCount);
      assert.deepEqual(await globals.RecordType.findOne({ id: finalIdentity.id }), finalIdentity);
    } finally {
      await historyCollection.replaceOne({ _id: raw._id }, raw);
    }
    assert.deepEqual(
      JSON.parse(
        execFileSync(process.execPath, ['support/integration-testing/record-definition-preflight.cjs'], {
          encoding: 'utf8',
          timeout: 30000,
          env: { ...process.env, RECORD_DEFINITION_PREFLIGHT_MONGO_URL: process.env.RECORD_DEFINITION_TEST_MONGO_URL },
        })
      ),
      await service.preflight()
    );
    assert.deepEqual(await service.migrate(), await service.preflight());
  });

  it('fails closed on missing or malformed historical publication evidence', async function () {
    const brand = identities[0].branding;
    const lifecycle = new DraftServices.RecordDefinitionDraftLifecycle();
    const publication = new PublicationServices.RecordDefinitionPublication();
    const key = 'unretireevidence';
    const cloned = await lifecycle.clone(brand, 'dataset', key, { id: 'b11-admin' });
    assert.equal(cloned.draft.baseRevisionNumber, null);
    let identity = await globals.RecordType.findOne({ branding: brand, name: key });
    let draft = await lifecycle.get(brand, key);
    assert.ok(draft);
    const published1 = await publication.publish(
      brand,
      key,
      {
        schemaVersion: 1,
        expectedIdentityVersion: identity.version,
        expectedDraftVersion: draft.version,
        expectedActiveRevisionNumber: null,
      },
      { id: 'b11-admin' }
    );
    assert.equal(published1.ok, true);
    draft = await lifecycle.get(brand, key);
    assert.ok(draft);
    const saved1 = await lifecycle.save(
      brand,
      key,
      {
        schemaVersion: 1,
        expectedDraftVersion: draft.version,
        expectedActiveRevisionNumber: 1,
        definition: draft.definition,
      },
      { id: 'b11-admin' }
    );
    assert.equal(saved1.ok, true);
    identity = await globals.RecordType.findOne({ branding: brand, name: key });
    const retired = await publication.retire(
      brand,
      key,
      { schemaVersion: 1, expectedIdentityVersion: identity.version },
      { id: 'b11-admin' }
    );
    assert.equal(retired.ok, true);
    identity = await globals.RecordType.findOne({ branding: brand, name: key });
    const unretired = await publication.unretire(
      brand,
      key,
      { schemaVersion: 1, expectedIdentityVersion: identity.version },
      { id: 'b11-admin' }
    );
    assert.equal(unretired.ok, true);
    identity = await globals.RecordType.findOne({ branding: brand, name: key });
    draft = await lifecycle.get(brand, key);
    assert.ok(draft);
    const published2 = await publication.publish(
      brand,
      key,
      {
        schemaVersion: 1,
        expectedIdentityVersion: identity.version,
        expectedDraftVersion: draft.version,
        expectedActiveRevisionNumber: 1,
      },
      { id: 'b11-admin' }
    );
    assert.equal(published2.ok, true);
    draft = await lifecycle.get(brand, key);
    assert.ok(draft);
    const saved2 = await lifecycle.save(
      brand,
      key,
      {
        schemaVersion: 1,
        expectedDraftVersion: draft.version,
        expectedActiveRevisionNumber: 2,
        definition: draft.definition,
      },
      { id: 'b11-admin' }
    );
    assert.equal(saved2.ok, true);
    const finalIdentity = await globals.RecordType.findOne({ branding: brand, name: key });
    assert.equal(finalIdentity.activeRevisionNumber, 2);
    assert.equal(finalIdentity.retiredAt, null);
    const manager = globals.RecordType.getDatastore().manager;
    const historyCollection = manager.collection('recorddefinitionhistory');
    const histories = await globals.RecordDefinitionHistory.find({ recordType: finalIdentity.id });
    const prior = histories.find((entry: any) => entry.operation === 'publish' && entry.revisionNumber === 1);
    assert.ok(prior);
    const service = new RecordDefinitionMigrationService();
    const revisionCount = await globals.RecordDefinitionRevision.count({});
    const historyCount = await globals.RecordDefinitionHistory.count({});
    const secret = 'B11-EVIDENCE-SECRET';
    const runCli = () =>
      spawnSync(process.execPath, ['support/integration-testing/record-definition-preflight.cjs'], {
        encoding: 'utf8',
        timeout: 30000,
        env: { ...process.env, RECORD_DEFINITION_PREFLIGHT_MONGO_URL: process.env.RECORD_DEFINITION_TEST_MONGO_URL },
      });
    const expectRejected = async (label: string, historyDelta = 0) => {
      const errors: string[] = [];
      for (const run of [() => service.preflight(), () => service.migrate()]) {
        await assert.rejects(
          run(),
          error => {
            const message = String(error);
            assert.ok(message.length < 512, label);
            assert.ok(!message.includes(secret), label);
            assert.match(message, /invalid-identity-history/, label);
            errors.push(message);
            return true;
          },
          label
        );
      }
      assert.equal(errors[0], errors[1], label);
      const cli = runCli();
      assert.equal(cli.status, 1, `${label} ${cli.stdout + cli.stderr}`);
      assert.match(cli.stdout + cli.stderr, /invalid-identity-history/, label);
      assert.ok((cli.stdout + cli.stderr).length < 1024, label);
      assert.ok(!(cli.stdout + cli.stderr).includes(secret), label);
      assert.equal(await globals.RecordDefinitionRevision.count({}), revisionCount, label);
      assert.equal(await globals.RecordDefinitionHistory.count({}), historyCount + historyDelta, label);
      assert.deepEqual(await globals.RecordType.findOne({ id: finalIdentity.id }), finalIdentity, label);
    };
    // Missing prior publication evidence fails closed on every entry point.
    const raw = await historyCollection.findOne({ _id: prior.id });
    assert.ok(raw);
    try {
      await historyCollection.deleteOne({ _id: raw._id });
      assert.equal(await historyCollection.findOne({ _id: raw._id }), null);
      await expectRejected('missing-history', -1);
    } finally {
      await historyCollection.insertOne(raw);
    }
    assert.deepEqual(await service.preflight(), await service.preflight());
    // Malformed prior evidence fails closed on every entry point.
    const patches: [string, Record<string, unknown>][] = [
      ['schema', { schemaVersion: 99 }],
      ['resulting', { resultingIdentityVersion: -1 }],
      ['expected', { expectedIdentityVersion: 999 }],
      ['hash', { canonicalHash: `sha256:${secret}` }],
      ['report', { validation: { password: secret } }],
    ];
    for (const [label, patch] of patches) {
      try {
        await historyCollection.updateOne({ _id: raw._id }, { $set: patch });
        await expectRejected(label);
      } finally {
        await historyCollection.replaceOne({ _id: raw._id }, raw);
      }
    }
    assert.deepEqual(
      JSON.parse(
        execFileSync(process.execPath, ['support/integration-testing/record-definition-preflight.cjs'], {
          encoding: 'utf8',
          timeout: 30000,
          env: { ...process.env, RECORD_DEFINITION_PREFLIGHT_MONGO_URL: process.env.RECORD_DEFINITION_TEST_MONGO_URL },
        })
      ),
      await service.preflight()
    );
    assert.deepEqual(await service.migrate(), await service.preflight());
    assert.deepEqual(await globals.RecordType.findOne({ id: finalIdentity.id }), finalIdentity);
  });

  it('rejects forged 3->1 with missing or future intermediate successor across preflight, CLI and migrate', async function () {
    const brand = identities[0].branding;
    const lifecycle = new DraftServices.RecordDefinitionDraftLifecycle();
    const publication = new PublicationServices.RecordDefinitionPublication();
    const key = 'unretireforge31succ';
    await lifecycle.clone(brand, 'dataset', key, { id: 'b11-admin' });
    const publishRev = async (expectedActive: number | null) => {
      const identity = await globals.RecordType.findOne({ branding: brand, name: key });
      const draft = await lifecycle.get(brand, key);
      assert.ok(draft);
      const published = await publication.publish(
        brand,
        key,
        {
          schemaVersion: 1,
          expectedIdentityVersion: identity.version,
          expectedDraftVersion: draft.version,
          expectedActiveRevisionNumber: expectedActive,
        },
        { id: 'b11-admin' }
      );
      assert.equal(published.ok, true);
    };
    const saveRev = async (expectedActive: number) => {
      const draft = await lifecycle.get(brand, key);
      assert.ok(draft);
      const saved = await lifecycle.save(
        brand,
        key,
        {
          schemaVersion: 1,
          expectedDraftVersion: draft.version,
          expectedActiveRevisionNumber: expectedActive,
          definition: draft.definition,
        },
        { id: 'b11-admin' }
      );
      assert.equal(saved.ok, true);
    };
    await publishRev(null);
    await saveRev(1);
    await publishRev(1);
    await saveRev(2);
    await publishRev(2);
    let identity = await globals.RecordType.findOne({ branding: brand, name: key });
    assert.equal(identity.activeRevisionNumber, 3);
    const retired = await publication.retire(
      brand,
      key,
      { schemaVersion: 1, expectedIdentityVersion: identity.version },
      { id: 'b11-admin' }
    );
    assert.equal(retired.ok, true);
    identity = await globals.RecordType.findOne({ branding: brand, name: key });
    const unretired = await publication.unretire(
      brand,
      key,
      { schemaVersion: 1, expectedIdentityVersion: identity.version },
      { id: 'b11-admin' }
    );
    assert.equal(unretired.ok, true);
    await publishRev(3);
    await saveRev(4);
    const finalIdentity = await globals.RecordType.findOne({ branding: brand, name: key });
    assert.equal(finalIdentity.activeRevisionNumber, 4);
    const histories = await globals.RecordDefinitionHistory.find({ recordType: finalIdentity.id });
    const unretireHistory = histories.find((entry: any) => entry.operation === 'unretire');
    assert.equal(unretireHistory.expectedActiveRevisionNumber, 3);
    const successor = histories.find((entry: any) => entry.operation === 'publish' && entry.revisionNumber === 2);
    assert.ok(successor);
    const service = new RecordDefinitionMigrationService();
    const revisionCount = await globals.RecordDefinitionRevision.count({});
    const historyCount = await globals.RecordDefinitionHistory.count({});
    const report = await service.preflight();
    assert.deepEqual(
      JSON.parse(
        execFileSync(process.execPath, ['support/integration-testing/record-definition-preflight.cjs'], {
          encoding: 'utf8',
          timeout: 30000,
          env: { ...process.env, RECORD_DEFINITION_PREFLIGHT_MONGO_URL: process.env.RECORD_DEFINITION_TEST_MONGO_URL },
        })
      ),
      report
    );
    const manager = globals.RecordType.getDatastore().manager;
    const historyCollection = manager.collection('recorddefinitionhistory');
    const rawUnretire = await historyCollection.findOne({ _id: unretireHistory.id });
    const rawSuccessor = await historyCollection.findOne({ _id: successor.id });
    assert.ok(rawUnretire && rawSuccessor);
    const runCli = () =>
      spawnSync(process.execPath, ['support/integration-testing/record-definition-preflight.cjs'], {
        encoding: 'utf8',
        timeout: 30000,
        env: { ...process.env, RECORD_DEFINITION_PREFLIGHT_MONGO_URL: process.env.RECORD_DEFINITION_TEST_MONGO_URL },
      });
    const expectRejected = async (label: string, historyDelta = 0) => {
      const errors: string[] = [];
      for (const run of [() => service.preflight(), () => service.migrate()]) {
        await assert.rejects(
          run(),
          error => {
            const message = String(error);
            assert.ok(message.length < 512, label);
            assert.match(message, /invalid-identity-history/, label);
            errors.push(message);
            return true;
          },
          label
        );
      }
      assert.equal(errors[0], errors[1], label);
      const cli = runCli();
      assert.equal(cli.status, 1, `${label} ${cli.stdout + cli.stderr}`);
      assert.match(cli.stdout + cli.stderr, /invalid-identity-history/, label);
      assert.ok((cli.stdout + cli.stderr).length < 1024, label);
      assert.equal(await globals.RecordDefinitionRevision.count({}), revisionCount, label);
      assert.equal(await globals.RecordDefinitionHistory.count({}), historyCount + historyDelta, label);
      assert.deepEqual(await globals.RecordType.findOne({ id: finalIdentity.id }), finalIdentity, label);
    };
    try {
      await historyCollection.updateOne({ _id: rawUnretire._id }, { $set: { expectedActiveRevisionNumber: 1 } });
      // Forged 3->1 with the intermediate successor row deleted fails closed.
      await historyCollection.deleteOne({ _id: rawSuccessor._id });
      await expectRejected('forged-missing-successor', -1);
      await historyCollection.insertOne(rawSuccessor);
      // Forged 3->1 with a future intermediate successor version fails closed.
      await historyCollection.updateOne({ _id: rawSuccessor._id }, { $set: { resultingIdentityVersion: 999 } });
      await expectRejected('forged-future-successor');
    } finally {
      await historyCollection.replaceOne({ _id: rawUnretire._id }, rawUnretire);
      await historyCollection.replaceOne({ _id: rawSuccessor._id }, rawSuccessor);
    }
    assert.deepEqual(
      JSON.parse(
        execFileSync(process.execPath, ['support/integration-testing/record-definition-preflight.cjs'], {
          encoding: 'utf8',
          timeout: 30000,
          env: { ...process.env, RECORD_DEFINITION_PREFLIGHT_MONGO_URL: process.env.RECORD_DEFINITION_TEST_MONGO_URL },
        })
      ),
      await service.preflight()
    );
    assert.deepEqual(await service.migrate(), await service.preflight());
  });

  it('fails closed on missing and malformed intermediate successor after valid unretire then later publishes', async function () {
    const brand = identities[0].branding;
    const lifecycle = new DraftServices.RecordDefinitionDraftLifecycle();
    const publication = new PublicationServices.RecordDefinitionPublication();
    const key = 'unretireintermediate';
    await lifecycle.clone(brand, 'dataset', key, { id: 'b11-admin' });
    const publishRev = async (expectedActive: number | null) => {
      const identity = await globals.RecordType.findOne({ branding: brand, name: key });
      const draft = await lifecycle.get(brand, key);
      assert.ok(draft);
      const published = await publication.publish(
        brand,
        key,
        {
          schemaVersion: 1,
          expectedIdentityVersion: identity.version,
          expectedDraftVersion: draft.version,
          expectedActiveRevisionNumber: expectedActive,
        },
        { id: 'b11-admin' }
      );
      assert.equal(published.ok, true);
    };
    const saveRev = async (expectedActive: number) => {
      const draft = await lifecycle.get(brand, key);
      assert.ok(draft);
      const saved = await lifecycle.save(
        brand,
        key,
        {
          schemaVersion: 1,
          expectedDraftVersion: draft.version,
          expectedActiveRevisionNumber: expectedActive,
          definition: draft.definition,
        },
        { id: 'b11-admin' }
      );
      assert.equal(saved.ok, true);
    };
    await publishRev(null);
    await saveRev(1);
    let identity = await globals.RecordType.findOne({ branding: brand, name: key });
    const retired = await publication.retire(
      brand,
      key,
      { schemaVersion: 1, expectedIdentityVersion: identity.version },
      { id: 'b11-admin' }
    );
    assert.equal(retired.ok, true);
    identity = await globals.RecordType.findOne({ branding: brand, name: key });
    const unretired = await publication.unretire(
      brand,
      key,
      { schemaVersion: 1, expectedIdentityVersion: identity.version },
      { id: 'b11-admin' }
    );
    assert.equal(unretired.ok, true);
    await publishRev(1);
    await saveRev(2);
    await publishRev(2);
    await saveRev(3);
    const finalIdentity = await globals.RecordType.findOne({ branding: brand, name: key });
    assert.equal(finalIdentity.activeRevisionNumber, 3);
    assert.equal(finalIdentity.retiredAt, null);
    const histories = await globals.RecordDefinitionHistory.find({ recordType: finalIdentity.id });
    const intermediate = histories.find((entry: any) => entry.operation === 'publish' && entry.revisionNumber === 2);
    assert.ok(intermediate);
    const service = new RecordDefinitionMigrationService();
    const revisionCount = await globals.RecordDefinitionRevision.count({});
    const historyCount = await globals.RecordDefinitionHistory.count({});
    const secret = 'B11-INTERMEDIATE-SECRET';
    const runCli = () =>
      spawnSync(process.execPath, ['support/integration-testing/record-definition-preflight.cjs'], {
        encoding: 'utf8',
        timeout: 30000,
        env: { ...process.env, RECORD_DEFINITION_PREFLIGHT_MONGO_URL: process.env.RECORD_DEFINITION_TEST_MONGO_URL },
      });
    const expectRejected = async (label: string, historyDelta = 0) => {
      const errors: string[] = [];
      for (const run of [() => service.preflight(), () => service.migrate()]) {
        await assert.rejects(
          run(),
          error => {
            const message = String(error);
            assert.ok(message.length < 512, label);
            assert.ok(!message.includes(secret), label);
            assert.match(message, /invalid-identity-history/, label);
            errors.push(message);
            return true;
          },
          label
        );
      }
      assert.equal(errors[0], errors[1], label);
      const cli = runCli();
      assert.equal(cli.status, 1, `${label} ${cli.stdout + cli.stderr}`);
      assert.match(cli.stdout + cli.stderr, /invalid-identity-history/, label);
      assert.ok((cli.stdout + cli.stderr).length < 1024, label);
      assert.ok(!(cli.stdout + cli.stderr).includes(secret), label);
      assert.equal(await globals.RecordDefinitionRevision.count({}), revisionCount, label);
      assert.equal(await globals.RecordDefinitionHistory.count({}), historyCount + historyDelta, label);
      assert.deepEqual(await globals.RecordType.findOne({ id: finalIdentity.id }), finalIdentity, label);
    };
    const manager = globals.RecordType.getDatastore().manager;
    const historyCollection = manager.collection('recorddefinitionhistory');
    const raw = await historyCollection.findOne({ _id: intermediate.id });
    assert.ok(raw);
    try {
      await historyCollection.deleteOne({ _id: raw._id });
      await expectRejected('missing-intermediate', -1);
    } finally {
      await historyCollection.insertOne(raw);
    }
    const patches: [string, Record<string, unknown>][] = [
      ['schema', { schemaVersion: 99 }],
      ['expected', { expectedIdentityVersion: 999 }],
      ['future', { resultingIdentityVersion: 999 }],
      ['hash', { canonicalHash: `sha256:${secret}` }],
      ['report', { validation: { password: secret } }],
    ];
    for (const [label, patch] of patches) {
      try {
        await historyCollection.updateOne({ _id: raw._id }, { $set: patch });
        await expectRejected(label);
      } finally {
        await historyCollection.replaceOne({ _id: raw._id }, raw);
      }
    }
    assert.deepEqual(
      JSON.parse(
        execFileSync(process.execPath, ['support/integration-testing/record-definition-preflight.cjs'], {
          encoding: 'utf8',
          timeout: 30000,
          env: { ...process.env, RECORD_DEFINITION_PREFLIGHT_MONGO_URL: process.env.RECORD_DEFINITION_TEST_MONGO_URL },
        })
      ),
      await service.preflight()
    );
    assert.deepEqual(await service.migrate(), await service.preflight());
    assert.deepEqual(await globals.RecordType.findOne({ id: finalIdentity.id }), finalIdentity);
  });

  it('fails closed on corrupt intermediate successor immediately after publication without a draft save', async function () {
    const brand = identities[0].branding;
    const lifecycle = new DraftServices.RecordDefinitionDraftLifecycle();
    const publication = new PublicationServices.RecordDefinitionPublication();
    const key = 'unretireboundary';
    await lifecycle.clone(brand, 'dataset', key, { id: 'b11-admin' });
    const publishRev = async (expectedActive: number | null) => {
      const identity = await globals.RecordType.findOne({ branding: brand, name: key });
      const draft = await lifecycle.get(brand, key);
      assert.ok(draft);
      const published = await publication.publish(
        brand,
        key,
        {
          schemaVersion: 1,
          expectedIdentityVersion: identity.version,
          expectedDraftVersion: draft.version,
          expectedActiveRevisionNumber: expectedActive,
        },
        { id: 'b11-admin' }
      );
      assert.equal(published.ok, true);
    };
    const saveRev = async (expectedActive: number) => {
      const draft = await lifecycle.get(brand, key);
      assert.ok(draft);
      const saved = await lifecycle.save(
        brand,
        key,
        {
          schemaVersion: 1,
          expectedDraftVersion: draft.version,
          expectedActiveRevisionNumber: expectedActive,
          definition: draft.definition,
        },
        { id: 'b11-admin' }
      );
      assert.equal(saved.ok, true);
    };
    // Valid unretire at revision 1, publish revision 2, save, then publish
    // revision 3 without the final save: version equals the current
    // publication resulting version.
    await publishRev(null);
    await saveRev(1);
    let identity = await globals.RecordType.findOne({ branding: brand, name: key });
    const retired = await publication.retire(
      brand,
      key,
      { schemaVersion: 1, expectedIdentityVersion: identity.version },
      { id: 'b11-admin' }
    );
    assert.equal(retired.ok, true);
    identity = await globals.RecordType.findOne({ branding: brand, name: key });
    const unretired = await publication.unretire(
      brand,
      key,
      { schemaVersion: 1, expectedIdentityVersion: identity.version },
      { id: 'b11-admin' }
    );
    assert.equal(unretired.ok, true);
    await publishRev(1);
    await saveRev(2);
    await publishRev(2);
    const finalIdentity = await globals.RecordType.findOne({ branding: brand, name: key });
    assert.equal(finalIdentity.activeRevisionNumber, 3);
    assert.equal(finalIdentity.retiredAt, null);
    const histories = await globals.RecordDefinitionHistory.find({ recordType: finalIdentity.id });
    const current = histories.find((entry: any) => entry.operation === 'publish' && entry.revisionNumber === 3);
    assert.ok(current);
    assert.equal(finalIdentity.version, current.resultingIdentityVersion);
    const intermediate = histories.find((entry: any) => entry.operation === 'publish' && entry.revisionNumber === 2);
    assert.ok(intermediate);
    const service = new RecordDefinitionMigrationService();
    const revisionCount = await globals.RecordDefinitionRevision.count({});
    const historyCount = await globals.RecordDefinitionHistory.count({});
    const secret = 'B11-BOUNDARY-SECRET';
    const runCli = () =>
      spawnSync(process.execPath, ['support/integration-testing/record-definition-preflight.cjs'], {
        encoding: 'utf8',
        timeout: 30000,
        env: { ...process.env, RECORD_DEFINITION_PREFLIGHT_MONGO_URL: process.env.RECORD_DEFINITION_TEST_MONGO_URL },
      });
    // Valid immediate-post-publication boundary is accepted with CLI parity.
    const report = await service.preflight();
    assert.deepEqual(
      JSON.parse(
        execFileSync(process.execPath, ['support/integration-testing/record-definition-preflight.cjs'], {
          encoding: 'utf8',
          timeout: 30000,
          env: { ...process.env, RECORD_DEFINITION_PREFLIGHT_MONGO_URL: process.env.RECORD_DEFINITION_TEST_MONGO_URL },
        })
      ),
      report
    );
    assert.deepEqual(await service.migrate(), report);
    assert.equal(await globals.RecordDefinitionRevision.count({}), revisionCount);
    assert.equal(await globals.RecordDefinitionHistory.count({}), historyCount);
    assert.deepEqual(await globals.RecordType.findOne({ id: finalIdentity.id }), finalIdentity);
    const expectRejected = async (label: string, historyDelta = 0) => {
      const errors: string[] = [];
      for (const run of [() => service.preflight(), () => service.migrate()]) {
        await assert.rejects(
          run(),
          error => {
            const message = String(error);
            assert.ok(message.length < 512, label);
            assert.ok(!message.includes(secret), label);
            assert.match(message, /invalid-identity-history/, label);
            errors.push(message);
            return true;
          },
          label
        );
      }
      assert.equal(errors[0], errors[1], label);
      const cli = runCli();
      assert.equal(cli.status, 1, `${label} ${cli.stdout + cli.stderr}`);
      assert.match(cli.stdout + cli.stderr, /invalid-identity-history/, label);
      assert.ok((cli.stdout + cli.stderr).length < 1024, label);
      assert.ok(!(cli.stdout + cli.stderr).includes(secret), label);
      assert.equal(await globals.RecordDefinitionRevision.count({}), revisionCount, label);
      assert.equal(await globals.RecordDefinitionHistory.count({}), historyCount + historyDelta, label);
      assert.deepEqual(await globals.RecordType.findOne({ id: finalIdentity.id }), finalIdentity, label);
    };
    const manager = globals.RecordType.getDatastore().manager;
    const historyCollection = manager.collection('recorddefinitionhistory');
    const raw = await historyCollection.findOne({ _id: intermediate.id });
    assert.ok(raw);
    try {
      await historyCollection.deleteOne({ _id: raw._id });
      await expectRejected('missing-intermediate-boundary', -1);
    } finally {
      await historyCollection.insertOne(raw);
    }
    assert.deepEqual(await service.preflight(), report);
    const patches: [string, Record<string, unknown>][] = [
      ['schema-boundary', { schemaVersion: 99 }],
      ['expected-boundary', { expectedIdentityVersion: 999 }],
      ['resulting-boundary', { resultingIdentityVersion: 999 }],
      ['hash-boundary', { canonicalHash: `sha256:${secret}` }],
      ['report-boundary', { validation: { password: secret } }],
    ];
    for (const [label, patch] of patches) {
      try {
        await historyCollection.updateOne({ _id: raw._id }, { $set: patch });
        await expectRejected(label);
      } finally {
        await historyCollection.replaceOne({ _id: raw._id }, raw);
      }
    }
    assert.deepEqual(
      JSON.parse(
        execFileSync(process.execPath, ['support/integration-testing/record-definition-preflight.cjs'], {
          encoding: 'utf8',
          timeout: 30000,
          env: { ...process.env, RECORD_DEFINITION_PREFLIGHT_MONGO_URL: process.env.RECORD_DEFINITION_TEST_MONGO_URL },
        })
      ),
      await service.preflight()
    );
    assert.deepEqual(await service.migrate(), await service.preflight());
    assert.deepEqual(await globals.RecordType.findOne({ id: finalIdentity.id }), finalIdentity);
  });

  it('fails closed on corrupt earlier publication after a later retire/unretire cycle across preflight, CLI and migrate', async function () {
    const brand = identities[0].branding;
    const lifecycle = new DraftServices.RecordDefinitionDraftLifecycle();
    const publication = new PublicationServices.RecordDefinitionPublication();
    const key = 'laterretirecycle';
    await lifecycle.clone(brand, 'dataset', key, { id: 'b11-admin' });
    const publishRev = async (expectedActive: number | null) => {
      const identity = await globals.RecordType.findOne({ branding: brand, name: key });
      const draft = await lifecycle.get(brand, key);
      assert.ok(draft);
      const published = await publication.publish(
        brand,
        key,
        {
          schemaVersion: 1,
          expectedIdentityVersion: identity.version,
          expectedDraftVersion: draft.version,
          expectedActiveRevisionNumber: expectedActive,
        },
        { id: 'b11-admin' }
      );
      assert.equal(published.ok, true);
    };
    const saveRev = async (expectedActive: number) => {
      const draft = await lifecycle.get(brand, key);
      assert.ok(draft);
      const saved = await lifecycle.save(
        brand,
        key,
        {
          schemaVersion: 1,
          expectedDraftVersion: draft.version,
          expectedActiveRevisionNumber: expectedActive,
          definition: draft.definition,
        },
        { id: 'b11-admin' }
      );
      assert.equal(saved.ok, true);
    };
    // Publish revision 1, retire/unretire, publish revision 2, save, publish
    // revision 3, then a second valid retire/unretire cycle at revision 3.
    await publishRev(null);
    await saveRev(1);
    let identity = await globals.RecordType.findOne({ branding: brand, name: key });
    assert.equal(
      (
        await publication.retire(
          brand,
          key,
          { schemaVersion: 1, expectedIdentityVersion: identity.version },
          { id: 'b11-admin' }
        )
      ).ok,
      true
    );
    identity = await globals.RecordType.findOne({ branding: brand, name: key });
    assert.equal(
      (
        await publication.unretire(
          brand,
          key,
          { schemaVersion: 1, expectedIdentityVersion: identity.version },
          { id: 'b11-admin' }
        )
      ).ok,
      true
    );
    await publishRev(1);
    await saveRev(2);
    await publishRev(2);
    identity = await globals.RecordType.findOne({ branding: brand, name: key });
    assert.equal(identity.activeRevisionNumber, 3);
    assert.equal(
      (
        await publication.retire(
          brand,
          key,
          { schemaVersion: 1, expectedIdentityVersion: identity.version },
          { id: 'b11-admin' }
        )
      ).ok,
      true
    );
    const retiredIdentity = await globals.RecordType.findOne({ branding: brand, name: key });
    const service = new RecordDefinitionMigrationService();
    const manager = globals.RecordType.getDatastore().manager;
    const historyCollection = manager.collection('recorddefinitionhistory');
    const secret = 'B11-LATER-CYCLE-SECRET';
    const runCli = () =>
      spawnSync(process.execPath, ['support/integration-testing/record-definition-preflight.cjs'], {
        encoding: 'utf8',
        timeout: 30000,
        env: { ...process.env, RECORD_DEFINITION_PREFLIGHT_MONGO_URL: process.env.RECORD_DEFINITION_TEST_MONGO_URL },
      });
    const expectValid = async (label: string) => {
      const current = await globals.RecordType.findOne({ branding: brand, name: key });
      const revisionCount = await globals.RecordDefinitionRevision.count({});
      const historyCount = await globals.RecordDefinitionHistory.count({});
      const report = await service.preflight();
      assert.deepEqual(
        JSON.parse(
          execFileSync(process.execPath, ['support/integration-testing/record-definition-preflight.cjs'], {
            encoding: 'utf8',
            timeout: 30000,
            env: {
              ...process.env,
              RECORD_DEFINITION_PREFLIGHT_MONGO_URL: process.env.RECORD_DEFINITION_TEST_MONGO_URL,
            },
          })
        ),
        report,
        label
      );
      assert.deepEqual(await service.migrate(), report, label);
      assert.equal(await globals.RecordDefinitionRevision.count({}), revisionCount, label);
      assert.equal(await globals.RecordDefinitionHistory.count({}), historyCount, label);
      assert.deepEqual(await globals.RecordType.findOne({ id: current.id }), current, label);
    };
    const expectRejectedForIntermediate = async (label: string) => {
      const current = await globals.RecordType.findOne({ branding: brand, name: key });
      const revisionCount = await globals.RecordDefinitionRevision.count({});
      const historyCount = await globals.RecordDefinitionHistory.count({});
      const histories = await globals.RecordDefinitionHistory.find({ recordType: current.id });
      const intermediate = histories.find((entry: any) => entry.operation === 'publish' && entry.revisionNumber === 2);
      assert.ok(intermediate, label);
      const raw = await historyCollection.findOne({ _id: intermediate.id });
      assert.ok(raw, label);
      const expectRejected = async (inner: string, historyDelta = 0) => {
        const errors: string[] = [];
        for (const run of [() => service.preflight(), () => service.migrate()]) {
          await assert.rejects(
            run(),
            error => {
              const message = String(error);
              assert.ok(message.length < 512, `${label}:${inner}`);
              assert.ok(!message.includes(secret), `${label}:${inner}`);
              assert.match(message, /invalid-identity-history/, `${label}:${inner}`);
              errors.push(message);
              return true;
            },
            `${label}:${inner}`
          );
        }
        assert.equal(errors[0], errors[1], `${label}:${inner}`);
        const cli = runCli();
        assert.equal(cli.status, 1, `${label}:${inner} ${cli.stdout + cli.stderr}`);
        assert.match(cli.stdout + cli.stderr, /invalid-identity-history/, `${label}:${inner}`);
        assert.ok((cli.stdout + cli.stderr).length < 1024, `${label}:${inner}`);
        assert.ok(!(cli.stdout + cli.stderr).includes(secret), `${label}:${inner}`);
        assert.equal(await globals.RecordDefinitionRevision.count({}), revisionCount, `${label}:${inner}`);
        assert.equal(await globals.RecordDefinitionHistory.count({}), historyCount + historyDelta, `${label}:${inner}`);
        assert.deepEqual(await globals.RecordType.findOne({ id: current.id }), current, `${label}:${inner}`);
      };
      try {
        await historyCollection.deleteOne({ _id: raw._id });
        await expectRejected('missing', -1);
      } finally {
        await historyCollection.insertOne(raw);
      }
      assert.deepEqual(await service.preflight(), await service.preflight(), label);
      const patches: [string, Record<string, unknown>][] = [
        ['schema', { schemaVersion: 99 }],
        ['expected', { expectedIdentityVersion: 999 }],
        ['resulting', { resultingIdentityVersion: 999 }],
        ['hash', { canonicalHash: `sha256:${secret}` }],
        ['report', { validation: { password: secret } }],
      ];
      for (const [inner, patch] of patches) {
        try {
          await historyCollection.updateOne({ _id: raw._id }, { $set: patch });
          await expectRejected(inner);
        } finally {
          await historyCollection.replaceOne({ _id: raw._id }, raw);
        }
      }
      await expectValid(`${label}-restored`);
    };
    // While retired at revision 3.
    await expectValid('later-while-retired-valid');
    await expectRejectedForIntermediate('later-while-retired');
    // Immediately after unretire at revision 3.
    identity = await globals.RecordType.findOne({ branding: brand, name: key });
    assert.equal(
      (
        await publication.unretire(
          brand,
          key,
          { schemaVersion: 1, expectedIdentityVersion: identity.version },
          { id: 'b11-admin' }
        )
      ).ok,
      true
    );
    await expectValid('later-after-unretire-valid');
    await expectRejectedForIntermediate('later-after-unretire');
    // After saving at revision 3.
    identity = await globals.RecordType.findOne({ branding: brand, name: key });
    assert.equal(identity.activeRevisionNumber, 3);
    await saveRev(3);
    await expectValid('later-after-save-valid');
    await expectRejectedForIntermediate('later-after-save');
    // After publishing revision 4 without a final save.
    await publishRev(3);
    await expectValid('later-after-publish-rev4-valid');
    await expectRejectedForIntermediate('later-after-publish-rev4');
    // After publishing revision 5 without a final save.
    await publishRev(4);
    const finalIdentity = await globals.RecordType.findOne({ branding: brand, name: key });
    assert.equal(finalIdentity.activeRevisionNumber, 5);
    await expectValid('later-after-publish-rev5-valid');
    await expectRejectedForIntermediate('later-after-publish-rev5');
    assert.deepEqual(await globals.RecordType.findOne({ id: finalIdentity.id }), finalIdentity);
    assert.deepEqual(retiredIdentity.retiredAt !== null, true);
  });

  it('rejects a deleted intermediate history for never-retired revisions across preflight, CLI and migrate', async function () {
    const brand = identities[0].branding;
    const lifecycle = new DraftServices.RecordDefinitionDraftLifecycle();
    const publication = new PublicationServices.RecordDefinitionPublication();
    const key = 'neverretiredchain';
    await lifecycle.clone(brand, 'dataset', key, { id: 'b11-admin' });
    const publishRev = async (expectedActive: number | null) => {
      const identity = await globals.RecordType.findOne({ branding: brand, name: key });
      const draft = await lifecycle.get(brand, key);
      assert.ok(draft);
      const published = await publication.publish(
        brand,
        key,
        {
          schemaVersion: 1,
          expectedIdentityVersion: identity.version,
          expectedDraftVersion: draft.version,
          expectedActiveRevisionNumber: expectedActive,
        },
        { id: 'b11-admin' }
      );
      assert.equal(published.ok, true);
    };
    const saveRev = async (expectedActive: number) => {
      const draft = await lifecycle.get(brand, key);
      assert.ok(draft);
      const saved = await lifecycle.save(
        brand,
        key,
        {
          schemaVersion: 1,
          expectedDraftVersion: draft.version,
          expectedActiveRevisionNumber: expectedActive,
          definition: draft.definition,
        },
        { id: 'b11-admin' }
      );
      assert.equal(saved.ok, true);
    };
    await publishRev(null);
    await saveRev(1);
    await publishRev(1);
    await saveRev(2);
    await publishRev(2);
    const service = new RecordDefinitionMigrationService();
    const manager = globals.RecordType.getDatastore().manager;
    const historyCollection = manager.collection('recorddefinitionhistory');
    const revisionCollection = manager.collection('recorddefinitionrevision');
    const secret = 'B11-NEVER-RETIRED-SECRET';
    const runCli = () =>
      spawnSync(process.execPath, ['support/integration-testing/record-definition-preflight.cjs'], {
        encoding: 'utf8',
        timeout: 30000,
        env: { ...process.env, RECORD_DEFINITION_PREFLIGHT_MONGO_URL: process.env.RECORD_DEFINITION_TEST_MONGO_URL },
      });
    const expectValid = async (label: string) => {
      const current = await globals.RecordType.findOne({ branding: brand, name: key });
      const revisionCount = await globals.RecordDefinitionRevision.count({});
      const historyCount = await globals.RecordDefinitionHistory.count({});
      const rawIdentity = await manager.collection('recordtype').findOne({ _id: current.id });
      const rawRevision = await revisionCollection.findOne({ _id: current.activeRevisionId });
      const report = await service.preflight();
      assert.deepEqual(
        JSON.parse(
          execFileSync(process.execPath, ['support/integration-testing/record-definition-preflight.cjs'], {
            encoding: 'utf8',
            timeout: 30000,
            env: {
              ...process.env,
              RECORD_DEFINITION_PREFLIGHT_MONGO_URL: process.env.RECORD_DEFINITION_TEST_MONGO_URL,
            },
          })
        ),
        report,
        label
      );
      assert.deepEqual(await service.migrate(), report, label);
      assert.equal(await globals.RecordDefinitionRevision.count({}), revisionCount, label);
      assert.equal(await globals.RecordDefinitionHistory.count({}), historyCount, label);
      assert.deepEqual(await globals.RecordType.findOne({ id: current.id }), current, label);
      assert.deepEqual(await manager.collection('recordtype').findOne({ _id: current.id }), rawIdentity, label);
      assert.deepEqual(await revisionCollection.findOne({ _id: current.activeRevisionId }), rawRevision, label);
    };
    const expectRejectedAfterDelete = async (label: string) => {
      const current = await globals.RecordType.findOne({ branding: brand, name: key });
      const revisionCount = await globals.RecordDefinitionRevision.count({});
      const historyCount = await globals.RecordDefinitionHistory.count({});
      const rawIdentity = await manager.collection('recordtype').findOne({ _id: current.id });
      const histories = await globals.RecordDefinitionHistory.find({ recordType: current.id });
      const intermediate = histories.find((entry: any) => entry.revisionNumber === 2);
      assert.ok(intermediate, label);
      const raw = await historyCollection.findOne({ _id: intermediate.id });
      assert.ok(raw, label);
      const indexesBefore = await historyCollection.listIndexes().toArray();
      try {
        await historyCollection.deleteOne({ _id: raw._id });
        const errors: string[] = [];
        for (const run of [() => service.preflight(), () => service.migrate()]) {
          await assert.rejects(
            run(),
            error => {
              const message = String(error);
              assert.ok(message.length < 512, `${label}`);
              assert.ok(!message.includes(secret), `${label}`);
              assert.match(message, /invalid-identity-history/, `${label}`);
              errors.push(message);
              return true;
            },
            label
          );
        }
        assert.equal(errors[0], errors[1], label);
        const cli = runCli();
        assert.equal(cli.status, 1, `${label} ${cli.stdout + cli.stderr}`);
        assert.match(cli.stdout + cli.stderr, /invalid-identity-history/, label);
        assert.ok((cli.stdout + cli.stderr).length < 1024, label);
        assert.ok(!(cli.stdout + cli.stderr).includes(secret), label);
        assert.equal(await globals.RecordDefinitionRevision.count({}), revisionCount, label);
        assert.equal(await globals.RecordDefinitionHistory.count({}), historyCount - 1, label);
        assert.deepEqual(await globals.RecordType.findOne({ id: current.id }), current, label);
        assert.deepEqual(await manager.collection('recordtype').findOne({ _id: current.id }), rawIdentity, label);
        assert.deepEqual(await historyCollection.listIndexes().toArray(), indexesBefore, label);
      } finally {
        await historyCollection.insertOne(raw);
      }
      await expectValid(`${label}-restored`);
    };
    await expectValid('never-retired-immediate-valid');
    await expectRejectedAfterDelete('never-retired-immediate');
    await saveRev(3);
    await expectValid('never-retired-after-save-valid');
    await expectRejectedAfterDelete('never-retired-after-save');
  });

  it('rejects semantically invalid prior revisions with recomputed hashes across preflight, CLI and migrate', async function () {
    const brand = identities[0].branding;
    const lifecycle = new DraftServices.RecordDefinitionDraftLifecycle();
    const publication = new PublicationServices.RecordDefinitionPublication();
    const key = 'priorsemantic';
    await lifecycle.clone(brand, 'dataset', key, { id: 'b11-admin' });
    const publishRev = async (expectedActive: number | null) => {
      const identity = await globals.RecordType.findOne({ branding: brand, name: key });
      const draft = await lifecycle.get(brand, key);
      assert.ok(draft);
      const published = await publication.publish(
        brand,
        key,
        {
          schemaVersion: 1,
          expectedIdentityVersion: identity.version,
          expectedDraftVersion: draft.version,
          expectedActiveRevisionNumber: expectedActive,
        },
        { id: 'b11-admin' }
      );
      assert.equal(published.ok, true);
    };
    const saveRev = async (expectedActive: number) => {
      const draft = await lifecycle.get(brand, key);
      assert.ok(draft);
      const saved = await lifecycle.save(
        brand,
        key,
        {
          schemaVersion: 1,
          expectedDraftVersion: draft.version,
          expectedActiveRevisionNumber: expectedActive,
          definition: draft.definition,
        },
        { id: 'b11-admin' }
      );
      assert.equal(saved.ok, true);
    };
    await publishRev(null);
    await saveRev(1);
    await publishRev(1);
    await saveRev(2);
    await publishRev(2);
    const service = new RecordDefinitionMigrationService();
    const manager = globals.RecordType.getDatastore().manager;
    const historyCollection = manager.collection('recorddefinitionhistory');
    const revisionCollection = manager.collection('recorddefinitionrevision');
    const secret = 'B11-PRIOR-SEMANTIC-SECRET';
    const runCli = () =>
      spawnSync(process.execPath, ['support/integration-testing/record-definition-preflight.cjs'], {
        encoding: 'utf8',
        timeout: 30000,
        env: { ...process.env, RECORD_DEFINITION_PREFLIGHT_MONGO_URL: process.env.RECORD_DEFINITION_TEST_MONGO_URL },
      });
    const expectValid = async (label: string) => {
      const current = await globals.RecordType.findOne({ branding: brand, name: key });
      const revisionCount = await globals.RecordDefinitionRevision.count({});
      const historyCount = await globals.RecordDefinitionHistory.count({});
      const report = await service.preflight();
      assert.deepEqual(
        JSON.parse(
          execFileSync(process.execPath, ['support/integration-testing/record-definition-preflight.cjs'], {
            encoding: 'utf8',
            timeout: 30000,
            env: {
              ...process.env,
              RECORD_DEFINITION_PREFLIGHT_MONGO_URL: process.env.RECORD_DEFINITION_TEST_MONGO_URL,
            },
          })
        ),
        report,
        label
      );
      assert.deepEqual(await service.migrate(), report, label);
      assert.equal(await globals.RecordDefinitionRevision.count({}), revisionCount, label);
      assert.equal(await globals.RecordDefinitionHistory.count({}), historyCount, label);
      assert.deepEqual(await globals.RecordType.findOne({ id: current.id }), current, label);
    };
    const expectRejected = async (label: string) => {
      const current = await globals.RecordType.findOne({ branding: brand, name: key });
      const revisionCount = await globals.RecordDefinitionRevision.count({});
      const historyCount = await globals.RecordDefinitionHistory.count({});
      const errors: string[] = [];
      for (const run of [() => service.preflight(), () => service.migrate()]) {
        await assert.rejects(
          run(),
          error => {
            const message = String(error);
            assert.ok(message.length < 512, label);
            assert.ok(!message.includes(secret), label);
            assert.match(message, /invalid-identity-history/, label);
            errors.push(message);
            return true;
          },
          label
        );
      }
      assert.equal(errors[0], errors[1], label);
      const cli = runCli();
      assert.equal(cli.status, 1, `${label} ${cli.stdout + cli.stderr}`);
      assert.match(cli.stdout + cli.stderr, /invalid-identity-history/, label);
      assert.ok((cli.stdout + cli.stderr).length < 1024, label);
      assert.ok(!(cli.stdout + cli.stderr).includes(secret), label);
      assert.equal(await globals.RecordDefinitionRevision.count({}), revisionCount, label);
      assert.equal(await globals.RecordDefinitionHistory.count({}), historyCount, label);
      assert.deepEqual(await globals.RecordType.findOne({ id: current.id }), current, label);
    };
    await expectValid('prior-valid');
    const current = await globals.RecordType.findOne({ branding: brand, name: key });
    const histories = await globals.RecordDefinitionHistory.find({ recordType: current.id });
    const rev2History = histories.find((entry: any) => entry.revisionNumber === 2);
    assert.ok(rev2History);
    const rev2RawHistory = await historyCollection.findOne({ _id: rev2History.id });
    const rev2RawRevision = await revisionCollection.findOne({ _id: rev2History.revision });
    assert.ok(rev2RawHistory && rev2RawRevision);
    try {
      await revisionCollection.updateOne(
        { _id: rev2RawRevision._id },
        { $set: { actionContracts: [{ actionId: 'core.email.send', contractVersion: 1 }] } }
      );
      await expectRejected('prior-action-contracts');
    } finally {
      await revisionCollection.replaceOne({ _id: rev2RawRevision._id }, rev2RawRevision);
    }
    await expectValid('prior-action-restored');
    const freshRevision = await revisionCollection.findOne({ _id: rev2RawRevision._id });
    const mutatedDefinition = structuredClone(freshRevision.definition);
    mutatedDefinition.stages = mutatedDefinition.stages.map((stage: any) => ({
      ...stage,
      editRoles: ['B11-GHOST-ROLE'],
      viewRoles: ['B11-GHOST-ROLE', ...(stage.viewRoles ?? [])],
    }));
    const canonicalHash = hashRecordDefinition(mutatedDefinition);
    try {
      await revisionCollection.updateOne(
        { _id: rev2RawRevision._id },
        { $set: { definition: mutatedDefinition, canonicalHash } }
      );
      await historyCollection.updateOne({ _id: rev2RawHistory._id }, { $set: { canonicalHash } });
      await expectRejected('prior-edit-roles');
    } finally {
      await revisionCollection.replaceOne({ _id: rev2RawRevision._id }, rev2RawRevision);
      await historyCollection.replaceOne({ _id: rev2RawHistory._id }, rev2RawHistory);
    }
    await expectValid('prior-edit-restored');
  });

  it('rejects a forged earlier publication version in a later retire/unretire cycle across preflight, CLI and migrate', async function () {
    const brand = identities[0].branding;
    const lifecycle = new DraftServices.RecordDefinitionDraftLifecycle();
    const publication = new PublicationServices.RecordDefinitionPublication();
    const key = 'forgedversionslot';
    await lifecycle.clone(brand, 'dataset', key, { id: 'b11-admin' });
    const publishRev = async (expectedActive: number | null) => {
      const identity = await globals.RecordType.findOne({ branding: brand, name: key });
      const draft = await lifecycle.get(brand, key);
      assert.ok(draft);
      const published = await publication.publish(
        brand,
        key,
        {
          schemaVersion: 1,
          expectedIdentityVersion: identity.version,
          expectedDraftVersion: draft.version,
          expectedActiveRevisionNumber: expectedActive,
        },
        { id: 'b11-admin' }
      );
      assert.equal(published.ok, true);
    };
    const saveRev = async (expectedActive: number) => {
      const draft = await lifecycle.get(brand, key);
      assert.ok(draft);
      const saved = await lifecycle.save(
        brand,
        key,
        {
          schemaVersion: 1,
          expectedDraftVersion: draft.version,
          expectedActiveRevisionNumber: expectedActive,
          definition: draft.definition,
        },
        { id: 'b11-admin' }
      );
      assert.equal(saved.ok, true);
    };
    await publishRev(null);
    await saveRev(1);
    let identity = await globals.RecordType.findOne({ branding: brand, name: key });
    assert.equal(
      (
        await publication.retire(
          brand,
          key,
          { schemaVersion: 1, expectedIdentityVersion: identity.version },
          { id: 'b11-admin' }
        )
      ).ok,
      true
    );
    identity = await globals.RecordType.findOne({ branding: brand, name: key });
    assert.equal(
      (
        await publication.unretire(
          brand,
          key,
          { schemaVersion: 1, expectedIdentityVersion: identity.version },
          { id: 'b11-admin' }
        )
      ).ok,
      true
    );
    await publishRev(1);
    await saveRev(2);
    await publishRev(2);
    identity = await globals.RecordType.findOne({ branding: brand, name: key });
    assert.equal(identity.activeRevisionNumber, 3);
    assert.equal(
      (
        await publication.retire(
          brand,
          key,
          { schemaVersion: 1, expectedIdentityVersion: identity.version },
          { id: 'b11-admin' }
        )
      ).ok,
      true
    );
    identity = await globals.RecordType.findOne({ branding: brand, name: key });
    assert.equal(
      (
        await publication.unretire(
          brand,
          key,
          { schemaVersion: 1, expectedIdentityVersion: identity.version },
          { id: 'b11-admin' }
        )
      ).ok,
      true
    );
    const service = new RecordDefinitionMigrationService();
    const manager = globals.RecordType.getDatastore().manager;
    const historyCollection = manager.collection('recorddefinitionhistory');
    const secret = 'B11-FORGED-VERSION-SECRET';
    const runCli = () =>
      spawnSync(process.execPath, ['support/integration-testing/record-definition-preflight.cjs'], {
        encoding: 'utf8',
        timeout: 30000,
        env: { ...process.env, RECORD_DEFINITION_PREFLIGHT_MONGO_URL: process.env.RECORD_DEFINITION_TEST_MONGO_URL },
      });
    const expectValid = async (label: string) => {
      const current = await globals.RecordType.findOne({ branding: brand, name: key });
      const revisionCount = await globals.RecordDefinitionRevision.count({});
      const historyCount = await globals.RecordDefinitionHistory.count({});
      const report = await service.preflight();
      assert.deepEqual(
        JSON.parse(
          execFileSync(process.execPath, ['support/integration-testing/record-definition-preflight.cjs'], {
            encoding: 'utf8',
            timeout: 30000,
            env: {
              ...process.env,
              RECORD_DEFINITION_PREFLIGHT_MONGO_URL: process.env.RECORD_DEFINITION_TEST_MONGO_URL,
            },
          })
        ),
        report,
        label
      );
      assert.deepEqual(await service.migrate(), report, label);
      assert.equal(await globals.RecordDefinitionRevision.count({}), revisionCount, label);
      assert.equal(await globals.RecordDefinitionHistory.count({}), historyCount, label);
      assert.deepEqual(await globals.RecordType.findOne({ id: current.id }), current, label);
    };
    await expectValid('forged-slot-valid');
    const current = await globals.RecordType.findOne({ branding: brand, name: key });
    const revisionCount = await globals.RecordDefinitionRevision.count({});
    const historyCount = await globals.RecordDefinitionHistory.count({});
    const histories = await globals.RecordDefinitionHistory.find({ recordType: current.id });
    const intermediate = histories.find((entry: any) => entry.revisionNumber === 2);
    assert.ok(intermediate);
    const raw = await historyCollection.findOne({ _id: intermediate.id });
    assert.ok(raw);
    assert.notDeepEqual([raw.expectedIdentityVersion, raw.resultingIdentityVersion], [1, 2]);
    const indexesBefore = await historyCollection.listIndexes().toArray();
    try {
      await historyCollection.updateOne(
        { _id: raw._id },
        { $set: { expectedIdentityVersion: 1, resultingIdentityVersion: 2 } }
      );
      const errors: string[] = [];
      for (const run of [() => service.preflight(), () => service.migrate()]) {
        await assert.rejects(
          run(),
          error => {
            const message = String(error);
            assert.ok(message.length < 512);
            assert.ok(!message.includes(secret));
            assert.match(message, /invalid-identity-history/);
            errors.push(message);
            return true;
          },
          'forged-slot'
        );
      }
      assert.equal(errors[0], errors[1]);
      const cli = runCli();
      assert.equal(cli.status, 1, cli.stdout + cli.stderr);
      assert.match(cli.stdout + cli.stderr, /invalid-identity-history/);
      assert.ok((cli.stdout + cli.stderr).length < 1024);
      assert.ok(!(cli.stdout + cli.stderr).includes(secret));
      assert.equal(await globals.RecordDefinitionRevision.count({}), revisionCount);
      assert.equal(await globals.RecordDefinitionHistory.count({}), historyCount);
      assert.deepEqual(await globals.RecordType.findOne({ id: current.id }), current);
      assert.deepEqual(await historyCollection.listIndexes().toArray(), indexesBefore);
    } finally {
      await historyCollection.replaceOne({ _id: raw._id }, raw);
    }
    await expectValid('forged-slot-restored');
  });

  it('rejects Astra round-13 predecessor, out-of-range and provenance forgeries across preflight, CLI and migrate', async function () {
    const brand = identities[0].branding;
    const lifecycle = new DraftServices.RecordDefinitionDraftLifecycle();
    const publication = new PublicationServices.RecordDefinitionPublication();
    const key = 'astraround13';
    await lifecycle.clone(brand, 'dataset', key, { id: 'b11-admin' });
    const publishRev = async (expectedActive: number | null) => {
      const identity = await globals.RecordType.findOne({ branding: brand, name: key });
      const draft = await lifecycle.get(brand, key);
      assert.ok(draft);
      const published = await publication.publish(
        brand,
        key,
        {
          schemaVersion: 1,
          expectedIdentityVersion: identity.version,
          expectedDraftVersion: draft.version,
          expectedActiveRevisionNumber: expectedActive,
        },
        { id: 'b11-admin' }
      );
      assert.equal(published.ok, true);
    };
    await publishRev(null);
    await publishRev(1);
    await publishRev(2);
    let identity = await globals.RecordType.findOne({ branding: brand, name: key });
    assert.equal(identity.activeRevisionNumber, 3);
    const service = new RecordDefinitionMigrationService();
    const manager = globals.RecordType.getDatastore().manager;
    const revisionCollection = manager.collection('recorddefinitionrevision');
    const historyCollection = manager.collection('recorddefinitionhistory');
    const identityCollection = manager.collection('recordtype');
    const secret = 'B11-ASTRA13-SECRET';
    const runCli = () =>
      spawnSync(process.execPath, ['support/integration-testing/record-definition-preflight.cjs'], {
        encoding: 'utf8',
        timeout: 30000,
        env: { ...process.env, RECORD_DEFINITION_PREFLIGHT_MONGO_URL: process.env.RECORD_DEFINITION_TEST_MONGO_URL },
      });
    const expectReject = async (label: string) => {
      const current = await globals.RecordType.findOne({ branding: brand, name: key });
      const rawIdentity = await identityCollection.findOne({ _id: current._id ?? current.id });
      const revisionCount = await globals.RecordDefinitionRevision.count({});
      const historyCount = await globals.RecordDefinitionHistory.count({});
      const indexesBefore = await historyCollection.listIndexes().toArray();
      const errors: string[] = [];
      for (const run of [() => service.preflight(), () => service.migrate()]) {
        await assert.rejects(
          run(),
          error => {
            const message = String(error);
            assert.ok(message.length < 512, label);
            assert.ok(!message.includes(secret), label);
            assert.match(message, /invalid-identity-history/, label);
            errors.push(message);
            return true;
          },
          label
        );
      }
      assert.equal(errors[0], errors[1], label);
      const cli = runCli();
      assert.equal(cli.status, 1, `${label}: ${cli.stdout + cli.stderr}`);
      assert.match(cli.stdout + cli.stderr, /invalid-identity-history/, label);
      assert.ok((cli.stdout + cli.stderr).length < 1024, label);
      assert.ok(!(cli.stdout + cli.stderr).includes(secret), label);
      assert.equal(await globals.RecordDefinitionRevision.count({}), revisionCount, label);
      assert.equal(await globals.RecordDefinitionHistory.count({}), historyCount, label);
      assert.deepEqual(await globals.RecordType.findOne({ id: current.id }), current, label);
      assert.deepEqual(await historyCollection.listIndexes().toArray(), indexesBefore, label);
      void rawIdentity;
    };
    // Predecessor deletion: remove rev1/rev2 rows and histories, keep rev3.
    // Must reject immediately and across a later save-gap version advance.
    const allRevisions = await revisionCollection.find({}).toArray();
    const allHistories = await historyCollection.find({}).toArray();
    const victimRevisions = allRevisions.filter(
      (entry: any) => String(entry.recordType) === String(identity.id) && [1, 2].includes(entry.revisionNumber)
    );
    const victimHistories = allHistories.filter(
      (entry: any) => String(entry.recordType) === String(identity.id) && [1, 2].includes(entry.revisionNumber)
    );
    assert.equal(victimRevisions.length, 2);
    assert.equal(victimHistories.length, 2);
    try {
      await revisionCollection.deleteMany({ _id: { $in: victimRevisions.map((entry: any) => entry._id) } });
      await historyCollection.deleteMany({ _id: { $in: victimHistories.map((entry: any) => entry._id) } });
      await expectReject('deleted-predecessors');
      await identityCollection.updateOne({ _id: identity._id }, { $set: { version: identity.version + 1 } });
      await expectReject('deleted-predecessors-saved');
    } finally {
      await revisionCollection.deleteMany({});
      await historyCollection.deleteMany({});
      if (victimRevisions.length > 0) await revisionCollection.insertMany(victimRevisions);
      if (victimHistories.length > 0) await historyCollection.insertMany(victimHistories);
      const restored = await globals.RecordType.findOne({ branding: brand, name: key });
      await identityCollection.updateOne({ _id: restored._id }, { $set: { version: identity.version } });
    }
    // Out-of-range retirement: needs a retire/unretire pair first.
    identity = await globals.RecordType.findOne({ branding: brand, name: key });
    assert.equal(
      (
        await publication.retire(
          brand,
          key,
          { schemaVersion: 1, expectedIdentityVersion: identity.version },
          { id: 'b11-admin' }
        )
      ).ok,
      true
    );
    const retireHistories = await globals.RecordDefinitionHistory.find({ recordType: identity.id });
    const retire = retireHistories.find((entry: any) => entry.operation === 'retire');
    assert.ok(retire);
    const rawRetire = await historyCollection.findOne({ _id: retire._id ?? retire.id });
    try {
      await historyCollection.updateOne(
        { _id: rawRetire._id },
        { $set: { expectedIdentityVersion: -3, resultingIdentityVersion: -2 } }
      );
      await expectReject('negative-retirement');
    } finally {
      await historyCollection.replaceOne({ _id: rawRetire._id }, rawRetire);
    }
    // Forged prior provenance: relabel rev1 as bootstrap/migration with a
    // forged actor and valid hashes must fail closed at both versions.
    for (const operation of ['bootstrap', 'migration']) {
      const rev1 = await revisionCollection.findOne({ recordType: identity.id, revisionNumber: 1 });
      const hist1 = await historyCollection.findOne({ recordType: identity.id, revisionNumber: 1 });
      assert.ok(rev1 && hist1);
      const forgedActor = { id: secret };
      try {
        await revisionCollection.updateOne(
          { _id: rev1._id },
          {
            $set: {
              source: { operation, sourceRevisionNumber: null },
              publishedBy: forgedActor,
              createdBy: forgedActor,
            },
          }
        );
        await historyCollection.updateOne(
          { _id: hist1._id },
          {
            $set: {
              operation,
              source: { operation, sourceRevisionNumber: null },
              actor: forgedActor,
              expectedDraftVersion: null,
              expectedIdentityVersion: 0,
            },
          }
        );
        await expectReject(`forged-prior-${operation}`);
      } finally {
        await revisionCollection.replaceOne({ _id: rev1._id }, rev1);
        await historyCollection.replaceOne({ _id: hist1._id }, hist1);
      }
    }
  });

  it('rejects Astra fresh-review future, extra-row, prior-step and BSON-date forgeries', async function () {
    const brand = identities[0].branding;
    const lifecycle = new DraftServices.RecordDefinitionDraftLifecycle();
    const publication = new PublicationServices.RecordDefinitionPublication();
    const key = 'astrafreshreview';
    try {
      await lifecycle.clone(brand, 'dataset', key, { id: 'b11-admin' });
    } catch {
      // Already exists from a prior run; continue with the persisted identity.
    }
    const ensurePublished = async (expectedActive: number | null) => {
      const current = await globals.RecordType.findOne({ branding: brand, name: key });
      const draft = await lifecycle.get(brand, key);
      if (!draft) return;
      const result = await publication.publish(
        brand,
        key,
        {
          schemaVersion: 1,
          expectedIdentityVersion: current.version,
          expectedDraftVersion: draft.version,
          expectedActiveRevisionNumber: expectedActive,
        },
        { id: 'b11-admin' }
      );
      assert.equal(result.ok, true);
    };
    let fresh = await globals.RecordType.findOne({ branding: brand, name: key });
    if (!fresh || fresh.activeRevisionNumber !== 3) {
      // Publish rev1..rev3 if not already present (idempotent across retries).
      for (let attempt = 0; attempt < 3; attempt++) {
        fresh = await globals.RecordType.findOne({ branding: brand, name: key });
        if (fresh && fresh.activeRevisionNumber === 3) break;
        const expected = !fresh || fresh.activeRevisionNumber == null ? null : fresh.activeRevisionNumber;
        await ensurePublished(expected as number | null);
      }
    }
    fresh = await globals.RecordType.findOne({ branding: brand, name: key });
    assert.equal(fresh.activeRevisionNumber, 3);
    const service = new RecordDefinitionMigrationService();
    const manager = globals.RecordType.getDatastore().manager;
    const historyCollection = manager.collection('recorddefinitionhistory');
    const revisionCollection = manager.collection('recorddefinitionrevision');
    const secret = 'B11-FRESH-SECRET';
    const runCli = () =>
      spawnSync(process.execPath, ['support/integration-testing/record-definition-preflight.cjs'], {
        encoding: 'utf8',
        timeout: 30000,
        env: { ...process.env, RECORD_DEFINITION_PREFLIGHT_MONGO_URL: process.env.RECORD_DEFINITION_TEST_MONGO_URL },
      });
    const expectRejectNative = async (label: string) => {
      const current = await globals.RecordType.findOne({ branding: brand, name: key });
      const revisionCount = await globals.RecordDefinitionRevision.count({});
      const historyCount = await globals.RecordDefinitionHistory.count({});
      const rawCurrent = await manager.collection('recordtype').findOne({ _id: current._id ?? current.id });
      const rawHistorySample = await historyCollection.findOne({ recordType: current.id });
      const indexesBefore = await historyCollection.listIndexes().toArray();
      const errors: string[] = [];
      for (const run of [() => service.preflight(), () => service.migrate()]) {
        await assert.rejects(
          run(),
          error => {
            const message = String(error);
            assert.ok(message.length < 512, label);
            assert.ok(!message.includes(secret), label);
            errors.push(message);
            return true;
          },
          label
        );
      }
      assert.equal(errors[0], errors[1], label);
      const cli = runCli();
      assert.equal(cli.status, 1, `${label}: ${cli.stdout + cli.stderr}`);
      assert.ok((cli.stdout + cli.stderr).length < 1024, label);
      assert.ok(!(cli.stdout + cli.stderr).includes(secret), label);
      assert.equal(await globals.RecordDefinitionRevision.count({}), revisionCount, label);
      assert.equal(await globals.RecordDefinitionHistory.count({}), historyCount, label);
      assert.deepEqual(await globals.RecordType.findOne({ id: current.id }), current, label);
      assert.deepEqual(
        await manager.collection('recordtype').findOne({ _id: current._id ?? current.id }),
        rawCurrent,
        label
      );
      assert.deepEqual(await historyCollection.findOne({ _id: rawHistorySample._id }), rawHistorySample, label);
      assert.deepEqual(await historyCollection.listIndexes().toArray(), indexesBefore, label);
    };
    // Valid future continuation beyond the current version preserves the current
    // state and save gaps; impossible revisions and lifecycle violations fail.
    fresh = await globals.RecordType.findOne({ branding: brand, name: key });
    const baseVersion = fresh.version;
    const futureRetire: any = {
      _id: `rdh_${randomUUID().replace(/-/g, '').slice(0, 32)}`,
      id: `rdh_${randomUUID().replace(/-/g, '').slice(0, 32)}`,
      schemaVersion: 1,
      branding: fresh.branding,
      recordType: fresh.id,
      recordTypeId: fresh.definitionId,
      recordTypeKey: fresh.name,
      operation: 'retire',
      operationId: randomUUID(),
      expectedIdentityVersion: baseVersion,
      resultingIdentityVersion: baseVersion + 1,
      expectedDraftVersion: null,
      expectedActiveRevisionNumber: 3,
      revision: null,
      revisionNumber: null,
      canonicalHash: null,
      source: null,
      occurredAt: new Date(),
      actor: { id: 'b11-admin' },
      note: 'Retired',
      validation: null,
      impact: null,
      changes: [{ path: '/retirement', kind: 'added' }],
      redactions: [],
      truncated: false,
    };
    futureRetire._id = futureRetire.id;
    futureRetire.operationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    futureRetire.id = `rdh_${futureRetire.operationId.replace(/-/g, '')}`;
    futureRetire._id = futureRetire.id;
    const insertedFuture = await historyCollection.insertOne(futureRetire);
    try {
      // Valid BSON Date future passes and CLI matches the service (parity).
      const report = await service.preflight();
      const cliReport = JSON.parse(
        execFileSync(process.execPath, ['support/integration-testing/record-definition-preflight.cjs'], {
          encoding: 'utf8',
          timeout: 30000,
          env: { ...process.env, RECORD_DEFINITION_PREFLIGHT_MONGO_URL: process.env.RECORD_DEFINITION_TEST_MONGO_URL },
        })
      );
      assert.deepEqual(cliReport, report);
      // Impossible future revision fails closed without writes.
      await historyCollection.updateOne({ _id: futureRetire._id }, { $set: { expectedActiveRevisionNumber: 99 } });
      await expectRejectNative('fresh-future-impossible-revision');
      await historyCollection.updateOne({ _id: futureRetire._id }, { $set: { expectedActiveRevisionNumber: 3 } });
      // Future retire-retire lifecycle violation fails closed.
      const secondRetire = {
        ...futureRetire,
        _id: `rdh_${randomUUID().replace(/-/g, '').slice(0, 32)}`,
        id: `rdh_${randomUUID().replace(/-/g, '').slice(0, 32)}`,
        operationId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        expectedIdentityVersion: baseVersion + 1,
        resultingIdentityVersion: baseVersion + 2,
      };
      secondRetire.id = `rdh_${secondRetire.operationId.replace(/-/g, '')}`;
      secondRetire._id = secondRetire.id;
      const insertedSecond = await historyCollection.insertOne(secondRetire);
      try {
        await expectRejectNative('fresh-future-retire-retire');
      } finally {
        await historyCollection.deleteOne({ _id: insertedSecond.insertedId });
      }
      // Extra publication row with missing provenance fails closed.
      const extraPub = await historyCollection.findOne({ recordType: fresh.id, revisionNumber: 1 });
      const forgedExtra: any = {
        ...extraPub,
        _id: `rdh_${randomUUID().replace(/-/g, '').slice(0, 32)}`,
        operationId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        expectedIdentityVersion: baseVersion + 1,
        resultingIdentityVersion: baseVersion + 2,
        source: null,
        occurredAt: { password: secret },
      };
      forgedExtra.id = `rdh_${forgedExtra.operationId.replace(/-/g, '')}`;
      forgedExtra._id = forgedExtra.id;
      delete forgedExtra._id;
      const insertedExtra = await historyCollection.insertOne({ ...forgedExtra, _id: forgedExtra.id });
      try {
        await expectRejectNative('fresh-extra-missing-provenance-object-timestamp');
      } finally {
        await historyCollection.deleteOne({ _id: insertedExtra.insertedId });
      }
      // Malformed BSON date (object timestamp) on the future retire fails closed.
      await historyCollection.updateOne({ _id: futureRetire._id }, { $set: { occurredAt: { password: secret } } });
      await expectRejectNative('fresh-malformed-occurredAt');
      await historyCollection.updateOne({ _id: futureRetire._id }, { $set: { occurredAt: new Date() } });
      // Prior migration step-count binding: forge a migrated legacy note.
      const migratedHist = await historyCollection.findOne({ operation: 'migration' });
      if (migratedHist) {
        const rawNote = migratedHist.note as string;
        const parsedNote = JSON.parse(rawNote);
        const forgedNote = JSON.stringify({
          migration: parsedNote.migration,
          workflowSteps: (parsedNote.workflowSteps as number) + 1,
          warnings: parsedNote.warnings,
        });
        try {
          await historyCollection.updateOne({ _id: migratedHist._id }, { $set: { note: forgedNote } });
          const current = await globals.RecordType.findOne({ branding: brand, name: key });
          const revisionCount = await globals.RecordDefinitionRevision.count({});
          const historyCount = await globals.RecordDefinitionHistory.count({});
          for (const run of [() => service.preflight(), () => service.migrate()]) {
            await assert.rejects(
              run(),
              /invalid-identity-history|conflicting-migration-history|invalid-active-history/
            );
          }
          assert.equal(await globals.RecordDefinitionRevision.count({}), revisionCount);
          assert.equal(await globals.RecordDefinitionHistory.count({}), historyCount);
          assert.deepEqual(await globals.RecordType.findOne({ id: current.id }), current);
          void secret;
        } finally {
          await historyCollection.replaceOne({ _id: migratedHist._id }, migratedHist);
        }
      }
      void revisionCollection;
    } finally {
      await historyCollection.deleteOne({ _id: insertedFuture.insertedId });
    }
  });

  it('rejects forged initial-migration history and strict-actor retire forgeries', async function () {
    const service = new RecordDefinitionMigrationService();
    const manager = globals.RecordType.getDatastore().manager;
    const historyCollection = manager.collection('recorddefinitionhistory');
    const identityCollection = manager.collection('recordtype');
    const stepCollection = manager.collection('workflowstep');
    const secret = 'B11-NEW-SECRET';
    const runCli = () =>
      spawnSync(process.execPath, ['support/integration-testing/record-definition-preflight.cjs'], {
        encoding: 'utf8',
        timeout: 30000,
        env: { ...process.env, RECORD_DEFINITION_PREFLIGHT_MONGO_URL: process.env.RECORD_DEFINITION_TEST_MONGO_URL },
      });
    const expectRejectNative = async (label: string) => {
      const revisionCount = await globals.RecordDefinitionRevision.count({});
      const historyCount = await globals.RecordDefinitionHistory.count({});
      const indexesBefore = await historyCollection.listIndexes().toArray();
      const errors: string[] = [];
      for (const run of [() => service.preflight(), () => service.migrate()]) {
        await assert.rejects(
          run(),
          error => {
            const message = String(error);
            assert.ok(message.length < 1024, label);
            assert.ok(!message.includes(secret), label);
            errors.push(message);
            return true;
          },
          label
        );
      }
      assert.equal(errors[0], errors[1], label);
      const cli = runCli();
      assert.equal(cli.status, 1, `${label}: ${cli.stdout + cli.stderr}`);
      assert.ok((cli.stdout + cli.stderr).length < 2048, label);
      assert.ok(!(cli.stdout + cli.stderr).includes(secret), label);
      assert.equal(await globals.RecordDefinitionRevision.count({}), revisionCount, label);
      assert.equal(await globals.RecordDefinitionHistory.count({}), historyCount, label);
      assert.deepEqual(await historyCollection.listIndexes().toArray(), indexesBefore, label);
    };
    // Initial migration: inactive legacy identity with a forged extra history
    // row (distinct IDs, -2 -> -1, missing provenance, object occurredAt) must
    // fail before any writes/indexes with service/CLI/native parity.
    const brand = identities[0].branding;
    const legacyKey = `initialforged${randomUUID().replace(/-/g, '').slice(0, 8)}`;
    const legacy = await globals.RecordType.create({
      branding: brand,
      name: legacyKey,
      packageType: 'dataset',
    }).fetch();
    const legacyStep = await globals.WorkflowStep.create({
      name: 'draft',
      recordType: legacy.id,
      starting: true,
      config: {
        workflow: { stage: 'draft', stageLabel: 'Draft' },
        form: 'dataset-form',
        authorization: { viewRoles: ['Admin'], editRoles: ['Admin'] },
      },
    }).fetch();
    const forgedInitial: any = {
      _id: `rdh_${'e'.repeat(32)}`,
      id: `rdh_${'e'.repeat(32)}`,
      schemaVersion: 1,
      branding: legacy.branding,
      recordType: legacy.id,
      recordTypeId: 'rti_different',
      recordTypeKey: legacy.name,
      operation: 'publish',
      operationId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      expectedIdentityVersion: -2,
      resultingIdentityVersion: -1,
      expectedDraftVersion: null,
      expectedActiveRevisionNumber: null,
      revision: 'rdr_forged',
      revisionNumber: 1,
      canonicalHash: `sha256:${'0'.repeat(64)}`,
      source: null,
      occurredAt: { password: secret },
      actor: null,
      validation: null,
      impact: null,
      note: '',
      changes: [],
      redactions: [],
      truncated: false,
    };
    const storedLegacy = await identityCollection.findOne({ key: legacy.key });
    assert.ok(storedLegacy);
    for (const relation of [legacy.id, storedLegacy._id]) {
      const insertedInitial = await historyCollection.insertOne({ ...forgedInitial, recordType: relation });
      try {
        const collections = ['recordtype', 'recorddefinitionrevision', 'recorddefinitionhistory'];
        const snapshot = async () =>
          Promise.all(
            collections.map(async name => ({
              name,
              rows: await manager.collection(name).find({}).sort({ _id: 1 }).toArray(),
              indexes: await manager.collection(name).listIndexes().toArray(),
            }))
          );
        const before = await snapshot();
        await expectRejectNative(`initial-forged-history-native-${typeof relation}`);
        assert.deepEqual(await snapshot(), before);
        assert.equal(await globals.RecordDefinitionRevision.count({ recordType: legacy.id }), 0);
      } finally {
        await historyCollection.deleteOne({ _id: insertedInitial.insertedId });
      }
    }
    // Future retire/unretire strict actor: after publication at version 1, a
    // future retire 1 -> 2 with a malformed actor must fail with no writes.
    const lifecycle = new DraftServices.RecordDefinitionDraftLifecycle();
    const publication = new PublicationServices.RecordDefinitionPublication();
    const actorKey = `actorstrict${randomUUID().replace(/-/g, '').slice(0, 8)}`;
    try {
      await lifecycle.clone(brand, 'dataset', actorKey, { id: 'b11-admin' });
    } catch {
      // Already exists; continue.
    }
    const current = await globals.RecordType.findOne({ branding: brand, name: actorKey });
    const draft = await lifecycle.get(brand, actorKey);
    if (draft) {
      const result = await publication.publish(
        brand,
        actorKey,
        {
          schemaVersion: 1,
          expectedIdentityVersion: current.version,
          expectedDraftVersion: draft.version,
          expectedActiveRevisionNumber: null,
        },
        { id: 'b11-admin' }
      );
      assert.equal(result.ok, true);
    }
    const published = await globals.RecordType.findOne({ branding: brand, name: actorKey });
    assert.equal(published.activeRevisionNumber, 1);
    assert.equal(published.version, 1);
    const forgedActor: any = {
      _id: `rdh_${'d'.repeat(32)}`,
      id: `rdh_${'d'.repeat(32)}`,
      schemaVersion: 1,
      branding: published.branding,
      recordType: published.id,
      recordTypeId: published.definitionId,
      recordTypeKey: published.name,
      operation: 'retire',
      operationId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      expectedIdentityVersion: 1,
      resultingIdentityVersion: 2,
      expectedDraftVersion: null,
      expectedActiveRevisionNumber: 1,
      revision: null,
      revisionNumber: null,
      canonicalHash: null,
      source: null,
      occurredAt: new Date(),
      actor: { id: 'admin', displayName: { password: secret }, extra: true },
      note: 'Retired',
      validation: null,
      impact: null,
      changes: [{ path: '/retirement', kind: 'added' }],
      redactions: [],
      truncated: false,
    };
    forgedActor.id = `rdh_${forgedActor.operationId.replace(/-/g, '')}`;
    forgedActor._id = forgedActor.id;
    const insertedActor = await historyCollection.insertOne(forgedActor);
    try {
      await expectRejectNative('future-strict-actor-native');
      // Valid actors stay accepted with service/CLI parity.
      await historyCollection.updateOne(
        { _id: forgedActor._id },
        { $set: { actor: { id: 'b11-admin', displayName: 'Portal administrator' } } }
      );
      writesCheck: {
        const report = await service.preflight();
        const cliReport = JSON.parse(
          execFileSync(process.execPath, ['support/integration-testing/record-definition-preflight.cjs'], {
            encoding: 'utf8',
            timeout: 30000,
            env: {
              ...process.env,
              RECORD_DEFINITION_PREFLIGHT_MONGO_URL: process.env.RECORD_DEFINITION_TEST_MONGO_URL,
            },
          })
        );
        assert.deepEqual(cliReport, report);
        break writesCheck;
      }
      await historyCollection.updateOne(
        { _id: forgedActor._id },
        { $set: { actor: { id: 'admin', displayName: { password: secret }, extra: true } } }
      );
      await expectRejectNative('future-strict-actor-native-restore');
    } finally {
      await historyCollection.deleteOne({ _id: insertedActor.insertedId });
    }
    await globals.WorkflowStep.destroy({ id: legacyStep.id });
    await globals.RecordType.destroy({ id: legacy.id });
    await stepCollection.deleteMany({ recordType: legacy.id });
    await identityCollection.deleteOne({ _id: legacy._id ?? legacy.id });
    await globals.RecordType.destroy({ branding: brand, name: actorKey });
  });

  it('fails Sails startup on unsafe persisted input without recording Umzug completion', async function () {
    await globals.RecordType.create({
      branding: identities[0].branding,
      name: 'unsafe',
      packageType: 'dataset',
      hooks: { onCreate: { pre: [{ function: 'PASSWORD-DO-NOT-LOG' }] } },
    }).fetch();
    const unsafe = await globals.RecordType.findOne({ branding: identities[0].branding, name: 'unsafe' });
    await globals.WorkflowStep.create({
      name: 'draft',
      recordType: unsafe.id,
      starting: true,
      config: {
        workflow: { stage: 'draft', stageLabel: 'Draft' },
        form: 'dataset-form',
        authorization: { viewRoles: ['Admin'], editRoles: ['Admin'] },
      },
    }).fetch();
    await globals.Migration.destroy({ name: RECORD_DEFINITION_MIGRATION_NAME });
    const result = spawnSync(
      process.execPath,
      [
        '-e',
        `
      const app = require('sails');
      const core = require('@researchdatabox/redbox-core');
      const adapter = require('sails-mongo');
      const url = process.env.RECORD_DEFINITION_TEST_MONGO_URL;
      app.lift({ appPath: process.env.B11_GENERATED_APP, port: 15911,
        hooks: { grunt: false }, log: { level: 'silent' }, models: { datastore: 'mongodb', migrate: 'safe' },
        datastores: { mongodb: { adapter, url }, redboxStorage: { adapter, url } },
        bootstrap: function(done) { core.runPendingMigrations(app.config.migrations).then(function() { done(); }, done); }
      }, error => { if (error) { console.error(error.message); process.exit(1); } process.exit(0); });
    `,
      ],
      { encoding: 'utf8', timeout: 30000, env: { ...process.env, B11_GENERATED_APP: globals.sails.config.appPath } }
    );
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.ok(result.stderr.includes('unknown-legacy-action'), result.stderr);
    assert.ok(!(result.stdout + result.stderr).includes('PASSWORD-DO-NOT-LOG'));
    assert.equal(await globals.Migration.count({ name: RECORD_DEFINITION_MIGRATION_NAME }), 0);
  });
});
