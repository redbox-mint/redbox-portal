const assert = require('node:assert/strict');
const { test } = require('node:test');
const { of, firstValueFrom } = require('rxjs');
const { nothingLogger: log } = require('@researchdatabox/sails-ng-common');
const { Services } = require('../../dist/records/WorkflowTriggers');

test('workflow trigger operations resolve names without global services and retain frozen template options', async () => {
  assert.equal(global.sails, undefined);
  const calls = [];
  const operations = new Map([
    [
      'qualification.first',
      (_oid, record) => {
        calls.push('first');
        return of(record);
      },
    ],
    [
      'qualification.second',
      (_oid, record) => {
        calls.push('second');
        return of(record);
      },
    ],
  ]);
  const trigger = new Services.Trigger({
    log,
    translation: { t: key => `translated:${key}`, tInter: key => key },
    records: {
      getMeta: async () => {
        throw new Error('Unexpected record lookup in pure trigger qualification');
      },
      updateMetaInternal: async () => {
        throw new Error('Unexpected record write in pure trigger qualification');
      },
    },
    brand: () => {
      throw new Error('Unexpected brand lookup in pure trigger qualification');
    },
    resolveHook: name => {
      assert(operations.has(name), 'Unregistered named operation');
      return operations.get(name);
    },
  });
  const record = { metadata: { value: 'retained' }, workflow: { stage: 'draft' }, metaMetadata: { form: 'draft' } };
  assert.equal(
    await firstValueFrom(
      trigger.runHooksSync(
        'oid',
        record,
        Object.freeze({
          hooks: Object.freeze([{ function: 'qualification.first' }, { function: 'qualification.second' }]),
        }),
        {}
      )
    ),
    record
  );
  assert.deepEqual(calls, ['first', 'second']);
  calls.length = 0;
  assert.throws(
    () =>
      trigger.runHooksSync(
        'oid',
        record,
        { hooks: [{ function: 'qualification.first' }, { function: 'sails.services.synthetic.unregistered' }] },
        {}
      ),
    /Unregistered named operation/
  );
  assert.equal(calls.length, 0, 'resolve the complete list before executing any operation');
  const options = Object.freeze({ forceRun: true, template: '<% return []; %>' });
  assert.equal(await trigger.validateFieldsUsingTemplate('oid', record, options), record);
  assert.equal(await trigger.validateFieldsUsingTemplate('oid', record, options), record);
  assert.equal(typeof options.template, 'string');
  await assert.rejects(
    trigger.validateFieldsUsingTemplate(
      'oid',
      record,
      Object.freeze({
        forceRun: true,
        template: '<% const errors=[]; addError(errors,"field","label","invalid"); return errors; %>',
      })
    ),
    /Field validation using template failed/
  );
  await firstValueFrom(
    trigger.transitionWorkflow(
      'oid',
      record,
      Object.freeze({
        triggerCondition: 'true',
        targetWorkflowStageName: 'published',
        targetWorkflowStageLabel: 'Published',
        targetForm: 'published',
      })
    )
  );
  assert.equal(record.workflow.stage, 'published');
  assert.equal(record.metaMetadata.form, 'published');
  assert.equal(global.sails, undefined);
  assert(!Object.keys(require.cache).some(file => /[/\\](CoreBase|CoreService|compat[/\\]sails[/\\])/.test(file)));
});
