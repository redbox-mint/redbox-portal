const assert = require('node:assert/strict');
const { test } = require('node:test');
const { convertBuiltinRecordHooks, convertBuiltinRecordTypeHooks } = require('../../dist/recordTypes');
const { RecordCreateAuthorization } = require('../../dist/records/RecordCreateAuthorization');

test('explicit built-in hook conversion preserves nested options and authoritative creator permissions', () => {
  const authorization = new RecordCreateAuthorization({}); // Only the pure declaration projection is exercised.
  const source = Object.freeze({
    onCreate: Object.freeze({
      pre: Object.freeze([
        Object.freeze({
          function: 'sails.services.rdmpservice.assignPermissions',
          options: Object.freeze({ recordCreatorPermissions: 'view&edit' }),
        }),
        Object.freeze({
          function: 'sails.services.triggerservice.runHooksSync',
          options: Object.freeze({
            hooks: Object.freeze([
              { function: 'sails.services.emailservice.sendRecordNotification', options: { subject: 'unchanged' } },
            ]),
            template: 'sails.services.opaque.template.literal',
          }),
        }),
        Object.freeze({ function: 'institution.approvedOperation', execution: Object.freeze({ completion: 'await' }) }),
      ]),
    }),
  });
  const converted = convertBuiltinRecordHooks(source);
  assert.equal(converted.onCreate.pre[0].function, 'record.assignPermissions');
  assert.equal(converted.onCreate.pre[1].function, 'workflow.runHooksSync');
  assert.equal(converted.onCreate.pre[1].options.hooks[0].function, 'email.sendRecordNotification');
  assert.equal(converted.onCreate.pre[1].options.template, source.onCreate.pre[1].options.template);
  assert.equal(converted.onCreate.pre[2].function, 'institution.approvedOperation');
  assert.equal(source.onCreate.pre[0].function, 'sails.services.rdmpservice.assignPermissions');
  assert.deepEqual(convertBuiltinRecordHooks(converted), converted);
  assert.equal(authorization.hasConfiguredRecordCreatorEditPermission({ hooks: source }), false);
  assert.equal(authorization.hasConfiguredRecordCreatorEditPermission({ hooks: converted }), true);
  assert.equal(
    authorization.hasConfiguredRecordCreatorEditPermission({
      hooks: {
        onCreate: {
          pre: [
            {
              function: 'record.assignPermissions',
              options: { recordCreatorPermissions: 'edit', triggerCondition: 'conditional' },
            },
          ],
        },
      },
    }),
    false
  );
  assert.throws(
    () => convertBuiltinRecordHooks({ onCreate: { pre: [{ function: 'sails.services.private.unknown' }] } }),
    /unsupported record hook expression/
  );
  assert.throws(() => convertBuiltinRecordHooks({ onCreate: { privatePhase: [] } }), /Unsupported record hook phase/);
  assert.throws(() => convertBuiltinRecordHooks({ privateMode: {} }), /Unsupported record hook mode/);
  const definitions = convertBuiltinRecordTypeHooks({ example: { searchable: true, hooks: source } });
  assert.equal(definitions.example.searchable, true);
  assert.deepEqual(definitions.example.hooks, converted);
});

test('bundled v6 declaration and producer contain only named operations', () => {
  const declaration = require('redbox-hook-dev/extension').registerRedboxExtension();
  const { recordtype } = require('../../../redbox-hook-dev/dist/config/recordtype');
  let count = 0;
  function inspect(hooks) {
    for (const mode of Object.values(hooks ?? {}))
      for (const phase of Object.values(mode))
        for (const hook of phase) {
          assert(!hook.function.startsWith('sails.'));
          count++;
          if (hook.options?.hooks) inspect({ nested: { hooks: hook.options.hooks } });
        }
  }
  for (const value of Object.values(declaration.config.recordtype)) inspect(value.hooks);
  assert(count > 20);
  for (const value of Object.values(recordtype)) inspect(value.hooks);
  assert(JSON.stringify(recordtype).includes('record.assignPermissions'));
  assert(!JSON.stringify(recordtype).includes('sails.services.'));
  assert.equal(global.sails, undefined);
  console.log(JSON.stringify({ convertedHookDeclarations: count }));
});

test('queued PDF declarations convert explicit trigger configuration without interpreting templates', () => {
  const source = {
    onCreate: {
      post: [
        {
          function: 'sails.services.rdmpservice.queueTriggerCall',
          options: {
            triggerConfiguration: {
              function: 'sails.services.pdfservice.createPDF',
              options: { filename: '<%= record.metadata.title %>' },
            },
            template: 'sails.services.pdfservice.createPDF',
          },
        },
      ],
    },
  };
  const converted = convertBuiltinRecordHooks(source);
  assert.equal(converted.onCreate.post[0].options.triggerConfiguration.function, 'pdf.create');
  assert.equal(converted.onCreate.post[0].options.template, source.onCreate.post[0].options.template);
  assert.deepEqual(convertBuiltinRecordHooks(converted), converted);
  assert.throws(
    () =>
      convertBuiltinRecordHooks({
        onUpdate: {
          post: [
            {
              function: 'record.queueTriggerCall',
              options: { triggerConfiguration: { function: 'sails.services.unknown.private' } },
            },
          ],
        },
      }),
    /unsupported record hook expression/
  );
});
