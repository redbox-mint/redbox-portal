import { Controllers as AdminControllers } from '../../../packages/redbox-core/src/controllers/RecordDefinitionAdminController';
import { Services as AdminServices } from '../../../packages/redbox-core/src/services/RecordDefinitionAdminService';
import { createRegisteredActionExecutor } from '../../../packages/redbox-core/src/action-execution/registered-executor';
import { createActionExecutionOperation } from '../../../packages/redbox-core/src/action-execution/executor';
import { strict as assert } from 'node:assert';
import { createDecipheriv, randomBytes } from 'node:crypto';
import { createActionSecretSlotIdentity } from '../../../packages/redbox-core/src/action-registry';
import { createActionSecretExecutionBoundary } from '../../../packages/redbox-core/src/action-registry/secrets';
import { persistedRecordActionSecretProvider } from '../../../packages/redbox-core/src/services/action-secrets/storage';
import { secretFixture } from '../../../packages/redbox-core/test/helpers/action-secret-fixture';
import { Services as TransitionServices } from '../../../packages/redbox-core/src/services/WorkflowTransitionService';
import { firstValueFrom } from 'rxjs';
import { handlebarsPrecompile, handlebarsCompile } from '@researchdatabox/sails-ng-common';
import { Services as DashboardServices } from '../../../packages/redbox-core/src/services/DashboardTypesService';
import {
  activeRecordDefinitions,
  Services as RuntimeServices,
} from '../../../packages/redbox-core/src/services/RecordDefinitionRuntimeService';
import { Services as TypeServices } from '../../../packages/redbox-core/src/services/RecordTypesService';
import { Services as StepServices } from '../../../packages/redbox-core/src/services/WorkflowStepsService';
import { randomUUID } from 'node:crypto';
import {
  RECORD_DEFINITION_AGGREGATE_SCHEMA_VERSION,
  RECORD_DEFINITION_API_SCHEMA_VERSION,
  RECORD_DEFINITION_STAGE_SCHEMA_VERSION,
  RECORD_DEFINITION_TRANSITION_SCHEMA_VERSION,
  parseRecordDefinitionBrandId,
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
const sailsMongo = require('sails-mongo');
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
} from '../../../packages/redbox-core/src/action-registry';
import {
  RECORD_DEFINITION_VALIDATION_LIMITS,
  deriveRecordDefinitionDraftId,
  deriveRecordDefinitionId,
  deriveRecordDefinitionRevisionId,
  deriveWorkflowTransitionId,
  hashRecordDefinition,
} from '../../../packages/redbox-core/src/record-workflow-administration';
import { coreRecordActionRegistry } from '../../../packages/redbox-core/src/services/record-actions/coordinator';
import { Services as DraftServices } from '../../../packages/redbox-core/src/services/RecordDefinitionDraftService';
import {
  RECORD_DEFINITION_HISTORY_LIST_MAX,
  RecordDefinitionPublicationLifecycleError,
  Services,
  type RecordDefinitionPublicationAuthority,
} from '../../../packages/redbox-core/src/services/RecordDefinitionPublicationService';
import { Services as RecordServices } from '../../../packages/redbox-core/src/services/RecordsService';
import type { BrandingConfigWaterlineModel } from '../../../packages/redbox-core/src/waterline-models/BrandingConfig';
import type { FormWaterlineModel } from '../../../packages/redbox-core/src/waterline-models/Form';
import type { RecordDefinitionDraftWaterlineModel } from '../../../packages/redbox-core/src/waterline-models/RecordDefinitionDraft';
import type { RecordDefinitionHistoryWaterlineModel } from '../../../packages/redbox-core/src/waterline-models/RecordDefinitionHistory';
import type { RecordDefinitionLifecycleOperationAckWaterlineModel } from '../../../packages/redbox-core/src/waterline-models/RecordDefinitionLifecycleOperationAck';
import type { RecordDefinitionRevisionWaterlineModel } from '../../../packages/redbox-core/src/waterline-models/RecordDefinitionRevision';
import type { RoleWaterlineModel } from '../../../packages/redbox-core/src/waterline-models/Role';
import type { RecordTypeWaterlineModel } from '../../../packages/redbox-core/src/waterline-models/RecordType';

declare const BrandingConfig: BrandingConfigWaterlineModel;
declare const Form: FormWaterlineModel;
declare const RecordDefinitionDraft: RecordDefinitionDraftWaterlineModel;
declare const RecordDefinitionHistory: RecordDefinitionHistoryWaterlineModel;
declare const RecordDefinitionLifecycleOperationAck: RecordDefinitionLifecycleOperationAckWaterlineModel;
declare const RecordDefinitionRevision: RecordDefinitionRevisionWaterlineModel;
declare const Role: RoleWaterlineModel;
declare const RecordType: RecordTypeWaterlineModel;

interface MongoCollection {
  deleteMany(filter: Record<string, any>): Promise<{ readonly deletedCount: number }>;
  find(filter: Record<string, any>): MongoCursor;
  findOne(filter: Record<string, any>): Promise<Record<string, any> | null>;
  insertOne(value: Record<string, any>): Promise<{ readonly insertedId: any }>;
  updateOne(
    filter: Record<string, any>,
    update: Record<string, any>
  ): Promise<{ readonly matchedCount: number; readonly modifiedCount: number }>;
}

interface MongoCursor {
  project(projection: Record<string, number>): MongoCursor;
  toArray(): Promise<Array<Record<string, any>>>;
}

interface MongoManager {
  collection(name: string): MongoCollection;
}

const actor: RecordDefinitionActorDto = { id: 'b05-integration-admin', displayName: 'B05 integration admin' };
let createdBrandNames: string[] = [];
let barrierRestorers: Array<() => void> = [];
let activeBarriers: DatastoreBarrier[] = [];

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

function pauseNextActivePointerBeforeCommit(service: object): DatastoreBarrier {
  const barrier = new DatastoreBarrier();
  const target = service as any;
  const originalActivateRevision = target.activateRevision;
  let claimed = false;
  const wrappedActivateRevision = async function (this: any, ...args: any[]): Promise<any> {
    if (!claimed) {
      claimed = true;
      await barrier.pause();
    }
    return originalActivateRevision.apply(this, args);
  };
  target.activateRevision = wrappedActivateRevision;
  barrierRestorers.push(() => {
    if (target.activateRevision === wrappedActivateRevision) target.activateRevision = originalActivateRevision;
  });
  return barrier;
}

function pauseNextActivePointerAfterCommit(service: object): DatastoreBarrier {
  const barrier = new DatastoreBarrier();
  const target = service as any;
  const originalActivateRevision = target.activateRevision;
  let claimed = false;
  const wrappedActivateRevision = async function (this: any, ...args: any[]): Promise<any> {
    if (claimed) return originalActivateRevision.apply(this, args);
    claimed = true;
    await originalActivateRevision.apply(this, args);
    await barrier.pause();
    return originalActivateRevision.apply(this, args);
  };
  target.activateRevision = wrappedActivateRevision;
  barrierRestorers.push(() => {
    if (target.activateRevision === wrappedActivateRevision) target.activateRevision = originalActivateRevision;
  });
  return barrier;
}

function mongoManager(): MongoManager {
  return RecordDefinitionLifecycleOperationAck.getDatastore().manager as MongoManager;
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
      'recorddefinitionlifecycleoperationack',
      'recorddefinitiondraftoperationack',
      'recorddefinitiondraft',
      'recorddefinitionhistory',
      'recorddefinitionrevision',
      'actionsecret',
      'form',
      'role',
      'workflowstep',
      'recordtype',
    ]) {
      await manager.collection(collectionName).deleteMany({ branding: { $in: ownerIds } });
    }
    await brandingCollection.deleteMany({ _id: { $in: brands.map(row => row._id) } });
  }
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
        formReference: 'b05-integration-form',
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

function draftDefinition(value: PublishableRecordDefinitionAggregateDto): DraftRecordDefinitionAggregateDto {
  return { ...structuredClone(value), definitionState: 'draft-incomplete' };
}

function authority(recordTypeKey: RecordDefinitionKey): RecordDefinitionPublicationAuthority {
  return {
    load: async () => ({
      actionRegistry: coreRecordActionRegistry(),
      roles: ['Admin'],
      forms: [{ reference: 'b05-integration-form', validationOperations: {}, validationGroups: {} }],
      availableRecordTypeKeys: [recordTypeKey],
      storageCapabilityProvider: null,
      stageReferences: [],
    }),
  };
}

const redactionActionId = parseActionDefinitionId('org.redbox.b05-redaction');
const redactionHandler: ActionHandler = () => ({ schemaVersion: ACTION_RESULT_SCHEMA_VERSION, kind: 'no-change' });

function redactionRegistry(): RedboxActionRegistry {
  const descriptor: ActionRegistrationDescriptor = {
    schemaVersion: ACTION_CONTRACT_SCHEMA_VERSION,
    id: redactionActionId,
    contractVersion: 1,
    title: 'B05 redaction integration action',
    description: 'Supplies a bounded secret-marker contract for integration evidence.',
    category: 'test',
    handler: redactionHandler,
    contexts: ['record-lifecycle'],
    modes: ['onCreate'],
    phases: ['pre'],
    allowRepeatedBindings: true,
    parameterSchema: {
      schemaVersion: ACTION_CONTRACT_SCHEMA_VERSION,
      parameters: [{ name: 'credential', title: 'Credential', kind: 'secret', writeOnly: true, required: false }],
    },
    outputSchema: { schemaVersion: ACTION_CONTRACT_SCHEMA_VERSION, fields: [], safeFields: [] },
    resultContract: { allowedKinds: ['no-change'] },
    executionPolicy: {
      timeout: { defaultMs: 1_000, minMs: 100, maxMs: 2_000 },
      retry: { allowed: false },
    },
  };
  return buildActionRegistry([
    actionRegistrationSource('@researchdatabox/b05-integration', 'actions/redaction', () => [descriptor]),
  ]);
}

function boundedRedactionDefinition(
  brandId: RecordDefinitionBrandId,
  recordTypeKey: RecordDefinitionKey
): PublishableRecordDefinitionAggregateDto {
  const source = definition('Bounded redaction definition');
  const scope = { context: 'record-lifecycle' as const, mode: 'onCreate' as const, phase: 'pre' as const };
  const templateStage = source.stages[0];
  const stages = Array.from({ length: 100 }, (_, index) => ({
    ...templateStage,
    key: parseWorkflowStageKey(index === 0 ? 'draft' : `stage-${index}`),
    label: index === 0 ? 'Changed draft stage' : `Additional stage ${index}`,
    displayOrder: index,
    starting: index === 0,
    terminal: index === 99,
  }));
  return {
    ...source,
    stages,
    transitions: stages.slice(1).map((stage, index) => ({
      schemaVersion: RECORD_DEFINITION_TRANSITION_SCHEMA_VERSION,
      id: deriveWorkflowTransitionId({ brandId, recordTypeKey, stableKey: `stage-${index + 1}` }),
      sourceStageKey: stages[index].key,
      targetStageKey: stage.key,
      label: `Advance to stage ${index + 1}`,
      mode: 'manual' as const,
      allowedRoles: ['Admin'],
    })),
    actionBindings: [
      {
        schemaVersion: ACTION_CONTRACT_SCHEMA_VERSION,
        id: deriveStableActionBindingId({
          recordTypeKey,
          scope,
          actionId: redactionActionId,
          contractVersion: 1,
          stableKey: 'secret-marker',
        }),
        stableKey: 'secret-marker',
        actionId: redactionActionId,
        contractVersion: 1,
        scope,
        parameters: { credential: { kind: 'secret' as const, configured: true } },
        order: 0,
      },
    ],
  };
}

function redactionAuthority(recordTypeKey: RecordDefinitionKey): RecordDefinitionPublicationAuthority {
  return {
    load: async () => ({
      actionRegistry: redactionRegistry(),
      roles: ['Admin'],
      forms: [{ reference: 'b05-integration-form', validationOperations: {}, validationGroups: {} }],
      availableRecordTypeKeys: [recordTypeKey],
      storageCapabilityProvider: null,
      stageReferences: [],
    }),
  };
}

async function createDefaultAuthority(brandId: RecordDefinitionBrandId): Promise<void> {
  await Role.create({ name: 'Admin', branding: brandId }).fetch();
  await Form.create({
    name: 'b05-integration-form',
    branding: brandId,
    configuration: { validationOperations: {}, validationGroups: {} },
  }).fetch();
}

async function lifecycleRejection<Value>(
  operation: PromiseLike<Value>
): Promise<RecordDefinitionPublicationLifecycleError> {
  try {
    await operation;
  } catch (error) {
    expect(error).to.be.instanceOf(RecordDefinitionPublicationLifecycleError);
    return error as RecordDefinitionPublicationLifecycleError;
  }
  expect.fail('Expected the lifecycle operation to fail closed');
}

async function afterRawLifecycleSettlement<Value>(
  operation: PromiseLike<Value>,
  brandId: RecordDefinitionBrandId,
  recordTypeKey: RecordDefinitionKey
): Promise<Value> {
  const result = await operation;
  const rawIdentity = await mongoManager()
    .collection('recordtype')
    .findOne({ definitionId: deriveRecordDefinitionId({ brandId, recordTypeKey }), name: recordTypeKey });
  expect(rawIdentity).to.include({
    definitionLifecycleToken: null,
    definitionLifecycleOperation: null,
    draftLifecycleToken: null,
    draftLifecycleKind: null,
    draftLifecycleOperation: null,
  });
  return result;
}

function failOnceAfter(service: object, methodName: string): void {
  const target = service as any;
  const original = target[methodName];
  let failed = false;
  const replacement = async function (this: any, ...args: any[]): Promise<any> {
    const result = await original.apply(this, args);
    if (!failed) {
      failed = true;
      throw new Error(`simulated lost ${methodName} acknowledgement`);
    }
    return result;
  };
  target[methodName] = replacement;
  barrierRestorers.push(() => {
    if (target[methodName] === replacement) target[methodName] = original;
  });
}

function failOnceBefore(targetValue: object, methodName: string): void {
  const target = targetValue as any;
  const original = target[methodName];
  let failed = false;
  const replacement = function (this: any, ...args: any[]): any {
    if (!failed) {
      failed = true;
      throw new Error(`simulated ${methodName} adapter failure`);
    }
    return original.apply(this, args);
  };
  target[methodName] = replacement;
  barrierRestorers.push(() => {
    if (target[methodName] === replacement) target[methodName] = original;
  });
}

async function expectRejected<Value>(operation: PromiseLike<Value>): Promise<void> {
  try {
    await operation;
  } catch {
    return;
  }
  expect.fail('Expected immutable datastore operation to be rejected');
}

async function createBrand(name: string): Promise<RecordDefinitionBrandId> {
  createdBrandNames.push(name);
  const row = await BrandingConfig.create({ name, variables: {} }).fetch();
  return parseRecordDefinitionBrandId(String(row.id));
}

async function createPublicationFixture(
  brandId: RecordDefinitionBrandId,
  recordTypeKey: RecordDefinitionKey,
  draft: PublishableRecordDefinitionAggregateDto = definition('Published integration definition'),
  initial: PublishableRecordDefinitionAggregateDto = definition('Original integration definition')
): Promise<Record<string, any>> {
  const recordTypeId = deriveRecordDefinitionId({ brandId, recordTypeKey });
  const revisionId = deriveRecordDefinitionRevisionId({ brandId, recordTypeKey }, 1);
  const draftId = deriveRecordDefinitionDraftId({ brandId, recordTypeKey });
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
    definitionLifecycleToken: null,
    definitionLifecycleOperation: null,
    retiredAt: null,
    retiredBy: null,
    retirementReason: null,
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
    canonicalHash: hashRecordDefinition(initial),
    definition: initial,
    actionContracts: [],
    source: { operation: 'publish', sourceRevisionNumber: null },
    publishedAt: new Date(),
    publishedBy: actor,
    createdBy: actor,
  }).fetch();
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
    definition: draftDefinition(draft),
    validation: null,
    createdBy: actor,
    updatedBy: actor,
  }).fetch();
  return identity as Record<string, any>;
}

describe('RecordDefinitionPublicationService datastore CAS integration', function () {
  this.timeout(90_000);

  let liftedHere = false;

  before(async function () {
    if (sailsApp.hooks?.orm !== undefined) return;
    const datastoreUrl = process.env['B05_TEST_MONGO_URL'];
    await new Promise<void>((resolve, reject) => {
      sailsApp.lift(
        {
          bootstrap: (done: (error?: Error) => void): void => done(),
          ...(datastoreUrl === undefined
            ? {}
            : {
                datastores: {
                  mongodb: { adapter: sailsMongo, url: datastoreUrl },
                  redboxStorage: { adapter: sailsMongo, url: datastoreUrl },
                },
              }),
          hooks: { grunt: false },
          log: { level: 'silent' },
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

  beforeEach(function () {
    createdBrandNames = [];
    barrierRestorers = [];
    activeBarriers = [];
  });

  afterEach(async function () {
    for (const barrier of activeBarriers) barrier.release();
    for (const restore of barrierRestorers.reverse()) restore();
    await cleanupCreatedBrands();
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

  it('B09 generated HTTP discovery, policies, parser, native provider CAS and draft races', async function () {
    assert.equal(
      (sailsApp as any).config.b09GeneratedNativeGate,
      true,
      'Run bash support/integration-testing/run-b09-native.sh with disposable Mongo; generated bootstrap is required.'
    );
    this.timeout(60000);
    const globals = global as any;
    const app = sailsApp as any;
    assert(app.getActions()['recorddefinitionadmin/writesecret']);
    assert.equal(app.getActions()['recorddefinitionadmin/sendadminresponse'], undefined);
    assert.equal(globals.RecordDefinitionAdminService, app.services.recorddefinitionadminservice);
    const suffix = randomUUID().replaceAll('-', '').slice(0, 10);
    const brandName = `b09-http-${suffix}`;
    const brandId = await createBrand(brandName);
    const key = parseRecordDefinitionKey(`B09Http${suffix}`);
    const fixture = secretFixture(key, () => ({ schemaVersion: 1, kind: 'no-change' }));
    const previousRegistry = app.config.actionRegistry;
    const previousKey = process.env.REDBOX_ACTION_SECRET_KEY;
    const builtRegistry = require('@researchdatabox/redbox-core').ActionRegistry;
    const lookup = fixture.registry.lookup(fixture.binding.actionId, fixture.binding.contractVersion);
    assert.equal(lookup.status, 'available');
    app.config.actionRegistry = builtRegistry.buildActionRegistry([
      builtRegistry.actionRegistrationSource('@researchdatabox/b09-test', 'actions/index', () => [
        { ...(lookup as any).descriptor, handler: (lookup as any).handler },
      ]),
    ]);
    process.env.REDBOX_ACTION_SECRET_KEY = randomBytes(32).toString('hex');
    const aggregate = { ...definition('HTTP fixture'), actionBindings: [fixture.binding] };
    await createPublicationFixture(brandId, key, aggregate, aggregate);
    await firstValueFrom(globals.BrandingService.bootstrap());
    const adminRole = await Role.create({ name: 'Admin', branding: brandId }).fetch();
    await Role.create({ name: 'Guest', branding: brandId });
    await firstValueFrom(globals.BrandingService.loadAvailableBrands(null));
    await globals.PathRule.create({
      path: '/:branding/:portal/admin/record-definitions(/*)',
      role: adminRole.id,
      branding: brandId,
      can_read: true,
    });
    await firstValueFrom(globals.PathRulesService.bootstrap(null, []));
    const host = 'http://127.0.0.1:15909';
    // Sails' built-in CSRF action is discovered by the security hook.
    app.router.bind('/b09-csrf', app.getActions()['security/grant-csrf-token'], 'get', {});
    const csrfResponse = await fetch(`${host}/b09-csrf`);
    const cookie = csrfResponse.headers
      .getSetCookie()
      .map((v: string) => v.split(';')[0])
      .join('; ');
    const csrfBody = (await csrfResponse.json()) as any;
    const token = csrfBody._csrf;
    assert(token, JSON.stringify({ status: csrfResponse.status, body: csrfBody }));
    const headers = {
      cookie,
      'content-type': 'application/json',
      'x-csrf-token': token,
      'x-b09-brand': brandId,
      'x-b09-role': 'Admin',
      'x-b09-role-id': String(adminRole.id),
    };
    const base = `${host}/${brandName}/rdmp/admin/record-definitions/${key}/draft`;
    const secretUrl = `${base}/actions/${fixture.binding.id}/secrets/credential`;
    const responses: string[] = [];
    async function request(url: string, method: string, body?: any, overrides = {}) {
      const response = await fetch(url, {
        method,
        headers: { ...headers, ...overrides },
        ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
      });
      const text = await response.text();
      responses.push(text);
      return { status: response.status, data: text ? JSON.parse(text) : null, headers: response.headers };
    }
    const slot = createActionSecretSlotIdentity({
      brandId,
      recordTypeKey: key,
      bindingId: fixture.binding.id,
      parameterName: 'credential',
    });
    const provider = persistedRecordActionSecretProvider(fixture.registry);
    const access = { requesterBrandId: brandId, slot };
    const preconditions = { schemaVersion: 1, expectedDraftVersion: 0, expectedSecretVersion: 0 };
    const manager = mongoManager() as any;
    const collection = manager.collection('actionsecret');
    const sentinel = 'B09-E2E-secret-sentinel';
    try {
      const read = await request(base, 'GET');
      assert.equal(read.status, 200, JSON.stringify(read.data));
      assert.match(read.headers.get('cache-control') ?? '', /no-store|no-cache/);
      assert.equal(
        (await request(base, 'GET', undefined, { 'x-b09-role': 'Reader', 'x-b09-role-id': 'reader' })).status,
        403
      );
      assert.equal((await request(base, 'GET', undefined, { 'x-b09-brand': 'other-brand' })).status, 403);
      assert.equal((await request(base, 'GET', undefined, { 'x-b09-role': '', 'x-b09-brand': '' })).status, 403);
      assert.equal((await request(secretUrl, 'PUT', preconditions, { 'x-csrf-token': '' })).status, 403);
      for (const environment of ['development', 'production']) {
        const previous = app.config.environment;
        app.config.environment = environment;
        try {
          const malformed = await request(secretUrl, 'PUT', `{"value":"${sentinel}",`);
          assert.equal(malformed.status, 400);
          assert.deepEqual(malformed.data, { error: 'invalid-request-body' });
          const oversized = await request(secretUrl, 'PUT', { value: sentinel + 'x'.repeat(2 * 1024 * 1024) });
          assert.equal(oversized.status, 413);
          assert.deepEqual(oversized.data, { error: 'payload-too-large' });
          assert.equal(await collection.findOne({ _id: slot.id }), null);
        } finally {
          app.config.environment = previous;
        }
      }
      const written = await request(secretUrl, 'PUT', { ...preconditions, value: sentinel });
      assert.equal(written.status, 200, JSON.stringify(written.data));
      await provider.replace({ ...access, value: sentinel + '-provider' });
      assert.equal((await collection.findOne({ _id: slot.id })).adminVersion, 2);
      assert.equal(
        (await request(secretUrl, 'PUT', { ...preconditions, expectedSecretVersion: 1, value: sentinel })).status,
        409
      );
      await provider.clear(access);
      const tombstone = await collection.findOne({ _id: slot.id });
      assert.equal(tombstone.adminVersion, 3);
      assert.equal(tombstone.protectedValue, null);
      assert.equal(
        (await request(secretUrl, 'PUT', { ...preconditions, expectedSecretVersion: 2, value: sentinel })).status,
        409
      );

      const identities = manager.collection('recordtype');
      const identityFilter = { definitionId: deriveRecordDefinitionId({ brandId, recordTypeKey: key }) };
      const drafts = manager.collection('recorddefinitiondraft');
      const draftFilter = { recordTypeKey: key };
      await Form.create({
        name: 'b05-integration-form',
        branding: brandId,
        configuration: { validationOperations: {}, validationGroups: {} },
      }).fetch();
      const lifecycle = new DraftServices.RecordDefinitionDraftLifecycle();
      const publisher = new Services.RecordDefinitionPublication();
      async function snapshot() {
        return {
          identity: await identities.findOne(identityFilter),
          draft: await drafts.findOne(draftFilter),
          revisions: await manager.collection('recorddefinitionrevision').find({ recordTypeKey: key }).toArray(),
          history: await manager.collection('recorddefinitionhistory').find({ recordTypeKey: key }).toArray(),
        };
      }
      async function change(kind: string, current: any, identity: any) {
        if (kind === 'publish')
          return publisher.publish(
            brandId,
            key,
            {
              schemaVersion: 1,
              expectedIdentityVersion: identity.version,
              expectedDraftVersion: current.version,
              expectedActiveRevisionNumber: identity.activeRevisionNumber,
            },
            actor
          );
        if (kind === 'save')
          return lifecycle.save(
            brandId,
            key,
            {
              schemaVersion: 1,
              expectedDraftVersion: current.version,
              expectedActiveRevisionNumber: identity.activeRevisionNumber,
              definition: current.definition,
            },
            actor
          );
        return lifecycle.discard(brandId, key, current.version, identity.activeRevisionNumber, actor);
      }
      // Both orders for every HTTP mutation/lifecycle pair, with real native authority and persistence.
      for (const ordering of ['lifecycle-first', 'secret-first']) {
        for (const kind of ['save', 'discard', 'publish']) {
          for (const method of ['PUT', 'DELETE']) {
            await provider.replace({ ...access, value: sentinel });
            const beforeSlot = await collection.findOne({ _id: slot.id });
            const before = await snapshot();
            const current = await lifecycle.get(brandId, key);
            const barrier = new DatastoreBarrier();
            const service = globals.RecordDefinitionDraftService;
            const originalGet = service.get;
            const originalCollection = manager.collection;
            let claimed = false;
            if (ordering === 'lifecycle-first') {
              service.get = async (...args: any[]) => {
                const result = await originalGet(...args);
                if (!claimed) {
                  claimed = true;
                  await barrier.pause();
                }
                return result;
              };
            } else {
              manager.collection = function (name: string, ...args: any[]) {
                const result = originalCollection.call(this, name, ...args);
                if (name !== 'actionsecret') return result;
                return new Proxy(result, {
                  get(target, property) {
                    if (property === 'updateOne')
                      return async (...args: any[]) => {
                        if (!claimed) {
                          claimed = true;
                          await barrier.pause();
                        }
                        return target.updateOne(...args);
                      };
                    const value = Reflect.get(target, property);
                    return typeof value === 'function' ? value.bind(target) : value;
                  },
                });
              };
            }
            const pending = request(secretUrl, method, {
              ...preconditions,
              expectedDraftVersion: current!.version,
              expectedSecretVersion: beforeSlot.adminVersion,
              ...(method === 'PUT' ? { value: sentinel } : { confirm: true }),
            });
            let committed: Awaited<ReturnType<typeof snapshot>> | undefined;
            try {
              await barrier.reached;
              if (ordering === 'lifecycle-first') {
                const result = await change(kind, current, before.identity);
                assert.equal(result.ok, true, JSON.stringify(result));
                committed = await snapshot();
                assert.equal(
                  committed.identity.activeRevisionNumber,
                  before.identity.activeRevisionNumber + (kind === 'publish' ? 1 : 0)
                );
                assert.equal(committed.draft.version, before.draft.version + (kind === 'publish' ? 0 : 1));
                assert.equal(committed.revisions.length, before.revisions.length + (kind === 'publish' ? 1 : 0));
                assert.equal(committed.history.length, before.history.length + (kind === 'publish' ? 1 : 0));
              } else {
                const fenced = await snapshot();
                assert.equal(typeof fenced.identity.secretMutationToken, 'string');
                await assert.rejects(change(kind, current, before.identity));
                assert.deepEqual(await snapshot(), fenced);
                assert.deepEqual(await collection.findOne({ _id: slot.id }), beforeSlot);
              }
            } finally {
              service.get = originalGet;
              manager.collection = originalCollection;
              barrier.release();
            }
            assert.equal((await pending).status, ordering === 'lifecycle-first' && kind !== 'publish' ? 409 : 200);
            if (ordering === 'lifecycle-first' && kind !== 'publish') {
              assert.deepEqual(await collection.findOne({ _id: slot.id }), beforeSlot);
              assert.deepEqual(await snapshot(), committed);
            } else {
              const afterSlot = await collection.findOne({ _id: slot.id });
              assert.deepEqual(afterSlot, {
                ...beforeSlot,
                adminVersion: beforeSlot.adminVersion + 1,
                protectedValue: afterSlot.protectedValue,
                updatedAt: afterSlot.updatedAt,
                updatedBy: { id: 'action-secret-provider' },
              });
              if (method === 'DELETE') assert.equal(afterSlot.protectedValue, null);
              else {
                assert.match(afterSlot.protectedValue, /^v1:/);
                assert.notEqual(afterSlot.protectedValue, beforeSlot.protectedValue);
                const [, iv, tag, ciphertext] = afterSlot.protectedValue.split(':');
                const decipher = createDecipheriv(
                  'aes-256-gcm',
                  Buffer.from(process.env.REDBOX_ACTION_SECRET_KEY!, 'hex'),
                  Buffer.from(iv, 'hex')
                );
                decipher.setAAD(Buffer.from(slot.id));
                decipher.setAuthTag(Buffer.from(tag, 'hex'));
                assert.equal(
                  Buffer.concat([decipher.update(Buffer.from(ciphertext, 'hex')), decipher.final()]).toString('utf8'),
                  sentinel
                );
              }
              assert.deepEqual(await snapshot(), ordering === 'lifecycle-first' ? committed : before);
            }
            assert.equal((await identities.findOne(identityFilter)).secretMutationToken, null);
          }
        }
      }

      // Fault injection wraps actual native updateOne; it never substitutes an in-memory datastore.
      for (const method of ['PUT', 'DELETE']) {
        for (const fault of [
          'acquire-throw',
          'acquire-unacknowledged',
          'release-before',
          'release-after',
          'slot-unacknowledged',
          'slot-delayed',
          'foreign-owner',
        ]) {
          await provider.replace({ ...access, value: sentinel });
          const beforeSlot = await collection.findOne({ _id: slot.id });
          const before = await snapshot();
          const barrier = new DatastoreBarrier();
          const originalCollection = manager.collection;
          let ownedToken: string | undefined;
          let expectedSlot = beforeSlot;
          let delayed: Promise<void> | undefined;
          let releaseMatched: number | undefined;
          let injected = false;
          manager.collection = function (name: string, ...args: any[]) {
            const result = originalCollection.call(this, name, ...args);
            if (name !== 'actionsecret' && name !== 'recordtype') return result;
            return new Proxy(result, {
              get(target, property) {
                if (property === 'updateOne')
                  return async (filter: any, update: any, options: any) => {
                    const acquiring = name === 'recordtype' && typeof update.$set?.secretMutationToken === 'string';
                    const releasing = name === 'recordtype' && update.$set?.secretMutationToken === null;
                    if (acquiring) ownedToken = update.$set.secretMutationToken;
                    if (acquiring && fault.startsWith('acquire-')) {
                      injected = true;
                      await target.updateOne(filter, update, options);
                      if (fault === 'acquire-unacknowledged') return { acknowledged: false };
                      throw new Error('Injected acquisition acknowledgement loss');
                    }
                    if (name === 'actionsecret') {
                      expectedSlot = { ...beforeSlot, ...update.$set };
                      if (fault === 'slot-delayed') {
                        injected = true;
                        delayed = (async () => {
                          await barrier.pause();
                          await target.updateOne(filter, update, options);
                        })();
                        throw new Error('Injected uncertain slot completion');
                      }
                      if (fault === 'slot-unacknowledged') {
                        injected = true;
                        await target.updateOne(filter, update, options);
                        return { acknowledged: false };
                      }
                    }
                    if (releasing && fault === 'release-before') {
                      injected = true;
                      throw new Error('Injected release acknowledgement loss before commit');
                    }
                    if (releasing && fault === 'foreign-owner') {
                      injected = true;
                      // Simulate a changed owner, then run the real stale owner's release filter.
                      await identities.updateOne(identityFilter, { $set: { secretMutationToken: 'another-owner' } });
                      const result = await target.updateOne(filter, update, options);
                      releaseMatched = result.matchedCount;
                      return result;
                    }
                    const result = await target.updateOne(filter, update, options);
                    if (releasing && fault === 'release-after') {
                      injected = true;
                      throw new Error('Injected release acknowledgement loss after commit');
                    }
                    return result;
                  };
                const value = Reflect.get(target, property);
                return typeof value === 'function' ? value.bind(target) : value;
              },
            });
          };
          try {
            const result = await request(secretUrl, method, {
              ...preconditions,
              expectedDraftVersion: before.draft.version,
              expectedSecretVersion: beforeSlot.adminVersion,
              ...(method === 'PUT' ? { value: sentinel } : { confirm: true }),
            });
            assert(injected, fault);
            const expectedStatus =
              fault === 'slot-unacknowledged'
                ? 409
                : ['acquire-throw', 'release-before', 'release-after'].includes(fault)
                  ? 500
                  : 503;
            assert.equal(result.status, expectedStatus, fault);
            assert.deepEqual(result.data, {
              error:
                expectedStatus === 409
                  ? 'secret-version-conflict'
                  : expectedStatus === 500
                    ? 'server-error'
                    : 'secret-provider-failure',
            });
            manager.collection = originalCollection;
            assert.equal(typeof ownedToken, 'string');
            const expectedToken =
              fault === 'release-after' ? null : fault === 'foreign-owner' ? 'another-owner' : ownedToken;
            const fenced = { ...before, identity: { ...before.identity, secretMutationToken: expectedToken } };
            assert.deepEqual(await snapshot(), fenced);
            if (fault === 'foreign-owner') assert.equal(releaseMatched, 0);
            if (fault === 'slot-delayed') {
              await barrier.reached;
              assert.deepEqual(await collection.findOne({ _id: slot.id }), beforeSlot);
            } else {
              assert.deepEqual(await collection.findOne({ _id: slot.id }), expectedSlot);
            }
            if (expectedToken !== null) {
              await assert.rejects(provider.replace({ ...access, value: sentinel }));
              await assert.rejects(provider.clear(access));
              for (const kind of ['save', 'discard', 'publish']) {
                await assert.rejects(change(kind, await lifecycle.get(brandId, key), before.identity));
              }
              assert.deepEqual(await snapshot(), fenced);
            }
            barrier.release();
            await delayed;
            assert.deepEqual(await collection.findOne({ _id: slot.id }), expectedSlot);
            assert.equal(expectedSlot.adminVersion, beforeSlot.adminVersion + (fault.startsWith('acquire-') ? 0 : 1));
            assert.deepEqual(await snapshot(), fenced);
          } finally {
            manager.collection = originalCollection;
            barrier.release();
            await delayed;
            // Test-only recovery after every writer has settled; never expire a live production fence.
            await identities.updateOne(identityFilter, { $set: { secretMutationToken: null } });
          }
        }
      }
      // Reconstruct a legacy encrypted slot lacking the B09 counter.
      await provider.replace({ ...access, value: sentinel });
      await collection.updateOne({ _id: slot.id }, { $unset: { adminVersion: '' } });
      await provider.replace({ ...access, value: sentinel });
      assert.equal((await collection.findOne({ _id: slot.id })).adminVersion, 1);
      await provider.clear(access);
      assert.equal((await collection.findOne({ _id: slot.id })).adminVersion, 2);
      assert.equal((await collection.findOne({ _id: slot.id })).protectedValue, null);
      assert(!JSON.stringify(responses).includes(sentinel));
      assert(!JSON.stringify(responses).includes('protectedValue'));
    } finally {
      app.config.actionRegistry = previousRegistry;
      if (previousKey === undefined) delete process.env.REDBOX_ACTION_SECRET_KEY;
      else process.env.REDBOX_ACTION_SECRET_KEY = previousKey;
    }
  });

  it('B09 administration validates, publishes, clones and atomically versions write-only secrets', async function () {
    const globals = global as any;
    const saved = {
      BrandingService: globals.BrandingService,
      RecordDefinitionAdminService: globals.RecordDefinitionAdminService,
      RecordDefinitionDraftService: globals.RecordDefinitionDraftService,
      RecordDefinitionPublicationService: globals.RecordDefinitionPublicationService,
    };
    const oldRegistry = sailsApp.config.actionRegistry;
    const oldKey = process.env.REDBOX_ACTION_SECRET_KEY;
    process.env.REDBOX_ACTION_SECRET_KEY = randomBytes(32).toString('hex');
    try {
      const suffix = randomUUID().replaceAll('-', '').slice(0, 10);
      const brandId = await createBrand(`b09-admin-${suffix}`);
      const otherBrandId = await createBrand(`b09-other-${suffix}`);
      const key = parseRecordDefinitionKey(`B09Admin${suffix}`);
      const fixture = secretFixture(key, () => ({ schemaVersion: 1, kind: 'no-change' }));
      sailsApp.config.actionRegistry = fixture.registry;
      await createPublicationFixture(brandId, key, {
        ...definition('Admin definition'),
        actionBindings: [fixture.binding],
      });
      globals.RecordDefinitionDraftService = new DraftServices.RecordDefinitionDraftLifecycle();
      globals.RecordDefinitionPublicationService = new Services.RecordDefinitionPublication({
        load: async () => ({
          actionRegistry: fixture.registry,
          roles: ['Admin'],
          forms: [{ reference: 'b05-integration-form', validationOperations: {}, validationGroups: {} }],
          availableRecordTypeKeys: [key],
          storageCapabilityProvider: null,
          stageReferences: [],
        }),
      });
      const admin = new AdminServices.RecordDefinitionAdmin();
      globals.RecordDefinitionAdminService = admin;
      globals.BrandingService = {
        getBrand: (name: string) => ([brandId, otherBrandId].includes(name as any) ? { id: name, name } : null),
      };
      const controller = new AdminControllers.RecordDefinitionAdmin().exports() as any;
      const responses: any[] = [];
      const call = async (action: any, body: any = {}, overrides: any = {}) => {
        const selectedBrand = overrides.brandId ?? brandId;
        const result: any = { status: 200 };
        const response: any = {
          status(code: number) {
            result.status = code;
            return response;
          },
          json(data: any) {
            result.data = data;
          },
          ok(data: any) {
            result.data = data;
          },
        };
        await controller[action](
          {
            isAuthenticated: () => true,
            user: { id: actor.id, roles: [{ name: 'Admin', branding: selectedBrand }] },
            params: {
              branding: selectedBrand,
              portal: 'rdmp',
              key,
              sourceKey: key,
              revision: '2',
              bindingId: fixture.binding.id,
              parameter: 'credential',
            },
            body,
            query: {},
          },
          response
        );
        responses.push(result);
        return result as any;
      };
      assert.equal((await call('list')).data.items.length, 1);
      assert.equal((await call('list', {}, { brandId: otherBrandId })).data.items.length, 0);
      assert.equal((await call('draft', {}, { brandId: otherBrandId })).status, 404);
      const initial = await call('draft');
      assert.equal(initial.data.secretStates[0].configured, false);
      const preconditions = { schemaVersion: 1, expectedDraftVersion: 0, expectedSecretVersion: 0 };
      const sentinel = 'B09-mongo-secret-sentinel';
      assert.equal((await call('writeSecret', { ...preconditions, value: sentinel })).data.version, 1);
      assert.equal((await call('writeSecret', { ...preconditions, value: sentinel })).status, 409);
      assert.equal(
        (await call('writeSecret', { ...preconditions, expectedSecretVersion: 1, value: '  ' })).data.version,
        1
      );
      assert.equal((await call('writeSecret', { ...preconditions, expectedSecretVersion: 1 })).data.version, 1);
      assert.equal(
        (await call('writeSecret', { ...preconditions, expectedSecretVersion: 1, value: '\uD800' })).status,
        400
      );
      const races = await Promise.all([
        call('writeSecret', { ...preconditions, expectedSecretVersion: 1, value: sentinel + '-a' }),
        call('writeSecret', { ...preconditions, expectedSecretVersion: 1, value: sentinel + '-b' }),
      ]);
      assert.deepEqual(races.map(result => result.status).sort(), [200, 409]);
      assert.equal(
        (await call('clearSecret', { ...preconditions, expectedSecretVersion: 2, confirm: true })).data.version,
        3
      );
      assert.equal(
        (await call('writeSecret', { ...preconditions, expectedSecretVersion: 2, value: sentinel })).status,
        409
      );
      assert.equal((await call('draft')).data.secretStates[0].configured, false);
      assert.equal(
        (await call('writeSecret', { ...preconditions, expectedSecretVersion: 3, value: sentinel })).data.version,
        4
      );
      const publishBody = {
        schemaVersion: 1,
        expectedIdentityVersion: 0,
        expectedDraftVersion: 0,
        expectedActiveRevisionNumber: 1,
      };
      assert.equal((await call('validate', publishBody)).status, 200);
      assert.equal((await call('publish', publishBody)).status, 200);
      assert.equal((await call('publish', publishBody)).status, 409);
      assert.equal((await call('revision')).status, 200);
      assert.equal((await call('revisions')).data.items.length, 1);
      assert.equal((await call('get')).status, 200);
      const cloneBody = { schemaVersion: 1, targetRecordTypeKey: `${key}Clone`, expectedActiveRevisionNumber: 2 };
      const clone = await call('clone', cloneBody);
      assert.equal(clone.status, 200);
      assert.equal((await call('clone', cloneBody)).status, 409);
      assert.equal((await call('clone', { ...cloneBody, expectedActiveRevisionNumber: 1 })).status, 409);
      const current = (await call('draft')).data.draft;
      const saveBody = {
        schemaVersion: 1,
        expectedDraftVersion: current.version,
        expectedActiveRevisionNumber: 2,
        definition: current.definition,
      };
      assert.equal((await call('save', saveBody)).status, 200);
      assert.equal((await call('save', saveBody)).status, 409);
      assert.equal(
        (
          await call('discard', {
            schemaVersion: 1,
            expectedDraftVersion: current.version + 1,
            expectedActiveRevisionNumber: 2,
          })
        ).status,
        200
      );
      const identity = (await call('get')).data.identity;
      assert.equal(
        (
          await call('retire', {
            schemaVersion: 1,
            expectedIdentityVersion: identity.version,
            reason: 'Test retirement',
          })
        ).status,
        200
      );
      assert.equal(
        (await call('unretire', { schemaVersion: 1, expectedIdentityVersion: identity.version })).status,
        409
      );
      const retired = (await call('get')).data.identity;
      assert.equal(
        (await call('unretire', { schemaVersion: 1, expectedIdentityVersion: retired.version })).status,
        200
      );
      const restored = (await call('get')).data.identity;
      assert.equal(
        (
          await call('rollback', {
            schemaVersion: 1,
            expectedIdentityVersion: restored.version,
            expectedActiveRevisionNumber: 2,
            reason: 'Test rollback',
          })
        ).status,
        200
      );
      assert(!JSON.stringify(responses).includes(sentinel));
      assert(!JSON.stringify(responses).includes('protectedValue'));
      assert(!JSON.stringify(responses).includes('handler'));
    } finally {
      Object.assign(globals, saved);
      sailsApp.config.actionRegistry = oldRegistry;
      if (oldKey === undefined) delete process.env.REDBOX_ACTION_SECRET_KEY;
      else process.env.REDBOX_ACTION_SECRET_KEY = oldKey;
    }
  });

  it('B08 persists protected slots through publication, clone, replacement, clear and rollback', async function () {
    const oldKey = process.env.REDBOX_ACTION_SECRET_KEY;
    process.env.REDBOX_ACTION_SECRET_KEY = randomBytes(32).toString('hex');
    try {
      const suffix = randomUUID().replaceAll('-', '').slice(0, 10);
      const brandId = await createBrand(`b08-secret-${suffix}`);
      const otherBrandId = await createBrand(`b08-other-${suffix}`);
      const key = parseRecordDefinitionKey(`B08Secret${suffix}`);
      let handlerSecret = '';
      const fixture = secretFixture(key, (_context, _parameters, secrets) => {
        handlerSecret = secrets?.credential?.reveal() ?? '';
        return { schemaVersion: 1, kind: 'no-change' };
      });
      const aggregate = { ...definition('Secret definition'), actionBindings: [fixture.binding] };
      await createPublicationFixture(brandId, key, aggregate);
      await createPublicationFixture(otherBrandId, key, aggregate);
      const publisher = new Services.RecordDefinitionPublication({
        load: async () => ({
          actionRegistry: fixture.registry,
          roles: ['Admin'],
          forms: [{ reference: 'b05-integration-form', validationOperations: {}, validationGroups: {} }],
          availableRecordTypeKeys: [key],
          storageCapabilityProvider: null,
          stageReferences: [],
        }),
      });
      const provider = persistedRecordActionSecretProvider(fixture.registry);
      const slot = createActionSecretSlotIdentity({
        brandId,
        recordTypeKey: key,
        bindingId: fixture.binding.id,
        parameterName: 'credential',
      });
      const access = { requesterBrandId: brandId, slot };
      const sentinel = 'B08-integration-sensitive-value';
      await provider.replace({ ...access, value: sentinel });
      expect(await provider.isConfigured(access)).equal(true);
      expect(await provider.write({ ...access, value: '  ' })).equal('retained');
      const boundary = createActionSecretExecutionBoundary(provider, fixture.registry);
      const resolvedBinding = boundary.resolvePlan({
        schemaVersion: 1,
        recordTypeKey: key,
        bindings: [fixture.binding],
      }).bindings[0]!;
      const resolve = () => provider.resolveForHandler({ ...access, resolvedBinding });
      await assert.rejects(resolve()); // Drafts never authorize execution.
      const published = await publisher.publish(
        brandId,
        key,
        {
          schemaVersion: 1,
          expectedIdentityVersion: 0,
          expectedDraftVersion: 0,
          expectedActiveRevisionNumber: 1,
        },
        actor
      );
      expect(published.ok).equal(true);
      expect((await resolve())?.reveal()).equal(sentinel);
      const operation = createActionExecutionOperation('onCreate', 'b08-request', 'b08-record');
      const logs: any[] = [];
      const capture = (...args: any[]) => {
        logs.push(args);
      };
      const executor = createRegisteredActionExecutor(fixture.registry, provider, {
        logger: { debug: capture, info: capture, warn: capture, error: capture },
      });
      const outcome = await executor.runSequential(
        { schemaVersion: 1, recordTypeKey: key, bindings: [fixture.binding] },
        {
          schemaVersion: 1,
          executionId: operation.executionId,
          correlationId: 'b08-correlation',
          requestId: 'b08-request',
          timestamp: new Date().toISOString(),
          brandId,
          recordTypeKey: key,
          scope: fixture.binding.scope,
          actor: null,
          record: { oid: 'b08-record', candidate: { metadata: { title: 'Secret test' } } },
          priorOutputs: [],
        },
        operation
      );
      expect(handlerSecret).equal(sentinel);
      expect(JSON.stringify([outcome, operation, logs])).not.include(sentinel);
      for (const value of [null, {}, 'x'.repeat(65537), ' '.repeat(65537)]) {
        await assert.rejects(provider.write({ ...access, value } as any));
      }
      await assert.rejects(
        provider.replace({
          ...access,
          slot: createActionSecretSlotIdentity({ ...slot, parameterName: 'undeclared' }),
          value: sentinel,
        })
      );
      await assert.rejects((global as any).ActionSecret.updateOne({ id: slot.id }).set({ protectedValue: sentinel }));
      const collection = mongoManager().collection('actionsecret');
      const stored = await collection.findOne({ _id: slot.id });
      expect(stored?.protectedValue).match(/^v1:/);
      expect(JSON.stringify(stored)).not.include(sentinel);
      expect(stored?.recordTypeId).equal(deriveRecordDefinitionId({ brandId, recordTypeKey: key }));
      const model = await (global as any).ActionSecret.findOne({ id: slot.id });
      expect(JSON.stringify(model)).not.include('protectedValue');
      await assert.rejects(provider.resolveForHandler({ ...access, requesterBrandId: otherBrandId, resolvedBinding }));
      const otherSlot = createActionSecretSlotIdentity({ ...slot, brandId: otherBrandId });
      expect(await provider.isConfigured({ requesterBrandId: otherBrandId, slot: otherSlot })).equal(false);
      const clone = await new DraftServices.RecordDefinitionDraftLifecycle().clone(brandId, key, `${key}Clone`, actor);
      expect(JSON.stringify(clone)).not.include(sentinel);
      const clonedBinding = clone.draft.definition.actionBindings[0]!;
      expect(clonedBinding.parameters.credential).deep.equal({ kind: 'secret', configured: false });
      const cloneSlot = createActionSecretSlotIdentity({
        brandId,
        recordTypeKey: `${key}Clone`,
        bindingId: clonedBinding.id as any,
        parameterName: 'credential',
      });
      expect(await provider.isConfigured({ requesterBrandId: brandId, slot: cloneSlot })).equal(false);
      await provider.replace({ ...access, value: 'current-value' });
      const rolledBack = await publisher.rollback(
        brandId,
        key,
        {
          schemaVersion: 1,
          expectedIdentityVersion: 1,
          expectedActiveRevisionNumber: 2,
          sourceRevisionNumber: 2,
          reason: 'B08 slot independence',
        },
        actor
      );
      expect(rolledBack.ok).equal(true);
      expect((await resolve())?.reveal()).equal('current-value');
      await provider.clear(access);
      await assert.rejects(resolve(), { code: 'required-secret-not-configured' });
      const clearedRollback = await publisher.rollback(
        brandId,
        key,
        {
          schemaVersion: 1,
          expectedIdentityVersion: 2,
          expectedActiveRevisionNumber: 3,
          sourceRevisionNumber: 2,
          reason: 'B08 clear persists',
        },
        actor
      );
      expect(clearedRollback.ok).equal(true);
      await assert.rejects(resolve(), { code: 'required-secret-not-configured' });
      for (const name of [
        'recorddefinitiondraft',
        'recorddefinitionrevision',
        'recorddefinitionhistory',
        'recorddefinitionlifecycleoperationack',
      ]) {
        expect(JSON.stringify(await mongoManager().collection(name).find({ branding: brandId }).toArray())).not.include(
          sentinel
        );
      }
      // Native concurrent upserts are atomic; contending first inserts may fail closed on a unique index.
      const results = await Promise.allSettled(
        Array.from({ length: 12 }, (_, i) => provider.replace({ ...access, value: `parallel-${i}` }))
      );
      expect(results.some(result => result.status === 'fulfilled')).equal(true);
      expect((await collection.find({ _id: slot.id }).toArray()).length).equal(1);
      expect((await resolve())?.reveal()).match(/^parallel-/);
      const beforeClear = await collection.findOne({ _id: slot.id });
      await provider.clear(access);
      expect(await collection.findOne({ _id: slot.id })).include({
        protectedValue: null,
        adminVersion: beforeClear!.adminVersion + 1,
      });
    } finally {
      if (oldKey === undefined) delete process.env.REDBOX_ACTION_SECRET_KEY;
      else process.env.REDBOX_ACTION_SECRET_KEY = oldKey;
    }
  });

  it('B06 publishes into two warm runtime caches on the next read and preserves an operation snapshot', async function () {
    const suffix = randomUUID().replaceAll('-', '').slice(0, 10);
    const brandId = await createBrand(`b06-runtime-${suffix}`);
    const otherBrand = await createBrand(`b06-other-${suffix}`);
    const key = parseRecordDefinitionKey(`B06Runtime${suffix}`);
    await createPublicationFixture(brandId, key);
    await createPublicationFixture(otherBrand, key);
    const local = activeRecordDefinitions();
    const remote = new RuntimeServices.RecordDefinitionRuntime();
    const types = new TypeServices.RecordTypes();
    const steps = new StepServices.WorkflowSteps();
    const brand = { id: brandId } as any;
    const old = await firstValueFrom(types.get(brand, key));
    expect((await local.resolve(brandId, key))?.revision.revisionNumber).to.equal(1);
    expect((await remote.resolve(brandId, key))?.revision.revisionNumber).to.equal(1);
    await remote.resolve(otherBrand, key);
    const publisher = new Services.RecordDefinitionPublication(authority(key));
    const published = await publisher.publish(
      brandId,
      key,
      { schemaVersion: 1, expectedIdentityVersion: 0, expectedDraftVersion: 0, expectedActiveRevisionNumber: 1 },
      actor
    );
    expect(published.ok).to.equal(true);
    expect((await local.resolve(brandId, key))?.revision.revisionNumber).to.equal(2);
    expect((await remote.resolve(brandId, key))?.revision.revisionNumber).to.equal(2);
    expect((await remote.resolve(otherBrand, key))?.revision.revisionNumber).to.equal(1);
    expect((old as any).labels.name).to.equal('Original integration definition');
    expect(((await firstValueFrom(steps.getFirst(old))) as any).config.form).to.equal('b05-integration-form');
    expect(((await firstValueFrom(types.get(brand, key))) as any).labels.name).to.equal(
      'Published integration definition'
    );
    await remote.assertReady();
  });

  for (const location of ['recordType', 'stage'] as const) {
    it(`B06 rejects persisted ${location} dashboard JSONata before publish or rollback activation`, async function () {
      const suffix = randomUUID().replaceAll('-', '').slice(0, 10);
      const brandId = await createBrand(`b06-dashboard-${suffix}`);
      const key = parseRecordDefinitionKey(`B06Dashboard${suffix}`);
      const source = definition('Dashboard definition');
      const dashboard = {
        schemaVersion: 1 as const,
        showAdminSidebar: true,
        columns: [
          {
            id: 'title',
            title: 'Title',
            displayOrder: 0,
            value: { kind: 'jsonata' as const, expression: 'record.candidate.metadata.title' },
            render: { kind: 'handlebars' as const, template: '{{metadata.title}}' },
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
      await createPublicationFixture(brandId, key, candidate);
      const publisher = new Services.RecordDefinitionPublication(authority(key));
      const runtime = new RuntimeServices.RecordDefinitionRuntime();
      const request = {
        schemaVersion: 1 as const,
        expectedIdentityVersion: 0,
        expectedDraftVersion: 0,
        expectedActiveRevisionNumber: 1,
      };
      const issuePath =
        location === 'recordType' ? '/recordType/dashboard/columns/0/value' : '/stages/0/dashboard/columns/0/value';
      const rejected = await lifecycleRejection(publisher.publish(brandId, key, request, actor));
      expect(rejected.code).to.equal('publication-validation-failed');
      expect(
        rejected.validation?.issues.some(
          issue => issue.code === 'unsupported-dashboard-value' && issue.path === issuePath
        )
      ).to.equal(true);
      expect(await RecordDefinitionRevision.count({ branding: brandId, recordTypeKey: key })).to.equal(1);
      expect(await RecordDefinitionHistory.count({ branding: brandId, recordTypeKey: key })).to.equal(0);
      expect((await runtime.resolve(brandId, key))?.revision.revisionNumber).to.equal(1);
      await runtime.assertReady();

      const supportedDashboard = {
        ...dashboard,
        columns: dashboard.columns.map(column => ({
          ...column,
          value: { kind: 'path' as const, path: 'metadata.title' },
        })),
      };
      const supported = {
        ...candidate,
        recordType: {
          ...candidate.recordType,
          ...(location === 'recordType' ? { dashboard: supportedDashboard } : {}),
        },
        stages: candidate.stages.map((stage, index) => ({
          ...stage,
          ...(location === 'stage' && index === 0 ? { dashboard: supportedDashboard } : {}),
        })),
      };
      await mongoManager()
        .collection('recorddefinitiondraft')
        .updateOne({ recordTypeKey: key }, { $set: { definition: draftDefinition(supported) } });
      expect((await publisher.publish(brandId, key, request, actor)).ok).to.equal(true);
      expect((await runtime.resolve(brandId, key))?.revision.revisionNumber).to.equal(2);
      await runtime.assertReady();

      // Simulate an inactive revision accepted by the older validator, with a correct hash.
      await mongoManager()
        .collection('recorddefinitionrevision')
        .updateOne(
          { recordTypeKey: key, revisionNumber: 1 },
          { $set: { definition: candidate, canonicalHash: hashRecordDefinition(candidate) } }
        );
      const rollback = await lifecycleRejection(
        publisher.rollback(
          brandId,
          key,
          {
            schemaVersion: 1,
            expectedIdentityVersion: 1,
            expectedActiveRevisionNumber: 2,
            sourceRevisionNumber: 1,
            reason: 'Old dashboard configuration',
          },
          actor
        )
      );
      expect(rollback.code).to.equal('publication-validation-failed');
      expect(rollback.validation?.scope).to.equal('rollback');
      expect(
        rollback.validation?.issues.some(
          issue => issue.code === 'unsupported-dashboard-value' && issue.path === issuePath
        )
      ).to.equal(true);
      expect(await RecordDefinitionRevision.count({ branding: brandId, recordTypeKey: key })).to.equal(2);
      expect(await RecordDefinitionHistory.count({ branding: brandId, recordTypeKey: key })).to.equal(1);
      expect(
        await RecordType.count({
          branding: brandId,
          name: key,
          version: 1,
          activeRevisionNumber: 2,
          definitionLifecycleToken: null,
        })
      ).to.equal(1);
      expect((await runtime.resolve(brandId, key))?.revision.revisionNumber).to.equal(2);
      await runtime.assertReady();
      await new RuntimeServices.RecordDefinitionRuntime().assertReady();
    });
  }

  for (const location of ['recordType', 'stage'] as const) {
    it(`B06 publishes and renders numeric ${location} dashboard paths while rejecting unsafe paths`, async function () {
      const suffix = randomUUID().replaceAll('-', '').slice(0, 10);
      const brandId = await createBrand(`b06-numeric-${suffix}`);
      const key = parseRecordDefinitionKey(`B06Numeric${suffix}`);
      const source = definition('Numeric dashboard');
      const withPath = (path: string): PublishableRecordDefinitionAggregateDto => {
        const dashboard = {
          schemaVersion: 1 as const,
          showAdminSidebar: false,
          columns: [{ id: 'keyword', title: 'Keyword', displayOrder: 0, value: { kind: 'path' as const, path } }],
        };
        return {
          ...source,
          recordType: { ...source.recordType, ...(location === 'recordType' ? { dashboard } : {}) },
          stages: source.stages.map((stage, index) => ({
            ...stage,
            ...(location === 'stage' && index === 0 ? { dashboard } : {}),
          })),
        };
      };
      await createPublicationFixture(brandId, key, withPath('metadata.keywords.0'));
      const publisher = new Services.RecordDefinitionPublication(authority(key));
      const request = {
        schemaVersion: 1 as const,
        expectedIdentityVersion: 0,
        expectedDraftVersion: 0,
        expectedActiveRevisionNumber: 1,
      };
      for (const path of [
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
      ]) {
        await mongoManager()
          .collection('recorddefinitiondraft')
          .updateOne({ recordTypeKey: key }, { $set: { definition: draftDefinition(withPath(path)) } });
        const rejected = await lifecycleRejection(publisher.publish(brandId, key, request, actor));
        // Persisted corruption is rejected by the shared schema before publication validation.
        expect(rejected.code).to.equal('storage-consistency-error');
        expect(await RecordDefinitionRevision.count({ branding: brandId, recordTypeKey: key })).to.equal(1);
        expect(await RecordDefinitionHistory.count({ branding: brandId, recordTypeKey: key })).to.equal(0);
      }
      await mongoManager()
        .collection('recorddefinitiondraft')
        .updateOne({ recordTypeKey: key }, { $set: { definition: draftDefinition(withPath('metadata.keywords.0')) } });
      expect((await publisher.publish(brandId, key, request, actor)).ok).to.equal(true);
      const runtime = new RuntimeServices.RecordDefinitionRuntime();
      expect((await runtime.resolve(brandId, key))?.revision.revisionNumber).to.equal(2);
      await runtime.assertReady();
      const dashboards = new DashboardServices.DashboardTypes();
      const brand = await BrandingConfig.findOne({ id: brandId });
      if (!brand) throw new Error('Missing test brand');
      const table = await dashboards.getDashboardTableConfig(brand, key, source.stages[0].key);
      expect(table?.rowConfig).to.have.length(1);
      const column = table!.rowConfig[0];
      expect(column.variable).to.equal('metadata.keywords.0');
      expect(() => handlebarsPrecompile(column.template)).not.to.throw();
      expect(handlebarsCompile(column.template)({ metadata: { keywords: ['<script>alert("x")</script>'] } })).to.equal(
        '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;'
      );
      expect(await dashboards.extractDashboardTemplates(brand, key, source.stages[0].key)).to.have.length(1);
    });
  }

  it('B06 readiness ignores draft missing actions and fails on a newly active contract missing on another node', async function () {
    const suffix = randomUUID().replaceAll('-', '').slice(0, 10);
    const brandId = await createBrand(`b06-readiness-${suffix}`);
    const key = parseRecordDefinitionKey(`B06Readiness${suffix}`);
    const draft = {
      ...definition('New action'),
      actionBindings: boundedRedactionDefinition(brandId, key).actionBindings,
    };
    await createPublicationFixture(brandId, key, draft);
    const oldNode = new RuntimeServices.RecordDefinitionRuntime();
    const upgradedNode = new RuntimeServices.RecordDefinitionRuntime(redactionRegistry());
    await oldNode.assertReady(); // Missing action exists only in a draft.
    expect((await oldNode.resolve(brandId, key))?.revision.revisionNumber).to.equal(1);
    const published = await new Services.RecordDefinitionPublication(redactionAuthority(key)).publish(
      brandId,
      key,
      { schemaVersion: 1, expectedIdentityVersion: 0, expectedDraftVersion: 0, expectedActiveRevisionNumber: 1 },
      actor
    );
    expect(published.ok).to.equal(true);
    await expectRejected(oldNode.assertReady());
    await expectRejected(oldNode.resolve(brandId, key));
    await upgradedNode.assertReady();
    expect((await upgradedNode.resolve(brandId, key))?.revision.revisionNumber).to.equal(2);
  });

  it('gives one concurrent publish the CAS and stores one complete immutable aggregate', async function () {
    const suffix = randomUUID().replaceAll('-', '').slice(0, 10);
    const brandId = await createBrand(`b05-cas-${suffix}`);
    const recordTypeKey = parseRecordDefinitionKey(`B05Dataset${suffix}`);
    await createPublicationFixture(brandId, recordTypeKey);
    const request = {
      schemaVersion: RECORD_DEFINITION_API_SCHEMA_VERSION,
      expectedIdentityVersion: 0,
      expectedDraftVersion: 0,
      expectedActiveRevisionNumber: 1,
      publicationNote: 'Datastore CAS publication',
    } as const;

    const results = await Promise.all([
      new Services.RecordDefinitionPublication(authority(recordTypeKey)).publish(
        brandId,
        recordTypeKey,
        request,
        actor
      ),
      new Services.RecordDefinitionPublication(authority(recordTypeKey)).publish(brandId, recordTypeKey, request, {
        id: 'b05-integration-admin-2',
      }),
    ]);

    expect(results.filter(result => result.ok)).to.have.length(1);
    expect(results.filter(result => !result.ok)).to.have.length(1);
    expect(await RecordDefinitionRevision.count({ branding: brandId, recordTypeKey })).to.equal(2);
    expect(await RecordDefinitionHistory.count({ branding: brandId, recordTypeKey, operation: 'publish' })).to.equal(1);
    expect(
      await RecordDefinitionLifecycleOperationAck.count({ branding: brandId, recordTypeKey, kind: 'publish' })
    ).to.equal(1);
    const storedIdentity = await RecordType.findOne({ branding: brandId, name: recordTypeKey });
    expect(storedIdentity).to.include({ activeRevisionNumber: 2, version: 1, definitionLifecycleToken: null });

    const revisionId = deriveRecordDefinitionRevisionId({ brandId, recordTypeKey }, 2);
    await expectRejected(RecordDefinitionRevision.updateOne({ id: revisionId }).set({ publicationNote: 'tampered' }));
    await expectRejected(RecordDefinitionRevision.destroyOne({ id: revisionId }));
    const history = await RecordDefinitionHistory.findOne({ branding: brandId, recordTypeKey, revisionNumber: 2 });
    await expectRejected(RecordDefinitionHistory.updateOne({ id: history?.id }).set({ note: 'tampered' }));
    await expectRejected(RecordDefinitionHistory.destroyOne({ id: history?.id }));
    const acknowledgement = await RecordDefinitionLifecycleOperationAck.findOne({
      branding: brandId,
      recordTypeKey,
      kind: 'publish',
    });
    if (acknowledgement === undefined) expect.fail('publication acknowledgement must exist');
    await expectRejected(
      RecordDefinitionLifecycleOperationAck.updateOne({ id: acknowledgement?.id }).set({ historyId: 'tampered' })
    );
    await expectRejected(RecordDefinitionLifecycleOperationAck.destroyOne({ id: acknowledgement?.id }));
  });

  it('uses brand-owned roles and forms from the default Mongo authority and rejects cross-brand substitutes', async function () {
    const suffix = randomUUID().replaceAll('-', '').slice(0, 10);
    const ownedBrandId = await createBrand(`b05-default-owned-${suffix}`);
    const foreignBrandId = await createBrand(`b05-default-foreign-${suffix}`);
    const ownedKey = parseRecordDefinitionKey(`B05DefaultOwned${suffix}`);
    const foreignKey = parseRecordDefinitionKey(`B05DefaultForeign${suffix}`);
    await createPublicationFixture(ownedBrandId, ownedKey);
    await createPublicationFixture(foreignBrandId, foreignKey);
    await createDefaultAuthority(ownedBrandId);
    await createDefaultAuthority(foreignBrandId);

    const applied = await new Services.RecordDefinitionPublication().publish(
      ownedBrandId,
      ownedKey,
      {
        schemaVersion: RECORD_DEFINITION_API_SCHEMA_VERSION,
        expectedIdentityVersion: 0,
        expectedDraftVersion: 0,
        expectedActiveRevisionNumber: 1,
      },
      actor
    );
    expect(applied.ok).to.equal(true);

    await Role.destroy({ branding: foreignBrandId });
    await Form.destroy({ branding: foreignBrandId });
    const crossBrandFailure = await lifecycleRejection(
      new Services.RecordDefinitionPublication().publish(
        foreignBrandId,
        foreignKey,
        {
          schemaVersion: RECORD_DEFINITION_API_SCHEMA_VERSION,
          expectedIdentityVersion: 0,
          expectedDraftVersion: 0,
          expectedActiveRevisionNumber: 1,
        },
        actor
      )
    );
    expect(crossBrandFailure.code).to.equal('publication-validation-failed');
    expect(crossBrandFailure.validation?.issues.map(issue => issue.code)).to.include.members([
      'administrative-role-unavailable',
      'form-not-found',
      'role-not-found',
    ]);
    expect(await RecordType.count({ branding: foreignBrandId, name: foreignKey, activeRevisionNumber: 1 })).to.equal(1);
  });

  it('fails closed when default-authority Mongo rows have malformed owned role or form data', async function () {
    const suffix = randomUUID().replaceAll('-', '').slice(0, 10);
    const roleBrandId = await createBrand(`b05-bad-role-${suffix}`);
    const roleKey = parseRecordDefinitionKey(`B05BadRole${suffix}`);
    await createPublicationFixture(roleBrandId, roleKey);
    await Role.create({ name: 'not a safe role', branding: roleBrandId }).fetch();
    await Form.create({
      name: 'b05-integration-form',
      branding: roleBrandId,
      configuration: { validationOperations: {}, validationGroups: {} },
    }).fetch();
    expect(
      (
        await lifecycleRejection(
          new Services.RecordDefinitionPublication().publish(
            roleBrandId,
            roleKey,
            {
              schemaVersion: RECORD_DEFINITION_API_SCHEMA_VERSION,
              expectedIdentityVersion: 0,
              expectedDraftVersion: 0,
              expectedActiveRevisionNumber: 1,
            },
            actor
          )
        )
      ).code
    ).to.equal('storage-consistency-error');

    const formBrandId = await createBrand(`b05-bad-form-${suffix}`);
    const formKey = parseRecordDefinitionKey(`B05BadForm${suffix}`);
    await createPublicationFixture(formBrandId, formKey);
    await Role.create({ name: 'Admin', branding: formBrandId }).fetch();
    await Form.create({
      name: 'not a safe form',
      branding: formBrandId,
      configuration: { validationOperations: {}, validationGroups: {} },
    }).fetch();
    expect(
      (
        await lifecycleRejection(
          new Services.RecordDefinitionPublication().publish(
            formBrandId,
            formKey,
            {
              schemaVersion: RECORD_DEFINITION_API_SCHEMA_VERSION,
              expectedIdentityVersion: 0,
              expectedDraftVersion: 0,
              expectedActiveRevisionNumber: 1,
            },
            actor
          )
        )
      ).code
    ).to.equal('storage-consistency-error');
  });

  it('keeps the old pointer until revision and history are durable, then recovers a lost activation acknowledgement', async function () {
    const suffix = randomUUID().replaceAll('-', '').slice(0, 10);
    const brandId = await createBrand(`b05-visibility-${suffix}`);
    const recordTypeKey = parseRecordDefinitionKey(`B05Visibility${suffix}`);
    await createPublicationFixture(brandId, recordTypeKey);
    const request = {
      schemaVersion: RECORD_DEFINITION_API_SCHEMA_VERSION,
      expectedIdentityVersion: 0,
      expectedDraftVersion: 0,
      expectedActiveRevisionNumber: 1,
    } as const;
    const service = new Services.RecordDefinitionPublication(authority(recordTypeKey));
    const beforeCommit = pauseNextActivePointerBeforeCommit(service);
    const publication = service.publish(brandId, recordTypeKey, request, actor);
    await beforeCommit.reached;

    expect(await RecordDefinitionRevision.count({ branding: brandId, recordTypeKey, revisionNumber: 2 })).to.equal(1);
    expect(await RecordDefinitionHistory.count({ branding: brandId, recordTypeKey, revisionNumber: 2 })).to.equal(1);
    expect(await RecordType.count({ branding: brandId, name: recordTypeKey, activeRevisionNumber: 1 })).to.equal(1);
    beforeCommit.release();
    expect((await publication).ok).to.equal(true);

    const savedDraft = await new DraftServices.RecordDefinitionDraftLifecycle().save(
      brandId,
      recordTypeKey,
      {
        schemaVersion: RECORD_DEFINITION_API_SCHEMA_VERSION,
        expectedDraftVersion: 0,
        expectedActiveRevisionNumber: 2,
        definition: draftDefinition(definition('Recovery publication')),
      },
      actor
    );
    expect(savedDraft.ok).to.equal(true);
    const afterCommit = pauseNextActivePointerAfterCommit(service);
    const recoveringPublication = service.publish(
      brandId,
      recordTypeKey,
      {
        schemaVersion: RECORD_DEFINITION_API_SCHEMA_VERSION,
        expectedIdentityVersion: 2,
        expectedDraftVersion: 1,
        expectedActiveRevisionNumber: 2,
      },
      actor
    );
    await afterCommit.reached;

    expect(await RecordType.count({ branding: brandId, name: recordTypeKey, activeRevisionNumber: 3 })).to.equal(1);
    expect(await RecordDefinitionRevision.count({ branding: brandId, recordTypeKey, revisionNumber: 3 })).to.equal(1);
    expect(await RecordDefinitionHistory.count({ branding: brandId, recordTypeKey, revisionNumber: 3 })).to.equal(1);
    expect(
      (await new Services.RecordDefinitionPublication(authority(recordTypeKey)).listHistory(brandId, recordTypeKey))
        .length
    ).to.equal(2);
    afterCommit.release();
    const recovered = await recoveringPublication;
    expect(recovered.ok).to.equal(true);
    expect(await RecordType.count({ branding: brandId, name: recordTypeKey, definitionLifecycleToken: null })).to.equal(
      1
    );
  });

  it('recovers every durable publication step after its adapter acknowledgement is lost', async function () {
    const methodNames = ['ensureRevision', 'ensureHistory', 'activateRevision', 'persistAck', 'clearOperation'];
    for (const methodName of methodNames) {
      const suffix = randomUUID().replaceAll('-', '').slice(0, 10);
      const brandId = await createBrand(`b05-lost-${methodName.toLowerCase()}-${suffix}`);
      const recordTypeKey = parseRecordDefinitionKey(`B05Lost${methodName}${suffix}`);
      await createPublicationFixture(brandId, recordTypeKey);
      const failingService = new Services.RecordDefinitionPublication(authority(recordTypeKey));
      failOnceAfter(failingService, methodName);
      const error = await lifecycleRejection(
        failingService.publish(
          brandId,
          recordTypeKey,
          {
            schemaVersion: RECORD_DEFINITION_API_SCHEMA_VERSION,
            expectedIdentityVersion: 0,
            expectedDraftVersion: 0,
            expectedActiveRevisionNumber: 1,
          },
          actor
        )
      );
      expect(error.code).to.equal('storage-consistency-error');

      const recovery = new Services.RecordDefinitionPublication(authority(recordTypeKey));
      expect(await recovery.listHistory(brandId, recordTypeKey)).to.have.length(1);
      expect(await RecordDefinitionRevision.count({ branding: brandId, recordTypeKey, revisionNumber: 2 })).to.equal(1);
      expect(await RecordDefinitionHistory.count({ branding: brandId, recordTypeKey, revisionNumber: 2 })).to.equal(1);
      expect(
        await RecordDefinitionLifecycleOperationAck.count({ branding: brandId, recordTypeKey, identityVersion: 1 })
      ).to.equal(1);
      expect(
        await RecordType.count({
          branding: brandId,
          name: recordTypeKey,
          version: 1,
          activeRevisionNumber: 2,
          definitionLifecycleToken: null,
        })
      ).to.equal(1);
    }
  });

  it('keeps the active pointer unchanged across an adapter failure and resumes from durable evidence', async function () {
    const suffix = randomUUID().replaceAll('-', '').slice(0, 10);
    const brandId = await createBrand(`b05-adapter-failure-${suffix}`);
    const recordTypeKey = parseRecordDefinitionKey(`B05AdapterFailure${suffix}`);
    await createPublicationFixture(brandId, recordTypeKey);
    failOnceBefore(RecordDefinitionHistory, 'create');
    const service = new Services.RecordDefinitionPublication(authority(recordTypeKey));
    expect(
      (
        await lifecycleRejection(
          service.publish(
            brandId,
            recordTypeKey,
            {
              schemaVersion: RECORD_DEFINITION_API_SCHEMA_VERSION,
              expectedIdentityVersion: 0,
              expectedDraftVersion: 0,
              expectedActiveRevisionNumber: 1,
            },
            actor
          )
        )
      ).code
    ).to.equal('storage-consistency-error');
    expect(await RecordType.count({ branding: brandId, name: recordTypeKey, activeRevisionNumber: 1 })).to.equal(1);
    expect(await RecordDefinitionRevision.count({ branding: brandId, recordTypeKey, revisionNumber: 2 })).to.equal(1);
    expect(await RecordDefinitionHistory.count({ branding: brandId, recordTypeKey, revisionNumber: 2 })).to.equal(0);

    barrierRestorers.pop()?.();
    expect(
      await new Services.RecordDefinitionPublication(authority(recordTypeKey)).listHistory(brandId, recordTypeKey)
    ).to.have.length(1);
    expect(await RecordType.count({ branding: brandId, name: recordTypeKey, activeRevisionNumber: 2 })).to.equal(1);
  });

  it('treats an immutable revision orphan as non-authoritative and rejects an orphan history row', async function () {
    const suffix = randomUUID().replaceAll('-', '').slice(0, 10);
    const brandId = await createBrand(`b05-orphans-${suffix}`);
    const recordTypeKey = parseRecordDefinitionKey(`B05Orphans${suffix}`);
    const identity = await createPublicationFixture(brandId, recordTypeKey);
    const orphanDefinition = definition('Harmless orphan revision');
    const orphanRevisionId = deriveRecordDefinitionRevisionId({ brandId, recordTypeKey }, 2);
    await RecordDefinitionRevision.create({
      id: orphanRevisionId,
      schemaVersion: 1,
      branding: brandId,
      recordType: String(identity.id),
      recordTypeId: deriveRecordDefinitionId({ brandId, recordTypeKey }),
      recordTypeKey,
      revisionNumber: 2,
      canonicalHash: hashRecordDefinition(orphanDefinition),
      definition: orphanDefinition,
      actionContracts: [],
      source: { operation: 'publish', sourceRevisionNumber: 1 },
      publishedAt: new Date(),
      publishedBy: actor,
      createdBy: actor,
    }).fetch();

    const service = new Services.RecordDefinitionPublication(authority(recordTypeKey));
    const published = await service.publish(
      brandId,
      recordTypeKey,
      {
        schemaVersion: RECORD_DEFINITION_API_SCHEMA_VERSION,
        expectedIdentityVersion: 0,
        expectedDraftVersion: 0,
        expectedActiveRevisionNumber: 1,
      },
      actor
    );
    if (!published.ok) expect.fail('publication must skip the orphan revision number and apply');
    expect(published.revision.revisionNumber).to.equal(3);
    expect((await lifecycleRejection(service.getRevision(brandId, recordTypeKey, 2))).code).to.equal(
      'storage-consistency-error'
    );

    const legitimateHistory = await mongoManager()
      .collection('recorddefinitionhistory')
      .findOne({ recordTypeKey, revisionNumber: 3 });
    if (legitimateHistory === null) expect.fail('publication history must exist');
    const orphanNumber = 99;
    await mongoManager()
      .collection('recorddefinitionhistory')
      .insertOne({
        ...legitimateHistory,
        _id: `rdh_${randomUUID().replaceAll('-', '')}`,
        operationId: randomUUID(),
        expectedIdentityVersion: 98,
        resultingIdentityVersion: 99,
        revision: deriveRecordDefinitionRevisionId({ brandId, recordTypeKey }, orphanNumber),
        revisionNumber: orphanNumber,
      });
    expect((await lifecycleRejection(service.listHistory(brandId, recordTypeKey))).code).to.equal(
      'storage-consistency-error'
    );
  });

  it('rejects valid-looking history metadata that is incoherent with its immutable revision', async function () {
    const suffix = randomUUID().replaceAll('-', '').slice(0, 10);
    const brandId = await createBrand(`b05-history-coherence-${suffix}`);
    const recordTypeKey = parseRecordDefinitionKey(`B05HistoryCoherence${suffix}`);
    await createPublicationFixture(brandId, recordTypeKey);
    const service = new Services.RecordDefinitionPublication(authority(recordTypeKey));
    const publication = await service.publish(
      brandId,
      recordTypeKey,
      {
        schemaVersion: RECORD_DEFINITION_API_SCHEMA_VERSION,
        expectedIdentityVersion: 0,
        expectedDraftVersion: 0,
        expectedActiveRevisionNumber: 1,
      },
      actor
    );
    if (!publication.ok) expect.fail('publication must create coherent revision history');

    const historyCollection = mongoManager().collection('recorddefinitionhistory');
    const filter = { recordTypeKey, revisionNumber: 2 };
    const persistedHistory = await historyCollection.findOne(filter);
    if (persistedHistory === null) expect.fail('publication history must exist');
    const original = {
      canonicalHash: persistedHistory.canonicalHash,
      operation: persistedHistory.operation,
      source: persistedHistory.source,
    };
    const expectRejected = async (): Promise<void> => {
      expect((await lifecycleRejection(service.getRevision(brandId, recordTypeKey, 2))).code).to.equal(
        'storage-consistency-error'
      );
    };

    await historyCollection.updateOne(filter, {
      $set: { canonicalHash: hashRecordDefinition(definition('Valid but unrelated history hash')) },
    });
    await expectRejected();
    await historyCollection.updateOne(filter, { $set: original });

    await historyCollection.updateOne(filter, {
      $set: { source: { operation: 'publish', sourceRevisionNumber: null } },
    });
    await expectRejected();
    await historyCollection.updateOne(filter, { $set: original });

    await historyCollection.updateOne(filter, { $set: { operation: 'rollback' } });
    await expectRejected();
    await historyCollection.updateOne(filter, { $set: original });

    await historyCollection.updateOne(filter, { $set: { operation: 'retire' } });
    await expectRejected();
  });

  it('fails closed on malformed persisted revision, history, and acknowledgement evidence', async function () {
    const suffix = randomUUID().replaceAll('-', '').slice(0, 10);
    const revisionBrandId = await createBrand(`b05-bad-revision-${suffix}`);
    const revisionKey = parseRecordDefinitionKey(`B05BadRevision${suffix}`);
    await createPublicationFixture(revisionBrandId, revisionKey);
    const revisionService = new Services.RecordDefinitionPublication(authority(revisionKey));
    const revisionPublication = await revisionService.publish(
      revisionBrandId,
      revisionKey,
      {
        schemaVersion: RECORD_DEFINITION_API_SCHEMA_VERSION,
        expectedIdentityVersion: 0,
        expectedDraftVersion: 0,
        expectedActiveRevisionNumber: 1,
      },
      actor
    );
    expect(revisionPublication.ok).to.equal(true);
    await mongoManager()
      .collection('recorddefinitionrevision')
      .updateOne(
        { _id: deriveRecordDefinitionRevisionId({ brandId: revisionBrandId, recordTypeKey: revisionKey }, 2) },
        { $set: { canonicalHash: 'not-a-canonical-hash' } }
      );
    expect((await lifecycleRejection(revisionService.getRevision(revisionBrandId, revisionKey, 2))).code).to.equal(
      'storage-consistency-error'
    );

    const historyBrandId = await createBrand(`b05-bad-history-${suffix}`);
    const historyKey = parseRecordDefinitionKey(`B05BadHistory${suffix}`);
    await createPublicationFixture(historyBrandId, historyKey);
    const historyService = new Services.RecordDefinitionPublication(authority(historyKey));
    expect(
      (
        await historyService.publish(
          historyBrandId,
          historyKey,
          {
            schemaVersion: RECORD_DEFINITION_API_SCHEMA_VERSION,
            expectedIdentityVersion: 0,
            expectedDraftVersion: 0,
            expectedActiveRevisionNumber: 1,
          },
          actor
        )
      ).ok
    ).to.equal(true);
    await mongoManager()
      .collection('recorddefinitionhistory')
      .updateOne(
        { recordTypeKey: historyKey, revisionNumber: 2 },
        { $set: { changes: [{ path: 7, kind: 'changed' }] } }
      );
    expect((await lifecycleRejection(historyService.listHistory(historyBrandId, historyKey))).code).to.equal(
      'storage-consistency-error'
    );

    const ackBrandId = await createBrand(`b05-bad-ack-${suffix}`);
    const ackKey = parseRecordDefinitionKey(`B05BadAck${suffix}`);
    await createPublicationFixture(ackBrandId, ackKey);
    const ackService = new Services.RecordDefinitionPublication(authority(ackKey));
    expect(
      (
        await ackService.publish(
          ackBrandId,
          ackKey,
          {
            schemaVersion: RECORD_DEFINITION_API_SCHEMA_VERSION,
            expectedIdentityVersion: 0,
            expectedDraftVersion: 0,
            expectedActiveRevisionNumber: 1,
          },
          actor
        )
      ).ok
    ).to.equal(true);
    const ackCollection = mongoManager().collection('recorddefinitionlifecycleoperationack');
    const acknowledgement = await ackCollection.findOne({ recordTypeKey: ackKey, identityVersion: 1 });
    if (acknowledgement === null) expect.fail('publication acknowledgement must exist');
    await ackCollection.updateOne(
      { _id: acknowledgement._id },
      { $set: { 'identity.deployment.searchCore': 'tampered-core' } }
    );
    await mongoManager()
      .collection('recordtype')
      .updateOne(
        { name: ackKey },
        {
          $set: {
            definitionLifecycleToken: acknowledgement._id,
            definitionLifecycleOperation: acknowledgement.operation,
          },
        }
      );
    expect((await lifecycleRejection(ackService.listHistory(ackBrandId, ackKey))).code).to.equal(
      'storage-consistency-error'
    );
    expect(
      await RecordType.count({ branding: ackBrandId, name: ackKey, definitionLifecycleToken: acknowledgement._id })
    ).to.equal(1);
  });

  it('publishes rollback monotonically and retirement preserves historical resolution', async function () {
    const suffix = randomUUID().replaceAll('-', '').slice(0, 10);
    const brandId = await createBrand(`b05-rollback-${suffix}`);
    const recordTypeKey = parseRecordDefinitionKey(`B05Rollback${suffix}`);
    await createPublicationFixture(brandId, recordTypeKey);
    const service = new Services.RecordDefinitionPublication(authority(recordTypeKey));
    const published = await service.publish(
      brandId,
      recordTypeKey,
      {
        schemaVersion: RECORD_DEFINITION_API_SCHEMA_VERSION,
        expectedIdentityVersion: 0,
        expectedDraftVersion: 0,
        expectedActiveRevisionNumber: 1,
      },
      actor
    );
    if (!published.ok) expect.fail('publication must win');
    const rollback = await service.rollback(
      brandId,
      recordTypeKey,
      {
        schemaVersion: RECORD_DEFINITION_API_SCHEMA_VERSION,
        expectedIdentityVersion: 1,
        expectedActiveRevisionNumber: 2,
        sourceRevisionNumber: 1,
        reason: 'Restore integration baseline',
      },
      actor
    );
    if (!rollback.ok) expect.fail('rollback must win');
    expect(rollback.revision).to.deep.include({
      revisionNumber: 3,
      source: { operation: 'rollback', sourceRevisionNumber: 1 },
    });

    const retired = await service.retire(
      brandId,
      recordTypeKey,
      {
        schemaVersion: RECORD_DEFINITION_API_SCHEMA_VERSION,
        expectedIdentityVersion: 2,
        reason: 'Integration retirement',
      },
      actor
    );
    expect(retired.ok).to.equal(true);
    expect((await service.getRevision(brandId, recordTypeKey, 2))?.revision.revisionNumber).to.equal(2);
    expect((await service.getRevision(brandId, recordTypeKey, 3))?.revision.revisionNumber).to.equal(3);
    expect(await service.listHistory(brandId, recordTypeKey)).to.have.length(2);
    expect(await RecordDefinitionHistory.count({ branding: brandId, recordTypeKey, operation: 'retire' })).to.equal(1);
  });

  it('gives the shared identity CAS to only one draft/publication and one rollback/retirement transition', async function () {
    const suffix = randomUUID().replaceAll('-', '').slice(0, 10);
    const draftBrandId = await createBrand(`b05-draft-publish-${suffix}`);
    const draftKey = parseRecordDefinitionKey(`B05DraftPublish${suffix}`);
    await createPublicationFixture(draftBrandId, draftKey);
    const draftPublicationRace = await Promise.allSettled([
      new Services.RecordDefinitionPublication(authority(draftKey)).publish(
        draftBrandId,
        draftKey,
        {
          schemaVersion: RECORD_DEFINITION_API_SCHEMA_VERSION,
          expectedIdentityVersion: 0,
          expectedDraftVersion: 0,
          expectedActiveRevisionNumber: 1,
        },
        actor
      ),
      new DraftServices.RecordDefinitionDraftLifecycle().save(
        draftBrandId,
        draftKey,
        {
          schemaVersion: RECORD_DEFINITION_API_SCHEMA_VERSION,
          expectedDraftVersion: 0,
          expectedActiveRevisionNumber: 1,
          definition: draftDefinition(definition('Concurrent draft edit')),
        },
        actor
      ),
    ]);
    expect(draftPublicationRace.filter(result => result.status === 'fulfilled' && result.value.ok)).to.have.length(1);
    expect(await RecordType.count({ branding: draftBrandId, name: draftKey, version: 1 })).to.equal(1);
    expect(await RecordType.count({ branding: draftBrandId, name: draftKey, definitionLifecycleToken: null })).to.equal(
      1
    );
    expect(await RecordType.count({ branding: draftBrandId, name: draftKey, draftLifecycleToken: null })).to.equal(1);

    const lifecycleBrandId = await createBrand(`b05-lifecycle-cas-${suffix}`);
    const lifecycleKey = parseRecordDefinitionKey(`B05LifecycleCas${suffix}`);
    await createPublicationFixture(lifecycleBrandId, lifecycleKey);
    const initialService = new Services.RecordDefinitionPublication(authority(lifecycleKey));
    const initialPublication = await initialService.publish(
      lifecycleBrandId,
      lifecycleKey,
      {
        schemaVersion: RECORD_DEFINITION_API_SCHEMA_VERSION,
        expectedIdentityVersion: 0,
        expectedDraftVersion: 0,
        expectedActiveRevisionNumber: 1,
      },
      actor
    );
    expect(initialPublication.ok).to.equal(true);
    const rollbackRequest = {
      schemaVersion: RECORD_DEFINITION_API_SCHEMA_VERSION,
      expectedIdentityVersion: 1,
      expectedActiveRevisionNumber: 2,
      sourceRevisionNumber: 1,
      reason: 'Concurrent rollback',
    } as const;
    const rollbacks = await Promise.all([
      new Services.RecordDefinitionPublication(authority(lifecycleKey)).rollback(
        lifecycleBrandId,
        lifecycleKey,
        rollbackRequest,
        actor
      ),
      new Services.RecordDefinitionPublication(authority(lifecycleKey)).rollback(
        lifecycleBrandId,
        lifecycleKey,
        rollbackRequest,
        { id: 'b05-concurrent-rollback' }
      ),
    ]);
    expect(rollbacks.filter(result => result.ok)).to.have.length(1);
    expect(await RecordDefinitionRevision.count({ branding: lifecycleBrandId, recordTypeKey: lifecycleKey })).to.equal(
      3
    );

    const retirements = await Promise.all([
      new Services.RecordDefinitionPublication(authority(lifecycleKey)).retire(
        lifecycleBrandId,
        lifecycleKey,
        {
          schemaVersion: RECORD_DEFINITION_API_SCHEMA_VERSION,
          expectedIdentityVersion: 2,
          reason: 'Concurrent retirement',
        },
        actor
      ),
      new Services.RecordDefinitionPublication(authority(lifecycleKey)).retire(
        lifecycleBrandId,
        lifecycleKey,
        {
          schemaVersion: RECORD_DEFINITION_API_SCHEMA_VERSION,
          expectedIdentityVersion: 2,
          reason: 'Concurrent retirement',
        },
        { id: 'b05-concurrent-retirement' }
      ),
    ]);
    expect(retirements.filter(result => result.ok)).to.have.length(1);
    expect(
      await RecordDefinitionHistory.count({
        branding: lifecycleBrandId,
        recordTypeKey: lifecycleKey,
        operation: 'retire',
      })
    ).to.equal(1);

    const unretirements = await Promise.all([
      new Services.RecordDefinitionPublication(authority(lifecycleKey)).unretire(
        lifecycleBrandId,
        lifecycleKey,
        { schemaVersion: RECORD_DEFINITION_API_SCHEMA_VERSION, expectedIdentityVersion: 3 },
        actor
      ),
      new Services.RecordDefinitionPublication(authority(lifecycleKey)).unretire(
        lifecycleBrandId,
        lifecycleKey,
        { schemaVersion: RECORD_DEFINITION_API_SCHEMA_VERSION, expectedIdentityVersion: 3 },
        { id: 'b05-concurrent-unretirement' }
      ),
    ]);
    expect(unretirements.filter(result => result.ok)).to.have.length(1);
    expect(
      await RecordDefinitionHistory.count({
        branding: lifecycleBrandId,
        recordTypeKey: lifecycleKey,
        operation: 'unretire',
      })
    ).to.equal(1);
    expect(
      await RecordType.count({ branding: lifecycleBrandId, name: lifecycleKey, version: 4, retiredAt: null })
    ).to.equal(1);
  });

  it('repeatedly settles a mixed rollback and retirement CAS in raw Mongo state', async function () {
    const repetitions = 12;
    for (let repetition = 0; repetition < repetitions; repetition += 1) {
      const suffix = `${randomUUID().replaceAll('-', '').slice(0, 8)}${repetition}`;
      const brandId = await createBrand(`b05-mixed-lifecycle-${suffix}`);
      const recordTypeKey = parseRecordDefinitionKey(`B05MixedLifecycle${suffix}`);
      await createPublicationFixture(brandId, recordTypeKey);
      const publication = new Services.RecordDefinitionPublication(authority(recordTypeKey));
      const initial = await publication.publish(
        brandId,
        recordTypeKey,
        {
          schemaVersion: RECORD_DEFINITION_API_SCHEMA_VERSION,
          expectedIdentityVersion: 0,
          expectedDraftVersion: 0,
          expectedActiveRevisionNumber: 1,
        },
        actor
      );
      expect(initial.ok).to.equal(true);

      const rollback = new Services.RecordDefinitionPublication(authority(recordTypeKey)).rollback(
        brandId,
        recordTypeKey,
        {
          schemaVersion: RECORD_DEFINITION_API_SCHEMA_VERSION,
          expectedIdentityVersion: 1,
          expectedActiveRevisionNumber: 2,
          sourceRevisionNumber: 1,
          reason: `Mixed lifecycle rollback ${repetition}`,
        },
        { id: `b05-mixed-rollback-${repetition}` }
      );
      const retirement = new Services.RecordDefinitionPublication(authority(recordTypeKey)).retire(
        brandId,
        recordTypeKey,
        {
          schemaVersion: RECORD_DEFINITION_API_SCHEMA_VERSION,
          expectedIdentityVersion: 1,
          reason: `Mixed lifecycle retirement ${repetition}`,
        },
        { id: `b05-mixed-retirement-${repetition}` }
      );
      const settledResults = await Promise.allSettled([
        afterRawLifecycleSettlement(rollback, brandId, recordTypeKey),
        afterRawLifecycleSettlement(retirement, brandId, recordTypeKey),
      ]);
      const results = settledResults.flatMap(result => (result.status === 'fulfilled' ? [result.value] : []));
      const rawIdentity = await mongoManager()
        .collection('recordtype')
        .findOne({ definitionId: deriveRecordDefinitionId({ brandId, recordTypeKey }), name: recordTypeKey });
      const storedIdentity = await RecordType.findOne({ branding: brandId, name: recordTypeKey });

      try {
        expect(settledResults.filter(result => result.status === 'rejected')).to.have.length(0);
        expect(results).to.have.length(2);
        expect(results.filter(result => result.ok)).to.have.length(1);
        expect(results.filter(result => !result.ok)).to.have.length(1);
        const loser = results.find(result => !result.ok);
        if (loser?.ok !== false) expect.fail('one mixed lifecycle operation must lose the identity CAS');
        expect(loser.current.version).to.equal(2);
        expect(storedIdentity).to.include({
          version: 2,
          definitionLifecycleToken: null,
          definitionLifecycleOperation: null,
          draftLifecycleToken: null,
          draftLifecycleKind: null,
          draftLifecycleOperation: null,
        });
        expect(rawIdentity).to.include({
          version: 2,
          definitionLifecycleToken: null,
          definitionLifecycleOperation: null,
          draftLifecycleToken: null,
          draftLifecycleKind: null,
          draftLifecycleOperation: null,
        });
        expect(
          await RecordDefinitionHistory.count({ branding: brandId, recordTypeKey, operation: 'rollback' })
        ).to.equal(results[0].ok ? 1 : 0);
        expect(await RecordDefinitionHistory.count({ branding: brandId, recordTypeKey, operation: 'retire' })).to.equal(
          results[1].ok ? 1 : 0
        );
        expect(await RecordDefinitionRevision.count({ branding: brandId, recordTypeKey })).to.equal(
          results[0].ok ? 3 : 2
        );
      } catch (error) {
        const diagnostics = {
          repetition,
          results: settledResults.map(result =>
            result.status === 'fulfilled'
              ? {
                  status: result.status,
                  ok: result.value.ok,
                  version: result.value.ok ? result.value.identity.version : result.value.current.version,
                }
              : {
                  status: result.status,
                  reason: result.reason instanceof Error ? result.reason.message : String(result.reason),
                }
          ),
          storedIdentity,
          rawIdentity,
        };
        throw new Error(`Mixed lifecycle CAS did not settle: ${JSON.stringify(diagnostics)}`, {
          cause: error,
        });
      }
    }
  });

  it('revalidates rollback with current default authority and leaves the active pointer unchanged on failure', async function () {
    const suffix = randomUUID().replaceAll('-', '').slice(0, 10);
    const brandId = await createBrand(`b05-rollback-authority-${suffix}`);
    const recordTypeKey = parseRecordDefinitionKey(`B05RollbackAuthority${suffix}`);
    await createPublicationFixture(brandId, recordTypeKey);
    await createDefaultAuthority(brandId);
    const service = new Services.RecordDefinitionPublication();
    expect(
      (
        await service.publish(
          brandId,
          recordTypeKey,
          {
            schemaVersion: RECORD_DEFINITION_API_SCHEMA_VERSION,
            expectedIdentityVersion: 0,
            expectedDraftVersion: 0,
            expectedActiveRevisionNumber: 1,
          },
          actor
        )
      ).ok
    ).to.equal(true);
    await Role.destroy({ branding: brandId });
    const error = await lifecycleRejection(
      service.rollback(
        brandId,
        recordTypeKey,
        {
          schemaVersion: RECORD_DEFINITION_API_SCHEMA_VERSION,
          expectedIdentityVersion: 1,
          expectedActiveRevisionNumber: 2,
          sourceRevisionNumber: 1,
          reason: 'Must be revalidated',
        },
        actor
      )
    );
    expect(error.code).to.equal('publication-validation-failed');
    expect(error.validation?.scope).to.equal('rollback');
    expect(
      await RecordType.count({ branding: brandId, name: recordTypeKey, version: 1, activeRevisionNumber: 2 })
    ).to.equal(1);
    expect(await RecordDefinitionRevision.count({ branding: brandId, recordTypeKey })).to.equal(2);
    expect(await RecordDefinitionHistory.count({ branding: brandId, recordTypeKey, operation: 'rollback' })).to.equal(
      0
    );
  });

  for (const forgedPayload of [false, true]) {
    it(`B07 saves a real published manual edge (${forgedPayload ? 'forged extras' : 'ID and revision only'}) through validation, actions and native Mongo CAS`, async function () {
      const suffix = randomUUID().replaceAll('-', '').slice(0, 10);
      const brandId = await createBrand(`b07-save-${suffix}`);
      const foreign = await createBrand(`b07-foreign-${suffix}`);
      const key = parseRecordDefinitionKey(`B07Save${suffix}`);
      const transitionId = deriveWorkflowTransitionId({ brandId, recordTypeKey: key, stableKey: 'submit' });
      const order: string[] = [];
      const actionId = parseActionDefinitionId('org.redbox.b07-observe');
      const registry = buildActionRegistry([
        actionRegistrationSource('@researchdatabox/b07-test', 'actions/observe', () => [
          {
            schemaVersion: 1,
            id: actionId,
            contractVersion: 1,
            title: 'Observe save',
            description: 'Observe actual registered action execution',
            category: 'test',
            handler: context => {
              order.push(`${context.scope.mode}:${context.scope.phase}`);
              return { schemaVersion: 1, kind: 'no-change' };
            },
            contexts: ['record-lifecycle', 'workflow-transition'],
            modes: ['onUpdate', 'onTransitionWorkflow'],
            phases: ['pre', 'postSync', 'post'],
            allowRepeatedBindings: true,
            parameterSchema: { schemaVersion: 1, parameters: [] },
            outputSchema: { schemaVersion: 1, fields: [], safeFields: [] },
            resultContract: { allowedKinds: ['no-change'] },
            executionPolicy: { timeout: { defaultMs: 1000, minMs: 100, maxMs: 2000 }, retry: { allowed: false } },
          },
        ]),
      ]);
      // The lift skips application bootstrap. Install real source service instances so
      // ts-node and compiled shims do not maintain separate runtime WeakMap snapshots.
      const globals = globalThis as any;
      const oldTypes = globals.RecordTypesService;
      const oldSteps = globals.WorkflowStepsService;
      const oldRegistry = sailsApp.config.actionRegistry;
      globals.RecordTypesService = new TypeServices.RecordTypes();
      globals.WorkflowStepsService = new StepServices.WorkflowSteps();
      sailsApp.config.actionRegistry = registry;
      barrierRestorers.push(() => {
        globals.RecordTypesService = oldTypes;
        globals.WorkflowStepsService = oldSteps;
        sailsApp.config.actionRegistry = oldRegistry;
      });
      await createDefaultAuthority(brandId);
      await Role.create({ name: 'Editor', branding: brandId }).fetch();
      await Role.create({ name: 'Publisher', branding: brandId }).fetch();
      const validationCalls: any[] = [];
      const validator = globals.RecordValidationService;
      const originalResolve = validator.resolve;
      validator.resolve = async function (request: any) {
        const result = await originalResolve.call(this, request);
        validationCalls.push({
          operation: request.validationOperation,
          evaluate: request.evaluateFormValidators,
          result,
        });
        return result;
      };
      barrierRestorers.push(() => {
        validator.resolve = originalResolve;
      });
      const formConfig = {
        name: 'b05-integration-form',
        type: key,
        componentDefinitions: [
          {
            name: 'title',
            component: { class: 'SimpleInputComponent' },
            model: {
              class: 'SimpleInputModel',
              config: { validators: [{ class: 'required', groups: { include: ['publish'] } }] },
            },
          },
        ],
        enabledValidationGroups: [],
        validationGroups: { publish: { description: 'Publish', initialMembership: 'all' } },
        validationOperations: {
          publish: { enabledValidationGroups: ['publish'], roles: ['Admin'], allowedTargetSteps: ['published'] },
        },
      };
      await Form.update({ branding: brandId }).set({ configuration: formConfig });
      const base = definition('Published save');
      const candidate: PublishableRecordDefinitionAggregateDto = {
        ...base,
        recordType: {
          ...base.recordType,
          validation: {
            mode: 'enforce',
            operations: [
              {
                name: 'publish',
                enabledValidationGroups: ['publish'],
                roles: ['Admin'],
                allowedTargetStages: [parseWorkflowStageKey('published')],
              },
            ],
          },
        },
        stages: [
          { ...base.stages[0], terminal: false, editRoles: ['Admin', 'Editor'], viewRoles: ['Admin', 'Editor'] },
          {
            ...base.stages[0],
            key: parseWorkflowStageKey('published'),
            label: 'Server published',
            starting: false,
            displayOrder: 1,
          },
        ],
        transitions: [
          {
            schemaVersion: 1,
            id: transitionId,
            sourceStageKey: parseWorkflowStageKey('draft'),
            targetStageKey: parseWorkflowStageKey('published'),
            label: 'Server submit',
            mode: 'manual',
            allowedRoles: ['Admin'],
            validationOperation: 'publish',
          },
        ],
        actionBindings: [
          {
            context: 'workflow-transition' as const,
            mode: 'onTransitionWorkflow' as const,
            phase: 'pre' as const,
            scopeId: transitionId,
          },
          { context: 'record-lifecycle' as const, mode: 'onUpdate' as const, phase: 'pre' as const },
          {
            context: 'workflow-transition' as const,
            mode: 'onTransitionWorkflow' as const,
            phase: 'postSync' as const,
            scopeId: transitionId,
          },
          {
            context: 'workflow-transition' as const,
            mode: 'onTransitionWorkflow' as const,
            phase: 'post' as const,
            scopeId: transitionId,
          },
        ].map((scope, index) => ({
          schemaVersion: 1,
          id: deriveStableActionBindingId({
            recordTypeKey: key,
            scope,
            actionId,
            contractVersion: 1,
            stableKey: `observe-${index}`,
          }),
          stableKey: `observe-${index}`,
          actionId,
          contractVersion: 1,
          scope,
          parameters: {},
          order: index,
        })),
      };
      await createPublicationFixture(brandId, key, candidate);
      const publication = await new Services.RecordDefinitionPublication()
        .publish(
          brandId,
          key,
          { schemaVersion: 1, expectedIdentityVersion: 0, expectedDraftVersion: 0, expectedActiveRevisionNumber: 1 },
          actor
        )
        .catch(error => {
          throw new Error(JSON.stringify(error));
        });
      expect(publication.ok, JSON.stringify(publication)).equal(true);
      const type = await firstValueFrom(globals.RecordTypesService.get({ id: brandId }, key));
      const active = activeRecordDefinitions().snapshot(type)!;
      expect(Object.isFrozen(active.revision.definition)).equal(true);
      const starting = (await firstValueFrom(globals.WorkflowStepsService.getFirst(type))) as any;
      const {
        Services: Mongo,
      } = require('../../../packages/sails-hook-redbox-storage-mongo/src/services/MongoStorageService');
      const storage = new Mongo.MongoStorageService();
      await storage.performInit();
      expect(storage.getCapabilities().recordConcurrency).to.exist;
      const records = new RecordServices.Records();
      records.storageService = storage;
      // Search is outside this save-authority test; audit delivery uses real Mongo storage.
      records.searchService = { index: async () => true } as never;
      (records as any).queueService = {
        now: async (_name: string, payload: any) => {
          const result = await storage.createRecordAudit(payload);
          expect(result.success).equal(true);
        },
      };
      const oid = `b07-save-${suffix}`;
      const initial = {
        redboxOid: oid,
        revision: 4,
        metaMetadata: { type: key, brandId, form: starting.config.form },
        workflow: structuredClone(starting.config.workflow),
        metadata: { ready: true, title: 'Published title' },
        authorization: { edit: [actor.id], view: [], editRoles: [], viewRoles: [] },
      };
      const collection = mongoManager().collection('record');
      await collection.insertOne(structuredClone(initial));

      const user = { username: actor.id, roles: [{ name: 'Admin' }] };
      const save = (brand = brandId, who = user, revision = 4, forged = false) =>
        records.updateMeta(
          { id: brand },
          oid,
          forged ? { metadata: { forged: true }, workflow: { stage: 'forged', stageLabel: 'Forged' } } : {},
          who,
          true,
          true,
          forged ? { name: 'forged', config: { authorization: { transitionRoles: ['Guest'] } } } : {},
          undefined,
          {
            requestId: '',
            operation: 'transition',
            routeFamily: 'api',
            transitionId,
            concurrency: { expectedRevision: revision, entityTagSupplied: true },
            ...(forged ? { targetStep: 'forged', validationOperation: 'skip', validationGroups: ['skip'] } : {}),
          }
        );
      const baseline = await collection.findOne({ redboxOid: oid });
      for (const [brand, who, revision, code] of [
        [foreign, user, 4, 'record-validation-authority-context-divergence'],
        [brandId, { username: 'intruder', roles: [{ name: 'Admin' }] }, 4, 'record-validation-edit-unauthorized'],
        [brandId, { username: actor.id, roles: [{ name: 'Guest' }] }, 4, 'workflow-transition-role-denied'],
        [
          brandId,
          { username: actor.id, roles: [{ name: 'Editor' }, { name: 'Publisher' }] },
          4,
          'workflow-transition-role-denied',
        ],
        [brandId, user, 3, 'record-revision-stale'],
      ] as const) {
        const denied = await save(brand, who, revision);
        expect(JSON.stringify(denied)).include(code);
        expect(denied.wasPersisted(), JSON.stringify(denied)).equal(false);
        expect(await collection.findOne({ redboxOid: oid })).deep.equal(baseline);
        expect(order).deep.equal([]);
      }
      // A forged operation/group cannot skip a real required validator.
      await collection.updateOne({ redboxOid: oid }, { $unset: { 'metadata.title': '' } });
      const invalidBaseline = await collection.findOne({ redboxOid: oid });
      const invalid = await save(brandId, user, 4, true);
      expect(invalid.wasPersisted(), JSON.stringify(invalid)).equal(false);
      expect(await collection.findOne({ redboxOid: oid })).deep.equal(invalidBaseline);
      expect(validationCalls.some(call => call.result.shouldBlock)).equal(true);
      await collection.updateOne({ redboxOid: oid }, { $set: { metadata: initial.metadata } });
      order.length = 0;
      validationCalls.length = 0;

      // Lose a real native CAS after all authoritative reads and validation.
      const updateMeta = storage.updateMeta;
      storage.updateMeta = async function (...args: any[]) {
        await collection.updateOne({ redboxOid: oid }, { $inc: { revision: 1 } });
        return updateMeta.apply(this, args);
      };
      const lost = await save();
      storage.updateMeta = updateMeta;
      expect(lost.wasPersisted(), JSON.stringify(lost)).equal(false);
      expect(JSON.stringify(lost)).include('record-revision-stale');
      expect(await collection.findOne({ redboxOid: oid })).deep.equal({ ...baseline, revision: 5 });
      expect(order).deep.equal(['onTransitionWorkflow:pre', 'onUpdate:pre']);
      await collection.updateOne({ redboxOid: oid }, { $set: { revision: 4 } });
      order.length = 0;
      validationCalls.length = 0;
      // Observe persistence ordering while forwarding to the real Mongo implementation.
      storage.updateMeta = async function (...args: any[]) {
        order.push('persistence');
        return updateMeta.apply(this, args);
      };
      const response = await save(brandId, user, 4, forgedPayload);
      expect(response.wasPersisted(), JSON.stringify(response)).equal(true);
      await new Promise(resolve => setTimeout(resolve, 100));
      const saved = await collection.findOne({ redboxOid: oid });
      expect(saved!.workflow).include({ stage: 'published', stageLabel: 'Server published' });
      expect(saved!.metaMetadata.form).equal('b05-integration-form');
      expect(saved!.metadata).deep.equal(initial.metadata);
      expect(saved!.revision).equal(6);
      expect(validationCalls.length).equal(3);
      for (const call of validationCalls) {
        expect(call.operation).equal('publish');
        expect(call.result.status).equal('resolved');
        expect(call.result.formName).equal('b05-integration-form');
        expect(call.result.effectiveGroups).deep.equal(call.evaluate === false ? [] : ['publish']);
        expect(call.result.shouldBlock).equal(false);
      }
      expect(order).deep.equal([
        'onTransitionWorkflow:pre',
        'onUpdate:pre',
        'persistence',
        'onTransitionWorkflow:postSync',
        'persistence',
        'onTransitionWorkflow:post',
      ]);
      const audits = await mongoManager().collection('recordaudit').find({ redboxOid: oid }).toArray();
      expect(audits.length).greaterThan(0);
      expect(audits.at(-1)!.executionSummary.transition).deep.equal({
        transitionId,
        definitionRevisionId: active.revision.id,
        sourceStage: 'draft',
        targetStage: 'published',
      });
      const denied = await save(brandId, user, 6);
      expect(JSON.stringify(denied)).include('workflow-transition-source-denied');
      expect(denied.wasPersisted()).equal(false);
      expect(await collection.findOne({ redboxOid: oid })).deep.equal(saved);
      await collection.deleteMany({ redboxOid: oid });
      await mongoManager().collection('recordaudit').deleteMany({ redboxOid: oid });
    });
  }

  it('B07 resolves a published immutable edge by ID with brand isolation and no draft authority', async function () {
    const suffix = randomUUID().replaceAll('-', '').slice(0, 10);
    const brandId = await createBrand(`b07-transition-${suffix}`);
    const key = parseRecordDefinitionKey(`B07Transition${suffix}`);
    const base = definition('Manual');
    const transitionId = deriveWorkflowTransitionId({ brandId, recordTypeKey: key, stableKey: 'submit' });
    const candidate: PublishableRecordDefinitionAggregateDto = {
      ...base,
      stages: [
        { ...base.stages[0], terminal: false },
        {
          ...base.stages[0],
          key: parseWorkflowStageKey('published'),
          starting: false,
          terminal: true,
          displayOrder: 1,
        },
      ],
      transitions: [
        {
          schemaVersion: 1,
          id: transitionId,
          sourceStageKey: parseWorkflowStageKey('draft'),
          targetStageKey: parseWorkflowStageKey('published'),
          label: 'Server label',
          mode: 'manual',
          allowedRoles: ['Admin'],
          eligibilityCondition: 'record.candidate.metadata.ready = true',
        },
      ],
    };
    await createPublicationFixture(brandId, key, candidate);
    const publication = await new Services.RecordDefinitionPublication(authority(key)).publish(
      brandId,
      key,
      {
        schemaVersion: 1,
        expectedIdentityVersion: 0,
        expectedDraftVersion: 0,
        expectedActiveRevisionNumber: 1,
      },
      actor
    );
    expect(publication.ok).equal(true);
    const type = await firstValueFrom(new TypeServices.RecordTypes().get({ id: brandId }, key));
    const active = activeRecordDefinitions().snapshot(type);
    expect(active?.revision.revisionNumber).equal(2);
    const transition = new TransitionServices.WorkflowTransition();
    const record = { revision: 4, workflow: { stage: 'draft' }, metadata: { ready: true } };
    const resolved = await transition.resolve(
      active!,
      transitionId,
      record,
      { id: actor.id, roles: ['Admin'] },
      brandId,
      4,
      randomUUID()
    );
    expect(resolved.targetStage).equal('published');
    expect(Object.isFrozen(active!.revision.definition)).equal(true);
    await expectRejected(
      transition.resolve(active!, 'published', record, { id: actor.id, roles: ['Admin'] }, brandId, 4, randomUUID())
    );
    await expectRejected(
      transition.resolve(active!, transitionId, record, { id: actor.id, roles: ['Admin'] }, 'foreign', 4, randomUUID())
    );
    const stillActive = await new RuntimeServices.RecordDefinitionRuntime().resolve(brandId, key);
    expect(stillActive?.revision.id).equal(active!.revision.id);
  });

  it('serializes the final RecordsService create with retirement and preserves existing record resolution and history', async function () {
    const suffix = randomUUID().replaceAll('-', '').slice(0, 10);
    const brandId = await createBrand(`b05-record-create-fence-${suffix}`);
    const recordTypeKey = parseRecordDefinitionKey(`B05RecordFence${suffix}`);
    await createPublicationFixture(brandId, recordTypeKey);
    const publication = new Services.RecordDefinitionPublication(authority(recordTypeKey));
    const initialPublication = await publication.publish(
      brandId,
      recordTypeKey,
      {
        schemaVersion: RECORD_DEFINITION_API_SCHEMA_VERSION,
        expectedIdentityVersion: 0,
        expectedDraftVersion: 0,
        expectedActiveRevisionNumber: 1,
      },
      actor
    );
    expect(initialPublication.ok).to.equal(true);
    const identity = await RecordType.findOne({ branding: brandId, name: recordTypeKey });
    if (identity === undefined) expect.fail('record type must remain addressable');
    const oid = `b05-existing-${suffix}`;
    const storedRecords = new Map<string, Record<string, any>>();
    const persistence = new DatastoreBarrier();
    let createCalls = 0;
    const records = new RecordServices.Records();
    (records as any).storageService = {
      create: async (_brand: any, candidate: Record<string, any>): Promise<Record<string, any>> => {
        createCalls += 1;
        await persistence.pause();
        storedRecords.set(oid, structuredClone(candidate));
        return { success: true, oid, applicationState: 'applied' };
      },
      getMeta: async (recordOid: string): Promise<Record<string, any> | undefined> => storedRecords.get(recordOid),
    };
    const internalRecords = records as any;
    const create = internalRecords.createStorageCandidateWithRetirementFence(
      { id: brandId },
      oid,
      { redboxOid: oid, metadata: { title: 'Existing' }, metaMetadata: { brandId, type: recordTypeKey } },
      identity,
      { username: actor.id },
      {}
    ) as Promise<{ readonly status: string }>;
    await persistence.reached;
    expect(
      await RecordType.count({ branding: brandId, name: recordTypeKey, recordCreationToken: { '!=': null } })
    ).to.equal(1);

    const fencedRetirement = await publication.retire(
      brandId,
      recordTypeKey,
      {
        schemaVersion: RECORD_DEFINITION_API_SCHEMA_VERSION,
        expectedIdentityVersion: 1,
        reason: 'Must wait for final record persistence',
      },
      actor
    );
    expect(fencedRetirement.ok).to.equal(false);
    expect(await RecordType.count({ branding: brandId, name: recordTypeKey, retiredAt: null })).to.equal(1);

    persistence.release();
    expect((await create).status).to.equal('created');
    expect(await RecordType.count({ branding: brandId, name: recordTypeKey, recordCreationToken: null })).to.equal(1);
    const retired = await publication.retire(
      brandId,
      recordTypeKey,
      {
        schemaVersion: RECORD_DEFINITION_API_SCHEMA_VERSION,
        expectedIdentityVersion: 1,
        reason: 'Fence released',
      },
      actor
    );
    expect(retired.ok).to.equal(true);

    const retiredIdentity = await RecordType.findOne({ branding: brandId, name: recordTypeKey });
    if (retiredIdentity === undefined) expect.fail('retired record type must remain addressable');
    const rejectedCreate = await records.create(
      { id: brandId },
      { redboxOid: `b05-rejected-${suffix}`, metadata: { title: 'Rejected' } },
      retiredIdentity,
      { username: actor.id },
      false,
      false
    );
    expect(rejectedCreate.wasPersisted()).to.equal(false);
    expect(rejectedCreate.problems[0]?.issues[0]?.code).to.equal('record-type-retired');
    expect(createCalls).to.equal(1);
    expect((await records.getMeta(oid)).metadata).to.deep.equal({ title: 'Existing' });
    expect((await publication.getRevision(brandId, recordTypeKey, 2))?.revision.revisionNumber).to.equal(2);
    expect(await publication.listHistory(brandId, recordTypeKey)).to.have.length(1);
    expect(await RecordDefinitionHistory.count({ branding: brandId, recordTypeKey, operation: 'retire' })).to.equal(1);
  });

  it('persists bounded structural changes and secret markers and enforces bounded history reads', async function () {
    const suffix = randomUUID().replaceAll('-', '').slice(0, 10);
    const brandId = await createBrand(`b05-bounded-history-${suffix}`);
    const recordTypeKey = parseRecordDefinitionKey(`B05BoundedHistory${suffix}`);
    await createPublicationFixture(brandId, recordTypeKey, boundedRedactionDefinition(brandId, recordTypeKey));
    const service = new Services.RecordDefinitionPublication(redactionAuthority(recordTypeKey));
    const publication = await service.publish(
      brandId,
      recordTypeKey,
      {
        schemaVersion: RECORD_DEFINITION_API_SCHEMA_VERSION,
        expectedIdentityVersion: 0,
        expectedDraftVersion: 0,
        expectedActiveRevisionNumber: 1,
      },
      actor
    );
    if (!publication.ok) expect.fail('bounded publication must apply');
    expect(publication.history.changes).to.have.length(RECORD_DEFINITION_VALIDATION_LIMITS.maxChanges);
    expect(publication.history.redactions).to.have.length(1);
    expect(publication.history.truncated).to.equal(true);
    expect(JSON.stringify(publication)).not.to.include('credential-value');

    const rollback = await service.rollback(
      brandId,
      recordTypeKey,
      {
        schemaVersion: RECORD_DEFINITION_API_SCHEMA_VERSION,
        expectedIdentityVersion: 1,
        expectedActiveRevisionNumber: 2,
        sourceRevisionNumber: 1,
        reason: 'Create another bounded history entry',
      },
      actor
    );
    expect(rollback.ok).to.equal(true);
    const bounded = await service.listHistory(brandId, recordTypeKey, 1);
    expect(bounded).to.have.length(1);
    expect(bounded[0]?.revision.revisionNumber).to.equal(3);
    expect(
      (await lifecycleRejection(service.listHistory(brandId, recordTypeKey, RECORD_DEFINITION_HISTORY_LIST_MAX + 1)))
        .code
    ).to.equal('invalid-history-request');
  });
});
