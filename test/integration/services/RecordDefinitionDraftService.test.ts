import { randomUUID } from 'node:crypto';
import {
  RECORD_DEFINITION_AGGREGATE_SCHEMA_VERSION,
  RECORD_DEFINITION_API_SCHEMA_VERSION,
  RECORD_DEFINITION_STAGE_SCHEMA_VERSION,
  parseRecordDefinitionBrandId,
  parseRecordDefinitionCanonicalHash,
  parseRecordDefinitionKey,
  parseWorkflowStageKey,
  type DraftRecordDefinitionAggregateDto,
  type PublishableRecordDefinitionAggregateDto,
  type RecordDefinitionActorDto,
  type RecordDefinitionBrandId,
  type RecordDefinitionKey,
} from '@researchdatabox/sails-ng-common';
import { expect } from 'chai';
import sailsApp from 'sails';
import { generateAllShims } from '../../../packages/redbox-core/src/loader';
import {
  deriveRecordDefinitionDraftId,
  deriveRecordDefinitionId,
  deriveRecordDefinitionRevisionId,
} from '../../../packages/redbox-core/src/record-workflow-administration';
import {
  RecordDefinitionDraftLifecycleError,
  Services,
} from '../../../packages/redbox-core/src/services/RecordDefinitionDraftService';
import type { BrandingConfigWaterlineModel } from '../../../packages/redbox-core/src/waterline-models/BrandingConfig';
import type { RecordDefinitionDraftWaterlineModel } from '../../../packages/redbox-core/src/waterline-models/RecordDefinitionDraft';
import type { RecordDefinitionDraftOperationAckWaterlineModel } from '../../../packages/redbox-core/src/waterline-models/RecordDefinitionDraftOperationAck';
import type { RecordDefinitionRevisionWaterlineModel } from '../../../packages/redbox-core/src/waterline-models/RecordDefinitionRevision';
import type { RecordTypeWaterlineModel } from '../../../packages/redbox-core/src/waterline-models/RecordType';

declare const BrandingConfig: BrandingConfigWaterlineModel;
declare const RecordDefinitionDraft: RecordDefinitionDraftWaterlineModel;
declare const RecordDefinitionDraftOperationAck: RecordDefinitionDraftOperationAckWaterlineModel;
declare const RecordDefinitionRevision: RecordDefinitionRevisionWaterlineModel;
declare const RecordType: RecordTypeWaterlineModel;

interface MongoIndexDescription {
  readonly expireAfterSeconds?: number;
  readonly key: Readonly<Record<string, number>>;
  readonly unique?: boolean;
}

interface MongoCollection {
  aggregate(pipeline: readonly Record<string, any>[]): MongoCursor;
  deleteMany(filter: Record<string, any>): Promise<{ readonly deletedCount: number }>;
  find(filter: Record<string, any>): MongoCursor;
  findOne(filter: Record<string, any>): Promise<Record<string, any> | null>;
  indexes(): Promise<readonly MongoIndexDescription[]>;
  updateOne(filter: Record<string, any>, update: Record<string, any>): Promise<{ readonly matchedCount: number }>;
}

interface MongoCursor {
  next(): Promise<Record<string, any> | null>;
  project(projection: Record<string, number>): MongoCursor;
  toArray(): Promise<Array<Record<string, any>>>;
}

interface MongoAdmin {
  command(command: Record<string, any>): Promise<Record<string, any>>;
}

interface MongoManager {
  admin(): MongoAdmin;
  collection(name: string): MongoCollection;
}

const actor: RecordDefinitionActorDto = { id: 'b04-integration-admin', displayName: 'B04 integration admin' };
let createdBrandNames: string[] = [];
let barrierRestorers: Array<() => void> = [];
let activeBarriers: DatastoreBarrier[] = [];
let ttlMonitorStateToRestore: { readonly enabled: boolean; readonly sleepSeconds: number } | null = null;

class DatastoreBarrier {
  public readonly reached: Promise<void>;
  private markReached!: () => void;
  private releaseWait!: () => void;
  private released = false;
  private readonly waitForRelease: Promise<void>;

  constructor() {
    this.reached = new Promise(resolve => {
      this.markReached = resolve;
    });
    this.waitForRelease = new Promise(resolve => {
      this.releaseWait = resolve;
    });
    activeBarriers.push(this);
  }

  public async pause(): Promise<void> {
    this.markReached();
    await this.waitForRelease;
  }

  public release(): void {
    if (this.released) return;
    this.released = true;
    this.releaseWait();
  }
}

function pauseNextIdentityMutation(kind: 'discard' | 'save'): DatastoreBarrier {
  const barrier = new DatastoreBarrier();
  const manager = RecordType.getDatastore().manager as object as MongoManager;
  const originalCollection = manager.collection;
  let claimed = false;
  const wrappedCollection = function (this: MongoManager, name: string): MongoCollection {
    const collection = originalCollection.call(this, name);
    if (name !== 'recordtype') return collection;
    const originalUpdateOne = collection.updateOne;
    collection.updateOne = async function (
      this: MongoCollection,
      filter: Record<string, any>,
      update: Record<string, any>
    ): Promise<{ readonly matchedCount: number }> {
      const result = await originalUpdateOne.call(this, filter, update);
      const values = update.$set;
      if (!claimed && values?.draftLifecycleKind === kind && typeof values.draftLifecycleToken === 'string') {
        claimed = true;
        await barrier.pause();
      }
      return result;
    };
    return collection;
  };
  manager.collection = wrappedCollection;
  barrierRestorers.push(() => {
    if (manager.collection === wrappedCollection) manager.collection = originalCollection;
  });
  return barrier;
}

function pauseNextCloneIdentityCreate(targetKey: RecordDefinitionKey): DatastoreBarrier {
  const barrier = new DatastoreBarrier();
  const model = RecordType as any;
  const originalCreate = model.create;
  let claimed = false;
  const wrappedCreate = function (this: any, values: Record<string, any>): any {
    const query = originalCreate.call(this, values);
    if (claimed || values.name !== targetKey || values.draftLifecycleKind !== 'clone') return query;
    claimed = true;
    const originalFetch = query.fetch;
    query.fetch = function (): any {
      const deferred = originalFetch.call(query);
      return Promise.resolve(deferred).then(async value => {
        await barrier.pause();
        return value;
      });
    };
    return query;
  };
  model.create = wrappedCreate;
  barrierRestorers.push(() => {
    if (model.create === wrappedCreate) model.create = originalCreate;
  });
  return barrier;
}

function mongoManager(): MongoManager {
  return RecordDefinitionDraftOperationAck.getDatastore().manager as MongoManager;
}

async function cleanupCreatedBrands(): Promise<void> {
  if (createdBrandNames.length === 0) return;
  const manager = mongoManager();
  const brandingCollection = manager.collection('brandingconfig');
  const brands = await brandingCollection
    .find({ name: { $in: createdBrandNames } })
    .project({ _id: 1 })
    .toArray();
  const ownerIds = brands.flatMap(row => [row._id, String(row._id)]);
  if (ownerIds.length > 0) {
    for (const collectionName of [
      'recorddefinitiondraftoperationack',
      'recorddefinitiondraft',
      'recorddefinitionhistory',
      'recorddefinitionrevision',
      'actionsecret',
      'recordtype',
    ]) {
      await manager.collection(collectionName).deleteMany({ branding: { $in: ownerIds } });
    }
    await brandingCollection.deleteMany({ _id: { $in: brands.map(row => row._id) } });
  }
}

async function pauseTtlMonitor(): Promise<void> {
  const admin = mongoManager().admin();
  const current = await admin.command({ getParameter: 1, ttlMonitorEnabled: 1, ttlMonitorSleepSecs: 1 });
  ttlMonitorStateToRestore = {
    enabled: current.ttlMonitorEnabled === true,
    sleepSeconds: Number(current.ttlMonitorSleepSecs),
  };
  await admin.command({ setParameter: 1, ttlMonitorEnabled: false });
}

async function startShortTtlMonitorInterval(): Promise<void> {
  const admin = mongoManager().admin();
  await admin.command({ setParameter: 1, ttlMonitorSleepSecs: 1 });
  await admin.command({ setParameter: 1, ttlMonitorEnabled: true });
}

async function waitForMongoDeletion(collection: MongoCollection, filter: Record<string, any>): Promise<void> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if ((await collection.findOne(filter)) === null) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  expect.fail('MongoDB TTL monitor did not delete the expired acknowledgement within 20 seconds');
}

async function expectLifecycleFailure(
  operation: Promise<any>,
  code: RecordDefinitionDraftLifecycleError['code']
): Promise<RecordDefinitionDraftLifecycleError> {
  try {
    await operation;
  } catch (error) {
    expect(error).to.be.instanceOf(RecordDefinitionDraftLifecycleError);
    expect((error as RecordDefinitionDraftLifecycleError).code).to.equal(code);
    return error as RecordDefinitionDraftLifecycleError;
  }
  expect.fail(`Expected draft lifecycle failure ${code}`);
}

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
        formReference: 'b04-integration-form',
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

function draftWithLabel(source: DraftRecordDefinitionAggregateDto, label: string): DraftRecordDefinitionAggregateDto {
  return {
    ...structuredClone(source),
    recordType: {
      ...structuredClone(source.recordType),
      labels: { name: label, namePlural: `${label} records` },
    },
  };
}

async function createBrand(name: string): Promise<RecordDefinitionBrandId> {
  createdBrandNames.push(name);
  const row = await BrandingConfig.create({ name, variables: {} }).fetch();
  return parseRecordDefinitionBrandId(String(row.id));
}

async function createActiveSource(
  brandId: RecordDefinitionBrandId,
  recordTypeKey: RecordDefinitionKey,
  label: string,
  withDraft = false
): Promise<void> {
  const recordTypeId = deriveRecordDefinitionId({ brandId, recordTypeKey });
  const revisionId = deriveRecordDefinitionRevisionId({ brandId, recordTypeKey }, 1);
  const draftId = withDraft ? deriveRecordDefinitionDraftId({ brandId, recordTypeKey }) : null;
  const identity = await RecordType.create({
    schemaVersion: 1,
    definitionId: recordTypeId,
    branding: brandId,
    name: recordTypeKey,
    packageType: 'dataset',
    searchCore: 'records',
    activeRevisionId: revisionId,
    activeRevisionNumber: 1,
    draftId,
    version: 0,
    draftLifecycleToken: null,
    draftLifecycleKind: null,
    draftLifecycleOperation: null,
    createdBy: actor,
    updatedBy: actor,
  }).fetch();
  const identityId = String(identity.id);
  await RecordDefinitionRevision.create({
    id: revisionId,
    schemaVersion: 1,
    branding: brandId,
    recordType: identityId,
    recordTypeId,
    recordTypeKey,
    revisionNumber: 1,
    canonicalHash: parseRecordDefinitionCanonicalHash(`sha256:${'a'.repeat(64)}`),
    definition: definition(label),
    actionContracts: [],
    source: { operation: 'publish', sourceRevisionNumber: null },
    publishedAt: new Date(),
    publishedBy: actor,
    createdBy: actor,
  }).fetch();
  if (withDraft) {
    await RecordDefinitionDraft.create({
      id: draftId,
      schemaVersion: 1,
      branding: brandId,
      recordType: identityId,
      recordTypeId,
      recordTypeKey,
      version: 0,
      lifecycleOperationToken: null,
      baseRevisionId: revisionId,
      baseRevisionNumber: 1,
      definition: { ...definition(label), definitionState: 'draft-incomplete' },
      validation: null,
      createdBy: actor,
      updatedBy: actor,
    }).fetch();
  }
}

function fulfilled<Value>(result: PromiseSettledResult<Value>): Value | null {
  return result.status === 'fulfilled' ? result.value : null;
}

describe('RecordDefinitionDraftService datastore concurrency integration', function () {
  this.timeout(90_000);

  let liftedHere = false;

  beforeEach(function () {
    createdBrandNames = [];
    barrierRestorers = [];
    activeBarriers = [];
    ttlMonitorStateToRestore = null;
  });

  before(async function () {
    if (sailsApp.hooks?.orm !== undefined) return;
    await generateAllShims(process.cwd(), { forceRegenerate: true });
    await new Promise<void>((resolve, reject) => {
      sailsApp.lift(
        {
          bootstrap: (done: (error?: Error) => void): void => done(),
          hooks: { grunt: false },
          log: { level: 'error' },
          models: { datastore: 'mongodb', migrate: 'drop' },
        },
        (error?: Error) => {
          if (error !== undefined) {
            reject(error);
            return;
          }
          liftedHere = true;
          resolve();
        }
      );
    });
  });

  after(async function () {
    if (!liftedHere) return;
    await new Promise<void>((resolve, reject) => {
      sailsApp.lower((error?: Error) => {
        if (error !== undefined) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  });

  afterEach(async function () {
    for (const barrier of activeBarriers) barrier.release();
    for (const restore of barrierRestorers.reverse()) restore();
    try {
      if (ttlMonitorStateToRestore !== null) {
        const admin = mongoManager().admin();
        try {
          await admin.command({
            setParameter: 1,
            ttlMonitorSleepSecs: ttlMonitorStateToRestore.sleepSeconds,
          });
        } finally {
          await admin.command({ setParameter: 1, ttlMonitorEnabled: ttlMonitorStateToRestore.enabled });
        }
      }
    } finally {
      await cleanupCreatedBrands();
    }
  });

  it('serializes multi-instance clone/save ordering through Waterline CAS and unique indexes', async function () {
    const suffix = randomUUID().replaceAll('-', '').slice(0, 10);
    const brandId = await createBrand(`b04-cas-${suffix}`);
    const sourceKey = parseRecordDefinitionKey(`B04Source${suffix}`);
    const targetKey = parseRecordDefinitionKey(`B04Target${suffix}`);
    await createActiveSource(brandId, sourceKey, 'Integration source');
    const firstInstance = new Services.RecordDefinitionDraftLifecycle();
    const secondInstance = new Services.RecordDefinitionDraftLifecycle();

    const cloneResults = await Promise.allSettled([
      firstInstance.clone(brandId, sourceKey, targetKey, actor),
      secondInstance.clone(brandId, sourceKey, targetKey, actor),
    ]);
    const cloned = cloneResults.map(fulfilled).find(result => result !== null);
    const rejectedClone = cloneResults.find(result => result.status === 'rejected');
    expect(cloned).not.to.equal(undefined);
    expect(rejectedClone?.status).to.equal('rejected');
    if (rejectedClone?.status === 'rejected') {
      expect(rejectedClone.reason).to.be.instanceOf(RecordDefinitionDraftLifecycleError);
      expect((rejectedClone.reason as RecordDefinitionDraftLifecycleError).code).to.equal('record-type-already-exists');
    }
    expect(await RecordType.count({ branding: brandId, name: targetKey })).to.equal(1);
    expect(await RecordDefinitionDraft.count({ branding: brandId, recordTypeKey: targetKey })).to.equal(1);
    expect(await RecordDefinitionDraftOperationAck.count({ branding: brandId, recordTypeKey: targetKey })).to.equal(1);
    const mongoManager = RecordDefinitionDraftOperationAck.getDatastore().manager as MongoManager;
    const acknowledgementIndexes = await mongoManager.collection('recorddefinitiondraftoperationack').indexes();
    expect(
      acknowledgementIndexes.some(
        index =>
          index.unique === true &&
          index.key.recordType === 1 &&
          index.key.identityVersion === 1 &&
          Object.keys(index.key).length === 2
      )
    ).to.equal(true);
    expect(
      acknowledgementIndexes.some(
        index =>
          index.unique === true &&
          index.key.branding === 1 &&
          index.key.recordTypeKey === 1 &&
          index.key.identityVersion === 1 &&
          Object.keys(index.key).length === 3
      )
    ).to.equal(true);
    expect(acknowledgementIndexes.some(index => index.key.expiresAt === 1 && index.expireAfterSeconds === 0)).to.equal(
      true
    );
    if (cloned === undefined || cloned === null) expect.fail('one clone must win');

    const firstEdit = draftWithLabel(cloned.draft.definition, 'First concurrent edit');
    const secondEdit = draftWithLabel(cloned.draft.definition, 'Second concurrent edit');
    const saveResults = await Promise.all([
      firstInstance.save(
        brandId,
        targetKey,
        {
          schemaVersion: RECORD_DEFINITION_API_SCHEMA_VERSION,
          expectedDraftVersion: 0,
          expectedActiveRevisionNumber: null,
          definition: firstEdit,
        },
        actor
      ),
      secondInstance.save(
        brandId,
        targetKey,
        {
          schemaVersion: RECORD_DEFINITION_API_SCHEMA_VERSION,
          expectedDraftVersion: 0,
          expectedActiveRevisionNumber: null,
          definition: secondEdit,
        },
        actor
      ),
    ]);
    const applied = saveResults.find(result => result.ok);
    const conflicted = saveResults.find(result => !result.ok);
    expect(applied?.ok).to.equal(true);
    expect(conflicted?.ok).to.equal(false);
    if (conflicted?.ok !== false) expect.fail('one datastore CAS contender must conflict');
    expect(conflicted.conflict).to.include({
      code: 'draft-version-conflict',
      expectedVersion: 0,
      currentVersion: 1,
    });

    const storedDraft = await RecordDefinitionDraft.findOne({
      id: deriveRecordDefinitionDraftId({ brandId, recordTypeKey: targetKey }),
      branding: brandId,
      recordTypeKey: targetKey,
    });
    expect(storedDraft).not.to.equal(undefined);
    expect(storedDraft?.version).to.equal(1);
    expect(storedDraft?.definition).to.deep.equal(applied?.ok === true ? applied.draft.definition : undefined);
    const nextDefinition = draftWithLabel(storedDraft!.definition, 'Ordered follow-up edit');
    const ordered = await secondInstance.save(
      brandId,
      targetKey,
      {
        schemaVersion: RECORD_DEFINITION_API_SCHEMA_VERSION,
        expectedDraftVersion: 1,
        expectedActiveRevisionNumber: null,
        definition: nextDefinition,
      },
      actor
    );
    expect(ordered.ok).to.equal(true);
    expect(await RecordDefinitionDraftOperationAck.count({ branding: brandId, recordTypeKey: targetKey })).to.equal(3);
  });

  it('rolls a token-owned interrupted clone forward once and returns the origin acknowledgement after later progress', async function () {
    const suffix = randomUUID().replaceAll('-', '').slice(0, 10);
    const brandId = await createBrand(`b04-clone-recovery-${suffix}`);
    const sourceKey = parseRecordDefinitionKey(`B04CloneSource${suffix}`);
    const targetKey = parseRecordDefinitionKey(`B04CloneTarget${suffix}`);
    await createActiveSource(brandId, sourceKey, 'Clone recovery source');

    const barrier = pauseNextCloneIdentityCreate(targetKey);
    const originatingClone = new Services.RecordDefinitionDraftLifecycle().clone(brandId, sourceKey, targetKey, actor);
    await barrier.reached;

    expect(await RecordType.count({ branding: brandId, name: targetKey })).to.equal(1);
    expect(await RecordDefinitionDraft.count({ branding: brandId, recordTypeKey: targetKey })).to.equal(0);
    const recoveredStatus = await new Services.RecordDefinitionDraftLifecycle().getStatus(brandId, targetKey);
    expect(recoveredStatus).to.deep.include({ brandId, key: targetKey, version: 0 });
    expect(recoveredStatus?.draft).to.deep.include({ version: 0, baseRevisionNumber: null });
    expect(await RecordType.count({ branding: brandId, name: targetKey })).to.equal(1);
    expect(await RecordDefinitionDraft.count({ branding: brandId, recordTypeKey: targetKey })).to.equal(1);

    await expectLifecycleFailure(
      new Services.RecordDefinitionDraftLifecycle().clone(brandId, sourceKey, targetKey, actor),
      'record-type-already-exists'
    );
    const recoveredDraft = await new Services.RecordDefinitionDraftLifecycle().get(brandId, targetKey);
    if (recoveredDraft === null) expect.fail('the recovered clone must have one draft');
    const forwardSave = await new Services.RecordDefinitionDraftLifecycle().save(
      brandId,
      targetKey,
      {
        schemaVersion: RECORD_DEFINITION_API_SCHEMA_VERSION,
        expectedDraftVersion: 0,
        expectedActiveRevisionNumber: null,
        definition: draftWithLabel(recoveredDraft.definition, 'Clone recovery advanced'),
      },
      actor
    );
    expect(forwardSave.ok).to.equal(true);

    barrier.release();
    const originResult = await originatingClone;
    expect(originResult.identity).to.deep.include({ brandId, key: targetKey, version: 0 });
    expect(originResult.identity.draft).to.deep.include({ version: 0, baseRevisionNumber: null });
    expect(originResult.draft.version).to.equal(0);
    expect(originResult.draft.definition.recordType.labels?.name).to.equal('Clone recovery source');
    expect((await new Services.RecordDefinitionDraftLifecycle().get(brandId, targetKey))?.version).to.equal(1);
    expect(await RecordType.count({ branding: brandId, name: targetKey })).to.equal(1);
    expect(await RecordDefinitionDraft.count({ branding: brandId, recordTypeKey: targetKey })).to.equal(1);
  });

  it('returns an originating save snapshot after a fresh reader settles it and a fresh writer advances it', async function () {
    const suffix = randomUUID().replaceAll('-', '').slice(0, 10);
    const brandId = await createBrand(`b04-save-recovery-${suffix}`);
    const sourceKey = parseRecordDefinitionKey(`B04SaveSource${suffix}`);
    const targetKey = parseRecordDefinitionKey(`B04SaveTarget${suffix}`);
    await createActiveSource(brandId, sourceKey, 'Save recovery source');
    const cloned = await new Services.RecordDefinitionDraftLifecycle().clone(brandId, sourceKey, targetKey, actor);

    const barrier = pauseNextIdentityMutation('save');
    const originatingSave = new Services.RecordDefinitionDraftLifecycle().save(
      brandId,
      targetKey,
      {
        schemaVersion: RECORD_DEFINITION_API_SCHEMA_VERSION,
        expectedDraftVersion: 0,
        expectedActiveRevisionNumber: null,
        definition: draftWithLabel(cloned.draft.definition, 'Originating save'),
      },
      actor
    );
    await barrier.reached;

    const settled = await new Services.RecordDefinitionDraftLifecycle().get(brandId, targetKey);
    expect(settled?.version).to.equal(1);
    expect(settled?.definition.recordType.labels?.name).to.equal('Originating save');
    const forwardSave = await new Services.RecordDefinitionDraftLifecycle().save(
      brandId,
      targetKey,
      {
        schemaVersion: RECORD_DEFINITION_API_SCHEMA_VERSION,
        expectedDraftVersion: 1,
        expectedActiveRevisionNumber: null,
        definition: draftWithLabel(settled!.definition, 'Save after recovery'),
      },
      actor
    );
    expect(forwardSave.ok).to.equal(true);

    barrier.release();
    const originResult = await originatingSave;
    expect(originResult.ok).to.equal(true);
    if (!originResult.ok) expect.fail('the originating save must retain its exact acknowledgement');
    expect(originResult.draft.version).to.equal(1);
    expect(originResult.draft.definition.recordType.labels?.name).to.equal('Originating save');
    expect((await new Services.RecordDefinitionDraftLifecycle().get(brandId, targetKey))?.version).to.equal(2);
    expect(
      (await new Services.RecordDefinitionDraftLifecycle().get(brandId, targetKey))?.definition.recordType.labels?.name
    ).to.equal('Save after recovery');
  });

  it('returns an originating discard snapshot after getStatus settles it and a fresh writer advances it', async function () {
    const suffix = randomUUID().replaceAll('-', '').slice(0, 10);
    const brandId = await createBrand(`b04-discard-recovery-${suffix}`);
    const recordTypeKey = parseRecordDefinitionKey(`B04Discard${suffix}`);
    await createActiveSource(brandId, recordTypeKey, 'Active discard source', true);

    const barrier = pauseNextIdentityMutation('discard');
    const originatingDiscard = new Services.RecordDefinitionDraftLifecycle().discard(
      brandId,
      recordTypeKey,
      0,
      1,
      actor
    );
    await barrier.reached;

    const settledStatus = await new Services.RecordDefinitionDraftLifecycle().getStatus(brandId, recordTypeKey);
    expect(settledStatus?.draft).to.deep.include({ version: 1, baseRevisionNumber: 1 });
    const settled = await new Services.RecordDefinitionDraftLifecycle().get(brandId, recordTypeKey);
    if (settled === null) expect.fail('the settled discard must retain the shared draft');
    const forwardSave = await new Services.RecordDefinitionDraftLifecycle().save(
      brandId,
      recordTypeKey,
      {
        schemaVersion: RECORD_DEFINITION_API_SCHEMA_VERSION,
        expectedDraftVersion: 1,
        expectedActiveRevisionNumber: 1,
        definition: draftWithLabel(settled.definition, 'Save after discard recovery'),
      },
      actor
    );
    expect(forwardSave.ok).to.equal(true);

    barrier.release();
    const originResult = await originatingDiscard;
    expect(originResult.ok).to.equal(true);
    if (!originResult.ok) expect.fail('the originating discard must retain its exact acknowledgement');
    expect(originResult.draft.version).to.equal(1);
    expect(originResult.draft.definition.recordType.labels?.name).to.equal('Active discard source');
    const current = await new Services.RecordDefinitionDraftLifecycle().get(brandId, recordTypeKey);
    expect(current?.version).to.equal(2);
    expect(current?.definition.recordType.labels?.name).to.equal('Save after discard recovery');
  });

  it('fails closed when a recovered acknowledgement is malformed in Mongo', async function () {
    const suffix = randomUUID().replaceAll('-', '').slice(0, 10);
    const brandId = await createBrand(`b04-malformed-ack-${suffix}`);
    const sourceKey = parseRecordDefinitionKey(`B04MalformedSource${suffix}`);
    const targetKey = parseRecordDefinitionKey(`B04MalformedTarget${suffix}`);
    await createActiveSource(brandId, sourceKey, 'Malformed acknowledgement source');
    const cloned = await new Services.RecordDefinitionDraftLifecycle().clone(brandId, sourceKey, targetKey, actor);

    const barrier = pauseNextIdentityMutation('save');
    const originatingSave = new Services.RecordDefinitionDraftLifecycle().save(
      brandId,
      targetKey,
      {
        schemaVersion: RECORD_DEFINITION_API_SCHEMA_VERSION,
        expectedDraftVersion: 0,
        expectedActiveRevisionNumber: null,
        definition: draftWithLabel(cloned.draft.definition, 'Recovered before corruption'),
      },
      actor
    );
    await barrier.reached;
    expect((await new Services.RecordDefinitionDraftLifecycle().get(brandId, targetKey))?.version).to.equal(1);

    const acknowledgements = mongoManager().collection('recorddefinitiondraftoperationack');
    const malformed = await acknowledgements.updateOne(
      { recordTypeKey: targetKey, kind: 'save', draftVersion: 1 },
      { $set: { draft: { schemaVersion: 999, malformed: true } } }
    );
    expect(malformed.matchedCount).to.equal(1);
    barrier.release();

    const failure = await expectLifecycleFailure(originatingSave, 'storage-consistency-error');
    expect(failure.message).not.to.include('malformed');
    expect((await RecordDefinitionDraft.findOne({ branding: brandId, recordTypeKey: targetKey }))?.version).to.equal(1);
  });

  it('stores BSON Date expiries, rejects expired acknowledgements, and observes TTL deletion', async function () {
    const suffix = randomUUID().replaceAll('-', '').slice(0, 10);
    const brandId = await createBrand(`b04-ttl-${suffix}`);
    const sourceKey = parseRecordDefinitionKey(`B04TtlSource${suffix}`);
    const targetKey = parseRecordDefinitionKey(`B04TtlTarget${suffix}`);
    await createActiveSource(brandId, sourceKey, 'TTL source');
    const cloned = await new Services.RecordDefinitionDraftLifecycle().clone(brandId, sourceKey, targetKey, actor);

    const barrier = pauseNextIdentityMutation('save');
    const originatingSave = new Services.RecordDefinitionDraftLifecycle().save(
      brandId,
      targetKey,
      {
        schemaVersion: RECORD_DEFINITION_API_SCHEMA_VERSION,
        expectedDraftVersion: 0,
        expectedActiveRevisionNumber: null,
        definition: draftWithLabel(cloned.draft.definition, 'TTL recovered save'),
      },
      actor
    );
    await barrier.reached;
    expect(
      (await new Services.RecordDefinitionDraftLifecycle().getStatus(brandId, targetKey))?.draft?.version
    ).to.equal(1);

    const acknowledgements = mongoManager().collection('recorddefinitiondraftoperationack');
    const rawAcknowledgement = await acknowledgements.findOne({
      recordTypeKey: targetKey,
      kind: 'save',
      draftVersion: 1,
    });
    expect(rawAcknowledgement).not.to.equal(null);
    expect(rawAcknowledgement?.expiresAt).to.be.instanceOf(Date);
    const bsonType = await acknowledgements
      .aggregate([
        { $match: { _id: rawAcknowledgement!._id } },
        { $project: { _id: 0, expiresAtType: { $type: '$expiresAt' } } },
      ])
      .next();
    expect(bsonType?.expiresAtType).to.equal('date');

    await pauseTtlMonitor();
    const expired = await acknowledgements.updateOne(
      { _id: rawAcknowledgement!._id },
      { $set: { expiresAt: new Date(Date.now() - 1_000) } }
    );
    expect(expired.matchedCount).to.equal(1);
    barrier.release();
    await expectLifecycleFailure(originatingSave, 'storage-consistency-error');
    expect(await acknowledgements.findOne({ _id: rawAcknowledgement!._id })).not.to.equal(null);

    await startShortTtlMonitorInterval();
    await waitForMongoDeletion(acknowledgements, { _id: rawAcknowledgement!._id });
    expect(await acknowledgements.findOne({ _id: rawAcknowledgement!._id })).to.equal(null);
  });

  it('allows the same key in separate brands while every service read and write remains isolated', async function () {
    const suffix = randomUUID().replaceAll('-', '').slice(0, 10);
    const firstBrand = await createBrand(`b04-brand-a-${suffix}`);
    const secondBrand = await createBrand(`b04-brand-b-${suffix}`);
    const sourceKey = parseRecordDefinitionKey(`B04SharedSource${suffix}`);
    const targetKey = parseRecordDefinitionKey(`B04SharedTarget${suffix}`);
    await createActiveSource(firstBrand, sourceKey, 'First brand source');
    await createActiveSource(secondBrand, sourceKey, 'Second brand source');
    const firstInstance = new Services.RecordDefinitionDraftLifecycle();
    const secondInstance = new Services.RecordDefinitionDraftLifecycle();

    const [firstClone, secondClone] = await Promise.all([
      firstInstance.clone(firstBrand, sourceKey, targetKey, actor),
      secondInstance.clone(secondBrand, sourceKey, targetKey, actor),
    ]);
    expect(firstClone.draft.definition.recordType.labels?.name).to.equal('First brand source');
    expect(secondClone.draft.definition.recordType.labels?.name).to.equal('Second brand source');
    expect(firstClone.identity.id).not.to.equal(secondClone.identity.id);
    expect(await RecordType.count({ name: targetKey })).to.equal(2);
    expect(await RecordDefinitionDraft.count({ recordTypeKey: targetKey })).to.equal(2);

    const firstSaved = await firstInstance.save(
      firstBrand,
      targetKey,
      {
        schemaVersion: RECORD_DEFINITION_API_SCHEMA_VERSION,
        expectedDraftVersion: 0,
        expectedActiveRevisionNumber: null,
        definition: draftWithLabel(firstClone.draft.definition, 'First brand only'),
      },
      actor
    );
    expect(firstSaved.ok).to.equal(true);
    expect((await secondInstance.get(secondBrand, targetKey))?.definition.recordType.labels?.name).to.equal(
      'Second brand source'
    );
    expect((await firstInstance.get(firstBrand, targetKey))?.definition.recordType.labels?.name).to.equal(
      'First brand only'
    );
    expect(await RecordDefinitionDraftOperationAck.count({ branding: firstBrand, recordTypeKey: targetKey })).to.equal(
      2
    );
    expect(await RecordDefinitionDraftOperationAck.count({ branding: secondBrand, recordTypeKey: targetKey })).to.equal(
      1
    );
  });
});
