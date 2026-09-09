import assert from 'node:assert/strict';
import {
  RECORD_DEFINITION_AGGREGATE_SCHEMA_VERSION,
  RECORD_DEFINITION_PATH_MAX_LENGTH,
  RECORD_DEFINITION_REDACTION_MARKER,
  RECORD_DEFINITION_STAGE_SCHEMA_VERSION,
  RECORD_DEFINITION_TRANSITION_SCHEMA_VERSION,
  parseRecordDefinitionBrandId,
  parseRecordDefinitionKey,
  parseWorkflowStageKey,
  type DraftRecordDefinitionAggregateDto,
  type DraftWorkflowStageDto,
  type DraftWorkflowTransitionDto,
  type PublishableRecordDefinitionAggregateDto,
  type RecordDefinitionActionBindingDto,
  type RecordDefinitionActionBindingScopeDto,
  type RecordDefinitionImpactReportDto,
  type RecordDefinitionValidationIssueDto,
  type RecordDefinitionValidationReportDto,
} from '@researchdatabox/sails-ng-common';
import {
  ACTION_CONTRACT_SCHEMA_VERSION,
  ACTION_RESULT_SCHEMA_VERSION,
  actionRegistrationSource,
  buildActionRegistry,
  deriveStableActionBindingId,
  parseActionDefinitionId,
  type ActionHandler,
  type ActionRegistrationDescriptor,
  type RedboxActionRegistry,
} from '../src/action-registry';
import {
  RECORD_DEFINITION_CONTRACT_LIMITS,
  RECORD_DEFINITION_VALIDATION_LIMITS,
  RecordDefinitionCanonicalizationError,
  canonicalizeRecordDefinition,
  deriveWorkflowTransitionId,
  hashRecordDefinition,
  serializeCanonicalRecordDefinition,
  recordDefinitionImpactReportSchema,
  recordDefinitionValidationReportSchema,
  validateRecordDefinitionDraftPayload,
  validateRecordDefinitionForPublication,
  type InvalidRecordDefinitionPublication,
  type RecordDefinitionPublicationValidationResult,
  type RecordDefinitionPublicationValidationRequest,
  type ValidatedRecordDefinitionPublication,
} from '../src/record-workflow-administration';
import {
  FULL_RECORD_STORAGE_CONCURRENCY_CAPABILITIES,
  type StorageCapabilityProvider,
} from '../src/RecordStorageConcurrency';
import { Services as ValidationServices } from '../src/services/RecordDefinitionValidationService';
import type { RuntimeValue } from '../src/runtimeValues';

const brandId = parseRecordDefinitionBrandId('brand-a');
const recordTypeKey = parseRecordDefinitionKey('dataRecord');
const draftStageKey = parseWorkflowStageKey('draft');
const reviewStageKey = parseWorkflowStageKey('review');
const publishedStageKey = parseWorkflowStageKey('published');
const firstTransitionId = deriveWorkflowTransitionId({ brandId, recordTypeKey, stableKey: 'submit' });
const secondTransitionId = deriveWorkflowTransitionId({ brandId, recordTypeKey, stableKey: 'publish' });
const automaticTransitionId = deriveWorkflowTransitionId({ brandId, recordTypeKey, stableKey: 'automaticReview' });
const actionId = parseActionDefinitionId('org.redbox.definition-validation');
let handlerInvocations = 0;

const handler: ActionHandler = () => {
  handlerInvocations += 1;
  return { schemaVersion: ACTION_RESULT_SCHEMA_VERSION, kind: 'no-change' };
};

function descriptor(): ActionRegistrationDescriptor {
  return {
    schemaVersion: ACTION_CONTRACT_SCHEMA_VERSION,
    id: actionId,
    contractVersion: 1,
    title: 'Definition validation action',
    description: 'Validates action references without executing this handler.',
    category: 'test',
    handler,
    contexts: ['workflow-transition'],
    modes: ['onTransitionWorkflow'],
    phases: ['pre'],
    allowRepeatedBindings: true,
    parameterSchema: {
      schemaVersion: ACTION_CONTRACT_SCHEMA_VERSION,
      parameters: [
        { name: 'label', title: 'Label', kind: 'string', required: true },
        { name: 'selector', title: 'Selector', kind: 'jsonata', required: true },
        {
          name: 'message',
          title: 'Message',
          kind: 'handlebars',
          destination: 'plain-text',
          required: true,
        },
        { name: 'credential', title: 'Credential', kind: 'secret', writeOnly: true, required: false },
      ],
    },
    outputSchema: {
      schemaVersion: ACTION_CONTRACT_SCHEMA_VERSION,
      fields: [{ name: 'reference', title: 'Reference', kind: 'string', required: false }],
      safeFields: ['reference'],
    },
    resultContract: { allowedKinds: ['no-change'] },
    executionPolicy: {
      timeout: { defaultMs: 1_000, minMs: 100, maxMs: 2_000 },
      retry: { allowed: false },
    },
  };
}

function registry(): RedboxActionRegistry {
  return buildActionRegistry([
    actionRegistrationSource('@researchdatabox/definition-validation-test', 'actions/index', () => [descriptor()]),
  ]);
}

function transitionScope(): RecordDefinitionActionBindingScopeDto {
  return {
    context: 'workflow-transition',
    mode: 'onTransitionWorkflow',
    phase: 'pre',
    scopeId: firstTransitionId,
  };
}

function actionBindings(): readonly RecordDefinitionActionBindingDto[] {
  const scope = transitionScope();
  const primaryId = deriveStableActionBindingId({
    recordTypeKey,
    scope,
    actionId,
    contractVersion: 1,
    stableKey: 'primary',
  });
  const primary: RecordDefinitionActionBindingDto = {
    schemaVersion: ACTION_CONTRACT_SCHEMA_VERSION,
    id: primaryId,
    stableKey: 'primary',
    actionId,
    contractVersion: 1,
    scope,
    parameters: {
      label: { kind: 'literal', value: 'notify' },
      selector: { kind: 'jsonata', expression: 'record.candidate.metadata.title' },
      message: { kind: 'handlebars', template: 'Published {{record.oid}}' },
      credential: { kind: 'secret', configured: true },
    },
    order: 10,
  };
  const dependentScope = transitionScope();
  return [
    primary,
    {
      ...primary,
      id: deriveStableActionBindingId({
        recordTypeKey,
        scope: dependentScope,
        actionId,
        contractVersion: 1,
        stableKey: 'dependent',
      }),
      stableKey: 'dependent',
      scope: dependentScope,
      parameters: {
        credential: { kind: 'secret', configured: false },
        message: { kind: 'handlebars', template: 'Confirmed {{record.oid}}' },
        selector: { kind: 'jsonata', expression: 'record.current.metadata.title' },
        label: { kind: 'literal', value: 'confirm' },
      },
      order: 20,
      dependencies: [{ bindingId: primaryId, condition: 'output-equals', field: 'reference', value: 'ready' }],
    },
  ];
}

function completeDraft(): DraftRecordDefinitionAggregateDto {
  return {
    schemaVersion: RECORD_DEFINITION_AGGREGATE_SCHEMA_VERSION,
    definitionState: 'draft-incomplete',
    recordType: {
      labels: { name: 'Data record', namePlural: 'Data records' },
      searchable: true,
      searchFilters: [
        {
          id: 'status',
          field: 'metadata.status',
          title: 'Status',
          kind: 'facet',
          typeLabel: null,
          alwaysActive: false,
        },
        {
          id: 'owner',
          field: 'metadata.owner',
          title: 'Owner',
          kind: 'exact',
          typeLabel: 'person',
          alwaysActive: true,
        },
      ],
      relationships: [
        {
          id: 'secondary',
          targetRecordTypeKey: parseRecordDefinitionKey('relatedB'),
          localField: 'metadata.secondaryId',
          foreignField: 'metadata.id',
          cardinality: 'many',
          direction: 'outbound',
          includeByDefault: false,
        },
        {
          id: 'primary',
          label: 'Primary record',
          targetRecordTypeKey: parseRecordDefinitionKey('relatedA'),
          localField: 'metadata.primaryId',
          foreignField: 'metadata.id',
          cardinality: 'one',
          direction: 'inbound',
          includeByDefault: true,
        },
      ],
      transferResponsibility: {
        fields: [
          {
            field: 'metadata.owner',
            label: 'Owner',
            updateAlso: ['metadata.delegate', 'metadata.contact'],
            fieldNames: [
              { name: 'ownerName', field: 'metadata.owner' },
              { name: 'contactName', field: 'metadata.contact' },
            ],
          },
          {
            field: 'metadata.delegate',
            label: 'Delegate',
            updateAlso: [],
            fieldNames: [{ name: 'delegateName', field: 'metadata.delegate' }],
          },
        ],
        roleRules: [
          { role: 'Researcher', editableFields: ['metadata.owner', 'metadata.delegate'] },
          { role: 'Admin', editableFields: ['metadata.delegate', 'metadata.owner'] },
        ],
      },
      validation: {
        mode: 'shadow',
        operations: [
          {
            name: 'publish',
            enabledValidationGroups: ['publication', 'core'],
            roles: ['Researcher', 'Admin'],
            allowedTargetStages: [publishedStageKey, reviewStageKey],
            mode: 'enforce',
          },
        ],
      },
      concurrency: { mode: 'strict' },
      dashboard: {
        schemaVersion: 1,
        showAdminSidebar: true,
        columns: [
          { id: 'status', title: 'Status', value: { kind: 'path', path: 'metadata.status' }, displayOrder: 1 },
          {
            id: 'title',
            title: 'Title',
            value: { kind: 'path', path: 'metadata.title' },
            render: { kind: 'handlebars', template: '{{record.oid}}' },
            displayOrder: 0,
          },
        ],
      },
    },
    stages: [
      {
        schemaVersion: RECORD_DEFINITION_STAGE_SCHEMA_VERSION,
        key: draftStageKey,
        label: 'Draft',
        formReference: 'record-form',
        viewRoles: ['Researcher', 'Admin'],
        editRoles: ['Researcher', 'Admin'],
        displayOrder: 0,
        starting: true,
        terminal: false,
        validationOverrides: [
          {
            name: 'publish',
            enabledValidationGroups: ['core'],
            roles: ['Admin'],
            allowedTargetStages: [reviewStageKey],
          },
        ],
      },
      {
        schemaVersion: RECORD_DEFINITION_STAGE_SCHEMA_VERSION,
        key: reviewStageKey,
        label: 'Review',
        formReference: 'record-form',
        viewRoles: ['Admin', 'Researcher'],
        editRoles: ['Admin', 'Researcher'],
        displayOrder: 1,
        starting: false,
        terminal: false,
        validationOverrides: [],
      },
      {
        schemaVersion: RECORD_DEFINITION_STAGE_SCHEMA_VERSION,
        key: publishedStageKey,
        label: 'Published',
        formReference: 'record-form',
        viewRoles: ['Researcher', 'Admin'],
        editRoles: ['Admin'],
        displayOrder: 2,
        starting: false,
        terminal: true,
        validationOverrides: [],
      },
    ],
    transitions: [
      {
        schemaVersion: RECORD_DEFINITION_TRANSITION_SCHEMA_VERSION,
        id: firstTransitionId,
        sourceStageKey: draftStageKey,
        targetStageKey: reviewStageKey,
        label: 'Submit for review',
        mode: 'manual',
        allowedRoles: ['Admin'],
        eligibilityCondition: 'record.candidate.metadata.ready = true',
        validationOperation: 'publish',
      },
      {
        schemaVersion: RECORD_DEFINITION_TRANSITION_SCHEMA_VERSION,
        id: automaticTransitionId,
        sourceStageKey: draftStageKey,
        targetStageKey: reviewStageKey,
        label: 'Automatically submit',
        mode: 'automatic',
        event: 'update',
        priority: 10,
        condition: 'record.candidate.metadata.auto = true',
      },
      {
        schemaVersion: RECORD_DEFINITION_TRANSITION_SCHEMA_VERSION,
        id: secondTransitionId,
        sourceStageKey: reviewStageKey,
        targetStageKey: publishedStageKey,
        label: 'Publish',
        mode: 'manual',
        allowedRoles: ['Admin'],
        validationOperation: 'publish',
      },
    ],
    actionBindings: actionBindings(),
  };
}

function publicationRequest(
  definition: RuntimeValue,
  overrides: Partial<Omit<RecordDefinitionPublicationValidationRequest, 'definition'>> = {}
): RecordDefinitionPublicationValidationRequest {
  return {
    brandId,
    recordTypeKey,
    draftVersion: 4,
    activeRevisionNumber: null,
    definition,
    actionRegistry: registry(),
    roles: ['Admin', 'Researcher'],
    administrativeRole: 'Admin',
    forms: [
      {
        reference: 'record-form',
        validationOperations: {
          publish: {
            enabledValidationGroups: ['publication', 'core'],
            label: 'Publish',
            description: 'Validate publication requirements.',
          },
        },
        validationGroups: {
          publication: { description: 'Publication validation.', initialMembership: 'none' },
          core: { description: 'Core validation.', initialMembership: 'all' },
        },
      },
    ],
    availableRecordTypeKeys: [
      recordTypeKey,
      parseRecordDefinitionKey('relatedA'),
      parseRecordDefinitionKey('relatedB'),
    ],
    storageCapabilityProvider: fullStorageCapabilityProvider(),
    activeDefinition: null,
    stageReferences: [],
    ...overrides,
  };
}

function fullStorageCapabilityProvider(): StorageCapabilityProvider {
  return {
    getCapabilities: () => ({ recordConcurrency: FULL_RECORD_STORAGE_CONCURRENCY_CAPABILITIES }),
  };
}

function assertPublicReports(
  report: RecordDefinitionValidationReportDto,
  impact: RecordDefinitionImpactReportDto
): void {
  assert.equal(recordDefinitionValidationReportSchema.safeParse(report).success, true);
  assert.equal(recordDefinitionImpactReportSchema.safeParse(impact).success, true);
}

function validResult(result: RecordDefinitionPublicationValidationResult): ValidatedRecordDefinitionPublication {
  if (!result.ok) assert.fail(`Expected publication validation to pass: ${JSON.stringify(result.report.issues)}`);
  assertPublicReports(result.report, result.impact);
  return result;
}

function invalidResult(result: RecordDefinitionPublicationValidationResult): InvalidRecordDefinitionPublication {
  if (result.ok) assert.fail('Expected publication validation to fail.');
  assertPublicReports(result.report, result.impact);
  return result;
}

function issueCodes(issues: readonly RecordDefinitionValidationIssueDto[]): readonly string[] {
  return issues.map(issue => issue.code);
}

function semanticallyReorderedDraft(): DraftRecordDefinitionAggregateDto {
  const source = completeDraft();
  const recordType = source.recordType;
  const transfer = recordType.transferResponsibility;
  const validation = recordType.validation;
  const dashboard = recordType.dashboard;
  assert.ok(transfer && validation && dashboard);
  return {
    ...source,
    recordType: {
      ...recordType,
      relationships: [...(recordType.relationships ?? [])].reverse(),
      transferResponsibility: {
        fields: [...(transfer.fields ?? [])].reverse().map(field => ({
          ...field,
          updateAlso: [...field.updateAlso].reverse(),
          fieldNames: [...field.fieldNames].reverse(),
        })),
        roleRules: [...(transfer.roleRules ?? [])]
          .reverse()
          .map(rule => ({ ...rule, editableFields: [...rule.editableFields].reverse() })),
      },
      validation: {
        ...validation,
        operations: (validation.operations ?? []).map(operation => ({
          ...operation,
          enabledValidationGroups: [...operation.enabledValidationGroups].reverse(),
          ...(operation.roles === undefined ? {} : { roles: [...operation.roles].reverse() }),
          ...(operation.allowedTargetStages === undefined
            ? {}
            : { allowedTargetStages: [...operation.allowedTargetStages].reverse() }),
        })),
      },
      dashboard: { ...dashboard, columns: [...dashboard.columns].reverse() },
    },
    stages: [...source.stages].reverse().map(stage => ({
      ...stage,
      viewRoles: [...(stage.viewRoles ?? [])].reverse(),
      editRoles: [...(stage.editRoles ?? [])].reverse(),
    })),
    transitions: [...source.transitions].reverse(),
    actionBindings: [...source.actionBindings].reverse().map(binding => ({
      ...binding,
      parameters: Object.fromEntries(
        Object.entries(binding.parameters)
          .reverse()
          .map(([name, value]) => [name, value])
      ),
    })),
  };
}

describe('record-definition canonicalization and authoritative validation', () => {
  beforeEach(() => {
    handlerInvocations = 0;
  });

  it('publishes a complete definition, canonicalizes semantic sets, hashes deterministically, and never runs handlers', () => {
    const original = completeDraft();
    const reordered = semanticallyReorderedDraft();
    const originalSnapshot = structuredClone(original);
    const first = validResult(validateRecordDefinitionForPublication(publicationRequest(original)));
    const second = validResult(validateRecordDefinitionForPublication(publicationRequest(reordered)));

    assert.equal(first.report.status, 'valid');
    assert.equal(first.report.definitionState, 'publishable');
    assert.equal(first.canonicalJson, second.canonicalJson);
    assert.equal(first.canonicalHash, second.canonicalHash);
    assert.equal(first.canonicalHash, hashRecordDefinition(first.definition));
    assert.equal(first.canonicalJson, serializeCanonicalRecordDefinition(first.definition));
    assert.deepEqual(original, originalSnapshot);
    assert.equal(Object.isFrozen(original), false);
    assert.equal(Object.isFrozen(first.definition), true);
    assert.equal(Object.isFrozen(first.definition.stages), true);
    assert.deepEqual(first.actionContracts, [{ actionId, contractVersion: 1 }]);
    assert.deepEqual(
      first.report.redactions.map(redaction => redaction.marker),
      [RECORD_DEFINITION_REDACTION_MARKER, RECORD_DEFINITION_REDACTION_MARKER]
    );
    assert.equal(handlerInvocations, 0);
  });

  it('preserves authoritative search-filter display order in canonical JSON and hashes', () => {
    const original = validResult(validateRecordDefinitionForPublication(publicationRequest(completeDraft())));
    const reversedSource = completeDraft();
    const reversed = validResult(
      validateRecordDefinitionForPublication(
        publicationRequest({
          ...reversedSource,
          recordType: {
            ...reversedSource.recordType,
            searchFilters: [...(reversedSource.recordType.searchFilters ?? [])].reverse(),
          },
        })
      )
    );

    assert.deepEqual(
      original.definition.recordType.searchFilters.map(filter => filter.id),
      ['status', 'owner']
    );
    assert.deepEqual(
      reversed.definition.recordType.searchFilters.map(filter => filter.id),
      ['owner', 'status']
    );
    assert.notEqual(original.canonicalJson, reversed.canonicalJson);
    assert.notEqual(original.canonicalHash, reversed.canonicalHash);
  });

  it('serializes direct numeric keys and adversarial Unicode as deterministic well-formed JSON', () => {
    const published = validResult(
      validateRecordDefinitionForPublication(publicationRequest(completeDraft()))
    ).definition;
    const numericValue = { 2: 'two', 10: 'ten' };
    const definition: PublishableRecordDefinitionAggregateDto = {
      ...published,
      recordType: {
        ...published.recordType,
        labels: { ...published.recordType.labels, name: `Line\u2028separator\ud800` },
      },
      actionBindings: published.actionBindings.map((binding, bindingIndex) => ({
        ...binding,
        ...(bindingIndex !== 1 || binding.dependencies === undefined
          ? {}
          : {
              dependencies: binding.dependencies.map(dependency =>
                dependency.condition === 'success' ? dependency : { ...dependency, value: numericValue }
              ),
            }),
      })),
    };

    const canonicalJson = serializeCanonicalRecordDefinition(definition);
    assert.doesNotThrow(() => JSON.parse(canonicalJson));
    assert.equal(canonicalJson.includes('"value":{"10":"ten","2":"two"}'), true);
    assert.equal(canonicalJson.includes('\u2028'), true);
    assert.equal(canonicalJson.includes('\\ud800'), true);
    assert.equal(canonicalJson, serializeCanonicalRecordDefinition(structuredClone(definition)));
    assert.equal(hashRecordDefinition(definition), hashRecordDefinition(structuredClone(definition)));
  });

  it('allows semantically incomplete drafts while enforcing bounded safe-data and managed-expression rules', () => {
    const incomplete: DraftRecordDefinitionAggregateDto = {
      schemaVersion: RECORD_DEFINITION_AGGREGATE_SCHEMA_VERSION,
      definitionState: 'draft-incomplete',
      recordType: {},
      stages: [{ schemaVersion: RECORD_DEFINITION_STAGE_SCHEMA_VERSION, key: draftStageKey }],
      transitions: [],
      actionBindings: [],
    };
    const valid = validateRecordDefinitionDraftPayload({
      brandId,
      recordTypeKey,
      draftVersion: 1,
      activeRevisionNumber: null,
      definition: incomplete,
    });
    assert.equal(valid.ok, true);
    assert.equal(valid.report.definitionState, 'draft-incomplete');

    const unknownProperty = validateRecordDefinitionDraftPayload({
      brandId,
      recordTypeKey,
      draftVersion: 1,
      activeRevisionNumber: null,
      definition: { ...incomplete, executable: 'return process.env' },
    });
    assert.equal(unknownProperty.ok, false);
    assert.deepEqual(
      unknownProperty.report.issues.map(issue => [issue.code, issue.path]),
      [['draft-unknown-property', '/executable']]
    );

    const nestedUnknown = validateRecordDefinitionDraftPayload({
      brandId,
      recordTypeKey,
      draftVersion: 1,
      activeRevisionNumber: null,
      definition: {
        ...incomplete,
        stages: [{ ...incomplete.stages[0], unsupported: true }],
      },
    });
    assert.deepEqual(
      nestedUnknown.report.issues.map(issue => [issue.code, issue.path]),
      [['draft-unknown-property', '/stages/0/unsupported']]
    );

    const deepSegment = `segment${'x'.repeat(55)}`;
    let deepValue: RuntimeValue = {};
    for (let depth = 0; depth < 40; depth += 1) deepValue = { [deepSegment]: deepValue };
    const deepResult = validateRecordDefinitionDraftPayload({
      brandId,
      recordTypeKey,
      draftVersion: 1,
      activeRevisionNumber: null,
      definition: { ...incomplete, unsupported: deepValue },
    });
    assert.equal(deepResult.report.issues[0]?.code, 'draft-payload-too-deep');
    assert.equal(deepResult.report.issues[0]?.path.startsWith('/unsupported'), true);
    assert.equal((deepResult.report.issues[0]?.path.length ?? 0) <= RECORD_DEFINITION_PATH_MAX_LENGTH, true);
    assert.equal(/~(?:[^01]|$)/.test(deepResult.report.issues[0]?.path ?? ''), false);
    const completeDeepPointer = `/unsupported${`/${deepSegment}`.repeat(40)}`;
    const boundedDeepPointer = deepResult.report.issues[0]?.path ?? '/';
    assert.equal(
      completeDeepPointer === boundedDeepPointer || completeDeepPointer.startsWith(`${boundedDeepPointer}/`),
      true
    );

    const escapedProperty = '~/'.repeat(64);
    const escapedResult = validateRecordDefinitionDraftPayload({
      brandId,
      recordTypeKey,
      draftVersion: 1,
      activeRevisionNumber: null,
      definition: { ...incomplete, [escapedProperty]: true },
    });
    const escapedPath = escapedResult.report.issues[0]?.path ?? '/';
    assert.equal(escapedPath.length <= RECORD_DEFINITION_PATH_MAX_LENGTH, true);
    assert.equal(/~(?:[^01]|$)/.test(escapedPath), false);
    assert.equal(escapedPath.slice(1).replace(/~1/g, '/').replace(/~0/g, '~'), escapedProperty);
    assert.equal(recordDefinitionValidationReportSchema.safeParse(escapedResult.report).success, true);

    const unsafeExpression: DraftRecordDefinitionAggregateDto = {
      ...incomplete,
      transitions: [
        {
          schemaVersion: RECORD_DEFINITION_TRANSITION_SCHEMA_VERSION,
          id: automaticTransitionId,
          condition: '$eval("1 + 1")',
        },
      ],
    };
    const expressionResult = validateRecordDefinitionDraftPayload({
      brandId,
      recordTypeKey,
      draftVersion: 1,
      activeRevisionNumber: null,
      definition: unsafeExpression,
    });
    assert.equal(expressionResult.ok, false);
    assert.deepEqual(
      expressionResult.report.issues.map(issue => [issue.code, issue.path]),
      [['invalid-jsonata-expression', '/transitions/0/condition']]
    );
    assert.equal(JSON.stringify(expressionResult.report).includes('$eval'), false);
  });

  it('rejects accessors before reading them and reports safe structural diagnostics', () => {
    let reads = 0;
    const input: Record<string, RuntimeValue> = {
      schemaVersion: RECORD_DEFINITION_AGGREGATE_SCHEMA_VERSION,
      definitionState: 'draft-incomplete',
      stages: [],
      transitions: [],
      actionBindings: [],
    };
    Object.defineProperty(input, 'recordType', {
      enumerable: true,
      get: () => {
        reads += 1;
        return {};
      },
    });
    const result = validateRecordDefinitionDraftPayload({
      brandId,
      recordTypeKey,
      draftVersion: 1,
      activeRevisionNumber: null,
      definition: input,
    });
    assert.equal(result.ok, false);
    assert.equal(reads, 0);
    assert.equal(result.report.issues[0]?.code, 'draft-payload-unsafe-structure');
    assert.equal(result.report.issues[0]?.path, '/recordType');
  });

  it('marks impact incomplete only when shape errors make core graph fields unusable', () => {
    const source = completeDraft();
    const result = invalidResult(
      validateRecordDefinitionForPublication(publicationRequest({ ...source, stages: 'not-a-stage-array' }))
    );
    assert.equal(issueCodes(result.report.issues).includes('draft-invalid-payload'), true);
    assert.equal(result.impact.status, 'blocked');
    assert.equal(result.impact.stageImpacts.length, 0);
    assert.equal(result.impact.truncated, true);
  });

  it('rejects duplicate identities, invalid edges, unreachable stages, and graphs with no terminal path', () => {
    const source = completeDraft();
    const orphanKey = parseWorkflowStageKey('orphan');
    const orphan: DraftWorkflowStageDto = {
      ...source.stages[2],
      key: orphanKey,
      label: 'Orphan',
      displayOrder: 3,
      starting: false,
    };
    const brokenEdge: DraftWorkflowTransitionDto = {
      ...source.transitions[2],
      targetStageKey: parseWorkflowStageKey('missing'),
      allowedRoles: [],
      event: 'update',
    };
    const duplicate: DraftWorkflowTransitionDto = {
      ...source.transitions[1],
      id: source.transitions[1].id,
      allowedRoles: ['Admin'],
    };
    const invalid = {
      ...source,
      stages: [...source.stages, orphan, { ...orphan, key: draftStageKey }],
      transitions: [...source.transitions.slice(0, 2), brokenEdge, duplicate],
    };
    const result = invalidResult(validateRecordDefinitionForPublication(publicationRequest(invalid)));
    const codes = issueCodes(result.report.issues);
    assert.equal(codes.includes('duplicate-stage-key'), true);
    assert.equal(codes.includes('duplicate-stage-display-order'), true);
    assert.equal(codes.includes('duplicate-transition-id'), true);
    assert.equal(codes.includes('duplicate-automatic-priority'), true);
    assert.equal(codes.includes('manual-transition-role-required'), true);
    assert.equal(codes.includes('manual-transition-field-not-allowed'), true);
    assert.equal(codes.includes('automatic-transition-field-not-allowed'), true);
    assert.equal(codes.includes('transition-target-stage-not-found'), true);
    assert.equal(codes.includes('unreachable-stage'), true);

    const noStart = {
      ...source,
      stages: source.stages.map(stage => ({ ...stage, starting: false })),
    };
    const startResult = invalidResult(validateRecordDefinitionForPublication(publicationRequest(noStart)));
    assert.equal(issueCodes(startResult.report.issues).includes('starting-stage-count-invalid'), true);

    const noTerminal = {
      ...source,
      stages: source.stages.map(stage => ({ ...stage, terminal: false })),
    };
    const terminalResult = invalidResult(validateRecordDefinitionForPublication(publicationRequest(noTerminal)));
    assert.equal(issueCodes(terminalResult.report.issues).includes('non-terminal-stage-has-no-exit'), true);
    assert.equal(issueCodes(terminalResult.report.issues).includes('non-terminal-stage-has-no-terminal-path'), true);
  });

  it('validates roles, forms, operation references, groups, policy narrowing, and storage capabilities', () => {
    const source = completeDraft();
    const missingTarget = parseWorkflowStageKey('missing');
    const invalid = {
      ...source,
      recordType: {
        ...source.recordType,
        validation: {
          mode: 'enforce' as const,
          operations: [
            {
              name: 'publish',
              enabledValidationGroups: ['missingGroup'],
              roles: ['Admin'],
              allowedTargetStages: [reviewStageKey],
            },
          ],
        },
      },
      stages: source.stages.map((stage, index) =>
        index === 0
          ? {
              ...stage,
              formReference: 'missing-form',
              validationOverrides: [
                {
                  name: 'publish',
                  enabledValidationGroups: ['missingGroup'],
                  roles: ['Researcher'],
                  allowedTargetStages: [publishedStageKey, missingTarget],
                },
              ],
            }
          : index === 1
            ? { ...stage, viewRoles: ['Ghost'], editRoles: ['Ghost'] }
            : stage
      ),
      transitions: source.transitions.map((transition, index) =>
        index === 0
          ? { ...transition, allowedRoles: ['Researcher'] }
          : index === 2
            ? { ...transition, validationOperation: 'notDeclared' }
            : transition
      ),
    };
    const result = invalidResult(
      validateRecordDefinitionForPublication(publicationRequest(invalid, { storageCapabilityProvider: undefined }))
    );
    const codes = issueCodes(result.report.issues);
    for (const expected of [
      'form-not-found',
      'role-not-found',
      'administrative-stage-lockout',
      'manual-transition-role-not-authorized',
      'validation-group-not-found',
      'stage-validation-role-broadening',
      'stage-validation-target-broadening',
      'validation-target-stage-not-found',
      'validation-operation-not-found',
      'validation-role-not-authorized',
      'storage-concurrency-capability-unavailable',
    ]) {
      assert.equal(codes.includes(expected), true, `Expected ${expected}: ${JSON.stringify(result.report.issues)}`);
    }

    const targetFormDraft = completeDraft();
    const targetFormDefinition = {
      ...targetFormDraft,
      stages: targetFormDraft.stages.map((stage, index) =>
        index === 2 ? { ...stage, formReference: 'publish-form' } : stage
      ),
    };
    const targetFormResult = invalidResult(
      validateRecordDefinitionForPublication(
        publicationRequest(targetFormDefinition, {
          forms: [
            {
              reference: 'record-form',
              validationOperations: {
                publish: { enabledValidationGroups: ['publication', 'core'] },
              },
              validationGroups: {
                publication: { description: 'Publication validation.' },
                core: { description: 'Core validation.' },
              },
            },
            {
              reference: 'publish-form',
              validationOperations: {},
              validationGroups: {
                publication: { description: 'Publication validation.' },
                core: { description: 'Core validation.' },
              },
            },
          ],
        })
      )
    );
    assert.equal(
      targetFormResult.report.issues.some(
        issue =>
          issue.code === 'form-validation-operation-not-found' && issue.path === '/transitions/2/validationOperation'
      ),
      true
    );
  });

  it('intersects full form, record-type, and stage operation restrictions while preserving omission and empty denial', () => {
    const inheritedSource = completeDraft();
    const inheritedValidation = inheritedSource.recordType.validation;
    const inheritedOperation = inheritedValidation?.operations?.[0];
    const defaultForm = publicationRequest(inheritedSource).forms[0];
    assert.ok(inheritedValidation && inheritedOperation && defaultForm);
    const { roles: _roles, allowedTargetStages: _targets, ...operationWithInheritedRestrictions } = inheritedOperation;
    const inheritedDefinition: DraftRecordDefinitionAggregateDto = {
      ...inheritedSource,
      recordType: {
        ...inheritedSource.recordType,
        validation: { ...inheritedValidation, operations: [operationWithInheritedRestrictions] },
      },
    };
    const formRestricted = invalidResult(
      validateRecordDefinitionForPublication(
        publicationRequest(inheritedDefinition, {
          forms: [
            {
              ...defaultForm,
              validationOperations: {
                publish: {
                  ...defaultForm.validationOperations.publish,
                  roles: ['Researcher'],
                  allowedTargetSteps: ['review'],
                },
              },
            },
          ],
        })
      )
    );
    assert.equal(
      formRestricted.report.issues.some(
        issue => issue.code === 'validation-role-not-authorized' && issue.path === '/transitions/0/allowedRoles/0'
      ),
      true
    );
    assert.equal(
      formRestricted.report.issues.some(
        issue => issue.code === 'validation-target-not-allowed' && issue.path === '/transitions/2/validationOperation'
      ),
      true
    );

    const formDenied = invalidResult(
      validateRecordDefinitionForPublication(
        publicationRequest(inheritedDefinition, {
          forms: [
            {
              ...defaultForm,
              validationOperations: {
                publish: {
                  ...defaultForm.validationOperations.publish,
                  roles: [],
                  allowedTargetSteps: [],
                },
              },
            },
          ],
        })
      )
    );
    assert.equal(issueCodes(formDenied.report.issues).includes('validation-role-not-authorized'), true);
    assert.equal(issueCodes(formDenied.report.issues).includes('validation-target-not-allowed'), true);

    const recordDeniedSource = completeDraft();
    const recordDeniedValidation = recordDeniedSource.recordType.validation;
    const recordDeniedOperation = recordDeniedValidation?.operations?.[0];
    assert.ok(recordDeniedValidation && recordDeniedOperation);
    const recordDenied = invalidResult(
      validateRecordDefinitionForPublication(
        publicationRequest({
          ...recordDeniedSource,
          recordType: {
            ...recordDeniedSource.recordType,
            validation: {
              ...recordDeniedValidation,
              operations: [{ ...recordDeniedOperation, roles: [], allowedTargetStages: [] }],
            },
          },
        })
      )
    );
    assert.equal(issueCodes(recordDenied.report.issues).includes('validation-role-not-authorized'), true);
    assert.equal(issueCodes(recordDenied.report.issues).includes('validation-target-not-allowed'), true);

    const stageDeniedSource = completeDraft();
    const stageDeniedValidation = stageDeniedSource.recordType.validation;
    const stageDeniedOperation = stageDeniedValidation?.operations?.[0];
    assert.ok(stageDeniedValidation && stageDeniedOperation);
    const {
      roles: _recordRoles,
      allowedTargetStages: _recordTargets,
      ...stageInheritedOperation
    } = stageDeniedOperation;
    const stageDenied = invalidResult(
      validateRecordDefinitionForPublication(
        publicationRequest({
          ...stageDeniedSource,
          recordType: {
            ...stageDeniedSource.recordType,
            validation: { ...stageDeniedValidation, operations: [stageInheritedOperation] },
          },
          stages: stageDeniedSource.stages.map(stage =>
            stage.key === reviewStageKey
              ? {
                  ...stage,
                  validationOverrides: [
                    {
                      name: 'publish',
                      enabledValidationGroups: ['core'],
                      roles: [],
                      allowedTargetStages: [],
                    },
                  ],
                }
              : stage
          ),
        })
      )
    );
    assert.equal(
      stageDenied.report.issues.some(
        issue => issue.code === 'validation-role-not-authorized' && issue.path === '/transitions/0/allowedRoles/0'
      ),
      true
    );
    assert.equal(
      stageDenied.report.issues.some(
        issue => issue.code === 'validation-target-not-allowed' && issue.path === '/transitions/0/validationOperation'
      ),
      true
    );
  });

  it('requires the established complete versioned storage capability only for strict publication', () => {
    const partialProvider = {
      getCapabilities: () => ({
        recordConcurrency: {
          version: 1,
          conditionalActiveCreate: true,
        },
      }),
    } as StorageCapabilityProvider;
    const wrongVersionProvider = {
      getCapabilities: () => ({
        recordConcurrency: { ...FULL_RECORD_STORAGE_CONCURRENCY_CAPABILITIES, version: 2 },
      }),
    } as unknown as StorageCapabilityProvider;
    const throwingProvider: StorageCapabilityProvider = {
      getCapabilities: () => {
        throw new Error('sensitive provider failure');
      },
    };

    for (const provider of [undefined, partialProvider, wrongVersionProvider, throwingProvider]) {
      const result = invalidResult(
        validateRecordDefinitionForPublication(
          publicationRequest(completeDraft(), { storageCapabilityProvider: provider })
        )
      );
      assert.equal(issueCodes(result.report.issues).includes('storage-concurrency-capability-unavailable'), true);
      assert.equal(JSON.stringify(result.report).includes('sensitive provider failure'), false);
    }

    const complete = validResult(
      validateRecordDefinitionForPublication(
        publicationRequest(completeDraft(), { storageCapabilityProvider: fullStorageCapabilityProvider() })
      )
    );
    assert.equal(issueCodes(complete.report.issues).includes('storage-concurrency-capability-unavailable'), false);

    const permissiveSource = completeDraft();
    const permissive = validResult(
      validateRecordDefinitionForPublication(
        publicationRequest(
          {
            ...permissiveSource,
            recordType: { ...permissiveSource.recordType, concurrency: { mode: 'observe' } },
          },
          { storageCapabilityProvider: undefined }
        )
      )
    );
    assert.equal(issueCodes(permissive.report.issues).includes('storage-concurrency-capability-unavailable'), false);
  });

  it('validates record-type collections and immutable graph references', () => {
    const active = validResult(validateRecordDefinitionForPublication(publicationRequest(completeDraft()))).definition;
    const source = completeDraft();
    const firstFilter = source.recordType.searchFilters?.[0];
    const firstRelationship = source.recordType.relationships?.[0];
    const transfer = source.recordType.transferResponsibility;
    assert.ok(firstFilter && firstRelationship && transfer?.fields && transfer.roleRules);
    const changedBaseKey = parseRecordDefinitionKey('relatedB');
    const activeWithBase: PublishableRecordDefinitionAggregateDto = {
      ...active,
      stages: active.stages.map((stage, index) =>
        index === 0 ? { ...stage, baseRecordTypeKey: parseRecordDefinitionKey('relatedA') } : stage
      ),
    };
    const invalid = {
      ...source,
      recordType: {
        ...source.recordType,
        searchFilters: [...(source.recordType.searchFilters ?? []), { ...firstFilter }],
        relationships: [
          ...(source.recordType.relationships ?? []),
          {
            ...firstRelationship,
            targetRecordTypeKey: parseRecordDefinitionKey('notAvailable'),
          },
        ],
        transferResponsibility: {
          fields: [...transfer.fields, { ...transfer.fields[0] }],
          roleRules: [...transfer.roleRules, { ...transfer.roleRules[0], editableFields: ['metadata.notDeclared'] }],
        },
      },
      stages: source.stages.map((stage, index) =>
        index === 0 ? { ...stage, baseRecordTypeKey: changedBaseKey } : stage
      ),
    };
    const result = invalidResult(
      validateRecordDefinitionForPublication(
        publicationRequest(invalid, { activeDefinition: activeWithBase, activeRevisionNumber: 1 })
      )
    );
    const codes = issueCodes(result.report.issues);
    for (const expected of [
      'duplicate-search-filter-id',
      'duplicate-relationship-id',
      'record-type-reference-not-found',
      'duplicate-transfer-field',
      'duplicate-transfer-role-rule',
      'transfer-role-field-not-found',
      'base-record-type-changed',
    ]) {
      assert.equal(codes.includes(expected), true, `Expected ${expected}: ${JSON.stringify(result.report.issues)}`);
    }

    const addedBase = completeDraft();
    const addedBaseResult = invalidResult(
      validateRecordDefinitionForPublication(
        publicationRequest(
          {
            ...addedBase,
            stages: addedBase.stages.map((stage, index) =>
              index === 0 ? { ...stage, baseRecordTypeKey: changedBaseKey } : stage
            ),
          },
          { activeDefinition: active, activeRevisionNumber: 1 }
        )
      )
    );
    assert.equal(issueCodes(addedBaseResult.report.issues).includes('base-record-type-changed'), true);
  });

  it('validates exact actions, scopes, parameters, dependencies, expressions, and policies without executing a handler', () => {
    const source = completeDraft();
    const missingScope = deriveWorkflowTransitionId({ brandId, recordTypeKey, stableKey: 'missingScope' });
    const scope: RecordDefinitionActionBindingScopeDto = {
      context: 'workflow-transition',
      mode: 'onTransitionWorkflow',
      phase: 'pre',
      scopeId: missingScope,
    };
    const bindings: RecordDefinitionActionBindingDto[] = source.actionBindings.map((binding, index) => {
      if (index === 0) {
        return {
          ...binding,
          id: deriveStableActionBindingId({
            recordTypeKey,
            scope,
            actionId: 'org.redbox.missing-action',
            contractVersion: 2,
            stableKey: binding.stableKey,
          }),
          actionId: 'org.redbox.missing-action',
          contractVersion: 2,
          scope,
        };
      }
      return {
        ...binding,
        parameters: { ...binding.parameters, label: { kind: 'literal' as const, value: 42 } },
        order: 5,
        policyOverrides: { timeoutMs: 2_001 },
      };
    });
    const primary = source.actionBindings[0];
    assert.ok(primary);
    bindings.push({
      ...primary,
      id: deriveStableActionBindingId({
        recordTypeKey,
        scope: primary.scope,
        actionId,
        contractVersion: 2,
        stableKey: 'unsupported',
      }),
      stableKey: 'unsupported',
      contractVersion: 2,
      order: 30,
    });
    const result = invalidResult(
      validateRecordDefinitionForPublication(publicationRequest({ ...source, actionBindings: bindings }))
    );
    const codes = issueCodes(result.report.issues);
    assert.equal(codes.includes('transition-action-scope-not-found'), true);
    assert.equal(codes.includes('unknown-action'), true);
    assert.equal(codes.includes('unsupported-action'), true);
    assert.equal(codes.includes('missing-action-dependency'), true);
    assert.equal(codes.includes('invalid-action-parameter'), true);
    assert.equal(codes.includes('action-policy-exceeds-bounds'), true);

    const expressionBindings = bindings.map((binding, index) =>
      index === 0
        ? {
            ...binding,
            parameters: {
              ...binding.parameters,
              selector: { kind: 'jsonata' as const, expression: '$process.pid' },
            },
          }
        : binding
    );
    const expressionResult = invalidResult(
      validateRecordDefinitionForPublication(publicationRequest({ ...source, actionBindings: expressionBindings }))
    );
    assert.equal(issueCodes(expressionResult.report.issues).includes('invalid-jsonata-expression'), true);
    assert.equal(issueCodes(expressionResult.report.issues).includes('unknown-action'), true);
    assert.equal(handlerInvocations, 0);
    assert.equal(JSON.stringify(expressionResult.report).includes('$process'), false);
  });

  for (const location of ['recordType', 'stage'] as const) {
    for (const expression of ['record.candidate.metadata.title', '"constant"', '$process.pid']) {
      it(`rejects ${location} dashboard JSONata at publication even with a render template: ${expression}`, () => {
        const source = completeDraft();
        const dashboard = {
          schemaVersion: 1 as const,
          showAdminSidebar: true,
          columns: [
            {
              id: 'computed',
              title: 'Computed',
              value: { kind: 'jsonata' as const, expression },
              render: { kind: 'handlebars' as const, template: '{{metadata.title}}' },
              displayOrder: 0,
            },
          ],
        };
        const candidate = {
          ...source,
          recordType: { ...source.recordType, ...(location === 'recordType' ? { dashboard } : {}) },
          stages: source.stages.map((stage, index) => ({
            ...stage,
            ...(location === 'stage' && index === 0 ? { dashboard } : {}),
          })),
        };
        const result = invalidResult(validateRecordDefinitionForPublication(publicationRequest(candidate)));
        assert.deepEqual(
          result.report.issues.filter(issue => issue.code === 'unsupported-dashboard-value').map(issue => issue.path),
          [location === 'recordType' ? '/recordType/dashboard/columns/0/value' : '/stages/0/dashboard/columns/0/value']
        );
        if (expression !== '$process.pid') {
          assert.equal(
            validateRecordDefinitionDraftPayload({
              brandId,
              recordTypeKey,
              draftVersion: 1,
              activeRevisionNumber: null,
              definition: candidate,
            }).ok,
            true
          );
        }
      });
    }
  }

  for (const location of ['recordType', 'stage'] as const) {
    for (const path of [
      'metadata.keywords.0',
      'metadata.rows.0.1.title',
      ...[
        'metadata..0',
        'metadata.keywords.',
        'metadata.__proto__.0',
        'metadata.constructor.name',
        'metadata.prototype.0',
        'metadata.[0]',
        'metadata.0}}',
        'lookup metadata 0',
        '@root.metadata.0',
        '../metadata.0',
      ],
    ]) {
      it(`validates ${location} dashboard property path ${path} before publication`, () => {
        const source = completeDraft();
        const dashboard = {
          schemaVersion: 1 as const,
          showAdminSidebar: false,
          columns: [{ id: 'path', title: 'Path', displayOrder: 0, value: { kind: 'path' as const, path } }],
        };
        const candidate = {
          ...source,
          recordType: { ...source.recordType, ...(location === 'recordType' ? { dashboard } : {}) },
          stages: source.stages.map((stage, index) => ({
            ...stage,
            ...(location === 'stage' && index === 0 ? { dashboard } : {}),
          })),
        };
        const result = validateRecordDefinitionForPublication(publicationRequest(candidate));
        if (['metadata.keywords.0', 'metadata.rows.0.1.title'].includes(path)) validResult(result);
        else {
          const rejected = invalidResult(result);
          assert.ok(
            rejected.report.issues.some(
              issue =>
                issue.path ===
                (location === 'recordType'
                  ? '/recordType/dashboard/columns/0/value/path'
                  : '/stages/0/dashboard/columns/0/value/path')
            )
          );
        }
      });
    }
  }

  it('reports invalid dashboard expressions and templates at UI-addressable paths', () => {
    const source = completeDraft();
    const dashboard = source.recordType.dashboard;
    assert.ok(dashboard);
    const invalid = {
      ...source,
      recordType: {
        ...source.recordType,
        dashboard: {
          ...dashboard,
          columns: dashboard.columns.map((column, index) =>
            index === 1
              ? {
                  ...column,
                  value: { kind: 'jsonata' as const, expression: '$process.pid' },
                  render: { kind: 'handlebars' as const, template: '{{{record.oid}}}' },
                }
              : column
          ),
        },
      },
    };
    const result = invalidResult(validateRecordDefinitionForPublication(publicationRequest(invalid)));
    assert.deepEqual(
      result.report.issues.filter(issue => issue.code.startsWith('invalid-')).map(issue => [issue.code, issue.path]),
      [
        ['invalid-handlebars-template', '/recordType/dashboard/columns/1/render/template'],
        ['invalid-jsonata-expression', '/recordType/dashboard/columns/1/value/expression'],
      ]
    );
  });

  it('blocks missing referenced stage keys as removals without inferring rename identity from display order', () => {
    const published = validResult(
      validateRecordDefinitionForPublication(publicationRequest(completeDraft()))
    ).definition;
    const references = [{ stageKey: publishedStageKey, recordCount: 7 }];
    const removed = completeDraft();
    const removalResult = invalidResult(
      validateRecordDefinitionForPublication(
        publicationRequest(
          { ...removed, stages: removed.stages.filter(stage => stage.key !== publishedStageKey) },
          { activeDefinition: published, activeRevisionNumber: 1, stageReferences: references }
        )
      )
    );
    assert.equal(issueCodes(removalResult.report.issues).includes('referenced-stage-removed'), true);
    assert.equal(removalResult.impact.status, 'blocked');
    assert.equal(removalResult.impact.affectedRecordCount, 7);

    const shapeAndRemovalResult = invalidResult(
      validateRecordDefinitionForPublication(
        publicationRequest(
          {
            ...removed,
            stages: removed.stages.filter(stage => stage.key !== publishedStageKey),
            harmlessUnknownRootProperty: true,
          },
          { activeDefinition: published, activeRevisionNumber: 1, stageReferences: references }
        )
      )
    );
    assert.equal(issueCodes(shapeAndRemovalResult.report.issues).includes('draft-unknown-property'), true);
    assert.equal(issueCodes(shapeAndRemovalResult.report.issues).includes('referenced-stage-removed'), true);
    assert.equal(shapeAndRemovalResult.impact.status, 'blocked');
    assert.equal(shapeAndRemovalResult.impact.affectedRecordCount, 7);
    assert.equal(shapeAndRemovalResult.impact.stageImpacts[0]?.effect, 'blocked-removal');
    assert.equal(shapeAndRemovalResult.impact.truncated, false);

    const renamedKey = parseWorkflowStageKey('archived');
    const renameSource = completeDraft();
    const renamed = {
      ...renameSource,
      recordType: {
        ...renameSource.recordType,
        validation: {
          ...renameSource.recordType.validation,
          operations: renameSource.recordType.validation?.operations?.map(operation => ({
            ...operation,
            allowedTargetStages: (operation.allowedTargetStages ?? []).map(target =>
              target === publishedStageKey ? renamedKey : target
            ),
          })),
        },
      },
      stages: renameSource.stages.map(stage =>
        stage.key === publishedStageKey ? { ...stage, key: renamedKey, label: 'Archived' } : stage
      ),
      transitions: renameSource.transitions.map(transition =>
        transition.targetStageKey === publishedStageKey ? { ...transition, targetStageKey: renamedKey } : transition
      ),
    };
    const renameResult = invalidResult(
      validateRecordDefinitionForPublication(
        publicationRequest(renamed, {
          activeDefinition: published,
          activeRevisionNumber: 1,
          stageReferences: references,
        })
      )
    );
    const conservativeRemovalIssue = renameResult.report.issues.find(
      issue => issue.code === 'referenced-stage-removed'
    );
    assert.equal(conservativeRemovalIssue?.path, '/stages');
    assert.equal(issueCodes(renameResult.report.issues).includes('referenced-stage-renamed'), false);
    assert.equal(renameResult.impact.stageImpacts[0]?.effect, 'blocked-removal');

    const labelSource = completeDraft();
    const labelOnly = {
      ...labelSource,
      stages: labelSource.stages.map(stage =>
        stage.key === publishedStageKey ? { ...stage, label: 'Preserved key, new label' } : stage
      ),
    };
    const labelResult = validResult(
      validateRecordDefinitionForPublication(
        publicationRequest(labelOnly, {
          activeDefinition: published,
          activeRevisionNumber: 1,
          stageReferences: references,
        })
      )
    );
    assert.equal(labelResult.impact.status, 'warning');
    assert.equal(labelResult.impact.stageImpacts[0]?.effect, 'label-only');
  });

  it('omits malformed and oversized stage-reference keys from schema-valid bounded impact reports', () => {
    const published = validResult(
      validateRecordDefinitionForPublication(publicationRequest(completeDraft()))
    ).definition;
    const malformedStageKey = 'not/a/stage' as typeof publishedStageKey;
    const oversizedStageKey = 'x'.repeat(4_096) as typeof publishedStageKey;
    const result = invalidResult(
      validateRecordDefinitionForPublication(
        publicationRequest(completeDraft(), {
          activeDefinition: published,
          activeRevisionNumber: 1,
          stageReferences: [
            { stageKey: publishedStageKey, recordCount: 3 },
            { stageKey: malformedStageKey, recordCount: 5 },
            { stageKey: oversizedStageKey, recordCount: 7 },
          ],
        })
      )
    );

    assert.deepEqual(
      result.report.issues.filter(issue => issue.code === 'validation-catalog-invalid').map(issue => issue.path),
      ['/validationContext/stageReferences/1/stageKey', '/validationContext/stageReferences/2/stageKey']
    );
    assert.equal(result.impact.status, 'blocked');
    assert.equal(result.impact.truncated, true);
    assert.equal(result.impact.affectedRecordCount, 0);
    assert.deepEqual(result.impact.stageImpacts, [
      { stageKey: publishedStageKey, referencedRecordCount: 3, effect: 'unchanged' },
    ]);
    assert.equal(JSON.stringify(result.impact).includes(malformedStageKey), false);
    assert.equal(JSON.stringify(result.impact).includes(oversizedStageKey), false);
    assert.equal(recordDefinitionImpactReportSchema.safeParse(result.impact).success, true);
  });

  it('rejects inherited, accessor-backed, and malformed stage references without executing getters', () => {
    const published = validResult(
      validateRecordDefinitionForPublication(publicationRequest(completeDraft()))
    ).definition;
    const inheritedReference = Object.create({
      stageKey: publishedStageKey,
      recordCount: 11,
    }) as Record<string, RuntimeValue>;
    const customPrototypeReference = Object.create({ catalogEntry: true }) as Record<string, RuntimeValue>;
    customPrototypeReference.stageKey = publishedStageKey;
    customPrototypeReference.recordCount = 13;

    let stageKeyReads = 0;
    const stageKeyAccessor: Record<string, RuntimeValue> = { recordCount: 17 };
    Object.defineProperty(stageKeyAccessor, 'stageKey', {
      enumerable: true,
      get: () => {
        stageKeyReads += 1;
        return publishedStageKey;
      },
    });

    let recordCountReads = 0;
    const recordCountAccessor: Record<string, RuntimeValue> = { stageKey: publishedStageKey };
    Object.defineProperty(recordCountAccessor, 'recordCount', {
      enumerable: true,
      get: () => {
        recordCountReads += 1;
        return 19;
      },
    });

    let throwingGetterReads = 0;
    const throwingAccessor: Record<string, RuntimeValue> = { recordCount: 23 };
    Object.defineProperty(throwingAccessor, 'stageKey', {
      enumerable: true,
      get: () => {
        throwingGetterReads += 1;
        throw new Error('stage-reference getter must not run');
      },
    });

    const adversarialReferences: RuntimeValue[] = [
      { stageKey: publishedStageKey, recordCount: 3 },
      inheritedReference,
      customPrototypeReference,
      stageKeyAccessor,
      recordCountAccessor,
      throwingAccessor,
      { stageKey: publishedStageKey },
      null,
    ];
    const result = invalidResult(
      validateRecordDefinitionForPublication(
        publicationRequest(completeDraft(), {
          activeDefinition: published,
          activeRevisionNumber: 1,
          stageReferences: adversarialReferences as RecordDefinitionPublicationValidationRequest['stageReferences'],
        })
      )
    );

    assert.equal(stageKeyReads, 0);
    assert.equal(recordCountReads, 0);
    assert.equal(throwingGetterReads, 0);
    assert.deepEqual(
      result.report.issues.filter(issue => issue.code === 'validation-catalog-invalid').map(issue => issue.path),
      [
        '/validationContext/stageReferences/1',
        '/validationContext/stageReferences/2',
        '/validationContext/stageReferences/3',
        '/validationContext/stageReferences/4',
        '/validationContext/stageReferences/5',
        '/validationContext/stageReferences/6',
        '/validationContext/stageReferences/7',
      ]
    );
    assert.equal(result.impact.status, 'blocked');
    assert.equal(result.impact.truncated, true);
    assert.equal(result.impact.affectedRecordCount, 0);
    assert.deepEqual(result.impact.stageImpacts, [
      { stageKey: publishedStageKey, referencedRecordCount: 3, effect: 'unchanged' },
    ]);
    assert.equal(result.impact.stageImpacts.length <= RECORD_DEFINITION_CONTRACT_LIMITS.maxStages, true);
    assert.equal(recordDefinitionImpactReportSchema.safeParse(result.impact).success, true);
  });

  it('bounds, sorts, deduplicates, and repeats publication diagnostics deterministically', () => {
    const source = completeDraft();
    const stages: DraftWorkflowStageDto[] = Array.from({ length: 100 }, (_, index) => ({
      schemaVersion: RECORD_DEFINITION_STAGE_SCHEMA_VERSION,
      key: parseWorkflowStageKey(`stage${index}`),
    }));
    const invalid = { ...source, stages, transitions: [], actionBindings: [] };
    const first = invalidResult(validateRecordDefinitionForPublication(publicationRequest(invalid)));
    const second = invalidResult(validateRecordDefinitionForPublication(publicationRequest(invalid)));

    assert.deepEqual(first.report, second.report);
    assert.deepEqual(first.impact, second.impact);
    assert.equal(first.report.issues.length, RECORD_DEFINITION_VALIDATION_LIMITS.maxIssues);
    assert.equal(first.report.truncated, true);
    assert.equal(
      first.report.issues.every(issue => issue.path.startsWith('/')),
      true
    );
    assert.equal(
      first.report.issues.every(issue => issue.message.length <= 1_000),
      true
    );
    const ordered = [...first.report.issues].sort(
      (left, right) =>
        left.path.localeCompare(right.path) ||
        left.code.localeCompare(right.code) ||
        left.message.localeCompare(right.message)
    );
    assert.deepEqual(first.report.issues, ordered);
  });

  it('marks validation and impact reports when redactions cross the exact public cap', () => {
    const definitionWithSecretBindings = (count: number): DraftRecordDefinitionAggregateDto => {
      const source = completeDraft();
      const template = source.actionBindings[0];
      assert.ok(template);
      return {
        ...source,
        actionBindings: Array.from({ length: count }, (_, index) => {
          const stableKey = `secret-${index}`;
          return {
            ...template,
            id: deriveStableActionBindingId({
              recordTypeKey,
              scope: template.scope,
              actionId,
              contractVersion: 1,
              stableKey,
            }),
            stableKey,
            parameters: {
              ...template.parameters,
              credential: { kind: 'secret', configured: true },
            },
            order: index,
          };
        }),
      };
    };
    const exact = validResult(
      validateRecordDefinitionForPublication(
        publicationRequest(definitionWithSecretBindings(RECORD_DEFINITION_VALIDATION_LIMITS.maxIssues))
      )
    );
    assert.equal(exact.report.redactions.length, RECORD_DEFINITION_VALIDATION_LIMITS.maxIssues);
    assert.equal(exact.impact.redactions.length, RECORD_DEFINITION_VALIDATION_LIMITS.maxIssues);
    assert.equal(exact.report.truncated, false);
    assert.equal(exact.impact.truncated, false);

    const overflow = validResult(
      validateRecordDefinitionForPublication(
        publicationRequest(definitionWithSecretBindings(RECORD_DEFINITION_VALIDATION_LIMITS.maxIssues + 1))
      )
    );
    assert.equal(overflow.report.redactions.length, RECORD_DEFINITION_VALIDATION_LIMITS.maxIssues);
    assert.equal(overflow.impact.redactions.length, RECORD_DEFINITION_VALIDATION_LIMITS.maxIssues);
    assert.equal(overflow.report.truncated, true);
    assert.equal(overflow.impact.truncated, true);
    assert.deepEqual(overflow.report.redactions, exact.report.redactions);
    assert.deepEqual(overflow.impact.redactions, exact.impact.redactions);
  });

  it('rejects contract-incomplete canonicalization and exposes the pure service façade', () => {
    const incompletePublishable = {
      ...completeDraft(),
      definitionState: 'publishable' as const,
      recordType: {},
    } as RuntimeValue;
    assert.throws(
      () => canonicalizeRecordDefinition(incompletePublishable as PublishableRecordDefinitionAggregateDto),
      RecordDefinitionCanonicalizationError
    );
    const service = new ValidationServices.RecordDefinitionValidation();
    const result = validResult(service.validateForPublication(publicationRequest(completeDraft())));
    assert.equal(service.hash(result.definition), result.canonicalHash);
    assert.equal(service.serializeCanonical(result.definition), result.canonicalJson);
    assert.deepEqual(service.canonicalize(result.definition), result.definition);
    assert.equal(handlerInvocations, 0);
  });
});
