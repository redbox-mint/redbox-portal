import { strict as assert } from 'node:assert';
import { transformLegacyRecordDefinition } from '../src/record-workflow-administration/legacyDatabaseMigration';
import { RecordDefinitionMigrationService } from '../src/services/RecordDefinitionMigrationService';
import { seedAuthority } from './helpers/record-definition-seed-fixture';
import database from './fixtures/legacy-record-actions/b11-database.json';
import historicalDatabase from './fixtures/legacy-record-actions/representative-database.json';

function fixture(brand = 'brand-a'): any {
  return {
    recordType: { id: `${brand}-type`, branding: brand, key: `${brand}_dataset`, name: 'dataset', searchable: true },
    workflowSteps: [
      {
        id: `${brand}-draft`,
        name: 'draft',
        recordType: `${brand}-type`,
        starting: true,
        config: {
          workflow: { stage: 'draft', stageLabel: `${brand} Draft` },
          form: 'dataset-form',
          authorization: { viewRoles: ['Admin'], editRoles: ['Admin'] },
        },
      },
    ],
  };
}

describe('B11 shared legacy database transformation', () => {
  for (const [field, value] of [
    ['searchCore', {}],
    ['packageType', []],
    ['searchable', {}],
  ]) {
    it(`rejects malformed recognized RecordType field ${field}`, () => {
      const input = fixture();
      input.recordType[field as string] = value;
      assert.throws(() => transformLegacyRecordDefinition(input));
    });
  }
  for (const [field, value] of [
    ['hidden', {}],
    ['hidden', true],
    ['hidden', null],
    ['form', []],
    ['id', {}],
  ]) {
    it(`rejects malformed recognized WorkflowStep field ${field}`, () => {
      const input = fixture();
      input.workflowSteps[0][field as string] = value;
      assert.throws(() => transformLegacyRecordDefinition(input));
    });
  }

  it('preserves transition hooks on already-explicit A10 edges', () => {
    const row: any = structuredClone(database.recordTypes[1]);
    row.automaticTransitions = [
      {
        schemaVersion: 1,
        id: 'explicit-edge',
        mode: 'automatic',
        event: 'update',
        sourceStage: 'draft',
        targetStage: 'published',
        priority: 0,
        condition: 'record.candidate.workflow.stage = "draft"',
      },
    ];
    row.hooks = {
      onTransitionWorkflow: {
        postSync: [
          { function: 'sails.services.rdmpservice.addWorkspaceToRecord', options: { rdmpOidField: 'rdmpOid' } },
        ],
      },
    };
    const result = transformLegacyRecordDefinition({
      recordType: row,
      workflowSteps: database.workflowSteps.filter(step => step.recordType === row.id),
    });
    assert.equal(result.definition.actionBindings.length, 3);
    const automatic = result.definition.transitions.find(transition => transition.mode === 'automatic')!;
    assert.ok(
      result.definition.actionBindings.some(
        binding => binding.scope.context === 'workflow-transition' && binding.scope.scopeId === automatic.id
      )
    );
  });
  it('bounds graph expansion before constructing the implicit legacy edges', () => {
    const value = fixture();
    value.workflowSteps = Array.from({ length: 24 }, (_, index) => ({
      ...value.workflowSteps[0],
      name: `stage-${index}`,
      starting: index === 0,
      config: { ...value.workflowSteps[0].config, workflow: { stage: `stage-${index}`, stageLabel: 'Stage' } },
    }));
    assert.throws(() => transformLegacyRecordDefinition(value), /expanded-transition-limit/);
  });

  it('does not include secret-bearing labels or input rows in a preflight report', async () => {
    const value = fixture();
    value.workflowSteps[0].config.workflow.stageLabel = 'SECRET-PASSWORD-SENTINEL';
    const report = await new RecordDefinitionMigrationService(
      {
        revisionAt: async () => null,
        activeRevision: async () => null,
        history: async () => null,
        recordTypes: async () => [value.recordType],
        workflowSteps: async () => value.workflowSteps,
      },
      seedAuthority
    ).preflight();
    assert.ok(!JSON.stringify(report).includes('SECRET-PASSWORD-SENTINEL'));
    assert.ok(JSON.stringify(report).length < 2048);
    assert.match(report.entries[0].canonicalHash, /^sha256:[a-f0-9]{64}$/);
  });

  it('rejects interleaved automatic mutation instead of changing action ordering', () => {
    const value = structuredClone(database);
    value.recordTypes[0].hooks.onUpdate!.pre.reverse();
    assert.throws(
      () =>
        transformLegacyRecordDefinition({
          recordType: value.recordTypes[0],
          workflowSteps: value.workflowSteps.filter(step => step.recordType === value.recordTypes[0].id),
        }),
      /interleaved-automatic-transition/
    );
  });
  it('migrates representative callbacks, conditions and automatic transitions independently per brand', async () => {
    const transformed = database.recordTypes.map(recordType =>
      transformLegacyRecordDefinition({
        recordType,
        workflowSteps: database.workflowSteps.filter(step => step.recordType === recordType.id),
      })
    );
    assert.equal(transformed[0].definition.actionBindings.length, 4);
    assert.equal(transformed[1].definition.actionBindings.length, 0);
    const automatic = transformed[0].definition.transitions.find(transition => transition.mode === 'automatic');
    assert.equal(automatic?.mode, 'automatic');
    assert.equal(automatic?.condition, 'record.candidate.workflow.stage = "draft"');
    const callback = transformed[0].definition.actionBindings.find(binding =>
      binding.dependencies?.some(dependency => dependency.condition === 'output-equals')
    );
    assert.ok(callback);
    assert.ok(!JSON.stringify(transformed).includes('sails.services'));
    const reader = {
      revisionAt: async () => null,
      activeRevision: async () => null,
      history: async () => null,
      recordTypes: async () => database.recordTypes,
      workflowSteps: async (id: string) => database.workflowSteps.filter(step => step.recordType === id),
    };
    assert.equal((await new RecordDefinitionMigrationService(reader, seedAuthority).preflight()).identities, 2);
  });

  it('keeps the unsafe historical A01 default fixture rejected and its independent secondary brand transformable', () => {
    const [a, b] = historicalDatabase.recordTypes;
    assert.throws(() =>
      transformLegacyRecordDefinition({
        recordType: a,
        workflowSteps: historicalDatabase.workflowSteps.filter(step => step.recordType === a.id),
      })
    );
    assert.equal(
      transformLegacyRecordDefinition({
        recordType: b,
        workflowSteps: historicalDatabase.workflowSteps.filter(step => step.recordType === b.id),
      }).brandId,
      'brand-secondary'
    );
  });
  it('uses each persisted brand independently and preserves inputs', async () => {
    const a = fixture();
    const b = fixture('brand-b');
    b.recordType.searchable = false;
    const before = structuredClone([a, b]);
    const reader = {
      revisionAt: async () => null,
      activeRevision: async () => null,
      history: async () => null,
      recordTypes: async () => [a.recordType, b.recordType],
      workflowSteps: async (id: string) =>
        [...a.workflowSteps, ...b.workflowSteps].filter(step => step.recordType === id),
    };
    const service = new RecordDefinitionMigrationService(reader, seedAuthority);
    const report = await service.preflight();
    assert.equal(report.identities, 2);
    assert.notEqual(report.entries[0].canonicalHash, report.entries[1].canonicalHash);
    assert.deepEqual([a, b], before);
    assert.equal(transformLegacyRecordDefinition(b).definition.recordType.searchable, false);
  });

  it('flattens sequence bindings in order without retaining function strings', () => {
    const value = fixture();
    value.recordType.hooks = {
      onUpdate: {
        pre: [
          {
            function: 'sails.services.triggerservice.runHooksSync',
            options: {
              hooks: [
                { function: 'sails.services.rdmpservice.stripUserBasedPermissions', options: { forceRun: true } },
                { function: 'sails.services.rdmpservice.restoreUserBasedPermissions', options: { forceRun: true } },
              ],
            },
          },
        ],
      },
    };
    const result = transformLegacyRecordDefinition(value);
    const bindings = result.definition.actionBindings;
    assert.equal(bindings.length, 2);
    assert.ok(bindings[0].order < bindings[1].order);
    assert.deepEqual(bindings[1].dependencies, [{ bindingId: bindings[0].id, condition: 'success' }]);
    assert.ok(!JSON.stringify(result).includes('sails.services'));
    assert.ok(!JSON.stringify(result).includes('"function"'));
  });

  for (const defect of [
    'proxy',
    'getter',
    'function',
    'symbol',
    'prototype',
    'cycle',
    'oversized',
    'foreign-step',
    'expression',
    'parameter',
  ]) {
    it(`rejects ${defect} without executing or leaking source values`, () => {
      let calls = 0;
      const value = fixture();
      const secret = 'PASSWORD-SENTINEL-DO-NOT-LOG';
      if (defect === 'proxy')
        value.recordType = new Proxy(value.recordType, {
          ownKeys() {
            calls++;
            throw Error(secret);
          },
        });
      if (defect === 'getter')
        Object.defineProperty(value.recordType, 'hooks', {
          enumerable: true,
          get() {
            calls++;
            throw Error(secret);
          },
        });
      if (defect === 'function')
        value.recordType.hooks = () => {
          calls++;
        };
      if (defect === 'symbol') value.recordType[Symbol(secret)] = true;
      if (defect === 'prototype') Object.setPrototypeOf(value.recordType, { poison: secret });
      if (defect === 'cycle') value.recordType.hooks = value;
      if (defect === 'oversized') value.recordType.name = secret.repeat(4000);
      if (defect === 'foreign-step') value.workflowSteps[0].recordType = secret;
      if (defect === 'expression') value.recordType.hooks = { onCreate: { pre: [{ function: secret }] } };
      if (defect === 'parameter')
        value.recordType.hooks = {
          onUpdate: {
            pre: [{ function: 'sails.services.rdmpservice.stripUserBasedPermissions', options: { password: secret } }],
          },
        };
      assert.throws(
        () => transformLegacyRecordDefinition(value),
        error => !JSON.stringify(error).includes(secret) && !String(error).includes(secret)
      );
      assert.equal(calls, 0);
    });
  }
});
