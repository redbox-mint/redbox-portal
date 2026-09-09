import {
  RECORD_DEFINITION_AGGREGATE_SCHEMA_VERSION,
  RECORD_DEFINITION_API_SCHEMA_VERSION,
  RECORD_DEFINITION_STAGE_SCHEMA_VERSION,
  RECORD_DEFINITION_TRANSITION_SCHEMA_VERSION,
  parseRecordDefinitionBrandId,
  parseRecordDefinitionCanonicalHash,
  parseRecordDefinitionKey,
  parseWorkflowStageKey,
  type DraftRecordDefinitionAggregateDto,
  type PublishableRecordDefinitionAggregateDto,
  type RecordDefinitionActionBindingScopeDto,
  type RecordDefinitionActorDto,
  type RecordDefinitionDraftSaveRequestDto,
} from '@researchdatabox/sails-ng-common';
import * as sinon from 'sinon';
import { deriveStableActionBindingId, parseActionBindingId, type ActionBindingScope } from '../../src/action-registry';
import {
  deriveRecordDefinitionDraftId,
  deriveRecordDefinitionId,
  deriveRecordDefinitionRevisionId,
  deriveWorkflowTransitionId,
} from '../../src/record-workflow-administration';
import {
  RecordDefinitionDraftLifecycleError,
  Services,
  type RecordDefinitionDraftMutationResult,
} from '../../src/services/RecordDefinitionDraftService';
import { RecordDefinitionDraftWLDef } from '../../src/waterline-models/RecordDefinitionDraft';
import { RecordTypeWLDef } from '../../src/waterline-models/RecordType';

let expect: Chai.ExpectStatic;

type StoredRow = Record<string, any>;
type Criteria = Record<string, any>;

class Deferred<Value> implements PromiseLike<Value> {
  private changes: StoredRow = {};
  private readonly operation: (changes: StoredRow) => Value | Promise<Value>;

  constructor(operation: (changes: StoredRow) => Value | Promise<Value>) {
    this.operation = operation;
  }

  public fetch(): this {
    return this;
  }

  public set(changes: StoredRow): this {
    this.changes = structuredClone(changes);
    return this;
  }

  public usingConnection(): this {
    return this;
  }

  public then<Result1 = Value, Result2 = never>(
    onfulfilled?: ((value: Value) => Result1 | PromiseLike<Result1>) | null,
    onrejected?: ((reason: any) => Result2 | PromiseLike<Result2>) | null
  ): PromiseLike<Result1 | Result2> {
    return Promise.resolve(this.operation(this.changes)).then(onfulfilled, onrejected);
  }
}

class Barrier {
  public readonly reached: Promise<void>;
  private markReached!: () => void;
  private releaseWait!: () => void;
  private readonly waitForRelease: Promise<void>;

  constructor() {
    this.reached = new Promise(resolve => {
      this.markReached = resolve;
    });
    this.waitForRelease = new Promise(resolve => {
      this.releaseWait = resolve;
    });
  }

  public async pause(): Promise<void> {
    this.markReached();
    await this.waitForRelease;
  }

  public release(): void {
    this.releaseWait();
  }
}

function matches(row: StoredRow, criteria: Criteria): boolean {
  return Object.entries(criteria).every(
    ([key, value]) => row[key] === value || (value === null && row[key] === undefined)
  );
}

function immutableCopy<Value>(value: Value): Value {
  return structuredClone(value);
}

const brandId = parseRecordDefinitionBrandId('brand-a');
const otherBrandId = parseRecordDefinitionBrandId('brand-b');
const sourceKey = parseRecordDefinitionKey('sourceType');
const targetKey = parseRecordDefinitionKey('targetType');
const inactiveKey = parseRecordDefinitionKey('inactiveType');
const actor: RecordDefinitionActorDto = { id: 'admin-1', displayName: 'First administrator' };
const secondActor: RecordDefinitionActorDto = { id: 'admin-2', displayName: 'Second administrator' };
const baseTime = Date.parse('2026-09-04T08:00:00.000Z');

function publishableDefinition(recordTypeKey = sourceKey): PublishableRecordDefinitionAggregateDto {
  const transitionId = deriveWorkflowTransitionId({
    brandId,
    recordTypeKey,
    stableKey: 'submit',
  });
  const transitionScope: RecordDefinitionActionBindingScopeDto = {
    context: 'workflow-transition',
    mode: 'onTransitionWorkflow',
    phase: 'pre',
    scopeId: transitionId,
  };
  const firstBindingId = deriveStableActionBindingId({
    recordTypeKey,
    scope: transitionScope,
    actionId: 'org.test.first',
    contractVersion: 1,
    stableKey: 'first-binding',
  });
  const secondBindingId = deriveStableActionBindingId({
    recordTypeKey,
    scope: transitionScope,
    actionId: 'org.test.second',
    contractVersion: 1,
    stableKey: 'second-binding',
  });
  return {
    schemaVersion: RECORD_DEFINITION_AGGREGATE_SCHEMA_VERSION,
    definitionState: 'publishable',
    recordType: {
      labels: { name: 'Source type', namePlural: 'Source types' },
      searchable: true,
      searchFilters: [],
      relationships: [],
      transferResponsibility: { fields: [], roleRules: [] },
      validation: { mode: 'shadow', operations: [] },
      concurrency: { mode: 'last-write-wins' },
    },
    stages: [
      {
        schemaVersion: RECORD_DEFINITION_STAGE_SCHEMA_VERSION,
        key: parseWorkflowStageKey('draft'),
        label: 'Draft',
        formReference: 'source-form',
        viewRoles: ['Admin'],
        editRoles: ['Admin'],
        displayOrder: 0,
        starting: true,
        terminal: false,
        validationOverrides: [],
      },
      {
        schemaVersion: RECORD_DEFINITION_STAGE_SCHEMA_VERSION,
        key: parseWorkflowStageKey('complete'),
        label: 'Complete',
        formReference: 'complete-form',
        viewRoles: ['Admin'],
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
        sourceStageKey: parseWorkflowStageKey('draft'),
        targetStageKey: parseWorkflowStageKey('complete'),
        label: 'Submit',
        mode: 'manual',
        allowedRoles: ['Admin'],
      },
    ],
    actionBindings: [
      {
        schemaVersion: 1,
        id: firstBindingId,
        stableKey: 'first-binding',
        actionId: 'org.test.first',
        contractVersion: 1,
        scope: transitionScope,
        parameters: {
          token: { kind: 'secret', configured: true },
          label: { kind: 'literal', value: 'safe value' },
        },
        order: 0,
      },
      {
        schemaVersion: 1,
        id: secondBindingId,
        stableKey: 'second-binding',
        actionId: 'org.test.second',
        contractVersion: 1,
        scope: transitionScope,
        parameters: {},
        order: 1,
        dependencies: [{ bindingId: firstBindingId, condition: 'success' }],
      },
    ],
  };
}

function draftFromActive(definition: PublishableRecordDefinitionAggregateDto): DraftRecordDefinitionAggregateDto {
  return {
    ...immutableCopy(definition),
    definitionState: 'draft-incomplete',
  };
}

function draftWithLabels(
  definition: DraftRecordDefinitionAggregateDto,
  labels: { readonly name?: string; readonly namePlural?: string }
): DraftRecordDefinitionAggregateDto {
  return {
    ...definition,
    recordType: { ...definition.recordType, labels },
  };
}

function saveRequest(
  definition: DraftRecordDefinitionAggregateDto,
  expectedDraftVersion = 0,
  expectedActiveRevisionNumber: number | null = 1
): RecordDefinitionDraftSaveRequestDto {
  return {
    schemaVersion: RECORD_DEFINITION_API_SCHEMA_VERSION,
    expectedDraftVersion,
    expectedActiveRevisionNumber,
    definition,
  };
}

describe('RecordDefinitionDraftService B04 lifecycle state-machine unit tests', function () {
  let service: Services.RecordDefinitionDraftLifecycle;
  let recordTypes: StoredRow[];
  let revisions: StoredRow[];
  let drafts: StoredRow[];
  let operationAcks: StoredRow[];
  let now: number;
  let recordTypeModel: Record<string, sinon.SinonStub>;
  let revisionModel: Record<string, sinon.SinonStub>;
  let draftModel: Record<string, sinon.SinonStub>;
  let operationAckModel: Record<string, sinon.SinonStub>;
  let historyModel: Record<string, sinon.SinonStub>;

  before(async function () {
    ({ expect } = await import('chai'));
  });

  beforeEach(function () {
    now = baseTime;
    const sourceRecordTypeId = deriveRecordDefinitionId({ brandId, recordTypeKey: sourceKey });
    const sourceDraftId = deriveRecordDefinitionDraftId({ brandId, recordTypeKey: sourceKey });
    const sourceRevisionId = deriveRecordDefinitionRevisionId({ brandId, recordTypeKey: sourceKey }, 1);
    const activeDefinition = publishableDefinition();
    recordTypes = [
      {
        id: 'record-type-source-row',
        schemaVersion: 1,
        definitionId: sourceRecordTypeId,
        branding: brandId,
        name: sourceKey,
        key: `${brandId}_${sourceKey}`,
        packageType: 'dataset',
        searchCore: 'records',
        activeRevisionId: sourceRevisionId,
        activeRevisionNumber: 1,
        draftId: sourceDraftId,
        version: 4,
        draftLifecycleToken: null,
        draftLifecycleKind: null,
        draftLifecycleOperation: null,
        definitionLifecycleToken: null,
        definitionLifecycleOperation: null,
        createdAt: new Date(now).toISOString(),
        updatedAt: new Date(now).toISOString(),
        createdBy: actor,
        updatedBy: actor,
      },
      {
        id: 'record-type-inactive-row',
        schemaVersion: 1,
        definitionId: deriveRecordDefinitionId({ brandId, recordTypeKey: inactiveKey }),
        branding: brandId,
        name: inactiveKey,
        key: `${brandId}_${inactiveKey}`,
        packageType: 'dataset',
        searchCore: 'records',
        activeRevisionNumber: null,
        draftId: null,
        version: 0,
        draftLifecycleToken: null,
        draftLifecycleKind: null,
        draftLifecycleOperation: null,
        definitionLifecycleToken: null,
        definitionLifecycleOperation: null,
        createdAt: new Date(now).toISOString(),
        updatedAt: new Date(now).toISOString(),
        createdBy: actor,
        updatedBy: actor,
      },
    ];
    revisions = [
      {
        id: sourceRevisionId,
        schemaVersion: 1,
        branding: brandId,
        recordType: 'record-type-source-row',
        recordTypeId: sourceRecordTypeId,
        recordTypeKey: sourceKey,
        revisionNumber: 1,
        canonicalHash: parseRecordDefinitionCanonicalHash(`sha256:${'a'.repeat(64)}`),
        definition: activeDefinition,
        actionContracts: [],
        source: { operation: 'publish', sourceRevisionNumber: null },
        publishedAt: new Date(now).toISOString(),
        publishedBy: actor,
        createdAt: new Date(now).toISOString(),
        createdBy: actor,
      },
    ];
    drafts = [
      {
        id: sourceDraftId,
        schemaVersion: 1,
        branding: brandId,
        recordType: 'record-type-source-row',
        recordTypeId: sourceRecordTypeId,
        recordTypeKey: sourceKey,
        version: 0,
        lifecycleOperationToken: null,
        baseRevisionId: sourceRevisionId,
        baseRevisionNumber: 1,
        definition: draftFromActive(activeDefinition),
        validation: null,
        createdAt: new Date(now).toISOString(),
        updatedAt: new Date(now).toISOString(),
        createdBy: actor,
        updatedBy: actor,
      },
    ];
    operationAcks = [];

    const findOne = (rows: StoredRow[], criteria: Criteria): StoredRow | null =>
      rows.find(row => matches(row, criteria)) ?? null;
    const create = (rows: StoredRow[], values: StoredRow, prefix: string): StoredRow => {
      now += 1_000;
      const row = {
        ...immutableCopy(values),
        id: values.id ?? `${prefix}-${rows.length + 1}`,
        createdAt: new Date(now).toISOString(),
        updatedAt: new Date(now).toISOString(),
      };
      rows.push(row);
      return immutableCopy(row);
    };
    const updateOne = (rows: StoredRow[], criteria: Criteria, changes: StoredRow): StoredRow | null => {
      const row = findOne(rows, criteria);
      if (row === null) return null;
      now += 1_000;
      Object.assign(row, immutableCopy(changes), { updatedAt: new Date(now).toISOString() });
      return immutableCopy(row);
    };

    recordTypeModel = {
      findOne: sinon
        .stub()
        .callsFake((criteria: Criteria) => new Deferred(() => immutableCopy(findOne(recordTypes, criteria)))),
      create: sinon
        .stub()
        .callsFake((values: StoredRow) => new Deferred(() => create(recordTypes, values, 'record-type'))),
      updateOne: sinon
        .stub()
        .callsFake(
          (criteria: Criteria) => new Deferred((changes: StoredRow) => updateOne(recordTypes, criteria, changes))
        ),
      destroyOne: sinon.stub().callsFake(
        (criteria: Criteria) =>
          new Deferred(() => {
            const index = recordTypes.findIndex(row => matches(row, criteria));
            return index < 0 ? null : recordTypes.splice(index, 1)[0];
          })
      ),
    };
    recordTypeModel.getDatastore = sinon.stub().returns({
      manager: {
        collection: sinon.stub().returns({
          updateOne: sinon.stub().callsFake(async (criteria: Criteria, mutation: { $set: StoredRow }) => {
            const updated = await recordTypeModel.updateOne(criteria).set(mutation.$set);
            return { matchedCount: updated === null ? 0 : 1, modifiedCount: updated === null ? 0 : 1 };
          }),
        }),
      },
    });
    revisionModel = {
      findOne: sinon
        .stub()
        .callsFake((criteria: Criteria) => new Deferred(() => immutableCopy(findOne(revisions, criteria)))),
    };
    draftModel = {
      findOne: sinon
        .stub()
        .callsFake((criteria: Criteria) => new Deferred(() => immutableCopy(findOne(drafts, criteria)))),
      create: sinon.stub().callsFake((values: StoredRow) => new Deferred(() => create(drafts, values, 'draft'))),
      updateOne: sinon
        .stub()
        .callsFake((criteria: Criteria) => new Deferred((changes: StoredRow) => updateOne(drafts, criteria, changes))),
      destroyOne: sinon.stub().callsFake(
        (criteria: Criteria) =>
          new Deferred(() => {
            const index = drafts.findIndex(row => matches(row, criteria));
            return index < 0 ? null : drafts.splice(index, 1)[0];
          })
      ),
    };
    operationAckModel = {
      getDatastore: sinon.stub().returns({
        manager: {
          collection: sinon.stub().returns({ createIndex: sinon.stub().resolves('ack-index') }),
        },
      }),
      findOne: sinon
        .stub()
        .callsFake((criteria: Criteria) => new Deferred(() => immutableCopy(findOne(operationAcks, criteria)))),
      create: sinon.stub().callsFake(
        (values: StoredRow) =>
          new Deferred(() => {
            if (
              operationAcks.some(
                row =>
                  row.id === values.id ||
                  (row.recordType === values.recordType && row.identityVersion === values.identityVersion)
              )
            ) {
              return Promise.reject(new Error('duplicate lifecycle acknowledgement'));
            }
            return create(operationAcks, values, 'draft-operation-ack');
          })
      ),
    };
    historyModel = { create: sinon.stub() };

    (global as any).sails = {
      log: {
        crit: sinon.stub(),
        error: sinon.stub(),
        warn: sinon.stub(),
        debug: sinon.stub(),
        info: sinon.stub(),
        verbose: sinon.stub(),
        silly: sinon.stub(),
        blank: sinon.stub(),
        trace: sinon.stub(),
        log: sinon.stub(),
        fatal: sinon.stub(),
        silent: sinon.stub(),
      },
    };
    (global as any).RecordType = recordTypeModel;
    (global as any).RecordDefinitionRevision = revisionModel;
    (global as any).RecordDefinitionDraft = draftModel;
    (global as any).RecordDefinitionDraftOperationAck = operationAckModel;
    (global as any).RecordDefinitionHistory = historyModel;
    service = new Services.RecordDefinitionDraftLifecycle();
  });

  afterEach(function () {
    delete (global as any).RecordDefinitionHistory;
    delete (global as any).RecordDefinitionDraft;
    delete (global as any).RecordDefinitionDraftOperationAck;
    delete (global as any).RecordDefinitionRevision;
    delete (global as any).RecordType;
    delete (global as any).sails;
    sinon.restore();
  });

  it('clones only an active source, redacts secrets, and remaps every target-owned ID', async function () {
    const sourceBefore = immutableCopy(recordTypes[0]);
    const revisionBefore = immutableCopy(revisions[0]);
    const result = await service.clone(brandId, sourceKey, targetKey, actor);

    expect(result.identity).to.include({ brandId, key: targetKey, activeRevision: null, version: 0 });
    expect(result.identity.draft).to.include({ version: 0, baseRevisionNumber: null });
    expect(result.draft.recordTypeKey).to.equal(targetKey);
    expect(result.draft.baseRevisionNumber).to.equal(null);
    expect(result.draft.definition.definitionState).to.equal('draft-incomplete');

    const sourceDefinition = revisions[0].definition as PublishableRecordDefinitionAggregateDto;
    const clone = result.draft.definition;
    expect(clone.transitions[0].id).not.to.equal(sourceDefinition.transitions[0].id);
    expect(clone.actionBindings.map(binding => binding.id)).not.to.deep.equal(
      sourceDefinition.actionBindings.map(binding => binding.id)
    );
    expect(clone.actionBindings[0].scope).to.deep.include({
      context: 'workflow-transition',
      scopeId: clone.transitions[0].id,
    });
    expect(clone.actionBindings[1].dependencies?.[0].bindingId).to.equal(clone.actionBindings[0].id);
    expect(clone.actionBindings[0].parameters.token).to.deep.equal({ kind: 'secret', configured: false });
    expect(clone.actionBindings[0].parameters.label).to.deep.equal({ kind: 'literal', value: 'safe value' });
    expect(recordTypes.find(row => row.name === targetKey)).to.deep.include({
      draftLifecycleToken: null,
      draftLifecycleKind: null,
      draftLifecycleOperation: null,
    });
    expect(drafts.find(row => row.recordTypeKey === targetKey)?.lifecycleOperationToken).to.be.a('string');
    expect(result.identity).not.to.have.property('draftLifecycleToken');
    expect(result.draft).not.to.have.property('lifecycleOperationToken');
    expect(operationAcks[0].expiresAt).to.be.instanceOf(Date);
    expect(operationAcks[0].expiresAt.getTime()).to.be.greaterThan(Date.now());
    const serializeIdentity = RecordTypeWLDef.customToJSON as (this: StoredRow) => StoredRow;
    const serializeDraft = RecordDefinitionDraftWLDef.customToJSON as (this: StoredRow) => StoredRow;
    const serializedIdentity = serializeIdentity.call(recordTypes.find(row => row.name === targetKey)!);
    expect(serializedIdentity).not.to.have.property('draftLifecycleToken');
    expect(serializedIdentity).not.to.have.property('draftLifecycleKind');
    expect(serializedIdentity).not.to.have.property('draftLifecycleOperation');
    expect(serializeDraft.call(drafts.find(row => row.recordTypeKey === targetKey)!)).not.to.have.property(
      'lifecycleOperationToken'
    );
    expect(recordTypes[0]).to.deep.equal(sourceBefore);
    expect(revisions[0]).to.deep.equal(revisionBefore);
    expect(historyModel.create.called).to.equal(false);
  });

  it('does not expose blank-slate creation or clone inactive and cross-brand sources', async function () {
    expect((service as any).create).to.equal(undefined);
    const exported = service.exports();
    expect(Object.keys(exported)).to.include.members(['clone', 'get', 'save', 'discard', 'getStatus']);
    expect(exported).not.to.have.property('create');

    for (const attempt of [
      service.clone(brandId, inactiveKey, targetKey, actor),
      service.clone(otherBrandId, sourceKey, targetKey, actor),
      service.clone(brandId, sourceKey, sourceKey, actor),
    ]) {
      try {
        await attempt;
        expect.fail('clone should fail');
      } catch (error) {
        expect(error).to.be.instanceOf(RecordDefinitionDraftLifecycleError);
      }
    }
    expect(recordTypes.some(row => row.name === targetKey)).to.equal(false);
    expect(await service.get(otherBrandId, sourceKey)).to.equal(null);
    expect(await service.getStatus(otherBrandId, sourceKey)).to.equal(null);
  });

  it('fails before clone persistence when acknowledgement indexes are unavailable and retries setup safely', async function () {
    const createIndex = sinon.stub().rejects(new Error('mongo-index-secret'));
    operationAckModel.getDatastore.returns({
      manager: { collection: sinon.stub().returns({ createIndex }) },
    });

    let caught: unknown;
    try {
      await service.clone(brandId, sourceKey, targetKey, actor);
    } catch (error) {
      caught = error;
    }

    expect(caught).to.be.instanceOf(RecordDefinitionDraftLifecycleError);
    expect((caught as RecordDefinitionDraftLifecycleError).code).to.equal('storage-consistency-error');
    expect(String((caught as Error).message)).not.to.include('mongo-index-secret');
    expect(recordTypeModel.create.called).to.equal(false);
    expect(recordTypes.some(row => row.name === targetKey)).to.equal(false);

    createIndex.resolves('ack-index');
    const retried = await service.clone(brandId, sourceKey, targetKey, actor);
    expect(retried.identity.key).to.equal(targetKey);
  });

  it('gets the one shared brand-scoped draft through its stable identity', async function () {
    const loaded = await service.get(brandId, sourceKey);

    expect(loaded).to.deep.include({
      id: deriveRecordDefinitionDraftId({ brandId, recordTypeKey: sourceKey }),
      brandId,
      recordTypeKey: sourceKey,
      version: 0,
      baseRevisionNumber: 1,
    });
    expect(loaded?.definition).to.deep.equal(drafts[0].definition);
    expect(draftModel.findOne.lastCall.firstArg).to.deep.include({
      branding: brandId,
      recordType: 'record-type-source-row',
      recordTypeId: deriveRecordDefinitionId({ brandId, recordTypeKey: sourceKey }),
      recordTypeKey: sourceKey,
    });
  });

  it('preserves a clone identity while an already-started resolver rolls its draft forward', async function () {
    const originRetry = new Barrier();
    const recoveryCreate = new Barrier();
    let targetCreateCount = 0;
    draftModel.create.callsFake(
      (values: StoredRow) =>
        new Deferred(async () => {
          targetCreateCount += 1;
          if (targetCreateCount === 1) return Promise.reject(new Error('initial draft create failed'));
          if (targetCreateCount === 2) {
            await originRetry.pause();
            return Promise.reject(new Error('origin recovery create failed'));
          }
          await recoveryCreate.pause();
          now += 1_000;
          const row = {
            ...immutableCopy(values),
            createdAt: new Date(now).toISOString(),
            updatedAt: new Date(now).toISOString(),
          };
          drafts.push(row);
          return immutableCopy(row);
        })
    );

    const recoveringService = new Services.RecordDefinitionDraftLifecycle();
    const cloneAttempt = service.clone(brandId, sourceKey, targetKey, actor);
    await originRetry.reached;
    const recovery = recoveringService.get(brandId, targetKey);
    await recoveryCreate.reached;

    originRetry.release();
    try {
      await cloneAttempt;
      expect.fail('the interrupted origin should report a bounded storage failure');
    } catch (error) {
      expect(error).to.be.instanceOf(RecordDefinitionDraftLifecycleError);
      expect((error as RecordDefinitionDraftLifecycleError).code).to.equal('storage-consistency-error');
    }
    const ownedIdentity = recordTypes.find(row => row.name === targetKey);
    expect(ownedIdentity).to.deep.include({ version: 0, draftLifecycleKind: 'clone' });
    expect(ownedIdentity?.draftLifecycleToken).to.be.a('string');
    expect(recordTypeModel.destroyOne.called).to.equal(false);
    expect(draftModel.destroyOne.called).to.equal(false);

    recoveryCreate.release();
    const recovered = await recovery;
    expect(recovered).to.deep.include({ recordTypeKey: targetKey, version: 0 });
    expect(recordTypes.find(row => row.name === targetKey)).to.deep.include({
      draftLifecycleToken: null,
      draftLifecycleKind: null,
      draftLifecycleOperation: null,
    });

    try {
      await service.clone(brandId, sourceKey, targetKey, secondActor);
      expect.fail('the recovered clone must remain unique');
    } catch (error) {
      expect(error).to.be.instanceOf(RecordDefinitionDraftLifecycleError);
      expect((error as RecordDefinitionDraftLifecycleError).code).to.equal('record-type-already-exists');
    }
    expect(drafts.filter(row => row.recordTypeKey === targetKey)).to.have.length(1);
  });

  it('reconciles an identity create that committed before returning a malformed acknowledgement', async function () {
    recordTypeModel.create.callsFake(
      (values: StoredRow) =>
        new Deferred(() => {
          now += 1_000;
          const stored: StoredRow = {
            ...immutableCopy(values),
            key: `${values.branding}_${values.name}`,
            createdAt: new Date(now).toISOString(),
            updatedAt: new Date(now).toISOString(),
          };
          recordTypes.push(stored);
          const malformed = immutableCopy(stored);
          delete malformed.id;
          return malformed;
        })
    );

    const result = await service.clone(brandId, sourceKey, targetKey, actor);

    expect(result.draft).to.include({ recordTypeKey: targetKey, version: 0 });
    expect(recordTypes.some(row => row.name === targetKey)).to.equal(true);
    expect(drafts.some(row => row.recordTypeKey === targetKey)).to.equal(true);
    expect(draftModel.destroyOne.called).to.equal(false);
    expect(recordTypeModel.destroyOne.called).to.equal(false);
  });

  it('uses authoritative clone rows after a malformed post-create acknowledgement', async function () {
    draftModel.create.callsFake(
      (values: StoredRow) =>
        new Deferred(() => {
          now += 1_000;
          const stored = {
            ...immutableCopy(values),
            createdAt: new Date(now).toISOString(),
            updatedAt: new Date(now).toISOString(),
          };
          drafts.push(stored);
          return { ...immutableCopy(stored), updatedAt: 'attacker-controlled-invalid-time' };
        })
    );

    const result = await service.clone(brandId, sourceKey, targetKey, actor);

    expect(result.draft.updatedAt).not.to.equal('attacker-controlled-invalid-time');
    expect(recordTypes.some(row => row.name === targetKey)).to.equal(true);
    expect(drafts.some(row => row.recordTypeKey === targetKey)).to.equal(true);
    expect(draftModel.destroyOne.called).to.equal(false);
    expect(recordTypeModel.destroyOne.called).to.equal(false);
  });

  it('reconciles a draft create that committed before its write acknowledgement failed', async function () {
    draftModel.create.callsFake(
      (values: StoredRow) =>
        new Deferred(() => {
          now += 1_000;
          drafts.push({
            ...immutableCopy(values),
            createdAt: new Date(now).toISOString(),
            updatedAt: new Date(now).toISOString(),
          });
          return Promise.reject(new Error('ambiguous committed draft write'));
        })
    );

    const result = await service.clone(brandId, sourceKey, targetKey, actor);

    expect(result.draft).to.include({ recordTypeKey: targetKey, version: 0 });
    expect(recordTypes.some(row => row.name === targetKey)).to.equal(true);
    expect(drafts.some(row => row.recordTypeKey === targetKey)).to.equal(true);
    expect(draftModel.destroyOne.called).to.equal(false);
    expect(recordTypeModel.destroyOne.called).to.equal(false);
  });

  it('returns its exact clone after another instance settles it and advances the shared draft', async function () {
    const postCreateRead = new Barrier();
    let heldOriginRead = false;
    recordTypeModel.findOne.callsFake(
      (criteria: Criteria) =>
        new Deferred(async () => {
          const target = recordTypes.find(row => matches(row, criteria)) ?? null;
          if (!heldOriginRead && criteria.name === targetKey && target?.draftLifecycleKind === 'clone') {
            heldOriginRead = true;
            await postCreateRead.pause();
          }
          return immutableCopy(recordTypes.find(row => matches(row, criteria)) ?? null);
        })
    );
    const otherInstance = new Services.RecordDefinitionDraftLifecycle();

    const originatingClone = service.clone(brandId, sourceKey, targetKey, actor);
    await postCreateRead.reached;
    const settledClone = await otherInstance.get(brandId, targetKey);
    if (settledClone === null) expect.fail('the concurrent instance must settle the clone');
    const laterDefinition = draftWithLabels(settledClone.definition, { name: 'Later clone edit' });
    const laterSave = await otherInstance.save(
      brandId,
      targetKey,
      saveRequest(laterDefinition, settledClone.version, null),
      secondActor
    );
    expect(laterSave.ok).to.equal(true);

    postCreateRead.release();
    const result = await originatingClone;

    expect(result.identity.version).to.equal(0);
    expect(result.draft.version).to.equal(0);
    expect(result.draft.definition.recordType.labels?.name).to.equal('Source type');
    expect(drafts.find(row => row.recordTypeKey === targetKey)).to.deep.include({
      version: 1,
      updatedBy: secondActor,
    });
    expect(operationAcks.filter(row => row.recordTypeKey === targetKey)).to.have.length(2);
  });

  it('preserves a concurrent clone winner while reconciling an ambiguous failed attempt', async function () {
    draftModel.create.callsFake(
      (values: StoredRow) =>
        new Deferred(() => {
          const attemptedIdentityId = values.recordType;
          const attemptedIndex = recordTypes.findIndex(row => row.id === attemptedIdentityId);
          if (attemptedIndex >= 0) recordTypes.splice(attemptedIndex, 1);
          const winnerIdentity = {
            id: 'concurrent-winner-row',
            schemaVersion: 1,
            definitionId: deriveRecordDefinitionId({ brandId, recordTypeKey: targetKey }),
            branding: brandId,
            name: targetKey,
            key: `${brandId}_${targetKey}`,
            packageType: 'dataset',
            searchCore: 'records',
            activeRevisionId: null,
            activeRevisionNumber: null,
            draftId: deriveRecordDefinitionDraftId({ brandId, recordTypeKey: targetKey }),
            version: 0,
            retirementReason: null,
            createdAt: new Date(now).toISOString(),
            updatedAt: new Date(now).toISOString(),
            createdBy: secondActor,
            updatedBy: secondActor,
          };
          recordTypes.push(winnerIdentity);
          drafts.push({
            ...immutableCopy(values),
            recordType: winnerIdentity.id,
            createdAt: new Date(now).toISOString(),
            updatedAt: new Date(now).toISOString(),
            createdBy: secondActor,
            updatedBy: secondActor,
          });
          return Promise.reject(new Error('ambiguous clone acknowledgement'));
        })
    );

    try {
      await service.clone(brandId, sourceKey, targetKey, actor);
      expect.fail('losing clone should report the concurrent winner');
    } catch (error) {
      expect(error).to.be.instanceOf(RecordDefinitionDraftLifecycleError);
      expect((error as RecordDefinitionDraftLifecycleError).code).to.equal('record-type-already-exists');
      expect(String((error as Error).message)).not.to.include('ambiguous clone acknowledgement');
    }
    expect(recordTypes.find(row => row.name === targetKey)?.id).to.equal('concurrent-winner-row');
    expect(drafts.find(row => row.recordTypeKey === targetKey)?.recordType).to.equal('concurrent-winner-row');
  });

  it('never deletes an attempted clone after the exact token-owned rows have advanced', async function () {
    draftModel.create.callsFake(
      (values: StoredRow) =>
        new Deferred(() => {
          now += 1_000;
          const advancedDraft = {
            ...immutableCopy(values),
            version: 1,
            lifecycleOperationToken: 'concurrent-save-token',
            updatedBy: secondActor,
            createdAt: new Date(now).toISOString(),
            updatedAt: new Date(now).toISOString(),
          };
          drafts.push(advancedDraft);
          const attemptedIdentity = recordTypes.find(row => row.id === values.recordType);
          if (attemptedIdentity === undefined) throw new Error('missing attempted identity');
          Object.assign(attemptedIdentity, {
            version: 1,
            draftLifecycleToken: null,
            draftLifecycleKind: null,
            draftLifecycleOperation: null,
            updatedBy: secondActor,
          });
          return Promise.reject(new Error('failed-create-secret'));
        })
    );

    try {
      await service.clone(brandId, sourceKey, targetKey, actor);
      expect.fail('the advanced clone must be reported as an existing winner');
    } catch (error) {
      expect(error).to.be.instanceOf(RecordDefinitionDraftLifecycleError);
      expect((error as RecordDefinitionDraftLifecycleError).code).to.equal('record-type-already-exists');
      expect(String((error as Error).message)).not.to.include('failed-create-secret');
    }
    expect(recordTypes.find(row => row.name === targetKey)).to.deep.include({ version: 1, updatedBy: secondActor });
    expect(drafts.find(row => row.recordTypeKey === targetKey)).to.deep.include({
      version: 1,
      lifecycleOperationToken: 'concurrent-save-token',
      updatedBy: secondActor,
    });
    expect(draftModel.destroyOne.called).to.equal(false);
    expect(recordTypeModel.destroyOne.called).to.equal(false);
  });

  it('uses an atomic draft-version predicate so concurrent editors produce one winner and a safe conflict', async function () {
    const first = draftWithLabels(draftFromActive(publishableDefinition()), { name: 'First edit' });
    const second = draftWithLabels(draftFromActive(publishableDefinition()), { name: 'Second edit' });

    const results = await Promise.all([
      service.save(brandId, sourceKey, saveRequest(first), actor),
      service.save(brandId, sourceKey, saveRequest(second), secondActor),
    ]);
    const applied = results.find(result => result.ok);
    const rejected = results.find(result => !result.ok);

    expect(applied?.ok).to.equal(true);
    expect(rejected?.ok).to.equal(false);
    if (rejected?.ok !== false) expect.fail('one editor must receive a conflict');
    expect(rejected.conflict).to.deep.include({
      code: 'draft-version-conflict',
      resource: 'draft',
      expectedVersion: 0,
      currentVersion: 1,
      expectedActiveRevisionNumber: 1,
      currentActiveRevisionNumber: 1,
    });
    expect(rejected.current.version).to.equal(1);
    expect(drafts[0].version).to.equal(1);
    expect(drafts[0].definition.recordType.labels.name).to.equal(
      (applied as Extract<RecordDefinitionDraftMutationResult, { ok: true }>).draft.definition.recordType.labels?.name
    );
    expect(historyModel.create.called).to.equal(false);
  });

  it('returns its exact save after another instance settles it and commits forward progress', async function () {
    const postCommitRead = new Barrier();
    let heldOriginRead = false;
    recordTypeModel.findOne.callsFake(
      (criteria: Criteria) =>
        new Deferred(async () => {
          const current = recordTypes.find(row => matches(row, criteria)) ?? null;
          if (!heldOriginRead && criteria.name === sourceKey && current?.draftLifecycleKind === 'save') {
            heldOriginRead = true;
            await postCommitRead.pause();
          }
          return immutableCopy(recordTypes.find(row => matches(row, criteria)) ?? null);
        })
    );
    const otherInstance = new Services.RecordDefinitionDraftLifecycle();
    const firstDefinition = draftWithLabels(draftFromActive(publishableDefinition()), { name: 'Origin save' });
    const originatingSave = service.save(brandId, sourceKey, saveRequest(firstDefinition), actor);
    await postCommitRead.reached;

    const settled = await otherInstance.get(brandId, sourceKey);
    if (settled === null) expect.fail('the concurrent instance must settle the save');
    const secondDefinition = draftWithLabels(settled.definition, { name: 'Later save' });
    const laterSave = await otherInstance.save(brandId, sourceKey, saveRequest(secondDefinition, 1), secondActor);
    expect(laterSave.ok).to.equal(true);

    postCommitRead.release();
    const originResult = await originatingSave;

    expect(originResult.ok).to.equal(true);
    if (!originResult.ok) expect.fail('the exact acknowledged origin save must succeed');
    expect(originResult.draft.version).to.equal(1);
    expect(originResult.draft.definition.recordType.labels?.name).to.equal('Origin save');
    expect(drafts[0]).to.deep.include({ version: 2, updatedBy: secondActor });
    expect(drafts[0].definition.recordType.labels.name).to.equal('Later save');
    expect(operationAcks.map(row => row.draftVersion)).to.deep.equal([1, 2]);
  });

  it('rejects accessor-backed operation acknowledgements without executing persisted getters', async function () {
    let getterReads = 0;
    operationAckModel.findOne.callsFake(
      (criteria: Criteria) =>
        new Deferred(() => {
          const stored = operationAcks.find(row => matches(row, criteria));
          if (stored === undefined) return null;
          const malicious = immutableCopy(stored);
          Object.defineProperty(malicious, 'draft', {
            configurable: true,
            enumerable: true,
            get() {
              getterReads += 1;
              throw new Error('persisted-acknowledgement-secret');
            },
          });
          return malicious;
        })
    );

    let caught: unknown;
    try {
      await service.save(
        brandId,
        sourceKey,
        saveRequest(draftWithLabels(draftFromActive(publishableDefinition()), { name: 'Blocked save' })),
        actor
      );
    } catch (error) {
      caught = error;
    }

    expect(caught).to.be.instanceOf(RecordDefinitionDraftLifecycleError);
    expect((caught as RecordDefinitionDraftLifecycleError).code).to.equal('storage-consistency-error');
    expect(String((caught as Error).message)).not.to.include('persisted-acknowledgement-secret');
    expect(getterReads).to.equal(0);
    expect(recordTypes[0].draftLifecycleKind).to.equal('save');
  });

  it('rejects non-Date and expired operation acknowledgements', async function () {
    const invalidExpiries = [new Date(Date.now() - 1), new Date(Date.now() + 60_000).toISOString()];
    const originalDraft = immutableCopy(drafts[0]);

    for (const invalidExpiry of invalidExpiries) {
      operationAckModel.findOne.callsFake(
        (criteria: Criteria) =>
          new Deferred(() => {
            const stored = operationAcks.find(row => matches(row, criteria));
            return stored === undefined ? null : { ...immutableCopy(stored), expiresAt: invalidExpiry };
          })
      );

      let caught: unknown;
      try {
        await service.save(
          brandId,
          sourceKey,
          saveRequest(draftWithLabels(draftFromActive(publishableDefinition()), { name: 'Blocked expiry' })),
          actor
        );
      } catch (error) {
        caught = error;
      }

      expect(caught).to.be.instanceOf(RecordDefinitionDraftLifecycleError);
      expect((caught as RecordDefinitionDraftLifecycleError).code).to.equal('storage-consistency-error');
      operationAcks = [];
      drafts[0] = immutableCopy(originalDraft);
      recordTypes[0].version = 4;
      recordTypes[0].draftLifecycleToken = null;
      recordTypes[0].draftLifecycleKind = null;
      recordTypes[0].draftLifecycleOperation = null;
    }
  });

  it('reports an active-revision conflict before writing and never changes runtime rows on a draft save', async function () {
    const activeBefore = immutableCopy(revisions[0]);
    const identityBefore = immutableCopy(recordTypes[0]);
    recordTypes[0].activeRevisionNumber = 2;
    recordTypes[0].activeRevisionId = deriveRecordDefinitionRevisionId({ brandId, recordTypeKey: sourceKey }, 2);
    const local = draftWithLabels(draftFromActive(publishableDefinition()), { name: 'Local edit' });

    const result = await service.save(brandId, sourceKey, saveRequest(local, 0, 1), actor);

    expect(result.ok).to.equal(false);
    if (result.ok) expect.fail('stale active revision should conflict');
    expect(result.conflict).to.deep.include({
      code: 'active-revision-conflict',
      resource: 'active-revision',
      expectedVersion: 1,
      currentVersion: 2,
    });
    expect(draftModel.updateOne.called).to.equal(false);
    expect(revisions[0]).to.deep.equal(activeBefore);
    expect({
      ...recordTypes[0],
      activeRevisionId: identityBefore.activeRevisionId,
      activeRevisionNumber: 1,
    }).to.deep.equal(identityBefore);
    expect(recordTypeModel.updateOne.called).to.equal(false);
  });

  it('rejects and rolls back a save when the active revision wins the commit race', async function () {
    const originalDraft = immutableCopy(drafts[0]);
    const local = draftWithLabels(draftFromActive(publishableDefinition()), { name: 'Losing local edit' });
    recordTypeModel.updateOne.callsFake(
      (criteria: Criteria) =>
        new Deferred(() => {
          if (criteria.name === sourceKey && criteria.version === 4) {
            recordTypes[0].activeRevisionNumber = 2;
            recordTypes[0].activeRevisionId = deriveRecordDefinitionRevisionId(
              { brandId, recordTypeKey: sourceKey },
              2
            );
            recordTypes[0].version = 5;
          }
          return null;
        })
    );

    const result = await service.save(brandId, sourceKey, saveRequest(local), secondActor);

    expect(result.ok).to.equal(false);
    if (result.ok) expect.fail('the active revision winner must reject the save');
    expect(result.conflict).to.deep.include({
      code: 'active-revision-conflict',
      expectedActiveRevisionNumber: 1,
      currentActiveRevisionNumber: 2,
    });
    expect(drafts[0]).to.deep.include({
      version: originalDraft.version,
      definition: originalDraft.definition,
      updatedBy: originalDraft.updatedBy,
    });
    expect(recordTypeModel.updateOne.firstCall.firstArg).to.deep.include({
      activeRevisionId: deriveRecordDefinitionRevisionId({ brandId, recordTypeKey: sourceKey }, 1),
      activeRevisionNumber: 1,
      version: 4,
    });
  });

  it('keeps the prior draft visible while a competing active revision wins before the identity CAS', async function () {
    const local = draftWithLabels(draftFromActive(publishableDefinition()), { name: 'Never committed' });
    let observedDuringCas: Awaited<ReturnType<typeof service.get>> = null;
    recordTypeModel.updateOne.callsFake(
      (criteria: Criteria) =>
        new Deferred(async () => {
          if (criteria.name === sourceKey && criteria.version === 4) {
            observedDuringCas = await service.get(brandId, sourceKey);
            recordTypes[0].activeRevisionNumber = 2;
            recordTypes[0].activeRevisionId = deriveRecordDefinitionRevisionId(
              { brandId, recordTypeKey: sourceKey },
              2
            );
            recordTypes[0].version = 5;
          }
          return null;
        })
    );

    const result = await service.save(brandId, sourceKey, saveRequest(local), secondActor);
    const observed = observedDuringCas as Awaited<ReturnType<typeof service.get>>;

    expect(result.ok).to.equal(false);
    expect(observed?.version).to.equal(0);
    expect(observed?.definition.recordType.labels?.name).to.equal('Source type');
    expect(drafts[0]).to.deep.include({ version: 0, updatedBy: actor });
    expect(drafts[0].definition.recordType.labels.name).to.equal('Source type');
  });

  it('rolls forward an acknowledgement-lost identity CAS and never compensates over the next winner', async function () {
    recordTypeModel.updateOne.callsFake(
      (criteria: Criteria) =>
        new Deferred((changes: StoredRow) => {
          const row = recordTypes.find(candidate => matches(candidate, criteria));
          if (row === undefined) return null;
          now += 1_000;
          Object.assign(row, immutableCopy(changes), { updatedAt: new Date(now).toISOString() });
          if (typeof changes.draftLifecycleToken === 'string') {
            return Promise.reject(new Error('identity-cas-ack-secret'));
          }
          return immutableCopy(row);
        })
    );
    const firstDefinition = draftWithLabels(draftFromActive(publishableDefinition()), { name: 'Committed first' });
    const secondDefinition = draftWithLabels(draftFromActive(publishableDefinition()), { name: 'Committed second' });

    const first = await service.save(brandId, sourceKey, saveRequest(firstDefinition), actor);
    const second = await service.save(brandId, sourceKey, saveRequest(secondDefinition, 1), secondActor);

    expect(first.ok).to.equal(true);
    expect(second.ok).to.equal(true);
    expect(drafts[0]).to.deep.include({
      version: 2,
      updatedBy: secondActor,
    });
    expect(drafts[0].definition.recordType.labels.name).to.equal('Committed second');
    expect(recordTypes[0]).to.deep.include({
      version: 6,
      draftLifecycleToken: null,
      draftLifecycleKind: null,
      draftLifecycleOperation: null,
    });
  });

  it('recovers a crash after the authoritative identity CAS without exposing a provisional draft', async function () {
    const proposed = draftWithLabels(draftFromActive(publishableDefinition()), { name: 'Recovered commit' });
    draftModel.updateOne.callsFake(() => new Deferred(() => Promise.reject(new Error('materialization-secret'))));

    try {
      await service.save(brandId, sourceKey, saveRequest(proposed), secondActor);
      expect.fail('the interrupted materialization should fail closed');
    } catch (error) {
      expect(error).to.be.instanceOf(RecordDefinitionDraftLifecycleError);
      expect((error as RecordDefinitionDraftLifecycleError).code).to.equal('storage-consistency-error');
      expect(String((error as Error).message)).not.to.include('materialization-secret');
    }
    expect(drafts[0]).to.deep.include({ version: 0, lifecycleOperationToken: null, updatedBy: actor });
    expect(drafts[0].definition.recordType.labels.name).to.equal('Source type');
    expect(recordTypes[0]).to.deep.include({ version: 5, draftLifecycleKind: 'save' });

    draftModel.updateOne.callsFake(
      (criteria: Criteria) =>
        new Deferred((changes: StoredRow) => {
          const row = drafts.find(candidate => matches(candidate, criteria));
          if (row === undefined) return null;
          now += 1_000;
          Object.assign(row, immutableCopy(changes), { updatedAt: new Date(now).toISOString() });
          return immutableCopy(row);
        })
    );
    const recovered = await service.get(brandId, sourceKey);

    expect(recovered).to.deep.include({ version: 1, updatedBy: secondActor });
    expect(recovered?.definition.recordType.labels?.name).to.equal('Recovered commit');
    expect(recordTypes[0]).to.deep.include({
      version: 5,
      draftLifecycleToken: null,
      draftLifecycleKind: null,
      draftLifecycleOperation: null,
    });
  });

  it('accepts semantically incomplete safe drafts, attributes the save, and keeps publication state immutable', async function () {
    const activeBefore = immutableCopy(revisions[0]);
    const identityBefore = immutableCopy(recordTypes[0]);
    const incomplete: DraftRecordDefinitionAggregateDto = {
      schemaVersion: RECORD_DEFINITION_AGGREGATE_SCHEMA_VERSION,
      definitionState: 'draft-incomplete',
      recordType: { labels: { name: 'Work in progress' } },
      stages: [],
      transitions: [],
      actionBindings: [],
    };

    const result = await service.save(brandId, sourceKey, saveRequest(incomplete), secondActor);

    expect(result.ok).to.equal(true);
    if (!result.ok) expect.fail('safe incomplete draft should save');
    expect(result.draft).to.include({ version: 1 });
    expect(result.draft.updatedBy).to.deep.equal(secondActor);
    expect(result.draft.validation).to.deep.include({
      scope: 'draft-save',
      status: 'valid',
      definitionState: 'draft-incomplete',
      validatedDraftVersion: 1,
    });
    expect(revisions[0]).to.deep.equal(activeBefore);
    expect(recordTypes[0]).to.deep.include({
      id: identityBefore.id,
      activeRevisionId: identityBefore.activeRevisionId,
      activeRevisionNumber: identityBefore.activeRevisionNumber,
      draftId: identityBefore.draftId,
      version: 5,
      updatedBy: secondActor,
    });
    expect(recordTypeModel.updateOne.callCount).to.equal(2);
    expect(historyModel.create.called).to.equal(false);
  });

  it('rejects hostile prototypes, accessors, oversized values, raw secret values, and unknown properties without reads or writes', async function () {
    let getterCalls = 0;
    const accessorRequest = Object.create(null) as Record<string, any>;
    Object.defineProperties(accessorRequest, {
      schemaVersion: { value: 1, enumerable: true },
      expectedDraftVersion: { value: 0, enumerable: true },
      expectedActiveRevisionNumber: { value: 1, enumerable: true },
      definition: {
        enumerable: true,
        get: () => {
          getterCalls += 1;
          return draftFromActive(publishableDefinition());
        },
      },
    });
    const inheritedRequest = Object.create({ polluted: true });
    Object.assign(inheritedRequest, saveRequest(draftFromActive(publishableDefinition())));
    const oversized = draftWithLabels(draftFromActive(publishableDefinition()), { name: 'x'.repeat(40_000) });
    const rawSecret = immutableCopy(saveRequest(draftFromActive(publishableDefinition()))) as Record<string, any>;
    rawSecret.definition.actionBindings[0].parameters.token = { kind: 'secret', configured: true, value: 'leak' };
    const unknownProperty = immutableCopy(saveRequest(draftFromActive(publishableDefinition()))) as Record<string, any>;
    unknownProperty.definition.recordType.executableService = 'process.env';

    for (const hostile of [accessorRequest, inheritedRequest, saveRequest(oversized), rawSecret, unknownProperty]) {
      try {
        await service.save(brandId, sourceKey, hostile as RecordDefinitionDraftSaveRequestDto, actor);
        expect.fail('hostile save should fail');
      } catch (error) {
        expect(error).to.be.instanceOf(RecordDefinitionDraftLifecycleError);
        expect(String((error as Error).message)).not.to.include('leak');
        expect(String((error as Error).message)).not.to.include('process.env');
      }
    }
    expect(getterCalls).to.equal(0);
    expect(draftModel.updateOne.called).to.equal(false);
    expect(historyModel.create.called).to.equal(false);
  });

  it('discards edits by reconstructing the shared draft from the current active revision', async function () {
    const edited = draftWithLabels(draftFromActive(publishableDefinition()), {
      name: 'Unsaved direction',
      namePlural: 'Unsaved directions',
    });
    const saved = await service.save(brandId, sourceKey, saveRequest(edited), actor);
    expect(saved.ok).to.equal(true);

    const discarded = await service.discard(brandId, sourceKey, 1, 1, secondActor);

    expect(discarded.ok).to.equal(true);
    if (!discarded.ok) expect.fail('current discard should apply');
    expect(discarded.draft.version).to.equal(2);
    expect(discarded.draft.baseRevisionNumber).to.equal(1);
    expect(discarded.draft.definition).to.deep.equal(draftFromActive(revisions[0].definition));
    expect(discarded.draft.definition.actionBindings[0].parameters.token).to.deep.equal({
      kind: 'secret',
      configured: true,
    });
    expect(discarded.draft.updatedBy).to.deep.equal(secondActor);
    expect(historyModel.create.called).to.equal(false);
  });

  it('returns its exact discard after another instance settles it and saves a newer edit', async function () {
    drafts[0].definition = draftWithLabels(draftFromActive(publishableDefinition()), { name: 'Discard me' });
    const postCommitRead = new Barrier();
    let heldOriginRead = false;
    recordTypeModel.findOne.callsFake(
      (criteria: Criteria) =>
        new Deferred(async () => {
          const current = recordTypes.find(row => matches(row, criteria)) ?? null;
          if (!heldOriginRead && criteria.name === sourceKey && current?.draftLifecycleKind === 'discard') {
            heldOriginRead = true;
            await postCommitRead.pause();
          }
          return immutableCopy(recordTypes.find(row => matches(row, criteria)) ?? null);
        })
    );
    const otherInstance = new Services.RecordDefinitionDraftLifecycle();
    const originatingDiscard = service.discard(brandId, sourceKey, 0, 1, actor);
    await postCommitRead.reached;

    const settled = await otherInstance.get(brandId, sourceKey);
    if (settled === null) expect.fail('the concurrent instance must settle the discard');
    const laterDefinition = draftWithLabels(settled.definition, { name: 'Edit after discard' });
    const laterSave = await otherInstance.save(brandId, sourceKey, saveRequest(laterDefinition, 1), secondActor);
    expect(laterSave.ok).to.equal(true);

    postCommitRead.release();
    const originResult = await originatingDiscard;

    expect(originResult.ok).to.equal(true);
    if (!originResult.ok) expect.fail('the exact acknowledged origin discard must succeed');
    expect(originResult.draft.version).to.equal(1);
    expect(originResult.draft.definition).to.deep.equal(draftFromActive(revisions[0].definition));
    expect(drafts[0]).to.deep.include({ version: 2, updatedBy: secondActor });
    expect(drafts[0].definition.recordType.labels.name).to.equal('Edit after discard');
    expect(operationAcks.map(row => row.kind)).to.deep.equal(['discard', 'save']);
  });

  it('rejects and rolls back discard when the active revision wins the commit race', async function () {
    const edited = draftWithLabels(draftFromActive(publishableDefinition()), { name: 'Keep after failed discard' });
    drafts[0].definition = edited;
    const originalDraft = immutableCopy(drafts[0]);
    recordTypeModel.updateOne.callsFake(
      (criteria: Criteria) =>
        new Deferred(() => {
          if (criteria.name === sourceKey && criteria.version === 4) {
            recordTypes[0].activeRevisionNumber = 2;
            recordTypes[0].activeRevisionId = deriveRecordDefinitionRevisionId(
              { brandId, recordTypeKey: sourceKey },
              2
            );
            recordTypes[0].version = 5;
          }
          return null;
        })
    );

    const result = await service.discard(brandId, sourceKey, 0, 1, secondActor);

    expect(result.ok).to.equal(false);
    if (result.ok) expect.fail('the active revision winner must reject discard');
    expect(result.conflict).to.deep.include({
      code: 'active-revision-conflict',
      expectedActiveRevisionNumber: 1,
      currentActiveRevisionNumber: 2,
    });
    expect(drafts[0]).to.deep.include({
      version: originalDraft.version,
      definition: originalDraft.definition,
      updatedBy: originalDraft.updatedBy,
    });
  });

  it('returns status from the stable identity and refuses to reset a clone with no active revision', async function () {
    const status = await service.getStatus(brandId, sourceKey);
    expect(status).to.deep.include({ brandId, key: sourceKey, version: 4 });
    expect(status?.activeRevision).to.deep.include({ revisionNumber: 1 });
    expect(status?.draft).to.deep.include({ version: 0, baseRevisionNumber: 1 });

    const cloned = await service.clone(brandId, sourceKey, targetKey, actor);
    try {
      await service.discard(brandId, targetKey, cloned.draft.version, null, actor);
      expect.fail('an unpublished clone cannot reconstruct an active revision');
    } catch (error) {
      expect(error).to.be.instanceOf(RecordDefinitionDraftLifecycleError);
      expect((error as RecordDefinitionDraftLifecycleError).code).to.equal('draft-reset-requires-active-revision');
    }
  });

  it('never reaches another brand through get, save, clone, discard, or status criteria', async function () {
    const definition = draftFromActive(publishableDefinition());
    const operations = [
      service.save(otherBrandId, sourceKey, saveRequest(definition), actor),
      service.clone(otherBrandId, sourceKey, targetKey, actor),
      service.discard(otherBrandId, sourceKey, 0, 1, actor),
    ];
    for (const operation of operations) {
      try {
        await operation;
        expect.fail('cross-brand operation should fail');
      } catch (error) {
        expect(error).to.be.instanceOf(RecordDefinitionDraftLifecycleError);
        expect((error as RecordDefinitionDraftLifecycleError).code).to.equal('record-type-not-found');
      }
    }
    expect(await service.get(otherBrandId, sourceKey)).to.equal(null);
    expect(await service.getStatus(otherBrandId, sourceKey)).to.equal(null);
    expect(drafts[0].version).to.equal(0);
  });

  it('validates actors without executing accessors and keeps secret material out of failures', async function () {
    let getterCalls = 0;
    const hostileActor = Object.create(null);
    Object.defineProperty(hostileActor, 'id', {
      enumerable: true,
      get: () => {
        getterCalls += 1;
        return 'stolen-secret';
      },
    });

    try {
      await service.save(
        brandId,
        sourceKey,
        saveRequest(draftFromActive(publishableDefinition())),
        hostileActor as RecordDefinitionActorDto
      );
      expect.fail('hostile actor should fail');
    } catch (error) {
      expect(error).to.be.instanceOf(RecordDefinitionDraftLifecycleError);
      expect(String((error as Error).message)).not.to.include('stolen-secret');
    }
    expect(getterCalls).to.equal(0);
    expect(draftModel.updateOne.called).to.equal(false);
  });

  it('normalizes every public operation across primitive, accessor, hostile-proxy, and revoked adapter failures', async function () {
    let unsafeReads = 0;
    const failures = [
      () => new Error('adapter-error-secret'),
      () => 'primitive-adapter-secret',
      () => {
        const failure = {};
        Object.defineProperty(failure, 'message', {
          get: () => {
            unsafeReads += 1;
            throw new Error('adapter-getter-secret');
          },
        });
        return failure;
      },
      () =>
        new Proxy(
          {},
          {
            getPrototypeOf: () => {
              unsafeReads += 1;
              throw new Error('adapter-proxy-secret');
            },
          }
        ),
      () => {
        const revoked = Proxy.revocable({}, {});
        revoked.revoke();
        return revoked.proxy;
      },
    ];
    const operations = [
      () => service.clone(brandId, sourceKey, targetKey, actor),
      () => service.get(brandId, sourceKey),
      () => service.save(brandId, sourceKey, saveRequest(draftFromActive(publishableDefinition())), actor),
      () => service.discard(brandId, sourceKey, 0, 1, actor),
      () => service.getStatus(brandId, sourceKey),
    ];

    for (const operation of operations) {
      for (const failure of failures) {
        recordTypeModel.findOne.callsFake(() => new Deferred(() => Promise.reject(failure())));
        try {
          await operation();
          expect.fail('an adapter failure must be normalized');
        } catch (error) {
          expect(error).to.be.instanceOf(RecordDefinitionDraftLifecycleError);
          expect((error as RecordDefinitionDraftLifecycleError).code).to.equal('storage-consistency-error');
          expect((error as Error).message).to.equal('The record-definition lifecycle storage state is unavailable.');
        }
      }
    }
    expect(unsafeReads).to.equal(0);
    expect(draftModel.updateOne.called).to.equal(false);
    expect(recordTypeModel.updateOne.called).to.equal(false);
  });

  it('fails closed without invoking throwing, accessor, or revoked persisted associations', async function () {
    let unsafeCalls = 0;
    const expectStorageConsistency = async (operation: Promise<unknown>) => {
      try {
        await operation;
        expect.fail('malformed persisted association should fail closed');
      } catch (error) {
        expect(error).to.be.instanceOf(RecordDefinitionDraftLifecycleError);
        expect((error as RecordDefinitionDraftLifecycleError).code).to.equal('storage-consistency-error');
        expect(String((error as Error).message)).not.to.include('attacker-association');
      }
    };

    const throwingProxy = new Proxy(
      { id: brandId },
      {
        getOwnPropertyDescriptor: () => {
          unsafeCalls += 1;
          throw new Error('attacker-association-proxy');
        },
      }
    );
    recordTypeModel.findOne.callsFake(
      () => new Deferred(() => ({ ...immutableCopy(recordTypes[0]), branding: throwingProxy }))
    );
    await expectStorageConsistency(service.get(brandId, sourceKey));

    const getterAssociation = {};
    Object.defineProperty(getterAssociation, 'id', {
      enumerable: true,
      get: () => {
        unsafeCalls += 1;
        throw new Error('attacker-association-getter');
      },
    });
    recordTypeModel.findOne.callsFake(
      () => new Deferred(() => ({ ...immutableCopy(recordTypes[0]), branding: getterAssociation }))
    );
    await expectStorageConsistency(service.get(brandId, sourceKey));

    const accessorRow = immutableCopy(recordTypes[0]);
    Object.defineProperty(accessorRow, 'branding', {
      enumerable: true,
      get: () => {
        unsafeCalls += 1;
        throw new Error('attacker-association-row-getter');
      },
    });
    recordTypeModel.findOne.callsFake(() => new Deferred(() => accessorRow));
    await expectStorageConsistency(service.get(brandId, sourceKey));

    const revoked = Proxy.revocable({ id: 'record-type-source-row' }, {});
    revoked.revoke();
    recordTypeModel.findOne.callsFake(
      (criteria: Criteria) => new Deferred(() => immutableCopy(recordTypes.find(row => matches(row, criteria)) ?? null))
    );
    draftModel.findOne.callsFake(
      () => new Deferred(() => ({ ...immutableCopy(drafts[0]), recordType: revoked.proxy }))
    );
    await expectStorageConsistency(service.get(brandId, sourceKey));

    expect(unsafeCalls).to.equal(0);
    expect(draftModel.updateOne.called).to.equal(false);
    expect(recordTypeModel.updateOne.called).to.equal(false);
  });

  it('keeps generated binding IDs canonical for the cloned record type', async function () {
    const result = await service.clone(brandId, sourceKey, targetKey, actor);
    const transition = result.draft.definition.transitions[0];
    for (const binding of result.draft.definition.actionBindings) {
      const scope = binding.scope as ActionBindingScope;
      const expected = deriveStableActionBindingId({
        recordTypeKey: targetKey,
        scope,
        actionId: binding.actionId,
        contractVersion: binding.contractVersion,
        stableKey: binding.stableKey,
      });
      expect(parseActionBindingId(binding.id)).to.equal(expected);
      if (scope.context === 'workflow-transition') expect(scope.scopeId).to.equal(transition.id);
    }
  });
});
