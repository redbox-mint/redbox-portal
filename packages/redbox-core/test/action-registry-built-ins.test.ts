import assert from 'node:assert/strict';
import { of, throwError } from 'rxjs';

import {
  ACTION_CONTEXT_SCHEMA_VERSION,
  ACTION_PLAN_SCHEMA_VERSION,
  BUILT_IN_ACTION_IDS,
  actionRegistrationSource,
  buildActionRegistry,
  createActionSecretProvider,
  migrateLegacyRecordAction,
  parseActionContext,
  parseActionDefinition,
  parseActionResult,
  registerRedboxActions,
  validateActionPlan,
  validateActionResultForDefinition,
  type ActionBinding,
  type ActionBindingScope,
  type ActionContext,
  type ActionJsonObject,
  type ActionParameterValue,
  type ActionParameterValues,
  type ActionRegistrationDescriptor,
  type ActionResult,
  type ActionSecretSlotIdentity,
  type ActionSecretStorage,
} from '../src/action-registry';
import { createActionExecutionOperation } from '../src/action-execution';
import { createRegisteredActionExecutor } from '../src/action-execution/registered-executor';
import { consumeRegisteredRecordActionQueueJob } from '../src/action-execution/registered-queue-consumer';
import { parseRegisteredRecordActionQueuePayload } from '../src/action-registry/registeredActionQueue';
import { REGISTERED_RECORD_ACTION_JOB_NAME, agendaQueue } from '../src/config/agendaQueue.config';
import { ActionRegistry as PublicActionRegistry } from '../src';

class EmptySecretStorage implements ActionSecretStorage {
  async replace(_slot: ActionSecretSlotIdentity, _value: string): Promise<void> {}
  async clear(_slot: ActionSecretSlotIdentity): Promise<void> {}
  async resolve(_slot: ActionSecretSlotIdentity): Promise<string | undefined> {
    return undefined;
  }
  async isConfigured(_slot: ActionSecretSlotIdentity): Promise<boolean> {
    return false;
  }
}

function literal(value: string | number | boolean | null | ActionJsonObject | string[]): ActionParameterValue {
  return { kind: 'literal', value };
}

const PARAMETERS: Readonly<Record<string, ActionParameterValues>> = Object.freeze({
  [BUILT_IN_ACTION_IDS.applyTemplates]: {
    field: literal('metadata.generated'),
    value: literal('managed-value'),
    parseObject: literal(false),
  },
  [BUILT_IN_ACTION_IDS.assignPermissions]: {
    condition: literal(true),
    emailProperty: literal('email'),
    editContributorProperties: literal(['metadata.owner']),
    viewContributorProperties: literal(['metadata.viewer']),
    recordCreatorPermissions: literal('view&edit'),
  },
  [BUILT_IN_ACTION_IDS.validateTotalAttachmentSize]: {
    condition: literal(true),
    maxUploadSizeMessageCode: literal('attachment-size'),
    replaceOrAppend: literal('append'),
  },
  [BUILT_IN_ACTION_IDS.updateNotificationState]: {
    condition: literal(true),
    name: literal('Update notification'),
    flagName: literal('notification.state'),
    flagVal: literal('draft'),
    logName: literal('notification.log'),
    saveRecord: literal(false),
  },
  [BUILT_IN_ACTION_IDS.stripUserPermissions]: {
    condition: literal(true),
    permissionTypes: literal('edit'),
  },
  [BUILT_IN_ACTION_IDS.restoreUserPermissions]: { condition: literal(true) },
  [BUILT_IN_ACTION_IDS.sendRecordEmail]: {
    condition: literal(true),
    to: literal('owner@example.test'),
    subject: literal('Managed subject'),
    template: literal('publicationReview'),
    format: literal('html'),
    replyTo: literal('reply@example.test'),
    priority: literal('normal'),
  },
  [BUILT_IN_ACTION_IDS.publishDoi]: {
    condition: literal(true),
    event: literal('publish'),
    profile: literal('default'),
  },
  [BUILT_IN_ACTION_IDS.updateDoi]: {
    condition: literal(true),
    event: literal('update'),
    profile: literal('default'),
  },
  [BUILT_IN_ACTION_IDS.linkWorkspace]: { rdmpOidField: literal('rdmpOid') },
  [BUILT_IN_ACTION_IDS.dispatchQueuedAction]: {
    condition: literal(true),
    queuedActionId: literal(BUILT_IN_ACTION_IDS.updateDoi),
    queuedContractVersion: literal(1),
    queuedParameters: literal({
      condition: { kind: 'jsonata', expression: 'true' },
      event: { kind: 'literal', value: 'delete' },
    }),
  },
});

function descriptorFor(actionId: string): ActionRegistrationDescriptor {
  const descriptor = registerRedboxActions().find(candidate => candidate.id === actionId);
  if (descriptor === undefined) {
    throw new Error(`Missing built-in descriptor ${actionId}.`);
  }
  return descriptor;
}

function scopeFor(descriptor: ActionRegistrationDescriptor): ActionBindingScope {
  if (descriptor.id === BUILT_IN_ACTION_IDS.dispatchQueuedAction) {
    return { context: 'record-lifecycle', mode: 'onDelete', phase: 'post' };
  }
  const context = descriptor.contexts[0];
  const mode = descriptor.modes[0];
  const phase = descriptor.phases[0];
  if (context === undefined || mode === undefined || phase === undefined) {
    throw new Error('Built-in descriptor has no executable scope.');
  }
  if (context === 'workflow-transition') {
    return { context, mode: 'onTransitionWorkflow', phase, scopeId: 'managed-transition' };
  }
  if (context === 'queued-record-action') {
    return { context, mode, phase, scopeId: 'managed-queue' };
  }
  if (mode === 'onTransitionWorkflow') {
    throw new Error('Lifecycle descriptor has an invalid transition mode.');
  }
  return { context: 'record-lifecycle', mode, phase };
}

function actionContext(
  bindingScope: ActionBindingScope,
  candidate: ActionJsonObject,
  executionId = 'built-in-execution'
): ActionContext {
  return parseActionContext({
    schemaVersion: ACTION_CONTEXT_SCHEMA_VERSION,
    executionId,
    correlationId: 'built-in-correlation',
    timestamp: '2026-08-28T00:00:00.000Z',
    brandId: 'default',
    recordTypeKey: 'legacy-action-fixture',
    scope: bindingScope,
    actor: { id: 'actor-1', username: 'tester', roles: ['Admin'] },
    record: { oid: 'record-1', candidate },
    priorOutputs: [],
  });
}

function installSuccessfulServices(): {
  readonly queuedJobNames: string[];
  readonly queuedPayloads: ActionJsonObject[];
} {
  const queuedJobNames: string[] = [];
  const queuedPayloads: ActionJsonObject[] = [];
  sails.config.emailnotification = {
    defaults: { from: 'server@example.test', format: 'html', cc: '', bcc: '' },
  } as never;
  sails.config.services = { email: { disabled: false } } as never;
  sails.config.queue = { serviceName: 'managedqueue' } as never;
  sails.services = {
    rdmpservice: {
      assignPermissions: (_oid: string, record: ActionJsonObject) => {
        record.authorization = { edit: ['actor-1'] };
        return of(record);
      },
      checkTotalSizeOfFilesInRecord: () => ({ ok: true }),
      stripUserBasedPermissions: (_oid: string, record: ActionJsonObject) => {
        record.authorization = { edit: [] };
        return of(record);
      },
      restoreUserBasedPermissions: (_oid: string, record: ActionJsonObject) => {
        record.authorization = { edit: ['actor-1'] };
        return of(record);
      },
    },
    recordsservice: {
      updateNotificationLog: (_oid: string, record: ActionJsonObject) => {
        record.notification = { state: 'draft' };
        return Promise.resolve(record);
      },
    },
    emailservice: {
      buildFromTemplate: () => Promise.resolve({ status: 200, body: '<p>Managed body</p>' }),
      sendMessage: () => Promise.resolve({ success: true }),
    },
    doiservice: {
      publishDoiTrigger: () => Promise.resolve({ published: true }),
      updateDoiTriggerSync: () => Promise.resolve({ updated: true }),
    },
    workspaceservice: {
      addWorkspaceToRecord: () => Promise.resolve({ linked: true }),
    },
    managedqueue: {
      now: (jobName: string, payload: ActionJsonObject) => {
        queuedJobNames.push(jobName);
        queuedPayloads.push(payload);
        return Promise.resolve({ queued: true });
      },
    },
  } as never;
  return { queuedJobNames, queuedPayloads };
}

async function executeDirect(
  descriptor: ActionRegistrationDescriptor,
  parameters: Readonly<ActionParameterValues>,
  candidate: ActionJsonObject = {
    redboxOid: 'record-1',
    metadata: { title: 'Original', rdmpOid: 'rdmp-1' },
    workflow: { stage: 'draft' },
  }
): Promise<ActionResult> {
  return descriptor.handler(actionContext(scopeFor(descriptor), candidate), parameters);
}

function coreRegistry() {
  return buildActionRegistry([
    actionRegistrationSource('@researchdatabox/redbox-core', 'actions/index', registerRedboxActions),
  ]);
}

describe('built-in registered record actions', function () {
  this.timeout(15_000);

  beforeEach(() => {
    installSuccessfulServices();
  });

  it('returns immutable, schema-valid success results for every registered identity without caller mutation', async () => {
    const callerCandidate: ActionJsonObject = {
      redboxOid: 'record-1',
      metadata: { title: 'Original', rdmpOid: 'rdmp-1' },
      workflow: { stage: 'draft' },
    };
    const before = JSON.stringify(callerCandidate);
    for (const descriptor of registerRedboxActions()) {
      const parameters = PARAMETERS[descriptor.id];
      assert.ok(parameters, descriptor.id);
      const result = await executeDirect(descriptor, parameters, callerCandidate);
      const parsed = parseActionResult(result);
      const definition = parseActionDefinition({
        ...descriptor,
        provenance: { packageName: '@researchdatabox/redbox-core', moduleName: 'actions/index' },
      });
      assert.doesNotThrow(() => validateActionResultForDefinition(parsed, definition, scopeFor(descriptor)));
      assert.equal(Object.isFrozen(result), true, descriptor.id);
      if (result.kind === 'replace') {
        assert.equal(Object.isFrozen(result.candidate), true, descriptor.id);
      }
      if (result.kind !== 'reject' && result.output !== undefined) {
        assert.equal(Object.isFrozen(result.output), true, descriptor.id);
        assert.equal(Object.isFrozen(result.output.fields), true, descriptor.id);
      }
      assert.equal(Object.isFrozen(descriptor), true, descriptor.id);
      assert.equal(Object.isFrozen(descriptor.parameterSchema.parameters), true, descriptor.id);
    }
    assert.equal(JSON.stringify(callerCandidate), before);
  });

  it('characterizes the successful transformation and side-effect boundaries for all eleven actions', async () => {
    const services = installSuccessfulServices();
    const results = new Map<string, ActionResult>();
    for (const descriptor of registerRedboxActions()) {
      const parameters = PARAMETERS[descriptor.id];
      assert.ok(parameters);
      results.set(descriptor.id, await executeDirect(descriptor, parameters));
    }

    const applied = results.get(BUILT_IN_ACTION_IDS.applyTemplates);
    assert.equal(applied?.kind, 'replace');
    assert.deepEqual(applied?.kind === 'replace' ? applied.candidate.metadata : undefined, {
      title: 'Original',
      rdmpOid: 'rdmp-1',
      generated: 'managed-value',
    });
    assert.equal(results.get(BUILT_IN_ACTION_IDS.validateTotalAttachmentSize)?.kind, 'no-change');
    assert.deepEqual(results.get(BUILT_IN_ACTION_IDS.sendRecordEmail)?.output?.fields, { sent: true });
    assert.deepEqual(results.get(BUILT_IN_ACTION_IDS.linkWorkspace)?.output?.fields.linked, true);
    assert.deepEqual(results.get(BUILT_IN_ACTION_IDS.dispatchQueuedAction)?.output?.fields, {
      queued: true,
      queuedActionId: BUILT_IN_ACTION_IDS.updateDoi,
    });
    assert.deepEqual(services.queuedJobNames, [REGISTERED_RECORD_ACTION_JOB_NAME]);
    assert.equal(
      agendaQueue.jobs[REGISTERED_RECORD_ACTION_JOB_NAME]?.fnName,
      'rdmpservice.registeredRecordActionSubscriptionHandler'
    );
    assert.equal(services.queuedPayloads.length, 1);
    const serializedQueuePayload = JSON.stringify(services.queuedPayloads[0]);
    assert.equal(serializedQueuePayload.includes('sails.services'), false);
    assert.equal(serializedQueuePayload.includes('function'), false);
    assert.equal(serializedQueuePayload.includes('registered-record-action'), true);
    assert.deepEqual(services.queuedPayloads[0]?.context, {
      schemaVersion: ACTION_CONTEXT_SCHEMA_VERSION,
      executionId: 'built-in-execution',
      correlationId: 'built-in-correlation',
      timestamp: '2026-08-28T00:00:00.000Z',
      brandId: 'default',
      recordTypeKey: 'legacy-action-fixture',
      scope: { context: 'queued-record-action', mode: 'onDelete', phase: 'post' },
      actor: null,
      record: {
        oid: 'record-1',
        candidate: { redboxOid: 'record-1', revision: 0 },
      },
      priorOutputs: [],
    });
  });

  it('fails parameter validation for every built-in action before invoking its primary behavior', async () => {
    for (const descriptor of registerRedboxActions()) {
      await assert.rejects(
        async () => descriptor.handler(actionContext(scopeFor(descriptor), { metadata: {} }), {}),
        (error: Error) => error.name === 'ActionValidationFailure',
        descriptor.id
      );
    }
  });

  it('contains runtime failures for every service-backed identity and never retries side effects', async () => {
    const runtimeCases = [
      [BUILT_IN_ACTION_IDS.assignPermissions, 'rdmpservice', 'assignPermissions'],
      [BUILT_IN_ACTION_IDS.validateTotalAttachmentSize, 'rdmpservice', 'checkTotalSizeOfFilesInRecord'],
      [BUILT_IN_ACTION_IDS.updateNotificationState, 'recordsservice', 'updateNotificationLog'],
      [BUILT_IN_ACTION_IDS.stripUserPermissions, 'rdmpservice', 'stripUserBasedPermissions'],
      [BUILT_IN_ACTION_IDS.restoreUserPermissions, 'rdmpservice', 'restoreUserBasedPermissions'],
      [BUILT_IN_ACTION_IDS.sendRecordEmail, 'emailservice', 'buildFromTemplate'],
      [BUILT_IN_ACTION_IDS.publishDoi, 'doiservice', 'publishDoiTrigger'],
      [BUILT_IN_ACTION_IDS.updateDoi, 'doiservice', 'updateDoiTriggerSync'],
      [BUILT_IN_ACTION_IDS.linkWorkspace, 'workspaceservice', 'addWorkspaceToRecord'],
      [BUILT_IN_ACTION_IDS.dispatchQueuedAction, 'managedqueue', 'now'],
    ] as const;
    for (const [actionId, serviceName, methodName] of runtimeCases) {
      installSuccessfulServices();
      const service = sails.services[serviceName] as Record<string, (...values: never[]) => never>;
      service[methodName] = () => {
        throw new Error('private-runtime-detail');
      };
      const descriptor = descriptorFor(actionId);
      const parameters = PARAMETERS[actionId];
      assert.ok(parameters);
      await assert.rejects(async () => executeDirect(descriptor, parameters), /private-runtime-detail/, actionId);
    }

    const retryAllowed = new Set([
      BUILT_IN_ACTION_IDS.applyTemplates,
      BUILT_IN_ACTION_IDS.assignPermissions,
      BUILT_IN_ACTION_IDS.stripUserPermissions,
      BUILT_IN_ACTION_IDS.restoreUserPermissions,
    ]);
    for (const descriptor of registerRedboxActions()) {
      assert.equal(descriptor.executionPolicy.retry.allowed, retryAllowed.has(descriptor.id), descriptor.id);
    }
  });

  it('validates parseObject and service result shapes rather than accepting malformed replacements or outputs', async () => {
    const apply = descriptorFor(BUILT_IN_ACTION_IDS.applyTemplates);
    await assert.rejects(
      async () =>
        executeDirect(apply, {
          field: literal('metadata.generated'),
          value: literal('{bad json'),
          parseObject: literal(true),
        }),
      (error: Error) => error.name === 'ActionValidationFailure'
    );
    await assert.rejects(
      async () =>
        executeDirect(apply, {
          field: literal('metadata.__proto__.polluted'),
          value: literal('unsafe'),
          parseObject: literal(false),
        }),
      (error: Error) => error.name === 'ActionValidationFailure'
    );
    await assert.rejects(
      async () =>
        executeDirect(
          descriptorFor(BUILT_IN_ACTION_IDS.linkWorkspace),
          { rdmpOidField: literal('constructor.prototype') },
          { redboxOid: 'workspace-1', metadata: { rdmpOid: 'rdmp-1' } }
        ),
      (error: Error) => error.name === 'ActionValidationFailure'
    );

    installSuccessfulServices();
    sails.services.emailservice.sendMessage = () => Promise.resolve({ success: 'yes' }) as never;
    await assert.rejects(
      async () =>
        executeDirect(
          descriptorFor(BUILT_IN_ACTION_IDS.sendRecordEmail),
          PARAMETERS[BUILT_IN_ACTION_IDS.sendRecordEmail]!
        ),
      (error: Error) => error.name === 'ActionValidationFailure'
    );

    installSuccessfulServices();
    let emailBuildInvocations = 0;
    sails.services.emailservice.buildFromTemplate = (() => {
      emailBuildInvocations += 1;
      return Promise.resolve({ status: 200, body: 'unused' });
    }) as never;
    const secretSentinel = 'email-option-secret-must-not-serialize';
    await assert.rejects(
      async () =>
        executeDirect(descriptorFor(BUILT_IN_ACTION_IDS.sendRecordEmail), {
          ...PARAMETERS[BUILT_IN_ACTION_IDS.sendRecordEmail],
          otherSendOptions: literal({ auth: { password: secretSentinel } }),
        }),
      (error: Error) => error.name === 'ActionValidationFailure' && !JSON.stringify(error).includes(secretSentinel)
    );
    assert.equal(emailBuildInvocations, 0);

    for (const hostileOptions of [
      { attachments: [{ path: '/etc/passwd' }] },
      { attachments: [{ href: 'https://attacker.example/secret' }] },
      { raw: 'hostile raw message' },
      { alternatives: [{ path: '/etc/shadow' }] },
    ]) {
      installSuccessfulServices();
      let buildCalls = 0;
      let sendCalls = 0;
      sails.services.emailservice.buildFromTemplate = (() => {
        buildCalls += 1;
        return Promise.resolve({ status: 200, body: 'unused' });
      }) as never;
      sails.services.emailservice.sendMessage = (() => {
        sendCalls += 1;
        return Promise.resolve({ success: true });
      }) as never;
      await assert.rejects(
        async () =>
          executeDirect(descriptorFor(BUILT_IN_ACTION_IDS.sendRecordEmail), {
            ...PARAMETERS[BUILT_IN_ACTION_IDS.sendRecordEmail],
            otherSendOptions: literal(hostileOptions as ActionJsonObject),
          }),
        (error: Error) => error.name === 'ActionValidationFailure'
      );
      assert.equal(buildCalls, 0);
      assert.equal(sendCalls, 0);
    }

    installSuccessfulServices();
    sails.services.rdmpservice.checkTotalSizeOfFilesInRecord = () =>
      throwError(() => new Error('observable-validation-failure')) as never;
    await assert.rejects(
      async () =>
        executeDirect(
          descriptorFor(BUILT_IN_ACTION_IDS.validateTotalAttachmentSize),
          PARAMETERS[BUILT_IN_ACTION_IDS.validateTotalAttachmentSize]!
        ),
      /observable-validation-failure/
    );

    installSuccessfulServices();
    const queueDescriptor = descriptorFor(BUILT_IN_ACTION_IDS.dispatchQueuedAction);
    const queueParameters = PARAMETERS[BUILT_IN_ACTION_IDS.dispatchQueuedAction];
    assert.ok(queueParameters);
    await assert.rejects(
      async () =>
        executeDirect(queueDescriptor, {
          ...queueParameters,
          queuedActionId: literal('org.example.missing'),
        }),
      (error: Error) => error.name === 'ActionValidationFailure'
    );
    await assert.rejects(
      async () =>
        executeDirect(queueDescriptor, {
          ...queueParameters,
          queuedContractVersion: literal(2),
        }),
      (error: Error) => error.name === 'ActionValidationFailure'
    );
    await assert.rejects(
      async () =>
        executeDirect(queueDescriptor, {
          ...queueParameters,
          queuedActionId: literal(BUILT_IN_ACTION_IDS.dispatchQueuedAction),
        }),
      (error: Error) => error.name === 'ActionValidationFailure'
    );
  });

  it('rejects hostile managed email, notification, and queue parameters at plan and handler boundaries', async () => {
    const registry = coreRegistry();
    const migratedEmail = migrateLegacyRecordAction({
      schemaVersion: 1,
      recordTypeKey: 'legacy-action-fixture',
      scope: { context: 'record-lifecycle', mode: 'onCreate', phase: 'post' },
      stableKey: 'managed-email',
      order: 0,
      sourcePath: '$.hooks[0]',
      definition: {
        function: 'sails.services.emailservice.sendRecordNotification',
        options: { forceRun: true, to: 'owner@example.test', subject: 'Review', template: 'publicationReview' },
      },
    });
    assert.equal(migratedEmail.kind, 'action-bindings');
    if (migratedEmail.kind !== 'action-bindings') {
      throw new Error('Expected email binding.');
    }
    const emailBinding = migratedEmail.bindings[0];
    assert.ok(emailBinding);
    const hostileEmailPlan = validateActionPlan(registry, {
      schemaVersion: ACTION_PLAN_SCHEMA_VERSION,
      recordTypeKey: 'legacy-action-fixture',
      bindings: [
        {
          ...emailBinding,
          parameters: {
            ...emailBinding.parameters,
            otherSendOptions: literal({ attachments: [{ href: 'https://attacker.example/file' }] }),
          },
        },
      ],
    });
    assert.equal(hostileEmailPlan.ok, false);

    const notification = descriptorFor(BUILT_IN_ACTION_IDS.updateNotificationState);
    const migratedNotification = migrateLegacyRecordAction({
      schemaVersion: 1,
      recordTypeKey: 'legacy-action-fixture',
      scope: { context: 'record-lifecycle', mode: 'onCreate', phase: 'pre' },
      stableKey: 'managed-notification',
      order: 0,
      sourcePath: '$.hooks[0]',
      definition: {
        function: 'sails.services.recordsservice.updateNotificationLog',
        options: { forceRun: true, flagName: 'notification.state', flagVal: 'draft' },
      },
    });
    assert.equal(migratedNotification.kind, 'action-bindings');
    if (migratedNotification.kind !== 'action-bindings') {
      throw new Error('Expected notification binding.');
    }
    const notificationBinding = migratedNotification.bindings[0];
    assert.ok(notificationBinding);
    assert.equal(
      validateActionPlan(registry, {
        schemaVersion: ACTION_PLAN_SCHEMA_VERSION,
        recordTypeKey: 'legacy-action-fixture',
        bindings: [
          {
            ...notificationBinding,
            parameters: {
              ...notificationBinding.parameters,
              flagName: literal('constructor.prototype.polluted'),
            },
          },
        ],
      }).ok,
      false
    );
    for (const parameters of [
      {
        ...PARAMETERS[BUILT_IN_ACTION_IDS.updateNotificationState],
        flagName: literal('constructor.prototype.polluted'),
      },
      {
        ...PARAMETERS[BUILT_IN_ACTION_IDS.updateNotificationState],
        flagName: literal('authorization.edit'),
      },
      {
        ...PARAMETERS[BUILT_IN_ACTION_IDS.updateNotificationState],
        logName: literal('notification.log.secretToken'),
      },
    ]) {
      let calls = 0;
      sails.services.recordsservice.updateNotificationLog = (() => {
        calls += 1;
        return Promise.resolve({});
      }) as never;
      await assert.rejects(
        async () => executeDirect(notification, parameters),
        (error: Error) => error.name === 'ActionValidationFailure'
      );
      assert.equal(calls, 0);
    }

    const queue = descriptorFor(BUILT_IN_ACTION_IDS.dispatchQueuedAction);
    let queueCalls = 0;
    sails.services.managedqueue.now = (() => {
      queueCalls += 1;
      return Promise.resolve({ queued: true });
    }) as never;
    await assert.rejects(
      async () =>
        executeDirect(queue, {
          ...PARAMETERS[BUILT_IN_ACTION_IDS.dispatchQueuedAction],
          jobName: literal('AttackerService-Execute'),
        }),
      (error: Error) => error.name === 'ActionValidationFailure'
    );
    assert.equal(queueCalls, 0);
  });

  it('persists an ActionContext-valid secret-free queue projection and routes only an exact child through the executor', async () => {
    const services = installSuccessfulServices();
    const secretSentinel = 'candidate-secret-must-not-enter-agenda';
    const candidate: ActionJsonObject = {
      redboxOid: 'record-1',
      revision: 7,
      metadata: { title: 'Authoritative', password: secretSentinel },
      apiToken: secretSentinel,
    };
    await executeDirect(
      descriptorFor(BUILT_IN_ACTION_IDS.dispatchQueuedAction),
      PARAMETERS[BUILT_IN_ACTION_IDS.dispatchQueuedAction]!,
      candidate
    );
    assert.deepEqual(services.queuedJobNames, [REGISTERED_RECORD_ACTION_JOB_NAME]);
    const persisted = services.queuedPayloads[0];
    assert.ok(persisted);
    const payload = parseRegisteredRecordActionQueuePayload(persisted);
    assert.doesNotThrow(() => parseActionContext(payload.context));
    assert.deepEqual(payload.context.priorOutputs, []);
    assert.deepEqual(payload.context.record.candidate, { redboxOid: 'record-1', revision: 7 });
    assert.equal(JSON.stringify(payload).includes(secretSentinel), false);
    assert.equal(JSON.stringify(payload).includes('password'), false);
    assert.equal(JSON.stringify(payload).includes('apiToken'), false);
    assert.equal(Object.hasOwn(payload, 'jobName'), false);

    let routed = 0;
    sails.services.doiservice.updateDoiTriggerSync = ((_oid: string, record: ActionJsonObject) => {
      routed += 1;
      assert.equal(record.metadata?.title, 'Authoritative');
      return Promise.resolve(record);
    }) as never;
    const registry = coreRegistry();
    const result = await consumeRegisteredRecordActionQueueJob(
      { attrs: { name: REGISTERED_RECORD_ACTION_JOB_NAME, data: payload } },
      {
        registry,
        provider: createActionSecretProvider(new EmptySecretStorage()),
        loadRecord: async () => candidate,
      }
    );
    assert.equal(result.actionId, BUILT_IN_ACTION_IDS.updateDoi);
    assert.equal(result.status, 'succeeded');
    assert.equal(routed, 1);

    const hostileJobs: ActionJsonObject[] = [
      { attrs: { name: 'AttackerService-Execute', data: payload as never } },
      {
        attrs: {
          name: REGISTERED_RECORD_ACTION_JOB_NAME,
          data: { ...payload, actionId: 'org.example.missing' } as never,
        },
      },
      {
        attrs: {
          name: REGISTERED_RECORD_ACTION_JOB_NAME,
          data: { ...payload, contractVersion: 2 } as never,
        },
      },
      {
        attrs: {
          name: REGISTERED_RECORD_ACTION_JOB_NAME,
          data: { ...payload, actionId: BUILT_IN_ACTION_IDS.dispatchQueuedAction } as never,
        },
      },
    ];
    for (const job of hostileJobs) {
      await assert.rejects(
        async () =>
          consumeRegisteredRecordActionQueueJob(job, {
            registry: coreRegistry(),
            provider: createActionSecretProvider(new EmptySecretStorage()),
            loadRecord: async () => candidate,
          }),
        (error: Error) => error.name === 'ActionValidationFailure'
      );
    }
    assert.equal(routed, 1);
  });

  it('uses the configured nested workspace field, drops return-shape selection, and skips disabled effects', async () => {
    let linkedRdmpOid = '';
    sails.services.workspaceservice.addWorkspaceToRecord = ((rdmpOid: string) => {
      linkedRdmpOid = rdmpOid;
      return Promise.resolve({ linked: true });
    }) as never;
    const workspace = await executeDirect(
      descriptorFor(BUILT_IN_ACTION_IDS.linkWorkspace),
      { rdmpOidField: literal('links.rdmpOid') },
      { redboxOid: 'workspace-1', metadata: { links: { rdmpOid: 'rdmp-nested' } } }
    );
    assert.equal(linkedRdmpOid, 'rdmp-nested');
    assert.deepEqual(workspace.output?.fields.linked, true);

    let emailInvocations = 0;
    sails.services.emailservice.buildFromTemplate = (() => {
      emailInvocations += 1;
      return Promise.resolve({ status: 200, body: 'unused' });
    }) as never;
    const emailParameters = { ...PARAMETERS[BUILT_IN_ACTION_IDS.sendRecordEmail], condition: literal(false) };
    const email = await executeDirect(descriptorFor(BUILT_IN_ACTION_IDS.sendRecordEmail), emailParameters);
    assert.deepEqual(email.output?.fields, { sent: false });
    assert.equal(emailInvocations, 0);

    let queueInvocations = 0;
    sails.services.managedqueue.now = (() => {
      queueInvocations += 1;
      return Promise.resolve({ queued: true });
    }) as never;
    const queueParameters = {
      ...PARAMETERS[BUILT_IN_ACTION_IDS.dispatchQueuedAction],
      condition: literal(false),
    };
    const queue = await executeDirect(descriptorFor(BUILT_IN_ACTION_IDS.dispatchQueuedAction), queueParameters);
    assert.deepEqual(queue.output?.fields, {
      queued: false,
      queuedActionId: BUILT_IN_ACTION_IDS.updateDoi,
    });
    assert.equal(queueInvocations, 0);
  });

  it('redacts nested workspace output and runtime errors at the executor boundary', async () => {
    installSuccessfulServices();
    const registry = coreRegistry();
    const provider = createActionSecretProvider(new EmptySecretStorage());
    const executor = createRegisteredActionExecutor(registry, provider);
    const workspaceMigration = migrateLegacyRecordAction({
      schemaVersion: 1,
      recordTypeKey: 'legacy-action-fixture',
      scope: { context: 'record-lifecycle', mode: 'onCreate', phase: 'postSync' },
      stableKey: 'workspace',
      order: 0,
      sourcePath: '$.hooks[0]',
      definition: {
        function: 'sails.services.rdmpservice.addWorkspaceToRecord',
        options: { rdmpOidField: 'rdmpOid' },
      },
    });
    assert.equal(workspaceMigration.kind, 'action-bindings');
    if (workspaceMigration.kind !== 'action-bindings') {
      throw new Error('Expected workspace binding.');
    }
    const workspaceScope = workspaceMigration.bindings[0]?.scope;
    assert.ok(workspaceScope);
    const operation = createActionExecutionOperation('onCreate');
    const outcome = await executor.runSequential(
      {
        schemaVersion: ACTION_PLAN_SCHEMA_VERSION,
        recordTypeKey: 'legacy-action-fixture',
        bindings: workspaceMigration.bindings,
      },
      actionContext(
        workspaceScope,
        {
          redboxOid: 'workspace-1',
          metadata: { rdmpOid: 'rdmp-1', title: 'Public', apiToken: 'must-not-project' },
        },
        operation.executionId
      ),
      operation
    );
    assert.equal(JSON.stringify(outcome.safeOutputs).includes('must-not-project'), false);
    assert.deepEqual(outcome.safeOutputs[0]?.output.fields.workspaceData, {
      redboxOid: 'workspace-1',
      metadata: { rdmpOid: 'rdmp-1', title: 'Public' },
    });

    const secretSentinel = 'runtime-secret-must-not-serialize';
    sails.services.emailservice.buildFromTemplate = () => Promise.reject(new Error(secretSentinel)) as never;
    const emailMigration = migrateLegacyRecordAction({
      schemaVersion: 1,
      recordTypeKey: 'legacy-action-fixture',
      scope: { context: 'record-lifecycle', mode: 'onCreate', phase: 'post' },
      stableKey: 'email',
      order: 0,
      sourcePath: '$.hooks[0]',
      definition: {
        function: 'sails.services.emailservice.sendRecordNotification',
        options: { forceRun: true, to: 'owner@example.test', subject: 'Review', template: 'publicationReview' },
      },
    });
    assert.equal(emailMigration.kind, 'action-bindings');
    if (emailMigration.kind !== 'action-bindings') {
      throw new Error('Expected email binding.');
    }
    const emailScope = emailMigration.bindings[0]?.scope;
    assert.ok(emailScope);
    const emailOperation = createActionExecutionOperation('onCreate');
    const completed = new Promise<void>(resolve => {
      emailOperation.onDetachedComplete = resolve;
    });
    executor.dispatchDetached(
      {
        schemaVersion: ACTION_PLAN_SCHEMA_VERSION,
        recordTypeKey: 'legacy-action-fixture',
        bindings: emailMigration.bindings,
      },
      actionContext(emailScope, { redboxOid: 'record-1', metadata: { title: 'Public' } }, emailOperation.executionId),
      emailOperation
    );
    await completed;
    assert.equal(JSON.stringify(emailOperation.detachedResults).includes(secretSentinel), false);
    assert.deepEqual(emailOperation.detachedResults?.[0]?.failure, {
      kind: 'unexpected',
      code: 'action-unexpected-failure',
    });
  });

  it('times out a non-cooperative external email call once under its non-idempotent policy', async () => {
    installSuccessfulServices();
    let invocations = 0;
    sails.services.emailservice.buildFromTemplate = (() => {
      invocations += 1;
      return new Promise<ActionJsonObject>(() => undefined);
    }) as never;
    const migration = migrateLegacyRecordAction({
      schemaVersion: 1,
      recordTypeKey: 'legacy-action-fixture',
      scope: { context: 'record-lifecycle', mode: 'onCreate', phase: 'post' },
      stableKey: 'email-timeout',
      order: 0,
      sourcePath: '$.hooks[0]',
      definition: {
        function: 'sails.services.emailservice.sendRecordNotification',
        options: { forceRun: true, to: 'owner@example.test', subject: 'Review', template: 'publicationReview' },
      },
    });
    assert.equal(migration.kind, 'action-bindings');
    if (migration.kind !== 'action-bindings') {
      throw new Error('Expected email binding.');
    }
    const sourceBinding = migration.bindings[0];
    assert.ok(sourceBinding);
    const binding: ActionBinding = {
      ...sourceBinding,
      policyOverrides: { timeoutMs: 3_000 },
    };
    const registry = coreRegistry();
    const executor = createRegisteredActionExecutor(registry, createActionSecretProvider(new EmptySecretStorage()));
    const operation = createActionExecutionOperation('onCreate');
    const completed = new Promise<void>(resolve => {
      operation.onDetachedComplete = resolve;
    });
    executor.dispatchDetached(
      { schemaVersion: ACTION_PLAN_SCHEMA_VERSION, recordTypeKey: 'legacy-action-fixture', bindings: [binding] },
      actionContext(binding.scope, { redboxOid: 'record-1', metadata: { title: 'Public' } }, operation.executionId),
      operation
    );
    await completed;
    assert.equal(invocations, 1);
    assert.equal(operation.detachedResults?.[0]?.status, 'timed_out');
    assert.deepEqual(operation.detachedResults?.[0]?.failure, {
      kind: 'timeout',
      code: 'action-timeout',
      cancellationCooperative: false,
    });
  });

  it('exports the A07 contracts', () => {
    assert.equal(PublicActionRegistry.migrateLegacyRecordAction, migrateLegacyRecordAction);
    assert.equal(PublicActionRegistry.BUILT_IN_ACTION_IDS, BUILT_IN_ACTION_IDS);
    assert.equal(PublicActionRegistry.LEGACY_RECORD_ACTION_MAPPINGS.length, 13);
  });
});
