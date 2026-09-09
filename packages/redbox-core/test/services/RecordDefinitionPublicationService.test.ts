import {
  RECORD_DEFINITION_AGGREGATE_SCHEMA_VERSION,
  RECORD_DEFINITION_API_SCHEMA_VERSION,
  RECORD_DEFINITION_STAGE_SCHEMA_VERSION,
  parseRecordDefinitionBrandId,
  parseRecordDefinitionKey,
  parseWorkflowStageKey,
  type DraftRecordDefinitionAggregateDto,
  type PublishableRecordDefinitionAggregateDto,
  type RecordDefinitionActorDto,
  type RecordDefinitionPublicationRequestDto,
} from '@researchdatabox/sails-ng-common';
import * as sinon from 'sinon';
import { coreRecordActionRegistry } from '../../src/services/record-actions/coordinator';
import {
  deriveRecordDefinitionDraftId,
  deriveRecordDefinitionId,
  deriveRecordDefinitionRevisionId,
  hashRecordDefinition,
} from '../../src/record-workflow-administration';
import type { RuntimeValue } from '../../src/runtimeValues';
import {
  RecordDefinitionPublicationLifecycleError,
  Services,
  type RecordDefinitionPublicationAuthority,
} from '../../src/services/RecordDefinitionPublicationService';

let expect: Chai.ExpectStatic;

type StoredRow = Record<string, RuntimeValue>;
type Criteria = Record<string, RuntimeValue>;

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
    onrejected?: ((reason: RuntimeValue) => Result2 | PromiseLike<Result2>) | null
  ): PromiseLike<Result1 | Result2> {
    return Promise.resolve(this.operation(this.changes)).then(onfulfilled, onrejected);
  }
}

class FindDeferred implements PromiseLike<StoredRow[]> {
  private maximum = Number.MAX_SAFE_INTEGER;
  private sortField: string | null = null;
  private descending = false;
  private readonly rows: () => StoredRow[];

  constructor(rows: () => StoredRow[]) {
    this.rows = rows;
  }

  public limit(maximum: number): this {
    this.maximum = maximum;
    return this;
  }

  public sort(criteria: string): this {
    const [field, direction] = criteria.split(/\s+/u);
    this.sortField = field;
    this.descending = direction === 'DESC';
    return this;
  }

  public usingConnection(): this {
    return this;
  }

  public then<Result1 = StoredRow[], Result2 = never>(
    onfulfilled?: ((value: StoredRow[]) => Result1 | PromiseLike<Result1>) | null,
    onrejected?: ((reason: RuntimeValue) => Result2 | PromiseLike<Result2>) | null
  ): PromiseLike<Result1 | Result2> {
    const rows = this.rows().map(row => structuredClone(row));
    if (this.sortField !== null) {
      const field = this.sortField;
      const direction = this.descending ? -1 : 1;
      rows.sort((left, right) => direction * (Number(left[field]) - Number(right[field])));
    }
    return Promise.resolve(rows.slice(0, this.maximum)).then(onfulfilled, onrejected);
  }
}

class Barrier {
  public readonly reached: Promise<void>;
  private releaseWait!: () => void;
  private markReached!: () => void;

  constructor() {
    this.reached = new Promise(resolve => {
      this.markReached = resolve;
    });
  }

  public async pause(): Promise<void> {
    this.markReached();
    await new Promise<void>(resolve => {
      this.releaseWait = resolve;
    });
  }

  public release(): void {
    this.releaseWait();
  }
}

function valuesEqual(left: RuntimeValue, right: RuntimeValue): boolean {
  if (right === null) return left === null || left === undefined;
  if (left instanceof Date && right instanceof Date) return left.getTime() === right.getTime();
  if (typeof right === 'object' && right !== null && Object.hasOwn(right, 'in')) {
    const candidates = (right as { readonly in?: readonly RuntimeValue[] }).in;
    return candidates?.includes(left) === true;
  }
  return left === right;
}

function matches(row: StoredRow, criteria: Criteria): boolean {
  return Object.entries(criteria).every(([key, value]) => valuesEqual(row[key], value));
}

const brandId = parseRecordDefinitionBrandId('brand-a');
const otherBrandId = parseRecordDefinitionBrandId('brand-b');
const recordTypeKey = parseRecordDefinitionKey('dataset');
const actor: RecordDefinitionActorDto = { id: 'admin-1', displayName: 'Publication administrator' };
const secondActor: RecordDefinitionActorDto = { id: 'admin-2' };
const initialTime = '2026-09-04T08:00:00.000Z';

function definition(label: string): PublishableRecordDefinitionAggregateDto {
  return {
    schemaVersion: RECORD_DEFINITION_AGGREGATE_SCHEMA_VERSION,
    definitionState: 'publishable',
    recordType: {
      labels: { name: label, namePlural: `${label} records` },
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
        formReference: 'dataset-form',
        viewRoles: ['Admin'],
        editRoles: ['Admin'],
        displayOrder: 0,
        starting: true,
        terminal: true,
        validationOverrides: [],
      },
    ],
    transitions: [],
    actionBindings: [],
  };
}

function asDraft(value: PublishableRecordDefinitionAggregateDto): DraftRecordDefinitionAggregateDto {
  return { ...structuredClone(value), definitionState: 'draft-incomplete' };
}

function publishRequest(): RecordDefinitionPublicationRequestDto {
  return {
    schemaVersion: RECORD_DEFINITION_API_SCHEMA_VERSION,
    expectedIdentityVersion: 0,
    expectedDraftVersion: 3,
    expectedActiveRevisionNumber: 1,
    publicationNote: 'Reviewed publication',
  };
}

async function expectLifecycleFailure(
  operation: Promise<RuntimeValue>,
  code: RecordDefinitionPublicationLifecycleError['code']
): Promise<RecordDefinitionPublicationLifecycleError> {
  try {
    await operation;
  } catch (error) {
    expect(error).to.be.instanceOf(RecordDefinitionPublicationLifecycleError);
    expect((error as RecordDefinitionPublicationLifecycleError).code).to.equal(code);
    return error as RecordDefinitionPublicationLifecycleError;
  }
  expect.fail(`Expected publication lifecycle failure ${code}`);
}

describe('RecordDefinitionPublicationService B05 lifecycle state-machine unit tests', function () {
  let service: Services.RecordDefinitionPublication;
  let identities: StoredRow[];
  let drafts: StoredRow[];
  let revisions: StoredRow[];
  let history: StoredRow[];
  let acknowledgements: StoredRow[];
  let historyCreateFailure: boolean;
  let activationBarrier: Barrier | null;
  let authorityLoads: number;
  let lifecycleClearFailures: number;

  before(async function () {
    ({ expect } = await import('chai'));
  });

  beforeEach(function () {
    const recordTypeId = deriveRecordDefinitionId({ brandId, recordTypeKey });
    const draftId = deriveRecordDefinitionDraftId({ brandId, recordTypeKey });
    const revisionId = deriveRecordDefinitionRevisionId({ brandId, recordTypeKey }, 1);
    const activeDefinition = definition('Original dataset');
    identities = [
      {
        id: 'record-type-a',
        schemaVersion: 1,
        definitionId: recordTypeId,
        branding: brandId,
        name: recordTypeKey,
        key: `${brandId}_${recordTypeKey}`,
        packageType: 'dataset',
        searchCore: 'records',
        activeRevisionId: revisionId,
        activeRevisionNumber: 1,
        draftId,
        version: 0,
        draftLifecycleToken: null,
        draftLifecycleKind: null,
        draftLifecycleOperation: null,
        definitionLifecycleToken: null,
        definitionLifecycleOperation: null,
        retiredAt: null,
        retiredBy: null,
        retirementReason: null,
        createdBy: actor,
        updatedBy: actor,
      },
      {
        id: 'record-type-b',
        schemaVersion: 1,
        definitionId: deriveRecordDefinitionId({ brandId: otherBrandId, recordTypeKey }),
        branding: otherBrandId,
        name: recordTypeKey,
        key: `${otherBrandId}_${recordTypeKey}`,
        packageType: 'dataset',
        searchCore: 'records',
        activeRevisionId: deriveRecordDefinitionRevisionId({ brandId: otherBrandId, recordTypeKey }, 1),
        activeRevisionNumber: 1,
        draftId: deriveRecordDefinitionDraftId({ brandId: otherBrandId, recordTypeKey }),
        version: 0,
        draftLifecycleToken: null,
        draftLifecycleKind: null,
        draftLifecycleOperation: null,
        definitionLifecycleToken: null,
        definitionLifecycleOperation: null,
        retiredAt: null,
        retiredBy: null,
        retirementReason: null,
        createdBy: actor,
        updatedBy: actor,
      },
    ];
    drafts = [
      {
        id: draftId,
        schemaVersion: 1,
        branding: brandId,
        recordType: 'record-type-a',
        recordTypeId,
        recordTypeKey,
        version: 3,
        lifecycleOperationToken: null,
        baseRevisionId: revisionId,
        baseRevisionNumber: 1,
        definition: asDraft(definition('Updated dataset')),
        validation: null,
        createdAt: initialTime,
        updatedAt: initialTime,
        createdBy: actor,
        updatedBy: actor,
      },
    ];
    revisions = [
      {
        id: revisionId,
        schemaVersion: 1,
        branding: brandId,
        recordType: 'record-type-a',
        recordTypeId,
        recordTypeKey,
        revisionNumber: 1,
        canonicalHash: hashRecordDefinition(activeDefinition),
        definition: activeDefinition,
        actionContracts: [],
        source: { operation: 'publish', sourceRevisionNumber: null },
        publishedAt: initialTime,
        publishedBy: actor,
        createdAt: initialTime,
        createdBy: actor,
      },
    ];
    history = [];
    acknowledgements = [];
    historyCreateFailure = false;
    activationBarrier = null;
    authorityLoads = 0;
    lifecycleClearFailures = 0;

    const findOne = (rows: StoredRow[], criteria: Criteria): StoredRow | null =>
      rows.find(row => matches(row, criteria)) ?? null;
    const create = (rows: StoredRow[], values: StoredRow): StoredRow => {
      if (
        rows.some(
          row =>
            row.id === values.id ||
            (row.recordType === values.recordType &&
              ((values.revisionNumber !== undefined &&
                values.revisionNumber !== null &&
                row.revisionNumber === values.revisionNumber) ||
                (values.resultingIdentityVersion !== undefined &&
                  row.resultingIdentityVersion === values.resultingIdentityVersion) ||
                (values.identityVersion !== undefined && row.identityVersion === values.identityVersion)))
        )
      ) {
        throw new Error('duplicate immutable row');
      }
      const row = structuredClone(values);
      rows.push(row);
      return structuredClone(row);
    };
    const update = async (rows: StoredRow[], criteria: Criteria, changes: StoredRow): Promise<StoredRow | null> => {
      const row = findOne(rows, criteria);
      if (row === null) return null;
      if (
        changes.definitionLifecycleToken === null &&
        criteria.definitionLifecycleToken !== undefined &&
        lifecycleClearFailures > 0
      ) {
        lifecycleClearFailures -= 1;
        throw new Error('simulated ambiguous lifecycle clear');
      }
      if (changes.activeRevisionId !== undefined && activationBarrier !== null) {
        const barrier = activationBarrier;
        activationBarrier = null;
        await barrier.pause();
      }
      Object.assign(row, structuredClone(changes));
      return structuredClone(row);
    };
    const mongoCollection = {
      createIndex: sinon.stub().resolves('publication-index'),
      findOne: sinon.stub().callsFake(async (criteria: Criteria) => structuredClone(findOne(identities, criteria))),
      updateOne: sinon.stub().callsFake(async (criteria: Criteria, mutation: { $set: StoredRow }) => {
        const updated = await update(identities, criteria, mutation.$set);
        return { matchedCount: updated === null ? 0 : 1, modifiedCount: updated === null ? 0 : 1 };
      }),
    };
    const indexManager = {
      collection: sinon.stub().returns(mongoCollection),
    };

    (global as typeof globalThis & { RecordType: RuntimeValue }).RecordType = {
      getDatastore: sinon.stub().returns({ manager: indexManager }),
      findOne: sinon
        .stub()
        .callsFake((criteria: Criteria) => new Deferred(() => structuredClone(findOne(identities, criteria)))),
      updateOne: sinon
        .stub()
        .callsFake((criteria: Criteria) => new Deferred(changes => update(identities, criteria, changes))),
    };
    (global as typeof globalThis & { RecordDefinitionDraft: RuntimeValue }).RecordDefinitionDraft = {
      findOne: sinon
        .stub()
        .callsFake((criteria: Criteria) => new Deferred(() => structuredClone(findOne(drafts, criteria)))),
    };
    (global as typeof globalThis & { RecordDefinitionRevision: RuntimeValue }).RecordDefinitionRevision = {
      getDatastore: sinon.stub().returns({ manager: indexManager }),
      findOne: sinon
        .stub()
        .callsFake((criteria: Criteria) => new Deferred(() => structuredClone(findOne(revisions, criteria)))),
      find: sinon
        .stub()
        .callsFake((criteria: Criteria) => new FindDeferred(() => revisions.filter(row => matches(row, criteria)))),
      create: sinon.stub().callsFake((values: StoredRow) => new Deferred(() => create(revisions, values))),
    };
    (global as typeof globalThis & { RecordDefinitionHistory: RuntimeValue }).RecordDefinitionHistory = {
      findOne: sinon
        .stub()
        .callsFake((criteria: Criteria) => new Deferred(() => structuredClone(findOne(history, criteria)))),
      find: sinon
        .stub()
        .callsFake((criteria: Criteria) => new FindDeferred(() => history.filter(row => matches(row, criteria)))),
      create: sinon.stub().callsFake(
        (values: StoredRow) =>
          new Deferred(() => {
            if (historyCreateFailure) throw new Error('private history failure');
            return create(history, values);
          })
      ),
    };
    (
      global as typeof globalThis & { RecordDefinitionLifecycleOperationAck: RuntimeValue }
    ).RecordDefinitionLifecycleOperationAck = {
      findOne: sinon
        .stub()
        .callsFake((criteria: Criteria) => new Deferred(() => structuredClone(findOne(acknowledgements, criteria)))),
      create: sinon.stub().callsFake((values: StoredRow) => new Deferred(() => create(acknowledgements, values))),
    };
    (global as typeof globalThis & { sails: RuntimeValue }).sails = {
      log: {
        error: sinon.stub(),
        warn: sinon.stub(),
        debug: sinon.stub(),
      },
    };

    const authority: RecordDefinitionPublicationAuthority = {
      load: async () => {
        authorityLoads += 1;
        return {
          actionRegistry: coreRecordActionRegistry(),
          roles: ['Admin'],
          forms: [{ reference: 'dataset-form', validationOperations: {}, validationGroups: {} }],
          availableRecordTypeKeys: [recordTypeKey],
          storageCapabilityProvider: null,
          stageReferences: [],
        };
      },
    };
    service = new Services.RecordDefinitionPublication(authority);
  });

  afterEach(function () {
    if (activationBarrier !== null) activationBarrier.release();
    delete (global as typeof globalThis & { RecordDefinitionLifecycleOperationAck?: RuntimeValue })
      .RecordDefinitionLifecycleOperationAck;
    delete (global as typeof globalThis & { RecordDefinitionHistory?: RuntimeValue }).RecordDefinitionHistory;
    delete (global as typeof globalThis & { RecordDefinitionRevision?: RuntimeValue }).RecordDefinitionRevision;
    delete (global as typeof globalThis & { RecordDefinitionDraft?: RuntimeValue }).RecordDefinitionDraft;
    delete (global as typeof globalThis & { RecordType?: RuntimeValue }).RecordType;
    delete (global as typeof globalThis & { sails?: RuntimeValue }).sails;
    sinon.restore();
  });

  it('validates authoritatively, persists immutable evidence, and changes the active pointer last', async function () {
    const barrier = new Barrier();
    activationBarrier = barrier;
    const publication = service.publish(brandId, recordTypeKey, publishRequest(), actor);
    await barrier.reached;

    expect(authorityLoads).to.equal(2);
    expect(revisions.map(row => row.revisionNumber)).to.deep.equal([1, 2]);
    expect(history).to.have.length(1);
    expect(history[0]).to.deep.include({
      operation: 'publish',
      expectedIdentityVersion: 0,
      resultingIdentityVersion: 1,
      expectedDraftVersion: 3,
      expectedActiveRevisionNumber: 1,
      actor,
      note: 'Reviewed publication',
    });
    expect(history[0].validation).to.be.an('object');
    expect(history[0].impact).to.be.an('object');
    expect(identities[0]).to.include({ activeRevisionNumber: 1, version: 1 });
    expect(acknowledgements).to.have.length(0);

    barrier.release();
    const result = await publication;
    expect(result.ok).to.equal(true);
    if (!result.ok) expect.fail('publication must apply');
    expect(result.revision).to.deep.include({ revisionNumber: 2, publishedBy: actor });
    expect(result.identity.activeRevision?.revisionNumber).to.equal(2);
    expect(identities[0]).to.include({ activeRevisionNumber: 2, version: 1 });
    expect(identities[0].definitionLifecycleToken).to.equal(null);
    expect(acknowledgements).to.have.length(1);
  });

  it('gives exactly one concurrent publisher the expected-version CAS and returns a conflict to the loser', async function () {
    const results = await Promise.all([
      service.publish(brandId, recordTypeKey, publishRequest(), actor),
      new Services.RecordDefinitionPublication({
        load: async request => ({
          actionRegistry: coreRecordActionRegistry(),
          roles: ['Admin'],
          forms: [{ reference: 'dataset-form', validationOperations: {}, validationGroups: {} }],
          availableRecordTypeKeys: [request.recordTypeKey],
          storageCapabilityProvider: null,
          stageReferences: [],
        }),
      }).publish(brandId, recordTypeKey, publishRequest(), secondActor),
    ]);

    expect(results.filter(result => result.ok)).to.have.length(1);
    expect(results.filter(result => !result.ok)).to.have.length(1);
    const loser = results.find(result => !result.ok);
    if (loser?.ok !== false) expect.fail('one concurrent publisher must conflict');
    expect(loser.conflict).to.include({ expectedActiveRevisionNumber: 1, currentActiveRevisionNumber: 2 });
    expect(revisions).to.have.length(2);
    expect(history).to.have.length(1);
    expect(acknowledgements).to.have.length(1);
    expect(identities[0]).to.include({ activeRevisionNumber: 2, version: 1 });
  });

  it('retries ambiguous lifecycle clears until raw identity state is settled', async function () {
    lifecycleClearFailures = 2;
    const result = await service.publish(brandId, recordTypeKey, publishRequest(), actor);

    expect(result.ok).to.equal(true);
    expect(lifecycleClearFailures).to.equal(0);
    expect(identities[0]).to.include({
      version: 1,
      definitionLifecycleToken: null,
      definitionLifecycleOperation: null,
      draftLifecycleToken: null,
      draftLifecycleKind: null,
      draftLifecycleOperation: null,
    });
  });

  it('fails closed when the bounded lifecycle clear cannot settle raw identity state', async function () {
    lifecycleClearFailures = 9;
    const failure = await expectLifecycleFailure(
      service.publish(brandId, recordTypeKey, publishRequest(), actor),
      'storage-consistency-error'
    );

    expect(failure.message).to.equal('The completed lifecycle fences could not be cleared.');
    expect(lifecycleClearFailures).to.equal(1);
    expect(identities[0]).to.include({
      version: 1,
      activeRevisionNumber: 2,
      draftLifecycleToken: null,
      draftLifecycleKind: null,
      draftLifecycleOperation: null,
    });
    expect(identities[0].definitionLifecycleToken).to.be.a('string');
    expect(identities[0].definitionLifecycleOperation).to.be.an('object');
  });

  it('fails closed on a history write failure without moving the runtime pointer', async function () {
    historyCreateFailure = true;
    const failure = await expectLifecycleFailure(
      service.publish(brandId, recordTypeKey, publishRequest(), actor),
      'storage-consistency-error'
    );

    expect(failure.message).not.to.include('private history failure');
    expect(revisions).to.have.length(2);
    expect(history).to.have.length(0);
    expect(acknowledgements).to.have.length(0);
    expect(identities[0]).to.include({ activeRevisionNumber: 1, version: 1 });
  });

  it('lists and gets brand-scoped immutable history with bounded structural changes', async function () {
    const published = await service.publish(brandId, recordTypeKey, publishRequest(), actor);
    if (!published.ok) expect.fail('publication must apply');

    const listed = await service.listHistory(brandId, recordTypeKey, 1);
    expect(listed).to.have.length(1);
    expect(listed[0]).to.deep.equal(published.history);
    expect(listed[0].changes.length).to.be.lessThanOrEqual(100);
    const fetched = await service.getRevision(brandId, recordTypeKey, 2);
    expect(fetched?.revision).to.deep.equal(published.revision);
    expect(fetched?.history).to.deep.equal(published.history);
    expect(await service.getRevision(otherBrandId, recordTypeKey, 2)).to.equal(null);
    await expectLifecycleFailure(service.listHistory(brandId, recordTypeKey, 101), 'invalid-history-request');
  });

  it('rolls back only after revalidation and publishes a reasoned monotonic revision', async function () {
    const published = await service.publish(brandId, recordTypeKey, publishRequest(), actor);
    if (!published.ok) expect.fail('publication must apply');
    const rollback = await service.rollback(
      brandId,
      recordTypeKey,
      {
        schemaVersion: RECORD_DEFINITION_API_SCHEMA_VERSION,
        expectedIdentityVersion: 1,
        expectedActiveRevisionNumber: 2,
        sourceRevisionNumber: 1,
        reason: 'Restore the reviewed baseline',
      },
      secondActor
    );

    expect(rollback.ok).to.equal(true);
    if (!rollback.ok) expect.fail('rollback must apply');
    expect(rollback.revision).to.deep.include({
      revisionNumber: 3,
      source: { operation: 'rollback', sourceRevisionNumber: 1 },
    });
    expect(rollback.revision.definition).to.deep.equal(revisions[0].definition);
    expect(rollback.history.publicationNote).to.equal('Restore the reviewed baseline');
    expect(rollback.validation.scope).to.equal('rollback');
    expect(authorityLoads).to.equal(4);
    await expectLifecycleFailure(
      service.rollback(
        brandId,
        recordTypeKey,
        {
          schemaVersion: RECORD_DEFINITION_API_SCHEMA_VERSION,
          expectedIdentityVersion: 2,
          expectedActiveRevisionNumber: 3,
          sourceRevisionNumber: 1,
          reason: '',
        },
        actor
      ),
      'invalid-rollback-request'
    );
  });

  it('rejects hidden and symbol actor fields before any storage access', async function () {
    const secret = 'HIDDEN-ACTOR-SECRET';
    let getterCalls = 0;
    const actors = [
      Object.defineProperty({ id: 'admin' }, secret, { value: secret }),
      Object.defineProperty({ id: 'admin' }, Symbol(secret), { value: secret }),
      { id: 'admin', [Symbol(secret)]: secret },
      Object.defineProperty({ id: 'admin' }, 'displayName', { value: secret }),
      Object.defineProperty({ id: 'admin' }, 'displayName', {
        enumerable: true,
        get: () => {
          getterCalls++;
          return secret;
        },
      }),
    ];
    for (const hostile of actors) {
      for (const kind of ['retire', 'unretire'] as const) {
        try {
          await service[kind](brandId, recordTypeKey, { schemaVersion: 1, expectedIdentityVersion: 0 }, hostile);
          expect.fail('hostile actor must be rejected');
        } catch (error) {
          expect(error).to.be.instanceOf(RecordDefinitionPublicationLifecycleError);
          expect((error as RecordDefinitionPublicationLifecycleError).code).to.equal('invalid-actor');
          expect(String(error)).not.to.include(secret);
          expect(String(error).length).to.be.lessThan(256);
        }
      }
    }
    expect(getterCalls).to.equal(0);
    for (const name of ['RecordType', 'RecordDefinitionDraft', 'RecordDefinitionRevision', 'RecordDefinitionHistory']) {
      const model = (global as any)[name];
      for (const stub of Object.values(model) as sinon.SinonStub[]) sinon.assert.notCalled(stub);
    }
    expect(authorityLoads).to.equal(0);
  });

  it('retires and unretires the stable identity without hiding revisions or history', async function () {
    const published = await service.publish(brandId, recordTypeKey, publishRequest(), actor);
    if (!published.ok) expect.fail('publication must apply');
    const retired = await service.retire(
      brandId,
      recordTypeKey,
      {
        schemaVersion: RECORD_DEFINITION_API_SCHEMA_VERSION,
        expectedIdentityVersion: 1,
        reason: 'Superseded by a governed type',
      },
      actor
    );
    expect(retired.ok).to.equal(true);
    if (!retired.ok) expect.fail('retirement must apply');
    expect(retired.identity.retirement).to.deep.include({ reason: 'Superseded by a governed type' });
    expect((await service.getRevision(brandId, recordTypeKey, 2))?.revision.revisionNumber).to.equal(2);
    expect(await service.listHistory(brandId, recordTypeKey)).to.have.length(1);
    expect(history.map(row => row.operation)).to.deep.equal(['publish', 'retire']);

    const restored = await service.unretire(
      brandId,
      recordTypeKey,
      { schemaVersion: RECORD_DEFINITION_API_SCHEMA_VERSION, expectedIdentityVersion: 2 },
      secondActor
    );
    expect(restored.ok).to.equal(true);
    if (!restored.ok) expect.fail('unretirement must apply');
    expect(restored.identity.retirement).to.equal(null);
    expect(history.map(row => row.operation)).to.deep.equal(['publish', 'retire', 'unretire']);
    expect(revisions).to.have.length(2);
  });

  it('rejects a tampered durable acknowledgement instead of replaying its claimed result', async function () {
    const published = await service.publish(brandId, recordTypeKey, publishRequest(), actor);
    if (!published.ok) expect.fail('publication must apply');
    const acknowledgement = acknowledgements[0];
    const operation = acknowledgement.operation;
    identities[0].definitionLifecycleToken = acknowledgement.id;
    identities[0].definitionLifecycleOperation = structuredClone(operation);
    acknowledgement.identity = {
      ...(acknowledgement.identity as StoredRow),
      deployment: { packageType: 'hostile-package', searchCore: 'records' },
    };

    await expectLifecycleFailure(service.listHistory(brandId, recordTypeKey), 'storage-consistency-error');
    expect(identities[0].definitionLifecycleToken).to.equal(acknowledgement.id);
  });

  it('rejects hostile request accessors and malformed persisted ownership without leaking values', async function () {
    let reads = 0;
    const hostile = Object.defineProperty({}, 'schemaVersion', {
      enumerable: true,
      get: () => {
        reads += 1;
        throw new Error('request-secret');
      },
    });
    const requestFailure = await expectLifecycleFailure(
      service.publish(brandId, recordTypeKey, hostile as RecordDefinitionPublicationRequestDto, actor),
      'invalid-publication-request'
    );
    expect(reads).to.equal(0);
    expect(requestFailure.message).not.to.include('request-secret');

    identities[0].definitionId = deriveRecordDefinitionId({ brandId: otherBrandId, recordTypeKey });
    const persistedFailure = await expectLifecycleFailure(
      service.publish(brandId, recordTypeKey, publishRequest(), actor),
      'storage-consistency-error'
    );
    expect(persistedFailure.message).not.to.include(otherBrandId);
    expect(revisions).to.have.length(1);
    expect(history).to.have.length(0);
  });
});
