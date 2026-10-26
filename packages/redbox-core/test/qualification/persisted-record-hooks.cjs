const assert = require('node:assert/strict');
const { test } = require('node:test');
const { MongoClient } = require('mongodb');
const { nothingLogger: log } = require('@researchdatabox/sails-ng-common');
const { loadPortalConfiguration } = require('../../dist/configuration/portal');
const { prepareSelectedPersistenceIndexes } = require('../../dist/persistence/maintenance');
const runtime = require('../../dist/persistence/runtime');
const { migrateRecordHooks, convertBuiltinRecordHooks } = require('../../dist/recordTypes');
const { firstValueFrom } = require('rxjs');
const { RecordTriggers } = require('../../dist/records/RecordTriggers');
const { portalRecordOperations } = require('../../dist/application/portal/recordOperations');

test('v5 persisted hooks validate before effects and resume idempotently after partial Mongo writes', async () => {
  assert.equal(process.version, 'v26.11.1');
  const url = process.env.SR_RECORD_HOOK_MONGO_URL;
  assert(url, 'SR_RECORD_HOOK_MONGO_URL is required');
  assert.equal(new URL(url).pathname, '/sr_p7_record_hooks');
  const config = await loadPortalConfiguration({
    env: {
      REDBOX_MONGODB_URL: url,
      REDBOX_STORAGE_MONGODB_URL: url,
      REDBOX_SESSION_SECRET: 'record-hook-qualification-only-secret-32',
    },
  });
  const owner = { config, log };
  const native = await new MongoClient(url).connect();
  try {
    assert.equal((await native.db().listCollections().toArray()).length, 0);
    assert.equal((await prepareSelectedPersistenceIndexes(owner, 'ensure')).ready, true);
    await runtime.initializeBrandingPersistence(owner);
    await runtime.initializeReferencePersistence(owner);
    const brands = runtime.getBrandingRepository(owner);
    const types = runtime.getReferenceRepositories(owner).recordTypes;
    const first = await brands.createBrand({ name: 'first' });
    const second = await brands.createBrand({ name: 'second' });
    const template = 'sails.services.opaque.secret-value';
    const legacy = {
      onCreate: {
        pre: [
          { function: 'sails.services.rdmpservice.assignPermissions', options: { recordCreatorPermissions: 'edit' } },
          {
            function: 'sails.services.rdmpservice.runTemplates',
            options: { templates: [{ field: 'metadata.copiedTitle', template: '<%= record.metadata.title %>' }] },
          },
        ],
        post: [
          {
            function: 'sails.services.triggerservice.runHooksSync',
            options: {
              template,
              hooks: [
                { function: 'sails.services.emailservice.sendRecordNotification', options: { subject: 'retained' } },
              ],
            },
          },
        ],
      },
      onUpdate: {
        post: [
          { function: 'sails.services.figshareservice.wakeFigshareRecord' },
          {
            function: 'sails.services.rdmpservice.queueTriggerCall',
            options: {
              triggerConfiguration: {
                function: 'sails.services.pdfservice.createPDF',
                options: { filename: '<%= record.metadata.title %>' },
              },
            },
          },
        ],
      },
    };
    const rowA = await types.createDefinition({ name: 'a', branding: first.id, packageType: 'a', hooks: legacy });
    const rowB = await types.createDefinition({ name: 'b', branding: first.id, packageType: 'b', hooks: legacy });
    const rowC = await types.createDefinition({ name: 'c', branding: second.id, packageType: 'c', hooks: legacy });
    const invalid = await types.createDefinition({
      name: 'invalid',
      branding: second.id,
      packageType: 'bad',
      hooks: { onCreate: { pre: [{ function: 'sails.services.unknown.secret-value' }] } },
    });
    const wrapped = {
      listForBrand: (...args) => types.listForBrand(...args),
      reviseDefinition: async (...args) => {
        writes++;
        if (failAt === writes) throw new Error('qualified interrupted migration body');
        return types.reviseDefinition(...args);
      },
    };
    let writes = 0,
      failAt = 0;
    await assert.rejects(migrateRecordHooks({ brands, types: wrapped }), error => {
      assert(error.message.includes(invalid.id));
      assert(!error.message.includes('secret-value'));
      return true;
    });
    assert.equal(writes, 0, 'invalid declarations in another brand prevent all effects');
    await types.reviseDefinition(invalid.id, { hooks: {} });
    failAt = 2;
    await assert.rejects(migrateRecordHooks({ brands, types: wrapped }), /qualified interrupted/);
    assert.equal(writes, 2);
    const partiallyConverted = await types.listForBrand(first.id);
    assert.equal(
      partiallyConverted.filter(row => row.hooks.onCreate.pre[0].function === 'record.assignPermissions').length,
      1
    );
    failAt = 0;
    writes = 0;
    const retry = await migrateRecordHooks({ brands, types: wrapped });
    assert.deepEqual(retry, { inspected: 4, changed: 2 });
    assert.equal(writes, 2);
    assert.deepEqual(await migrateRecordHooks({ brands, types: wrapped }), { inspected: 4, changed: 0 });
    assert.equal(writes, 2, 'idempotent retry performs no writes');
    const converted = convertBuiltinRecordHooks(legacy);
    for (const row of [rowA, rowB, rowC]) {
      const stored = await types.findByName(row.branding, row.name);
      assert.deepEqual(stored.hooks, converted);
      assert.equal(stored.hooks.onUpdate.post[1].options.triggerConfiguration.function, 'pdf.create');
      assert.equal(stored.hooks.onCreate.post[0].options.template, template);
    }
    const unused = () => {
      throw new Error('Unexpected unconfigured provider operation');
    };
    const triggers = new RecordTriggers({ config: { maxUploadSize: 100 }, log, translate: key => key });
    const operations = portalRecordOperations({
      triggers: () => triggers,
      workflows: unused,
      records: unused,
      email: unused,
      doi: unused,
      raid: unused,
      oni: unused,
      figshare: unused,
    });
    const stored = await types.findByName(first.id, 'a');
    const hook = stored.hooks.onCreate.pre[1];
    const record = { metaMetadata: { brandId: first.id }, metadata: { title: 'Stored v5 title' } };
    const invoke = operations.resolveHook(hook.function);
    assert.equal(await firstValueFrom(invoke(rowA.id, record, hook.options, {})), record);
    assert.equal(record.metadata.copiedTitle, record.metadata.title);
    assert.throws(() => operations.resolveHook('sails.services.rdmpservice.runTemplates'), /Unregistered/);
    assert.throws(() => operations.resolveHook('toString'), /Unregistered/);
    for (const malformed of [
      [],
      '',
      { onCreate: null },
      { onCreate: { pre: {} } },
      { onCreate: { pre: [null] } },
      { onCreate: { pre: [{ function: 'record.assignPermissions', options: [] }] } },
      { onCreate: { pre: [{ function: 'record.assignPermissions', execution: { timeoutMs: -1 } }] } },
    ])
      assert.throws(() => convertBuiltinRecordHooks(malformed));
    await runtime.cleanupPersistence(owner);
    assert.equal(
      (await native.db().collection('recordtype').findOne({ name: 'a' })).hooks.onCreate.pre[0].function,
      'record.assignPermissions'
    );
    assert.equal(global.sails, undefined);
    assert(
      !Object.keys(require.cache).some(file =>
        /[/\\](compat[/\\]sails|CoreService|CoreBase|services[/\\]index)/.test(file)
      )
    );
    console.log(JSON.stringify({ brands: 2, inspected: 4, converted: 3, retryWrites: 2, invalidPlanWrites: 0 }));
  } finally {
    await runtime.cleanupPersistence(owner);
    await native.db().dropDatabase();
    await native.close();
  }
});
