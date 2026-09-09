import assert from 'node:assert/strict';
import {
  RECORD_DEFINITION_AGGREGATE_SCHEMA_VERSION,
  RECORD_DEFINITION_API_SCHEMA_VERSION,
  RECORD_DEFINITION_LABEL_MAX_LENGTH,
  RECORD_DEFINITION_REDACTION_MARKER,
  RECORD_DEFINITION_REPORT_SCHEMA_VERSION,
  RECORD_DEFINITION_STAGE_SCHEMA_VERSION,
  RECORD_DEFINITION_TRANSITION_SCHEMA_VERSION,
  parseRecordDefinitionBrandId,
  parseRecordDefinitionCanonicalHash,
  parseRecordDefinitionKey,
  parseWorkflowStageKey,
  type DraftRecordDefinitionAggregateDto,
  type PublishableRecordDefinitionAggregateDto,
} from '@researchdatabox/sails-ng-common';
import {
  ACTION_CONTRACT_SCHEMA_VERSION,
  deriveStableActionBindingId,
  type ActionBindingScope,
} from '../src/action-registry';
import {
  PERSISTED_RECORD_DEFINITION_SCHEMA_VERSION,
  RECORD_DEFINITION_CONTRACT_LIMITS,
  deriveRecordDefinitionDraftId,
  deriveRecordDefinitionId,
  deriveRecordDefinitionRevisionId,
  deriveWorkflowTransitionId,
  draftRecordDefinitionAggregateSchema,
  persistedRecordDefinitionDraftSchema,
  persistedRecordDefinitionRevisionSchema,
  persistedRecordTypeIdentitySchema,
  publishableRecordDefinitionAggregateSchema,
  recordDefinitionActionBindingSchema,
  recordDefinitionConflictSchema,
  recordDefinitionDraftSaveRequestSchema,
  recordDefinitionDraftSchema,
  recordDefinitionHistorySummarySchema,
  recordDefinitionImpactReportSchema,
  recordDefinitionPublicationRequestSchema,
  recordDefinitionRetirementRequestSchema,
  recordDefinitionRevisionSchema,
  recordDefinitionRollbackRequestSchema,
  recordDefinitionValidationReportSchema,
  recordTypeIdentitySchema,
} from '../src/record-workflow-administration';

const brandId = parseRecordDefinitionBrandId('brand-a');
const recordTypeKey = parseRecordDefinitionKey('dataRecord');
const draftStageKey = parseWorkflowStageKey('draft');
const publishedStageKey = parseWorkflowStageKey('published');
const identityInput = { brandId, recordTypeKey };
const transitionId = deriveWorkflowTransitionId({ ...identityInput, stableKey: 'publish' });
const automaticTransitionId = deriveWorkflowTransitionId({ ...identityInput, stableKey: 'auto-publish' });
const actor = { id: 'admin-1', displayName: 'Portal administrator' };
const timestamp = '2026-09-01T10:00:00.000Z';
const canonicalHash = parseRecordDefinitionCanonicalHash(`sha256:${'a'.repeat(64)}`);

const transitionBindingScope: ActionBindingScope = {
  context: 'workflow-transition',
  mode: 'onTransitionWorkflow',
  phase: 'pre',
  scopeId: transitionId,
};

function actionBindingInput(): object {
  return {
    schemaVersion: ACTION_CONTRACT_SCHEMA_VERSION,
    id: deriveStableActionBindingId({
      recordTypeKey,
      scope: transitionBindingScope,
      actionId: 'org.redbox.test-action',
      contractVersion: 1,
      stableKey: 'notify',
    }),
    stableKey: 'notify',
    actionId: 'org.redbox.test-action',
    contractVersion: 1,
    scope: transitionBindingScope,
    parameters: {
      token: { kind: 'secret', configured: true },
      message: { kind: 'handlebars', template: 'Published {{record.oid}}' },
    },
    order: 0,
  };
}

function draftAggregate(): DraftRecordDefinitionAggregateDto {
  return {
    schemaVersion: RECORD_DEFINITION_AGGREGATE_SCHEMA_VERSION,
    definitionState: 'draft-incomplete',
    recordType: { labels: { name: 'Data record' } },
    stages: [],
    transitions: [],
    actionBindings: [],
  };
}

function publishableAggregate(): PublishableRecordDefinitionAggregateDto {
  return {
    schemaVersion: RECORD_DEFINITION_AGGREGATE_SCHEMA_VERSION,
    definitionState: 'publishable',
    recordType: {
      labels: { name: 'Data record', namePlural: 'Data records' },
      searchable: true,
      searchFilters: [],
      relationships: [],
      transferResponsibility: { fields: [], roleRules: [] },
      validation: {
        mode: 'shadow',
        operations: [
          {
            name: 'publish',
            enabledValidationGroups: ['publication'],
            roles: ['Admin'],
            allowedTargetStages: [publishedStageKey],
            mode: 'enforce',
          },
        ],
      },
      concurrency: { mode: 'strict' },
    },
    stages: [
      {
        schemaVersion: RECORD_DEFINITION_STAGE_SCHEMA_VERSION,
        key: draftStageKey,
        label: 'Draft',
        formReference: 'dataRecord',
        viewRoles: ['Admin', 'Researcher'],
        editRoles: ['Admin', 'Researcher'],
        displayOrder: 0,
        starting: true,
        terminal: false,
        validationOverrides: [],
      },
      {
        schemaVersion: RECORD_DEFINITION_STAGE_SCHEMA_VERSION,
        key: publishedStageKey,
        label: 'Published',
        formReference: 'dataRecord',
        viewRoles: ['Admin', 'Researcher'],
        editRoles: ['Admin'],
        displayOrder: 1,
        starting: false,
        terminal: true,
        validationOverrides: [],
      },
    ],
    transitions: [
      {
        schemaVersion: RECORD_DEFINITION_TRANSITION_SCHEMA_VERSION,
        id: transitionId,
        sourceStageKey: draftStageKey,
        targetStageKey: publishedStageKey,
        label: 'Publish',
        mode: 'manual',
        allowedRoles: ['Admin'],
        eligibilityCondition: '$exists(record.candidate.metadata.title)',
        validationOperation: 'publish',
      },
      {
        schemaVersion: RECORD_DEFINITION_TRANSITION_SCHEMA_VERSION,
        id: automaticTransitionId,
        sourceStageKey: draftStageKey,
        targetStageKey: publishedStageKey,
        label: 'Publish automatically',
        mode: 'automatic',
        event: 'update',
        priority: 10,
        condition: 'record.candidate.metadata.approved = true',
        validationOperation: 'publish',
      },
    ],
    actionBindings: [actionBindingInput()] as PublishableRecordDefinitionAggregateDto['actionBindings'],
  };
}

function revisionInput(): object {
  return {
    schemaVersion: RECORD_DEFINITION_API_SCHEMA_VERSION,
    id: deriveRecordDefinitionRevisionId(identityInput, 1),
    brandId,
    recordTypeKey,
    revisionNumber: 1,
    canonicalHash,
    definition: publishableAggregate(),
    actionContracts: [{ actionId: 'org.redbox.test-action', contractVersion: 1 }],
    source: { operation: 'publish', sourceRevisionNumber: null },
    publishedAt: timestamp,
    publishedBy: actor,
    publicationNote: 'Initial publication',
  };
}

function persistedRevisionInput(): object {
  return {
    ...revisionInput(),
    schemaVersion: PERSISTED_RECORD_DEFINITION_SCHEMA_VERSION,
    recordTypeId: deriveRecordDefinitionId(identityInput),
    createdAt: timestamp,
    createdBy: actor,
  };
}

function validationReportInput(): object {
  return {
    schemaVersion: RECORD_DEFINITION_REPORT_SCHEMA_VERSION,
    brandId,
    recordTypeKey,
    scope: 'publication',
    status: 'valid',
    definitionState: 'publishable',
    validatedDraftVersion: 3,
    validatedActiveRevisionNumber: null,
    issues: [],
    redactions: [
      {
        path: '/actionBindings/0/parameters/token',
        reason: 'secret',
        marker: RECORD_DEFINITION_REDACTION_MARKER,
      },
    ],
    truncated: false,
  };
}

function conflictInput(): object {
  return {
    schemaVersion: RECORD_DEFINITION_REPORT_SCHEMA_VERSION,
    code: 'draft-version-conflict',
    resource: 'draft',
    brandId,
    recordTypeKey,
    expectedVersion: 2,
    currentVersion: 3,
    expectedActiveRevisionNumber: 1,
    currentActiveRevisionNumber: 1,
    message: 'The draft has changed.',
  };
}

describe('record-definition B01 contracts', () => {
  it('derives deterministic, brand-scoped canonical IDs without normalizing existing keys', () => {
    assert.equal(deriveRecordDefinitionId(identityInput), deriveRecordDefinitionId(identityInput));
    assert.notEqual(
      deriveRecordDefinitionId(identityInput),
      deriveRecordDefinitionId({ brandId: 'brand-b', recordTypeKey })
    );
    assert.notEqual(
      deriveRecordDefinitionId(identityInput),
      deriveRecordDefinitionId({ brandId, recordTypeKey: 'DataRecord' })
    );
    assert.equal(deriveRecordDefinitionDraftId(identityInput), deriveRecordDefinitionDraftId(identityInput));
    assert.notEqual(
      deriveRecordDefinitionRevisionId(identityInput, 1),
      deriveRecordDefinitionRevisionId(identityInput, 2)
    );
    assert.notEqual(transitionId, deriveWorkflowTransitionId({ ...identityInput, stableKey: 'archive' }));

    assert.throws(() => deriveRecordDefinitionId({ brandId: '../other-brand', recordTypeKey }), TypeError);
    assert.throws(() => deriveWorkflowTransitionId({ ...identityInput, stableKey: 'unsafe/path' }), TypeError);
  });

  it('distinguishes shape-safe incomplete drafts from publishable aggregates', () => {
    assert.equal(draftRecordDefinitionAggregateSchema.safeParse(draftAggregate()).success, true);
    assert.equal(publishableRecordDefinitionAggregateSchema.safeParse(draftAggregate()).success, false);
    assert.equal(publishableRecordDefinitionAggregateSchema.safeParse(publishableAggregate()).success, true);
    assert.equal(draftRecordDefinitionAggregateSchema.safeParse(publishableAggregate()).success, false);
  });

  it('supports record-type operation rollout modes but prohibits them on stage overrides', () => {
    const definition = publishableAggregate();
    assert.equal(definition.recordType.validation.mode, 'shadow');
    assert.equal(definition.recordType.validation.operations[0]?.mode, 'enforce');
    assert.equal(publishableRecordDefinitionAggregateSchema.safeParse(definition).success, true);

    const validationOverrideWithMode = {
      name: 'publish',
      enabledValidationGroups: ['publication'],
      roles: ['Admin'],
      allowedTargetStages: [publishedStageKey],
      mode: 'shadow',
    };
    assert.equal(
      publishableRecordDefinitionAggregateSchema.safeParse({
        ...definition,
        stages: [{ ...definition.stages[0], validationOverrides: [validationOverrideWithMode] }],
      }).success,
      false
    );
    assert.equal(
      draftRecordDefinitionAggregateSchema.safeParse({
        ...draftAggregate(),
        stages: [
          {
            schemaVersion: RECORD_DEFINITION_STAGE_SCHEMA_VERSION,
            key: draftStageKey,
            validationOverrides: [validationOverrideWithMode],
          },
        ],
      }).success,
      false
    );
  });

  it('reuses the registered-action binding contract and forbids secret values', () => {
    const binding = actionBindingInput();
    assert.equal(recordDefinitionActionBindingSchema.safeParse(binding).success, true);
    assert.equal(
      recordDefinitionActionBindingSchema.safeParse({
        ...binding,
        parameters: { token: { kind: 'secret', configured: true, value: 'must-not-persist' } },
      }).success,
      false
    );
    assert.equal(
      recordDefinitionActionBindingSchema.safeParse({
        ...binding,
        scope: {
          context: 'queued-record-action',
          mode: 'onUpdate',
          phase: 'post',
          scopeId: 'queue',
        },
      }).success,
      false
    );

    const revisionWithSecret = revisionInput();
    const definition = publishableAggregate();
    assert.equal(
      recordDefinitionRevisionSchema.safeParse({
        ...revisionWithSecret,
        definition: {
          ...definition,
          actionBindings: [
            {
              ...actionBindingInput(),
              parameters: { token: { kind: 'secret', configured: true, value: 'must-not-persist' } },
            },
          ],
        },
      }).success,
      false
    );
    assert.equal(JSON.stringify(revisionInput()).includes('must-not-persist'), false);
  });

  it('rejects action bindings with hidden secret properties', () => {
    const secretParameter = { kind: 'secret' as const, configured: true };
    Object.defineProperty(secretParameter, 'value', {
      value: 'must-not-persist',
      enumerable: false,
    });
    assert.equal(
      recordDefinitionActionBindingSchema.safeParse({
        ...actionBindingInput(),
        parameters: { token: secretParameter },
      }).success,
      false
    );
  });

  it('returns detached action bindings for supported data properties', () => {
    const secretParameter = { kind: 'secret' as const, configured: true };
    const parameters = {
      token: secretParameter,
      message: { kind: 'handlebars' as const, template: 'Original message' },
    };
    const sourceBinding = { ...actionBindingInput(), parameters };
    const result = recordDefinitionActionBindingSchema.safeParse(sourceBinding);

    assert.equal(result.success, true);
    if (!result.success) return;
    const parsedToken = result.data.parameters.token;
    assert.ok(parsedToken);
    assert.equal(Object.hasOwn(parsedToken, 'value'), false);
    assert.equal(JSON.stringify(result.data).includes('must-not-persist'), false);

    const detachedSnapshot = JSON.stringify(result.data);
    secretParameter.configured = false;
    parameters.message.template = 'Mutated after validation';
    assert.equal(JSON.stringify(result.data), detachedSnapshot);
  });

  it('rejects unsupported schema versions at every versioned layer', () => {
    const definition = publishableAggregate();
    assert.equal(
      publishableRecordDefinitionAggregateSchema.safeParse({ ...definition, schemaVersion: 2 }).success,
      false
    );
    assert.equal(
      publishableRecordDefinitionAggregateSchema.safeParse({
        ...definition,
        stages: [{ ...definition.stages[0], schemaVersion: 2 }],
      }).success,
      false
    );
    assert.equal(
      publishableRecordDefinitionAggregateSchema.safeParse({
        ...definition,
        transitions: [{ ...definition.transitions[0], schemaVersion: 2 }],
      }).success,
      false
    );
    assert.equal(
      recordDefinitionActionBindingSchema.safeParse({ ...actionBindingInput(), schemaVersion: 2 }).success,
      false
    );
    assert.equal(
      recordDefinitionValidationReportSchema.safeParse({ ...validationReportInput(), schemaVersion: 2 }).success,
      false
    );
    assert.equal(
      persistedRecordDefinitionRevisionSchema.safeParse({
        ...persistedRevisionInput(),
        schemaVersion: 2,
      }).success,
      false
    );
  });

  it('rejects unknown fields throughout API, persisted, report, and conflict contracts', () => {
    const definition = publishableAggregate();
    assert.equal(
      publishableRecordDefinitionAggregateSchema.safeParse({ ...definition, executable: 'service.method' }).success,
      false
    );
    assert.equal(
      publishableRecordDefinitionAggregateSchema.safeParse({
        ...definition,
        stages: [{ ...definition.stages[0], next: 'published' }],
      }).success,
      false
    );
    assert.equal(
      publishableRecordDefinitionAggregateSchema.safeParse({
        ...definition,
        transitions: [{ ...definition.transitions[0], service: 'RecordsService' }],
      }).success,
      false
    );
    assert.equal(recordDefinitionRevisionSchema.safeParse({ ...revisionInput(), mutable: true }).success, false);
    assert.equal(
      persistedRecordDefinitionRevisionSchema.safeParse({ ...persistedRevisionInput(), secretValue: 'hidden' }).success,
      false
    );
    assert.equal(
      recordDefinitionValidationReportSchema.safeParse({ ...validationReportInput(), submittedDefinition: {} }).success,
      false
    );
    assert.equal(
      recordDefinitionConflictSchema.safeParse({
        ...conflictInput(),
        submittedDefinition: definition,
      }).success,
      false
    );
  });

  it('enforces exact identifier ownership for brand-scoped identity and revision DTOs', () => {
    const identity = {
      schemaVersion: RECORD_DEFINITION_API_SCHEMA_VERSION,
      id: deriveRecordDefinitionId(identityInput),
      brandId,
      key: recordTypeKey,
      deployment: { packageType: 'dataRecord', searchCore: 'default' },
      version: 4,
      activeRevision: {
        id: deriveRecordDefinitionRevisionId(identityInput, 1),
        revisionNumber: 1,
        canonicalHash,
      },
      draft: {
        id: deriveRecordDefinitionDraftId(identityInput),
        version: 3,
        baseRevisionNumber: 1,
        updatedAt: timestamp,
        updatedBy: actor,
      },
      retirement: null,
    };
    assert.equal(recordTypeIdentitySchema.safeParse(identity).success, true);
    assert.equal(
      recordTypeIdentitySchema.safeParse({
        ...identity,
        brandId: parseRecordDefinitionBrandId('brand-b'),
      }).success,
      false
    );
    assert.equal(recordDefinitionRevisionSchema.safeParse(revisionInput()).success, true);
    assert.equal(
      recordDefinitionRevisionSchema.safeParse({
        ...revisionInput(),
        brandId: parseRecordDefinitionBrandId('brand-b'),
      }).success,
      false
    );
  });

  it('rejects invalid action IDs in revision action contract references', () => {
    assert.equal(
      recordDefinitionRevisionSchema.safeParse({
        ...revisionInput(),
        actionContracts: [{ actionId: 'not an action id', contractVersion: 1 }],
      }).success,
      false
    );
  });

  it('enforces collection, display-text, and report bounds at boundary plus one', () => {
    const stages = Array.from({ length: RECORD_DEFINITION_CONTRACT_LIMITS.maxStages }, (_, index) => ({
      schemaVersion: RECORD_DEFINITION_STAGE_SCHEMA_VERSION,
      key: parseWorkflowStageKey(`stage-${index}`),
    }));
    const boundedDraft = { ...draftAggregate(), stages };
    assert.equal(draftRecordDefinitionAggregateSchema.safeParse(boundedDraft).success, true);
    assert.equal(
      draftRecordDefinitionAggregateSchema.safeParse({
        ...boundedDraft,
        stages: [...stages, { schemaVersion: RECORD_DEFINITION_STAGE_SCHEMA_VERSION, key: 'overflow' }],
      }).success,
      false
    );

    const definition = publishableAggregate();
    assert.equal(
      publishableRecordDefinitionAggregateSchema.safeParse({
        ...definition,
        recordType: {
          ...definition.recordType,
          labels: { name: 'x'.repeat(RECORD_DEFINITION_LABEL_MAX_LENGTH), namePlural: 'Records' },
        },
      }).success,
      true
    );
    assert.equal(
      publishableRecordDefinitionAggregateSchema.safeParse({
        ...definition,
        recordType: {
          ...definition.recordType,
          labels: { name: 'x'.repeat(RECORD_DEFINITION_LABEL_MAX_LENGTH + 1), namePlural: 'Records' },
        },
      }).success,
      false
    );

    const issues = Array.from({ length: RECORD_DEFINITION_CONTRACT_LIMITS.maxReportIssues }, (_, index) => ({
      code: `issue-${index}`,
      path: `/stages/${index}`,
      severity: 'warning',
      message: 'Review this stage.',
    }));
    assert.equal(
      recordDefinitionValidationReportSchema.safeParse({ ...validationReportInput(), issues }).success,
      true
    );
    assert.equal(
      recordDefinitionValidationReportSchema.safeParse({
        ...validationReportInput(),
        issues: [...issues, { code: 'overflow', path: '/', severity: 'error', message: 'Too many.' }],
      }).success,
      false
    );
  });

  it('validates redacted validation, impact, history, and persisted identity summaries', () => {
    assert.equal(recordDefinitionValidationReportSchema.safeParse(validationReportInput()).success, true);
    assert.equal(recordDefinitionConflictSchema.safeParse(conflictInput()).success, true);
    assert.equal(
      recordDefinitionImpactReportSchema.safeParse({
        schemaVersion: RECORD_DEFINITION_REPORT_SCHEMA_VERSION,
        brandId,
        recordTypeKey,
        status: 'clear',
        activeRevisionNumber: 1,
        draftVersion: 3,
        affectedRecordCount: 0,
        stageImpacts: [{ stageKey: draftStageKey, referencedRecordCount: 12, effect: 'unchanged' }],
        changes: [{ path: '/recordType/labels/name', kind: 'changed' }],
        redactions: [],
        truncated: false,
      }).success,
      true
    );
    const historySummary = {
      schemaVersion: RECORD_DEFINITION_REPORT_SCHEMA_VERSION,
      id: 'audit-1',
      brandId,
      recordTypeKey,
      revision: { id: deriveRecordDefinitionRevisionId(identityInput, 1), revisionNumber: 1, canonicalHash },
      source: { operation: 'publish', sourceRevisionNumber: null },
      publishedAt: timestamp,
      publishedBy: actor,
      validation: { status: 'valid', errorCount: 0, warningCount: 0 },
      impact: { status: 'clear', affectedRecordCount: 0 },
      changes: [],
      redactions: [],
      truncated: false,
    };
    assert.equal(recordDefinitionHistorySummarySchema.safeParse(historySummary).success, true);
    assert.equal(
      recordDefinitionHistorySummarySchema.safeParse({
        ...historySummary,
        revision: {
          ...historySummary.revision,
          id: deriveRecordDefinitionRevisionId({ brandId: parseRecordDefinitionBrandId('brand-b'), recordTypeKey }, 1),
        },
      }).success,
      false
    );
    assert.equal(
      recordDefinitionHistorySummarySchema.safeParse({
        ...historySummary,
        revision: {
          ...historySummary.revision,
          id: deriveRecordDefinitionRevisionId({ brandId, recordTypeKey: parseRecordDefinitionKey('otherRecord') }, 1),
        },
      }).success,
      false
    );
    assert.equal(
      recordDefinitionHistorySummarySchema.safeParse({
        ...historySummary,
        revision: { ...historySummary.revision, revisionNumber: 2 },
      }).success,
      false
    );

    const persistedIdentity = {
      schemaVersion: PERSISTED_RECORD_DEFINITION_SCHEMA_VERSION,
      id: deriveRecordDefinitionId(identityInput),
      brandId,
      key: recordTypeKey,
      deployment: { packageType: 'dataRecord', searchCore: 'default' },
      version: 4,
      activeRevisionId: deriveRecordDefinitionRevisionId(identityInput, 1),
      activeRevisionNumber: 1,
      draftId: deriveRecordDefinitionDraftId(identityInput),
      retirement: null,
      createdAt: timestamp,
      createdBy: actor,
      updatedAt: timestamp,
      updatedBy: actor,
    };
    assert.equal(persistedRecordTypeIdentitySchema.safeParse(persistedIdentity).success, true);
    assert.equal(
      persistedRecordTypeIdentitySchema.safeParse({ ...persistedIdentity, activeRevisionNumber: null }).success,
      false
    );
    assert.equal(persistedRecordDefinitionRevisionSchema.safeParse(persistedRevisionInput()).success, true);
  });

  it('validates versioned draft persistence and explicit mutation preconditions', () => {
    const publicDraft = {
      schemaVersion: RECORD_DEFINITION_API_SCHEMA_VERSION,
      id: deriveRecordDefinitionDraftId(identityInput),
      recordTypeId: deriveRecordDefinitionId(identityInput),
      brandId,
      recordTypeKey,
      version: 3,
      baseRevisionNumber: 1,
      definition: draftAggregate(),
      updatedAt: timestamp,
      updatedBy: actor,
      validation: null,
    };
    assert.equal(recordDefinitionDraftSchema.safeParse(publicDraft).success, true);
    assert.equal(
      recordDefinitionDraftSchema.safeParse({ ...publicDraft, validation: validationReportInput() }).success,
      true
    );
    const crossBrandValidation = {
      ...validationReportInput(),
      brandId: parseRecordDefinitionBrandId('brand-b'),
    };
    assert.equal(
      recordDefinitionDraftSchema.safeParse({ ...publicDraft, validation: crossBrandValidation }).success,
      false
    );
    assert.equal(
      recordDefinitionDraftSchema.safeParse({
        ...publicDraft,
        validation: { ...validationReportInput(), recordTypeKey: parseRecordDefinitionKey('otherRecord') },
      }).success,
      false
    );
    assert.equal(
      persistedRecordDefinitionDraftSchema.safeParse({
        ...publicDraft,
        schemaVersion: PERSISTED_RECORD_DEFINITION_SCHEMA_VERSION,
        baseRevisionId: deriveRecordDefinitionRevisionId(identityInput, 1),
        createdAt: timestamp,
        createdBy: actor,
      }).success,
      true
    );
    assert.equal(
      persistedRecordDefinitionDraftSchema.safeParse({
        ...publicDraft,
        schemaVersion: PERSISTED_RECORD_DEFINITION_SCHEMA_VERSION,
        baseRevisionId: deriveRecordDefinitionRevisionId(identityInput, 1),
        createdAt: timestamp,
        createdBy: actor,
        validation: crossBrandValidation,
      }).success,
      false
    );
    assert.equal(
      persistedRecordDefinitionDraftSchema.safeParse({
        ...publicDraft,
        schemaVersion: PERSISTED_RECORD_DEFINITION_SCHEMA_VERSION,
        baseRevisionId: deriveRecordDefinitionRevisionId(identityInput, 2),
        createdAt: timestamp,
        createdBy: actor,
      }).success,
      false
    );

    assert.equal(
      recordDefinitionDraftSaveRequestSchema.safeParse({
        schemaVersion: RECORD_DEFINITION_API_SCHEMA_VERSION,
        expectedDraftVersion: 3,
        expectedActiveRevisionNumber: 1,
        definition: draftAggregate(),
      }).success,
      true
    );
    assert.equal(
      recordDefinitionPublicationRequestSchema.safeParse({
        schemaVersion: RECORD_DEFINITION_API_SCHEMA_VERSION,
        expectedIdentityVersion: 4,
        expectedDraftVersion: 3,
        expectedActiveRevisionNumber: 1,
        publicationNote: 'Publish reviewed changes',
      }).success,
      true
    );
    assert.equal(
      recordDefinitionRollbackRequestSchema.safeParse({
        schemaVersion: RECORD_DEFINITION_API_SCHEMA_VERSION,
        expectedIdentityVersion: 4,
        expectedActiveRevisionNumber: 2,
        sourceRevisionNumber: 1,
        reason: 'Restore the approved definition',
      }).success,
      true
    );
    assert.equal(
      recordDefinitionRetirementRequestSchema.safeParse({
        schemaVersion: RECORD_DEFINITION_API_SCHEMA_VERSION,
        expectedIdentityVersion: 4,
        reason: 'No longer offered for new records',
      }).success,
      true
    );
    assert.equal(
      recordDefinitionPublicationRequestSchema.safeParse({
        schemaVersion: RECORD_DEFINITION_API_SCHEMA_VERSION,
        expectedDraftVersion: 3,
        expectedActiveRevisionNumber: 1,
      }).success,
      false
    );
  });
});
