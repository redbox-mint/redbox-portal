import assert from 'node:assert/strict';

import {
  BUILT_IN_ACTION_IDS,
  LEGACY_RECORD_ACTION_MAPPINGS,
  LegacyRecordActionMigrationError,
  actionRegistrationSource,
  buildActionRegistry,
  deriveStableActionBindingId,
  migrateLegacyRecordAction,
  parseActionContext,
  registerRedboxActions,
  validateActionPlan,
  type ActionBindingScope,
  type LegacyRecordActionMigration,
} from '../../src/action-registry';
import {
  compileManagedJsonataExpression,
  evaluateManagedJsonata,
  projectActionParameterContext,
} from '../../src/expression-runtime';
import {
  loadLegacyActionInventory,
  loadLegacyActionMappings,
  loadRepresentativeConfiguration,
  type HookDefinitionFixture,
  type HooksFixture,
  type JsonValue,
} from '../fixtures/legacy-record-actions/fixtures';

const { recordtype: shippedRecordTypes } = require('../../../redbox-hook-dev/src/config/recordtype') as {
  recordtype: Record<string, { hooks?: HooksFixture }>;
};
const { rdmpActionPlan } = require('../../../redbox-hook-dev/src/config/rdmp-actions') as {
  rdmpActionPlan: import('../../src/action-registry').ActionPlan;
};
const { lifecycleRecordType } = require('../../../redbox-hook-dev/src/playwright/scenarios/lifecycle') as {
  lifecycleRecordType: (id: string) => Partial<import('../../src/config/recordtype.config').RecordTypeDefinition>;
};

function scope(mode: string, phase: string): ActionBindingScope {
  if (mode === 'onTransitionWorkflow') {
    return {
      context: 'workflow-transition',
      mode: 'onTransitionWorkflow',
      phase: phase === 'pre' || phase === 'postSync' ? phase : 'post',
      scopeId: 'legacy-transition',
    };
  }
  if (mode !== 'onCreate' && mode !== 'onUpdate' && mode !== 'onDelete') {
    throw new Error('Unexpected fixture mode.');
  }
  return {
    context: 'record-lifecycle',
    mode,
    phase: phase === 'pre' || phase === 'postSync' ? phase : 'post',
  };
}

function migrate(
  definition: HookDefinitionFixture,
  bindingScope: ActionBindingScope,
  stableKey = 'legacy-action',
  order = 2
): LegacyRecordActionMigration {
  return migrateLegacyRecordAction({
    schemaVersion: 1,
    recordTypeKey: 'legacy-action-fixture',
    scope: bindingScope,
    stableKey,
    order,
    sourcePath: '$.hooks[0]',
    definition,
  });
}

function bindingMigration(result: LegacyRecordActionMigration) {
  assert.equal(result.kind, 'action-bindings');
  if (result.kind !== 'action-bindings') {
    throw new Error('Expected action bindings.');
  }
  return result;
}

interface ShippedDefinition {
  definition: HookDefinitionFixture;
  bindingScope: ActionBindingScope;
  order: number;
}

function collectDefinitions(
  value: JsonValue,
  bindingScope: ActionBindingScope,
  definitions: ShippedDefinition[]
): void {
  if (Array.isArray(value)) {
    value.forEach((item, order) => {
      if (item !== null && typeof item === 'object' && !Array.isArray(item) && typeof item.function === 'string') {
        definitions.push({ definition: item as unknown as HookDefinitionFixture, bindingScope, order });
      }
      collectDefinitions(item, bindingScope, definitions);
    });
    return;
  }
  if (value !== null && typeof value === 'object') {
    Object.values(value).forEach(child => collectDefinitions(child, bindingScope, definitions));
  }
}

function shippedDefinitions(): ShippedDefinition[] {
  const definitions: ShippedDefinition[] = [];
  for (const recordType of Object.values(shippedRecordTypes)) {
    for (const [mode, phases] of Object.entries(recordType.hooks ?? {})) {
      for (const [phase, configured] of Object.entries(phases ?? {})) {
        collectDefinitions(configured as JsonValue, scope(mode, phase), definitions);
      }
    }
  }
  return definitions;
}

describe('registered legacy record action migration', function () {
  this.timeout(15_000);

  it('validates browser lifecycle write-back plans and derives the server value from the candidate title', async () => {
    const registry = buildActionRegistry([
      actionRegistrationSource('@researchdatabox/redbox-core', 'actions/index', registerRedboxActions),
    ]);
    for (const id of ['lifecycle-server-writeback', 'lifecycle-edit-during-save']) {
      const recordType = lifecycleRecordType(id);
      assert.equal(recordType.hooks, undefined);
      const plan = recordType.actionPlan;
      assert.ok(plan);
      const validation = validateActionPlan(registry, plan);
      assert.equal(validation.ok, true, validation.ok ? undefined : JSON.stringify(validation.issues));
      assert.deepEqual(plan.bindings.map(binding => binding.scope.mode), ['onCreate', 'onUpdate']);
      for (const binding of plan.bindings) {
        assert.equal(
          binding.id,
          deriveStableActionBindingId({
            recordTypeKey: plan.recordTypeKey,
            actionId: binding.actionId,
            contractVersion: binding.contractVersion,
            stableKey: binding.stableKey,
            scope: binding.scope,
          })
        );
        assert.equal(binding.actionId, BUILT_IN_ACTION_IDS.applyTemplates);
        assert.deepEqual(binding.parameters.field, { kind: 'literal', value: 'metadata.serverValue' });
        const value = binding.parameters.value;
        if (value?.kind !== 'jsonata') assert.fail('Expected managed server write-back.');
        const context = projectActionParameterContext(
          parseActionContext({
            schemaVersion: 1,
            executionId: 'browser-write-back',
            correlationId: 'browser-write-back',
            timestamp: '2026-09-30T00:00:00Z',
            brandId: 'default',
            recordTypeKey: plan.recordTypeKey,
            scope: binding.scope,
            actor: null,
            record: { candidate: { metadata: { title: 'Changed title' } } },
            priorOutputs: [],
          })
        );
        const result = await evaluateManagedJsonata(compileManagedJsonataExpression(value.expression), context, {
          timeoutMs: 1_000,
        });
        assert.equal(result, 'Server: Changed title');
      }
    }
  });

  it('validates the migrated development RDMP plan and preserves six-digit server write-back values', async () => {
    const registry = buildActionRegistry([
      actionRegistrationSource('@researchdatabox/redbox-core', 'actions/index', registerRedboxActions),
    ]);
    const validation = validateActionPlan(registry, rdmpActionPlan);
    assert.equal(validation.ok, true, validation.ok ? undefined : JSON.stringify(validation.issues));
    assert.equal(rdmpActionPlan.bindings.length, 5);
    for (const binding of rdmpActionPlan.bindings) {
      assert.equal(
        binding.id,
        deriveStableActionBindingId({
          recordTypeKey: 'rdmp',
          actionId: binding.actionId,
          contractVersion: binding.contractVersion,
          stableKey: binding.stableKey,
          scope: binding.scope,
        })
      );
      if (binding.actionId !== BUILT_IN_ACTION_IDS.applyTemplates) continue;
      const value = binding.parameters.value;
      assert.equal(value?.kind, 'jsonata');
      if (value?.kind !== 'jsonata') assert.fail('Expected managed server write-back.');
      const context = projectActionParameterContext(
        parseActionContext({
          schemaVersion: 1,
          executionId: 'server-write-back',
          correlationId: 'server-write-back',
          timestamp: '2026-09-30T00:00:00Z',
          brandId: 'default',
          recordTypeKey: 'rdmp',
          scope: binding.scope,
          actor: null,
          record: { candidate: { metadata: {} } },
          priorOutputs: [],
        })
      );
      const result = await evaluateManagedJsonata(compileManagedJsonataExpression(value.expression), context, {
        timeoutMs: 1_000,
      });
      assert.equal(typeof result, 'string');
      assert.match(result as string, /^test-\d{6}$/);
    }
  });

  it('continues to reject unsupported legacy random templates', () => {
    assert.throws(
      () =>
        migrate(
          {
            function: 'sails.services.rdmpservice.runTemplates',
            options: {
              templates: [
                { field: 'metadata.server_sync_test_value', template: 'test-<%= _.random(100000, 999999) %>' },
              ],
            },
          },
          { context: 'record-lifecycle', mode: 'onCreate', phase: 'pre' }
        ),
      (error: Error) =>
        error instanceof LegacyRecordActionMigrationError && error.code === 'unsupported-legacy-expression'
    );
  });

  it('matches all thirteen governed mappings and registers exactly the eleven executable identities', () => {
    const governed = loadLegacyActionMappings().mappings;
    assert.equal(LEGACY_RECORD_ACTION_MAPPINGS.length, 13);
    assert.deepEqual(
      LEGACY_RECORD_ACTION_MAPPINGS.map(entry => ({
        legacyExpression: entry.legacyExpression,
        actionId: entry.actionId,
        contractVersion: entry.contractVersion,
        migrationTargetKind: entry.migrationTargetKind,
      })),
      governed.map(entry => ({
        legacyExpression: entry.legacyExpression,
        actionId: entry.actionId,
        contractVersion: entry.contractVersion,
        migrationTargetKind: entry.migrationTargetKind,
      }))
    );

    const registeredIds = registerRedboxActions()
      .map(descriptor => descriptor.id)
      .sort();
    const expectedIds = LEGACY_RECORD_ACTION_MAPPINGS.filter(entry => entry.registered)
      .map(entry => entry.actionId)
      .sort();
    assert.deepEqual(registeredIds, expectedIds);
    assert.equal(registeredIds.length, 11);
    assert.equal(registeredIds.includes('redbox.core.workflow.automatic-transition'), false);
    assert.equal(registeredIds.includes('redbox.core.sequence.run'), false);
    assert.equal(registeredIds.includes(BUILT_IN_ACTION_IDS.dispatchQueuedAction), true);
  });

  it('accounts for every shipped legacy occurrence', () => {
    const inventory = loadLegacyActionInventory();
    const registry = buildActionRegistry([
      actionRegistrationSource('@researchdatabox/redbox-core', 'actions/index', registerRedboxActions),
    ]);
    const counts = new Map(
      inventory.actions.map(action => [action.legacyExpression, action.occurrences.length] as const)
    );
    for (const governed of LEGACY_RECORD_ACTION_MAPPINGS) {
      assert.equal(governed.shippedOccurrenceCount, counts.get(governed.legacyExpression) ?? 0);
    }

    const definitions = shippedDefinitions();
    let migrated = 0;
    let rejectedRandom = 0;
    definitions.forEach(({ definition, bindingScope, order }, index) => {
      try {
        const result = migrate(definition, bindingScope, `source-${index}`, order);
        assert.equal(Object.isFrozen(result), true);
        if (result.kind === 'action-bindings') {
          const validation = validateActionPlan(registry, {
            schemaVersion: 1,
            recordTypeKey: 'legacy-action-fixture',
            bindings: result.bindings,
          });
          assert.equal(
            validation.ok,
            true,
            validation.ok ? undefined : `${definition.function}[${index}]: ${JSON.stringify(validation.issues)}`
          );
        }
        migrated += 1;
      } catch (error) {
        if (!(error instanceof LegacyRecordActionMigrationError)) {
          throw error;
        }
        assert.equal(error.code, 'unsupported-legacy-expression');
        assert.equal(definition.function, 'sails.services.rdmpservice.runTemplates');
        assert.match(error.migrationGuidance, /random generation is intentionally rejected/);
        rejectedRandom += 1;
      }
    });
    assert.equal(definitions.length, 26);
    assert.equal(migrated, 26);
    assert.equal(rejectedRandom, 0);
  });

  it('preserves shipped date write-back formatting with a managed expression', async () => {
    const definition = shippedRecordTypes['pw-07-date-writeback']?.hooks?.onUpdate?.pre?.[0];
    assert.ok(definition);
    const result = bindingMigration(
      migrate(definition, { context: 'record-lifecycle', mode: 'onUpdate', phase: 'pre' })
    );
    const value = result.bindings[0]?.parameters.value;
    assert.equal(value?.kind, 'jsonata');
    if (value?.kind !== 'jsonata') {
      assert.fail('Expected a managed date expression.');
    }
    const expression = compileManagedJsonataExpression(value.expression);
    for (const [metadata, expected] of [
      [{ date: '2026-09-30T12:34:56.123+09:30' }, '2026-09-30T03:04:56.123+00:00'],
      [{ date: '2026-09-30' }, '2026-09-30T00:00:00.000+00:00'],
      [{ date: '' }, ''],
      [{}, ''],
    ] as const) {
      const context = projectActionParameterContext(
        parseActionContext({
          schemaVersion: 1,
          executionId: 'date-writeback',
          correlationId: 'date-writeback',
          requestId: 'date-writeback',
          timestamp: '2026-09-30T00:00:00Z',
          brandId: 'default',
          recordTypeKey: 'pw-07-date-writeback',
          scope: { context: 'record-lifecycle', mode: 'onUpdate', phase: 'pre' },
          actor: null,
          record: { candidate: { metadata } },
          priorOutputs: [],
        })
      );
      assert.equal(await evaluateManagedJsonata(expression, context, { timeoutMs: 1_000 }), expected);
    }
  });

  it('converts supported Lodash value expressions and Handlebars paths without mutating input', () => {
    const definition: HookDefinitionFixture = {
      function: 'sails.services.rdmpservice.runTemplates',
      options: {
        parseObject: false,
        templates: [
          {
            field: 'metadata.fullName',
            template: "<%= _.get(record, 'metadata.givenName', '') + ' ' + _.get(record, 'metadata.surname', '') %>",
          },
          {
            field: 'metadata.l_fullName',
            template: "<%= _.toLower(_.get(record, 'metadata.fullName', '')) %>",
          },
        ],
      },
    };
    const before = JSON.stringify(definition);
    const result = bindingMigration(
      migrate(definition, { context: 'record-lifecycle', mode: 'onCreate', phase: 'pre' })
    );
    assert.equal(JSON.stringify(definition), before);
    assert.equal(result.bindings.length, 2);
    assert.deepEqual(
      result.bindings.map(binding => binding.order),
      [2000, 2001]
    );
    assert.equal(result.bindings[0]?.parameters.value?.kind, 'jsonata');
    assert.equal(result.bindings[1]?.parameters.value?.kind, 'jsonata');
    assert.equal(Object.isFrozen(result.bindings), true);
    assert.equal(Object.isFrozen(result.bindings[0]), true);

    const email = bindingMigration(
      migrate(
        {
          function: 'sails.services.emailservice.sendRecordNotification',
          options: {
            forceRun: true,
            to: '{{record.metadata.ownerEmail}},{{join (pluck record.metadata.creators "email") ","}}',
            subject: 'Created {{record.metadata.title}}',
            template: 'publicationReview',
          },
        },
        { context: 'record-lifecycle', mode: 'onCreate', phase: 'post' }
      )
    );
    const to = email.bindings[0]?.parameters.to;
    assert.deepEqual(to, {
      kind: 'handlebars',
      template: '{{record.candidate.metadata.ownerEmail}},{{emailList record.candidate.metadata.creators}}',
    });
  });

  it('flattens email callbacks and sequences with explicit ordered dependencies', () => {
    const fixture = loadRepresentativeConfiguration();
    const hooks = fixture.recordtype['legacy-action-fixture']?.hooks;
    const emailDefinition = hooks?.onCreate?.post?.[0];
    const sequenceDefinition = hooks?.onUpdate?.pre?.[0];
    assert.ok(emailDefinition);
    assert.ok(sequenceDefinition);

    const email = bindingMigration(
      migrate(emailDefinition, { context: 'record-lifecycle', mode: 'onCreate', phase: 'post' })
    );
    assert.equal(email.bindings.length, 2);
    assert.deepEqual(email.bindings[1]?.dependencies, [
      {
        bindingId: email.bindings[0]?.id,
        condition: 'output-equals',
        field: 'sent',
        value: true,
      },
    ]);

    const sequence = bindingMigration(
      migrate(sequenceDefinition, { context: 'record-lifecycle', mode: 'onUpdate', phase: 'pre' })
    );
    assert.deepEqual(
      sequence.bindings.map(binding => binding.actionId),
      [BUILT_IN_ACTION_IDS.stripUserPermissions, BUILT_IN_ACTION_IDS.restoreUserPermissions]
    );
    assert.deepEqual(sequence.bindings[1]?.dependencies, [
      { bindingId: sequence.bindings[0]?.id, condition: 'success' },
    ]);
    assert.equal(
      sequence.bindings.some(binding => binding.actionId === 'redbox.core.sequence.run'),
      false
    );
  });

  it('keeps automatic transition first-class and queue dispatch free of executable strings', () => {
    const fixture = loadRepresentativeConfiguration();
    const hooks = fixture.recordtype['legacy-action-fixture']?.hooks;
    const transitionDefinition = hooks?.onTransitionWorkflow?.pre?.[0];
    const queueDefinition = hooks?.onDelete?.post?.[0];
    assert.ok(transitionDefinition);
    assert.ok(queueDefinition);

    const transition = migrate(transitionDefinition, {
      context: 'record-lifecycle',
      mode: 'onCreate',
      phase: 'pre',
    });
    assert.equal(transition.kind, 'automatic-transition');
    if (transition.kind === 'automatic-transition') {
      assert.equal(transition.actionId, 'redbox.core.workflow.automatic-transition');
      assert.equal(transition.id, 'legacy-action');
      assert.equal(transition.mode, 'automatic');
      assert.equal(transition.event, 'create');
      assert.equal(transition.sourceStage, 'queued');
      assert.equal(transition.priority, 2);
      assert.equal(transition.targetStage, 'published');
      assert.equal(transition.targetStageLabelCheck, 'Published');
      assert.equal(transition.targetFormCheck, 'legacy-action-fixture-1.0-published');
    }

    const updateTransition = migrate(transitionDefinition, {
      context: 'record-lifecycle',
      mode: 'onUpdate',
      phase: 'pre',
    });
    assert.equal(updateTransition.kind, 'automatic-transition');
    if (updateTransition.kind === 'automatic-transition') {
      assert.equal(updateTransition.event, 'update');
    }
    assert.throws(
      () =>
        migrate(transitionDefinition, {
          context: 'workflow-transition',
          mode: 'onTransitionWorkflow',
          phase: 'pre',
          scopeId: 'queued-to-published',
        }),
      LegacyRecordActionMigrationError
    );

    const queued = bindingMigration(
      migrate(queueDefinition, { context: 'record-lifecycle', mode: 'onDelete', phase: 'post' })
    );
    assert.equal(queued.bindings.length, 1);
    assert.equal(queued.bindings[0]?.actionId, BUILT_IN_ACTION_IDS.dispatchQueuedAction);
    assert.deepEqual(queued.bindings[0]?.parameters.queuedActionId, {
      kind: 'literal',
      value: BUILT_IN_ACTION_IDS.updateDoi,
    });
    assert.equal(Object.hasOwn(queued.bindings[0]?.parameters ?? {}, 'jobName'), false);
    assert.equal(JSON.stringify(queued).includes('sails.services'), false);
    assert.equal(JSON.stringify(queued).includes('function'), false);
  });

  it('preserves each documented forceRun rule and gives a present trigger condition precedence', () => {
    const notification = bindingMigration(
      migrate(
        {
          function: 'sails.services.recordsservice.updateNotificationLog',
          options: {
            forceRun: false,
            triggerCondition: "<%= record.workflow.stage == 'draft' %>",
            flagName: 'notification.state',
            flagVal: 'draft',
          },
        },
        { context: 'record-lifecycle', mode: 'onCreate', phase: 'pre' }
      )
    );
    assert.deepEqual(notification.bindings[0]?.parameters.condition, {
      kind: 'jsonata',
      expression: 'record.candidate.workflow.stage = "draft"',
    });

    const forcedOff = bindingMigration(
      migrate(
        {
          function: 'sails.services.rdmpservice.restoreUserBasedPermissions',
          options: { forceRun: false, triggerCondition: '' },
        },
        { context: 'record-lifecycle', mode: 'onUpdate', phase: 'pre' }
      )
    );
    assert.deepEqual(forcedOff.bindings[0]?.parameters.condition, { kind: 'jsonata', expression: 'false' });

    const unconditional = bindingMigration(
      migrate(
        {
          function: 'sails.services.rdmpservice.checkTotalSizeOfFilesInRecord',
          options: { forceRun: false, triggerCondition: '' },
        },
        { context: 'record-lifecycle', mode: 'onUpdate', phase: 'pre' }
      )
    );
    assert.deepEqual(unconditional.bindings[0]?.parameters.condition, { kind: 'jsonata', expression: 'true' });
  });

  it('migrates only inert scalar email options and ignores legacy queue job selectors', () => {
    const safeEmail = bindingMigration(
      migrate(
        {
          function: 'sails.services.emailservice.sendRecordNotification',
          options: {
            forceRun: true,
            to: 'owner@example.test',
            subject: 'Review',
            template: 'publicationReview',
            otherSendOptions: { replyTo: 'reply@example.test', priority: 'high' },
          },
        },
        { context: 'record-lifecycle', mode: 'onCreate', phase: 'post' }
      )
    );
    assert.deepEqual(safeEmail.bindings[0]?.parameters.replyTo, {
      kind: 'literal',
      value: 'reply@example.test',
    });
    assert.deepEqual(safeEmail.bindings[0]?.parameters.priority, { kind: 'literal', value: 'high' });
    assert.equal(Object.hasOwn(safeEmail.bindings[0]?.parameters ?? {}, 'otherSendOptions'), false);

    for (const otherSendOptions of [
      { attachments: [{ path: '/etc/passwd' }] },
      { attachments: [{ href: 'https://attacker.example/file' }] },
      { alternatives: [{ content: 'hostile' }] },
      { raw: 'hostile raw message' },
      { replyTo: { address: 'nested@example.test' } },
    ]) {
      assert.throws(
        () =>
          migrate(
            {
              function: 'sails.services.emailservice.sendRecordNotification',
              options: {
                forceRun: true,
                to: 'owner@example.test',
                subject: 'Review',
                template: 'publicationReview',
                otherSendOptions,
              },
            },
            { context: 'record-lifecycle', mode: 'onCreate', phase: 'post' }
          ),
        (error: Error) => error instanceof LegacyRecordActionMigrationError
      );
    }

    const queue = bindingMigration(
      migrate(
        {
          function: 'sails.services.rdmpservice.queueTriggerCall',
          options: {
            forceRun: true,
            jobName: 'AttackerService-Execute',
            triggerConfiguration: {
              function: 'sails.services.doiservice.updateDoiTriggerSync',
              options: { forceRun: true, event: 'delete' },
            },
          },
        },
        { context: 'record-lifecycle', mode: 'onDelete', phase: 'post' }
      )
    );
    assert.equal(Object.hasOwn(queue.bindings[0]?.parameters ?? {}, 'jobName'), false);
    assert.equal(JSON.stringify(queue).includes('AttackerService-Execute'), false);
    const validation = validateActionPlan(
      buildActionRegistry([
        actionRegistrationSource('@researchdatabox/redbox-core', 'actions/index', registerRedboxActions),
      ]),
      { schemaVersion: 1, recordTypeKey: 'legacy-action-fixture', bindings: queue.bindings }
    );
    assert.equal(validation.ok, true);
  });

  it('rejects prototype, secret, traversal, and unrelated managed notification paths during migration', () => {
    for (const [flagName, logName] of [
      ['constructor.prototype.polluted', 'notification.log'],
      ['__proto__.polluted', 'notification.log'],
      ['notification.state', 'notification.log.secretToken'],
      ['authorization.edit', 'notification.log'],
      ['notification.state', 'metadata.audit'],
      ['notification.state', 'notification.log..published'],
    ]) {
      assert.throws(
        () =>
          migrate(
            {
              function: 'sails.services.recordsservice.updateNotificationLog',
              options: {
                forceRun: true,
                flagName,
                flagVal: 'draft',
                logName,
              },
            },
            { context: 'record-lifecycle', mode: 'onCreate', phase: 'pre' }
          ),
        (error: Error) => error instanceof LegacyRecordActionMigrationError && error.code === 'invalid-legacy-parameter'
      );
    }
  });

  it('rejects accessors before reading them and never reflects an unknown expression into its safe error', () => {
    let getterInvoked = false;
    const request = {
      schemaVersion: 1,
      recordTypeKey: 'rdmp',
      scope: { context: 'record-lifecycle', mode: 'onCreate', phase: 'pre' },
      stableKey: 'accessor',
      order: 0,
      sourcePath: '$.hooks[0]',
      definition: { function: 'sails.services.rdmpservice.restoreUserBasedPermissions', options: {} },
    };
    Object.defineProperty(request, 'definition', {
      enumerable: true,
      get: () => {
        getterInvoked = true;
        return {};
      },
    });
    assert.throws(() => migrateLegacyRecordAction(request), LegacyRecordActionMigrationError);
    assert.equal(getterInvoked, false);

    const hostileExpression = 'sails.services.attacker.execute-private-secret';
    let captured: LegacyRecordActionMigrationError | undefined;
    assert.throws(
      () =>
        migrateLegacyRecordAction({
          schemaVersion: 1,
          recordTypeKey: 'rdmp',
          scope: { context: 'record-lifecycle', mode: 'onCreate', phase: 'pre' },
          stableKey: 'unknown',
          order: 0,
          sourcePath: '$.hooks[0]',
          definition: { function: hostileExpression, options: {} },
        }),
      (error: Error) => {
        if (error instanceof LegacyRecordActionMigrationError) {
          captured = error;
          return true;
        }
        return false;
      }
    );
    assert.ok(captured);
    assert.equal(JSON.stringify(captured).includes(hostileExpression), false);
    assert.equal(captured.legacyExpression, undefined);
  });

  it('fails closed on malformed children, unknown expressions, unsupported options, and unsafe paths', () => {
    const invalidCases = [
      {
        request: {
          schemaVersion: 1,
          recordTypeKey: 'rdmp',
          scope: { context: 'record-lifecycle', mode: 'onCreate', phase: 'pre' },
          stableKey: 'unknown',
          order: 0,
          sourcePath: '$.hooks[0]',
          definition: { function: 'sails.services.attacker.execute', options: {} },
        },
        code: 'unknown-legacy-action',
      },
      {
        request: {
          schemaVersion: 1,
          recordTypeKey: 'rdmp',
          scope: { context: 'record-lifecycle', mode: 'onUpdate', phase: 'pre' },
          stableKey: 'sequence',
          order: 0,
          sourcePath: '$.hooks[0]',
          definition: { function: 'sails.services.triggerservice.runHooksSync', options: { hooks: [{}] } },
        },
        code: 'invalid-legacy-parameter',
      },
      {
        request: {
          schemaVersion: 1,
          recordTypeKey: 'rdmp',
          scope: { context: 'record-lifecycle', mode: 'onCreate', phase: 'post' },
          stableKey: 'email',
          order: 0,
          sourcePath: '$.hooks[0]',
          definition: {
            function: 'sails.services.emailservice.sendRecordNotification',
            options: { forceRun: true, to: 'a@example.test', subject: 'Hi', template: 'review', password: 'x' },
          },
        },
        code: 'unsupported-legacy-parameter',
      },
      {
        request: {
          schemaVersion: 1,
          recordTypeKey: 'rdmp',
          scope: { context: 'record-lifecycle', mode: 'onCreate', phase: 'pre' },
          stableKey: 'bad',
          order: 0,
          sourcePath: '$.hooks\nsecret',
          definition: { function: 'sails.services.rdmpservice.restoreUserBasedPermissions', options: {} },
        },
        code: 'invalid-legacy-action',
      },
    ];

    for (const testCase of invalidCases) {
      assert.throws(
        () => migrateLegacyRecordAction(testCase.request),
        (error: Error) =>
          error instanceof LegacyRecordActionMigrationError &&
          error.code === testCase.code &&
          error.message === 'Legacy record action cannot be migrated safely.'
      );
    }
  });
});
