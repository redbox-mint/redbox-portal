import assert from 'node:assert/strict';

import {
  BUILT_IN_ACTION_IDS,
  LEGACY_RECORD_ACTION_MAPPINGS,
  LegacyRecordActionMigrationError,
  actionRegistrationSource,
  buildActionRegistry,
  migrateLegacyRecordAction,
  registerRedboxActions,
  validateActionPlan,
  type ActionBindingScope,
  type LegacyRecordActionMigration,
} from '../../src/action-registry';
import {
  loadLegacyActionInventory,
  loadLegacyActionMappings,
  loadRepresentativeConfiguration,
  type HookDefinitionFixture,
} from '../fixtures/legacy-record-actions/fixtures';

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

describe('registered legacy record action migration', function () {
  this.timeout(15_000);

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

  it('accounts for every shipped occurrence and explicitly rejects only unsupported random generation', () => {
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

    let migrated = 0;
    let rejectedRandom = 0;
    inventory.actions.forEach((action, actionIndex) => {
      action.occurrences.forEach((occurrence, occurrenceIndex) => {
        const options = occurrence.sourceOptions.presence === 'present' ? occurrence.sourceOptions.value : undefined;
        const definition = { function: action.legacyExpression, ...(options === undefined ? {} : { options }) };
        try {
          const result = migrate(
            definition,
            scope(occurrence.lifecycleMode, occurrence.phase),
            `inventory-${actionIndex}-${occurrenceIndex}`,
            occurrence.order
          );
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
              validation.ok
                ? undefined
                : `${action.legacyExpression}[${occurrenceIndex}]: ${JSON.stringify(validation.issues)}`
            );
          }
          migrated += 1;
        } catch (error) {
          if (!(error instanceof LegacyRecordActionMigrationError)) {
            throw error;
          }
          assert.equal(error.code, 'unsupported-legacy-expression');
          assert.equal(action.legacyExpression, 'sails.services.rdmpservice.runTemplates');
          assert.match(error.migrationGuidance, /random generation is intentionally rejected/);
          rejectedRandom += 1;
        }
      });
    });
    assert.equal(migrated, 30);
    assert.equal(rejectedRandom, 2);
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
      context: 'workflow-transition',
      mode: 'onTransitionWorkflow',
      phase: 'pre',
      scopeId: 'queued-to-published',
    });
    assert.equal(transition.kind, 'automatic-transition');
    if (transition.kind === 'automatic-transition') {
      assert.equal(transition.actionId, 'redbox.core.workflow.automatic-transition');
      assert.equal(transition.id, 'legacy-action');
      assert.equal(transition.mode, 'automatic');
      assert.equal(transition.sourceStage, 'queued');
      assert.equal(transition.priority, 2);
      assert.equal(transition.targetStage, 'published');
      assert.equal(transition.targetStageLabelCheck, 'Published');
      assert.equal(transition.targetFormCheck, 'legacy-action-fixture-1.0-published');
    }

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
