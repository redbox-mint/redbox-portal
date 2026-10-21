import { AdversarialPublicationAdapter } from '../fixtures/adversarialPublication';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { MongoClient } from 'mongodb';
import { of } from 'rxjs';
import {
  PublicationService as CorePublication,
  PublicationPublishing,
  PublicationAdminControl,
  importPublicationIntents,
  publicationOperationEvidence,
  type PublicationProvider,
  type PublicationObject,
  type PublicationConfigurationContext,
  type StorageService,
  type PublicationAdminOptions,
  type PublicationOperation,
  type PublicationRepairContext,
  type PublicationRepairResult,
  type PublicationProviderExecution,
} from '@researchdatabox/redbox-core';
import type { DiskConfig } from '@researchdatabox/redbox-core/dist/config/storage.config';
import { Services as Managers } from '@researchdatabox/redbox-core/dist/services/StorageManagerService';
import { Services as FigshareServices } from '@researchdatabox/redbox-core/dist/services/FigshareService';
import { Services as OniServices } from '@researchdatabox/redbox-core/dist/services/OniService';
import {
  decodeFigshareLegacy,
  emptyFigshareEvidence,
  figshareJson,
} from '@researchdatabox/redbox-core/dist/services/figshare-v2/publication-state';
import {
  oniDestinationConfiguration,
  oniRepositoryIdentity,
  oniJson,
} from '@researchdatabox/redbox-core/dist/services/oni-v2/publication-config';
import { createOniRepository } from '@researchdatabox/redbox-core/dist/services/oni-v2/repository';
import {
  createOniOcflDesiredContent,
  sha256,
} from '@researchdatabox/redbox-core/dist/services/oni-v2/ocflReconciliation';
import { Services as WorkflowServices } from '@researchdatabox/redbox-core/dist/services/WorkflowStepsService';
import { Services as RecordServices } from '@researchdatabox/redbox-core/dist/services/RecordsService';
import { isPublicationObject } from '@researchdatabox/redbox-core/dist/services/publication/builtins';
import { Services } from '../../src/services/MongoStorageService';
import { publicationSource } from '../../src/services/publicationSourcePersistence';
import { storage } from '../../src/config/storage';
import { corruptPublicationEvidence, publicationEvidenceFields } from '../fixtures/publicationEvidence';

if (process.env.CI && !process.env.MONGO_TEST_URL) throw new Error('CI requires MONGO_TEST_URL for PUB-15 acceptance');
const describeMongo = process.env.MONGO_TEST_URL ? describe : describe.skip;
describeMongo('Supported publication administration (PUB-15, real Mongo)', function () {
  this.timeout(30000);
  const database = `publication_admin_${randomUUID().replaceAll('-', '')}`;
  const brand = { id: 'brand', name: 'brand', css: '', roles: [] };
  const key = { brandId: 'brand', oid: 'record', destinationId: 'archive' };
  const globals = new Map<string, unknown>();
  let client: MongoClient;
  let mongo: Services.MongoStorageService;
  let records: RecordServices.Records;
  let publication: TestPublication;
  let configuration: PublicationPublishing;
  let directory: string;
  let savedConfig: unknown;
  let savedServices: unknown;
  let adminBrand: string;
  let editAllowed: boolean;
  let disabled: boolean;
  let repairFault: (() => Promise<void>) | undefined;
  let reconciliationFault:
    | ((
        context: PublicationProviderExecution<PublicationObject, PublicationObject, PublicationObject>
      ) => Promise<void>)
    | undefined;
  let remoteWrites: number;
  let server: Server;
  let url: string;
  let article: Record<string, unknown>;
  let visibleToken: string | undefined;
  let file: Record<string, unknown>;
  const objectResult = (value: unknown) =>
    isPublicationObject(value)
      ? { valid: true as const, value }
      : { valid: false as const, issues: [{ path: '', code: 'object', message: 'Object required' }] };
  const repair = async (context: PublicationRepairContext): Promise<PublicationRepairResult> => {
    await repairFault?.();
    if (context.parameters.erase === true) return { state: context.state, operations: [] };
    return {
      state: { ...context.state, repaired: true },
      binding: {
        namespace: 'ledger:actual',
        objectId: String(context.parameters.objectId ?? 'one'),
        targetFingerprint: context.targetFingerprint,
        evidence: { verified: true },
      },
    };
  };
  let adversary: AdversarialPublicationAdapter;
  const provider: PublicationProvider<PublicationObject, PublicationObject, PublicationObject> = {
    id: 'ledger',
    contractVersion: 2,
    stateVersion: 1,
    configurationSchema: {},
    secretPaths: ['connection.token'],
    mutationRecovery: { mode: 'idempotency-key' },
    capabilities: { synchronise: true, reconcile: true, observe: true, resourceLeases: true },
    validateConfiguration: objectResult,
    targetFingerprint: () => 'verified-target',
    decodeState: value =>
      isPublicationObject(value) && value.invalidState === true
        ? { valid: false, issues: [{ path: '', code: 'invalid-state', message: 'Fixture rejected state' }] }
        : objectResult(value),
    upgradeState: objectResult,
    decodePreparedSource: objectResult,
    prepareSource: async () => ({ valid: true, value: {} }),
    synchronise: async context => {
      remoteWrites++;
      return { kind: 'waiting', state: context.state, reason: 'waiting' };
    },
    observe: async context => ({ kind: 'waiting', state: context.state, reason: 'waiting' }),
    reconcile: async context => {
      if (reconciliationFault) {
        await reconciliationFault(context);
        return { kind: 'waiting', state: context.state, reason: 'reconciled' };
      }
      await context.checkpoint({ reconciled: true });
      return { kind: 'waiting', state: { reconciled: true }, reason: 'reconciled' };
    },
    attestOperation: repair,
    repairs: [
      { id: 'link', description: 'Read/verify test ledger identity', run: repair },
      { id: 'relink', description: 'Read/verify replacement test identity', run: repair },
      { id: 'reconcile-evidence', description: 'Read back historical evidence', run: context => context.reconcile() },
      {
        id: 'caught-reconciliation',
        description: 'Fault fixture that catches a rejected reconciliation',
        run: async context => {
          await assert.rejects(context.reconcile(), /publication_operation_evidence_mismatch/);
          return { state: { acceptedDespiteFailure: true }, operations: [...context.operations] };
        },
      },
    ],
  };
  class TestPublication extends CorePublication.Services.Publication {
    runtime() {
      return this.publicationRuntime();
    }
    protected override configureProviders(): void {
      super.configureProviders();
      this.registerProvider(adversary.provider);
    }
    protected override async sourceConfigurationContext(
      _brand: string,
      adapter: StorageService
    ): Promise<PublicationConfigurationContext> {
      return {
        publicationStorage: adapter,
        authority: 'shared',
        verifiedTargets: Object.fromEntries(
          Object.entries(configuration.destinations).map(([id, destination]) => [
            id,
            this.providerRegistry.get(destination.provider)!.targetFingerprint(destination),
          ])
        ),
      };
    }
  }
  function globalValue(name: string, value: unknown) {
    if (!globals.has(name)) globals.set(name, Reflect.get(globalThis, name));
    Reflect.set(globalThis, name, value);
  }
  before(async () => {
    client = new MongoClient(process.env.MONGO_TEST_URL!);
    await client.connect();
    const db = client.db(database);
    await db.createCollection('record');
    for (const name of [
      'PublicationSync',
      'Record',
      'DeletedRecord',
      'RecordAudit',
      'IntegrationAudit',
      'RecordSchemaArtifact',
      'RecordSchemaReference',
    ])
      globalValue(name, {
        tableName: name.toLowerCase(),
        getDatastore: () => ({ manager: db }),
        findOne: (criteria: Record<string, unknown>) => db.collection(name.toLowerCase()).findOne(criteria),
      });
    const sails = Reflect.get(globalThis, 'sails');
    savedConfig = sails.config;
    savedServices = sails.services;
    sails.config = {
      ...sails.config,
      storage,
      recordSchema: { enabled: false },
      record: { auditing: { enabled: false }, baseUrl: {}, datastreamService: 'datastream' },
      jsonld: { addJsonLdContext: false, contexts: {} },
    };
    mongo = new Services.MongoStorageService();
    await mongo.init();
    server = createServer((req, res) => {
      if (req.method !== 'GET') remoteWrites++;
      res.setHeader('content-type', 'application/json');
      const path = new URL(req.url!, 'http://localhost').pathname;
      const result =
        path === '/account'
          ? { id: 1 }
          : path === '/account/articles'
            ? visibleToken
              ? [{ ...article, title: `ReDBox draft ${visibleToken}` }]
              : []
            : path.includes('/files/')
              ? file
              : article;
      res.end(JSON.stringify(result));
    });
    await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    url = `http://127.0.0.1:${address.port}`;
    directory = await mkdtemp(join(tmpdir(), 'pub15-admin-'));
    const diskConfig: DiskConfig = { driver: 'fs', config: { root: directory } };
    const manager = new (class extends Managers.StorageManager {
      override getMergedStorageConfig() {
        return {
          serviceName: 'manager',
          primaryDisk: 'repository',
          stagingDisk: 'repository',
          disks: { repository: diskConfig, durable: diskConfig },
        };
      }
      async ready() {
        await this.processDynamicImports();
        await this.bootstrap();
      }
    })();
    await manager.ready();
    globalValue('BrandingService', {
      getBrandById: (id: string) => (id === 'brand' ? brand : undefined),
      getBrand: () => brand,
      getDefault: () => brand,
      getAvailable: () => ['brand'],
    });
    globalValue('FormsService', {
      getForm: async () => ({ name: 'publication-form', attachmentFields: [] }),
      getFormByName: () => of({ name: 'publication-form', attachmentFields: [] }),
    });
    globalValue('RolesService', {
      getRole: () => null,
      getAdminFromBrand: () => ({ id: 'admin', name: 'Admin' }),
      getAdminFromRoles: (roles: Array<{ name: string }>) => roles.find(role => role.name === 'Admin'),
    });
    globalValue('WorkflowStep', {
      findOne: (criteria: { name?: string }) => ({
        exec: (callback: (error: null, result: unknown) => void) =>
          callback(null, {
            name: criteria.name ?? 'queued',
            config: {
              workflow: { stage: criteria.name ?? 'queued', stageLabel: criteria.name ?? 'queued' },
              form: 'publication-form',
              authorization: { editRoles: [], viewRoles: [] },
            },
          }),
      }),
    });
    globalValue('WorkflowStepsService', new WorkflowServices.WorkflowSteps().exports());
    globalValue('IntegrationAuditService', { recordPublicationAudit: async () => {} });
    globalValue('AgendaQueueService', { now: async () => {} });
    globalValue('RecordTypesService', {
      get: () => of({ id: 'pubtype', name: 'dataPublication', searchable: false, hooks: {} }),
    });
    globalValue('RecordValidationService', {
      resolve: async () => ({ status: 'unresolved', shouldBlock: false, mode: 'shadow', diagnostics: [] }),
    });
    globalValue('TranslationService', { t: (key: string) => key });
    globalValue('StorageManagerService', manager);
    globalValue('FigshareService', new FigshareServices.FigshareService().exports());
    globalValue('OniService', new OniServices.OniService().exports());
    globalValue('UsersService', {
      getUserWithUsername: (username: string) =>
        of({
          username,
          type: 'local',
          disabled: username === 'admin' && disabled,
          roles: username === 'admin' ? [{ name: 'Admin', branding: adminBrand }] : [],
        }),
    });
    globalValue('AppConfigService', { getAppConfigurationForBrand: () => ({ publicationPublishing: configuration }) });
  });
  after(async () => {
    const sails = Reflect.get(globalThis, 'sails');
    sails.config = savedConfig;
    sails.services = savedServices;
    for (const [name, value] of globals) {
      if (value === undefined) Reflect.deleteProperty(globalThis, name);
      else Reflect.set(globalThis, name, value);
    }
    if (server) await new Promise<void>(done => server.close(() => done()));
    if (client) {
      await client.db(database).dropDatabase();
      await client.close();
    }
    if (directory) await rm(directory, { recursive: true, force: true });
  });
  beforeEach(async () => {
    for (const name of [
      'record',
      'recordidentity',
      'deletedrecord',
      'publicationsync',
      'publicationdestination',
      'publicationresourcelease',
      'publicationworkflowdecision',
      'publicationadmincontrol',
      'publicationcorrection',
    ])
      await client.db(database).collection(name).deleteMany({});
    article = { id: 51, account_id: 1, version: 1, is_public: false, files: [] };
    file = { id: 11, size: 4, status: 'available', computed_md5: 'abcd', supplied_md5: 'abcd' };
    visibleToken = undefined;
    adminBrand = 'brand';
    editAllowed = true;
    disabled = false;
    repairFault = undefined;
    reconciliationFault = undefined;
    remoteWrites = 0;
    configuration = new PublicationPublishing();
    configuration.processing = {
      ...configuration.processing,
      enabled: true,
      serviceUsername: 'worker',
      stagingDisk: 'durable',
      coalesceMs: 1,
    };
    const destination = {
      provider: 'ledger',
      displayName: 'Archive',
      enabled: true,
      archived: false,
      connection: { token: 'DO-NOT-EXPOSE' },
      mapping: {},
      attachments: {},
      providerOptions: {},
      writeBack: {},
    };
    configuration.destinations = { archive: structuredClone(destination), repository: structuredClone(destination) };
    configuration.sourcePolicies = [
      {
        id: 'approve',
        version: 1,
        mode: 'approval',
        recordType: 'dataPublication',
        event: 'onCreate',
        destinations: ['archive', 'repository'],
      },
    ];
    records = new RecordServices.Records();
    records.storageService = mongo;
    Reflect.set(records, 'searchService', { index: async () => true });
    Reflect.set(records, 'queueService', { now: async () => {} });
    Reflect.set(records, 'datastreamService', { listDatastreams: async () => [] });
    const exports = records.exports();
    globalValue('RecordsService', {
      ...exports,
      hasEditAccess: (...args: Parameters<RecordServices.Records['hasEditAccess']>) =>
        editAllowed && records.hasEditAccess(...args),
    });
    adversary = new AdversarialPublicationAdapter(provider);
    publication = new TestPublication();
    publication.bootstrap();
    globalValue('PublicationService', publication.exports());
  });
  async function start() {
    const result = await records.create(
      brand,
      {
        redboxOid: 'record',
        metadata: { title: 'Approved source' },
        authorization: { edit: ['approver', 'worker', 'admin'], editRoles: [], view: [], viewRoles: [] },
      },
      { id: 'pubtype', name: 'dataPublication', searchable: false, hooks: {} },
      { username: 'approver', type: 'local', roles: [] },
      false,
      false
    );
    assert.equal(result.isComplete(), true, JSON.stringify(result));
    const runtime = publication.runtime();
    await importPublicationIntents(runtime, await mongo.getMeta('record'));
    return runtime;
  }
  const command = (action: PublicationAdminOptions['action'], extra: Partial<PublicationAdminOptions> = {}) =>
    publication.administer({ ...key, username: 'admin', action, ...extra });
  async function approvalId() {
    const record = await mongo.getMeta('record');
    assert.ok(record);
    return publicationSource(record.publicationSource).approvals[0].id;
  }
  async function row() {
    const saved = await publication.runtime().store.get(key);
    assert.ok(saved);
    return saved;
  }
  async function uncertain() {
    const saved = await row();
    const operation: PublicationOperation = {
      id: randomUUID(),
      kind: 'deposit',
      approvalId: saved.approvalId,
      approvalEpoch: saved.approvalEpoch,
      sourceGeneration: saved.sourceGeneration,
      intendedDigest: 'intended',
      submittedAt: new Date().toISOString(),
      outcome: 'uncertain',
      evidence: { receipt: 'owned', nonce: 'retained' },
    };
    await publication
      .runtime()
      .store.collection.updateOne(key, { $set: { operations: [operation], providerState: { receipt: 'owned' } } });
    return operation;
  }
  for (const apply of [false, true])
    it(`administrative reconciliation isolates in-place state and acknowledgement forgery (${apply ? 'apply' : 'dry-run'})`, async () => {
      await start();
      await uncertain();
      const before = await row();
      adversary.execute = async context => {
        context.state.escaped = true;
        for (const operation of context.operations) {
          operation.outcome = 'confirmed';
          operation.confirmation = publicationOperationEvidence(before, operation);
          operation.checkpointed = true;
        }
        return { kind: 'waiting', state: context.state, reason: 'forged-without-callback' };
      };
      await command('repair', { repair: 'reconcile-evidence', apply, reason: 'Test reference isolation' });
      const saved = await row();
      assert.deepEqual(saved.providerState, before.providerState);
      assert.deepEqual(saved.operations, before.operations, 'Only a host checkpoint can acknowledge evidence');
      assert.deepEqual(saved.work, before.work);
      assert.equal(saved.completion, undefined);
      assert.equal(remoteWrites, 0);
    });

  for (const apply of [false, true])
    it(`attestation cannot redirect the operator grant through mutable context (${apply ? 'apply' : 'dry-run'})`, async () => {
      await start();
      const first = await uncertain();
      const second = { ...first, id: randomUUID(), intendedDigest: 'other-mutation' };
      const runtime = publication.runtime();
      await runtime.store.collection.updateOne(key, { $set: { operations: [first, second] } });
      const before = await row();
      adversary.attest = async context => {
        context.operations[0].id = second.id;
        context.parameters.operationId = second.id;
        return {
          state: { escaped: true },
          operations: [{ ...second, outcome: 'confirmed', confirmation: publicationOperationEvidence(before, second) }],
          checkpointedOperationIds: [second.id],
        };
      };
      await assert.rejects(
        command('repair', {
          repair: 'attest-operation',
          apply,
          reason: 'Verify exact operator grant',
          parameters: {
            operationId: first.id,
            intendedDigest: first.intendedDigest,
            idempotencyKey: publicationOperationEvidence(before, first).idempotencyKey,
            outcome: 'confirmed',
            priorOperationSettled: true,
            evidenceReference: 'operator-receipt',
            externalReceipt: { id: first.id },
          },
        }),
        /Provider verification did not establish the attested operation outcome/
      );
      const saved = await row();
      assert.deepEqual(saved.providerState, before.providerState);
      assert.deepEqual(saved.operations, before.operations);
      assert.deepEqual(saved.work, before.work);
      assert.equal(saved.completion, undefined);
      assert.equal(saved.correctionReferences.length, 0);
      assert.equal(remoteWrites, 0);
    });

  for (const repair of provider.repairs)
    for (const apply of [false, true])
      for (const field of ['operationId', 'oid', 'brandId', 'destinationId'] as const)
        it(`malicious repair ${repair.id} catches foreign ${field} refusal (${apply ? 'apply' : 'dry-run'})`, async () => {
          await start();
          await uncertain();
          const before = await row();
          adversary.execute = async context => {
            const op = context.operations[0];
            const confirmation = publicationOperationEvidence(before, op);
            confirmation[field] += '-foreign';
            await adversary.swallow('foreign-evidence', () =>
              context.journal({ ...op, outcome: 'confirmed', confirmation })
            );
            await adversary.callbacks(context, op);
            adversary.later(() => adversary.callbacks(context, op));
            context.state.escaped = true;
            context.operations[0].checkpointed = true;
            return { kind: 'waiting', state: context.state, reason: 'swallowed' };
          };
          adversary.repair = async (_id, context) => {
            await adversary.swallow('reconcile', () => context.reconcile());
            await adversary.swallow('resource', () => context.withResourceLease('ledger', 'index', async () => {}));
            adversary.later(async () => {
              await adversary.swallow('late-reconcile', () => context.reconcile());
              await adversary.swallow('late-resource', () =>
                context.withResourceLease('ledger', 'index', async () => {})
              );
            });
            return { state: { escaped: true }, operations: [...context.operations] };
          };
          await assert.rejects(
            command('repair', { repair: repair.id, apply, reason: 'Adversarial adapter verification' }),
            /publication_operation_evidence_mismatch/
          );
          await adversary.flush();
          const saved = await row();
          assert.deepEqual(adversary.accepted, []);
          assert.equal(adversary.refused.length, 27);
          assert.deepEqual(saved.providerState, before.providerState);
          assert.deepEqual(saved.operations, before.operations);
          assert.deepEqual(saved.work, before.work);
          assert.deepEqual(saved.binding, before.binding);
          assert.equal(saved.completion, undefined);
          assert.equal(saved.correctionReferences.length, 0);
          assert.equal(saved.lease, null);
          assert.equal(remoteWrites, 0);
          if (apply) {
            assert.equal(saved.status, 'repair_required');
            assert.equal(saved.operationEvidenceFailures?.at(-1)?.field, field);
          } else assert.deepEqual(saved, before);
        });

  const actions: PublicationAdminOptions['action'][] = ['inspect', 'reconcile', 'pause', 'resume', 'revoke', 'repair'];
  for (const action of actions) {
    it(`denies a current administrator from another brand for ${action}`, async () => {
      await start();
      adminBrand = 'elsewhere';
      await assert.rejects(
        command(action, {
          ...(action === 'pause' ? { oid: undefined } : {}),
          approvalId: await approvalId(),
          repair: 'link',
        }),
        /current administrator/
      );
    });
  }
  for (const action of ['resume', 'revoke', 'repair'] as const) {
    it(`refuses an active record owner before ${action}`, async () => {
      const runtime = await start();
      await runtime.store.claim(key, 'worker', 120000);
      await assert.rejects(
        command(action, { apply: true, reason: 'Verified incident', repair: 'link', approvalId: await approvalId() }),
        /active publication worker/
      );
      assert.equal(await client.db(database).collection('publicationcorrection').countDocuments(), 0);
    });
  }
  for (const action of ['pause', 'resume'] as const) {
    it(`refuses an active brand owner before ${action}`, async () => {
      const runtime = await start();
      await runtime.store.claim(key, 'worker', 120000);
      await assert.rejects(
        command(action, { oid: undefined, destinationId: undefined, apply: true, reason: 'Verified incident' }),
        /active publication worker/
      );
    });
  }
  it('denies disabled administrators and missing edit access; refuses explicit record/brand mismatch', async () => {
    await start();
    disabled = true;
    await assert.rejects(command('inspect'), /current administrator/);
    disabled = false;
    editAllowed = false;
    await assert.rejects(command('resume'), /current administrator/);
    await assert.rejects(command('inspect', { brandId: 'another' }), /brand mismatch/);
  });
  it('keeps inspection and reconciliation read-only, including all database collections', async () => {
    const runtime = await start();
    await uncertain();
    const before = await runtime.store.collection.find(key).toArray();
    const controls = await client.db(database).collection('publicationadmincontrol').find().toArray();
    const inspected = JSON.stringify(await command('inspect'));
    assert.ok(!inspected.includes('DO-NOT-EXPOSE'));
    const result = await command('reconcile');
    assert.ok(result);
    assert.deepEqual(await runtime.store.collection.find(key).toArray(), before);
    assert.deepEqual(await client.db(database).collection('publicationadmincontrol').find().toArray(), controls);
    assert.equal(await client.db(database).collection('publicationcorrection').countDocuments(), 0);
    assert.equal(remoteWrites, 0);
    await assert.rejects(command('reconcile', { apply: true }), /read-only/);
  });
  it('defaults every correction category to dry-run without changing evidence', async () => {
    await start();
    const before = await row();
    const controls = await client.db(database).collection('publicationadmincontrol').find().toArray();
    for (const action of ['resume', 'revoke', 'repair'] as const) {
      const report = await command(action, { approvalId: await approvalId(), repair: 'link' });
      assert.equal(Reflect.get(Object(report), 'dryRun'), true);
      assert.deepEqual(await row(), before);
    }
    await command('pause', { oid: undefined });
    assert.deepEqual(await client.db(database).collection('publicationadmincontrol').find().toArray(), controls);
    assert.equal(await client.db(database).collection('publicationcorrection').countDocuments(), 0);
  });
  for (const field of publicationEvidenceFields) {
    it(`administrative reconciliation refuses ${field} proof and retains the report`, async () => {
      await start();
      const operation = await uncertain();
      const remote = { namespace: 'ledger:actual', objectId: 'one' };
      await publication.runtime().store.collection.updateOne(key, {
        $set: { binding: { ...remote, targetFingerprint: 'verified-target', evidence: {} } },
      });
      const before = await row();
      const confirmation = corruptPublicationEvidence(publicationOperationEvidence(before, operation, remote), field);
      reconciliationFault = async context => {
        await context.journal({ ...operation, outcome: 'confirmed', confirmation });
        assert.fail('A refused report cannot be acknowledged');
      };
      await assert.rejects(
        command('repair', { repair: 'reconcile-evidence' }),
        /publication_operation_evidence_mismatch/
      );
      assert.deepEqual(await row(), before, 'A dry-run refusal is read-only');
      await assert.rejects(
        command('repair', { repair: 'reconcile-evidence', apply: true, reason: 'Verify exact operation evidence' }),
        /publication_operation_evidence_mismatch/
      );
      const saved = await row();
      assert.equal(saved.status, 'repair_required');
      assert.deepEqual(saved.operations, before.operations);
      assert.deepEqual(saved.providerState, before.providerState);
      assert.deepEqual(saved.operationEvidenceFailures?.[0].reported, confirmation ?? null);
      assert.equal(saved.completion, undefined);
      assert.equal(remoteWrites, 0);
    });
  }
  for (const boundary of ['journal', 'checkpoint', 'resource', 'repair', 'replacement-error'] as const)
    for (const apply of [false, true])
      it(`retains a caught ${boundary} proof rejection during ${apply ? 'applied' : 'dry-run'} recovery`, async () => {
        await start();
        const operation = await uncertain();
        const runtime = publication.runtime();
        const work = await row();
        const confirmation = { ...publicationOperationEvidence(work, operation), intendedDigest: 'wrong-digest' };
        const reported = { ...operation, outcome: 'confirmed' as const, confirmation };
        const resourceKey = { providerId: 'ledger', namespace: 'ledger:actual', resourceKey: 'root' };
        if (boundary === 'checkpoint')
          await runtime.store.collection.updateOne(key, { $set: { operations: [reported] } });
        if (boundary === 'resource') {
          const resource = await runtime.resources.claim(resourceKey, key.brandId, 'fixture', 30000);
          assert.ok(resource?.lease);
          const saved = await runtime.resources.journal(
            resourceKey,
            key.brandId,
            resource.lease,
            resource.revision,
            key,
            { ...operation, outcome: 'submitted' }
          );
          await runtime.resources.release(resourceKey, key.brandId, resource.lease, saved.revision);
        }
        const before = await row();
        const resourcesBefore = await runtime.resources.get(resourceKey);
        reconciliationFault = async context => {
          const rejected = () =>
            boundary === 'checkpoint'
              ? context.checkpoint({ acceptedDespiteFailure: true }, [operation.id])
              : boundary === 'resource'
                ? context.withResourceLease(resourceKey.namespace, resourceKey.resourceKey, resource =>
                    resource.journal(reported)
                  )
                : context.journal(reported);
          if (boundary === 'repair') return rejected();
          await assert.rejects(rejected(), /publication_operation_evidence_mismatch:intended_digest/);
          if (boundary === 'replacement-error') throw new Error('Adapter replaced the host refusal');
          // A faulty adapter catches the boundary error and continues with a state-only checkpoint.
          try {
            await context.checkpoint({ acceptedDespiteFailure: true });
          } catch (error) {
            assert.match(String(error), /publication_operation_evidence_mismatch:intended_digest/);
          }
        };
        await assert.rejects(
          command('repair', {
            repair: boundary === 'repair' ? 'caught-reconciliation' : 'reconcile-evidence',
            apply,
            reason: 'Verify caught proof rejection',
          }),
          /publication_operation_evidence_mismatch:intended_digest/
        );
        const saved = await row();
        assert.deepEqual(saved.providerState, before.providerState);
        assert.deepEqual(saved.operations, before.operations);
        assert.deepEqual(saved.work, before.work);
        assert.deepEqual(saved.binding, before.binding);
        assert.equal(saved.completion, undefined);
        assert.equal(remoteWrites, 0);
        const resourcesAfter = await runtime.resources.get(resourceKey);
        assert.deepEqual(resourcesAfter?.operations, resourcesBefore?.operations);
        assert.equal(await client.db(database).collection('publicationcorrection').countDocuments(), 0);
        if (apply) {
          assert.equal(saved.status, 'repair_required');
          assert.equal(saved.operationEvidenceFailures?.[0].field, 'intendedDigest');
          assert.deepEqual(saved.operationEvidenceFailures?.[0].reported, confirmation);
        } else assert.deepEqual(saved, before, 'Caught refusal is still read-only in dry-run');
      });
  for (const boundary of [
    'identity',
    'immutable-evidence',
    'unknown-operation',
    'unconfirmed-checkpoint',
    'invalid-state',
  ] as const)
    for (const apply of [false, true])
      it(`retains a caught ${boundary} journal rejection during ${apply ? 'applied' : 'dry-run'} recovery`, async () => {
        await start();
        const operation = await uncertain();
        const before = await row();
        const errors = {
          identity: /identity cannot change/,
          'immutable-evidence': /evidence cannot be overwritten/,
          'unknown-operation': /Reconciliation cannot submit work/,
          'unconfirmed-checkpoint': /Only confirmed/,
          'invalid-state': /Invalid publication provider state/,
        };
        reconciliationFault = async context => {
          const rejected = () =>
            boundary === 'invalid-state'
              ? context.checkpoint({ invalidState: true })
              : boundary === 'unconfirmed-checkpoint'
                ? context.checkpoint({ acceptedDespiteFailure: true }, [operation.id])
                : context.journal({
                    ...operation,
                    ...(boundary === 'identity' ? { intendedDigest: 'rewritten' } : {}),
                    ...(boundary === 'immutable-evidence'
                      ? { evidence: { ...operation.evidence, [Object.keys(operation.evidence)[0]]: 'rewritten' } }
                      : {}),
                    ...(boundary === 'unknown-operation' ? { id: 'invented' } : {}),
                  });
          await assert.rejects(rejected(), errors[boundary]);
          try {
            await context.checkpoint({ acceptedDespiteFailure: true });
          } catch {}
        };
        await assert.rejects(
          command('repair', {
            repair: 'reconcile-evidence',
            apply,
            reason: 'Verify framework journal refusal',
          }),
          errors[boundary]
        );
        const saved = await row();
        assert.deepEqual(saved.providerState, before.providerState);
        assert.deepEqual(saved.operations, before.operations);
        assert.deepEqual(saved.work, before.work);
        assert.deepEqual(saved.binding, before.binding);
        assert.equal(saved.completion, undefined);
        assert.equal(remoteWrites, 0);
        assert.equal(await client.db(database).collection('publicationcorrection').countDocuments(), 0);
        if (!apply) assert.deepEqual(saved, before);
      });
  for (const finalCheckpoint of [false, true]) {
    it(`${finalCheckpoint ? 'acknowledges' : 'retains'} reconciliation evidence added after an earlier checkpoint`, async () => {
      await start();
      const operation = await uncertain();
      reconciliationFault = async context => {
        const confirmed = {
          ...operation,
          outcome: 'confirmed' as const,
          confirmation: publicationOperationEvidence(await row(), operation),
        };
        await context.journal(confirmed);
        await context.checkpoint({ receipt: 'owned' }, [operation.id]);
        await context.journal({
          ...confirmed,
          evidence: { ...confirmed.evidence, additionalReceipt: 'verified-later' },
        });
        if (finalCheckpoint)
          await context.checkpoint({ receipt: 'owned', additionalReceipt: 'verified-later' }, [operation.id]);
      };
      const before = await row();
      await command('repair', { repair: 'reconcile-evidence' });
      assert.deepEqual(await row(), before, 'Dry-run must not persist acknowledgement or evidence');
      await command('repair', { repair: 'reconcile-evidence', apply: true, reason: 'Verify checkpoint ordering' });
      const saved = await row();
      assert.equal(saved.operations[0].checkpointed, finalCheckpoint ? true : undefined);
      assert.equal(saved.operations[0].evidence.additionalReceipt, 'verified-later');
      assert.deepEqual(
        saved.providerState,
        finalCheckpoint ? { receipt: 'owned', additionalReceipt: 'verified-later' } : { receipt: 'owned' }
      );
      assert.deepEqual(saved.work, before.work);
      assert.equal(saved.completion, undefined);
      assert.equal(remoteWrites, 0);
      const corrections = await client.db(database).collection('publicationcorrection').find().toArray();
      assert.equal(corrections.length, 1);
      assert.equal(corrections[0].status, 'applied');
    });
  }
  for (const action of ['resume', 'revoke', 'repair'] as const) {
    it(`requires an explicit correction reason for ${action}`, async () => {
      await start();
      await assert.rejects(command(action, { apply: true, approvalId: await approvalId(), repair: 'link' }), /reason/);
    });
  }
  it('persists independent destination and brand pauses across service instances without shrinking approval sets', async () => {
    await start();
    const before = await row();
    await command('pause', { oid: undefined, apply: true, reason: 'Destination maintenance' });
    const config = await new TestPublication().runtime().configuration('brand');
    assert.equal(config?.destinations.archive.enabled, false);
    assert.equal(config?.destinations.repository.enabled, true);
    assert.equal(
      Reflect.get(Object(await publication.readiness({ brandId: 'brand', username: 'admin' })), 'paused'),
      true
    );
    await command('resume', { oid: undefined, apply: true, reason: 'Destination verified' });
    assert.equal((await publication.runtime().configuration('brand'))?.destinations.archive.enabled, true);
    await command('pause', { oid: undefined, destinationId: undefined, apply: true, reason: 'Brand maintenance' });
    assert.equal((await publication.runtime().configuration('brand'))?.processing.enabled, false);
    await command('resume', { oid: undefined, destinationId: undefined, apply: true, reason: 'Brand verified' });
    assert.equal((await publication.runtime().configuration('brand'))?.processing.enabled, true);
    assert.deepEqual((await row()).operations, before.operations);
    const record = await mongo.getMeta('record');
    assert.deepEqual(publicationSource(record!.publicationSource).approvals[0].destinationIds, [
      'archive',
      'repository',
    ]);
    const audits = await client.db(database).collection('publicationcorrection').find().toArray();
    assert.equal(audits.length, 4);
    assert.ok(
      audits.every(
        audit =>
          audit.actor.username === 'admin' &&
          audit.actor.userType === 'local' &&
          audit.status === 'applied' &&
          audit.reason
      )
    );
  });
  it('reads retained destination pauses and resumes them with an atomic brand-control decision', async () => {
    await start();
    const control = new PublicationAdminControl(client.db(database));
    await control.collection.insertOne({
      brandId: 'brand',
      destinationId: 'archive',
      paused: true,
      correctionId: 'legacy',
    });
    assert.equal((await publication.runtime().configuration('brand'))?.destinations.archive.enabled, false);
    const token = await control.acquire('brand');
    await control.setPaused('brand', 'archive', false, token, 'current-resume');
    await control.release('brand', token);
    assert.equal((await new TestPublication().runtime().configuration('brand'))?.destinations.archive.enabled, true);
    assert.equal(
      Reflect.get(Object(await publication.readiness({ brandId: 'brand', username: 'admin' })), 'paused'),
      false
    );
    assert.equal((await control.collection.findOne({ brandId: 'brand', destinationId: 'archive' }))?.paused, true);
  });
  for (const destinationId of ['', 'archive'])
    it(`fences a late ${destinationId || 'brand'} resume after administrative ownership changes`, async () => {
      await start();
      let replaceOwner = false;
      const control = new (class extends PublicationAdminControl {
        override async assertOwner(brandId: string, token: string) {
          await super.assertOwner(brandId, token);
          if (replaceOwner) {
            replaceOwner = false;
            await this.collection.updateOne(
              { brandId, destinationId: '', 'lock.token': token },
              { $set: { lock: { token: 'successor', expiresAt: Date.now() + 120000 } } }
            );
          }
        }
      })(client.db(database));
      const token = await control.acquire('brand');
      await control.setPaused('brand', destinationId, true, token, 'original-pause');
      replaceOwner = true;
      await assert.rejects(
        control.setPaused('brand', destinationId, false, token, 'late-resume'),
        /ownership|expired|changed/
      );
      await control.release('brand', 'successor');
      const configuration = await publication.runtime().configuration('brand');
      assert.ok(configuration);
      assert.equal(
        destinationId ? configuration.destinations.archive.enabled : configuration.processing.enabled,
        false
      );
    });
  it('resumes only current approval and preserves uncertain journal, source, binding, receipts and history', async () => {
    await start();
    const op = await uncertain();
    const before = await row();
    await command('resume', { apply: true, reason: 'Retry after transport maintenance' });
    const after = await row();
    assert.deepEqual(after.operations, [op]);
    assert.deepEqual(after.providerState, before.providerState);
    assert.deepEqual(after.source, before.source);
    assert.equal(after.approvalId, before.approvalId);
    assert.ok(after.work.synchronise.requested > before.work.synchronise.requested);
    const audit = await client.db(database).collection('publicationcorrection').findOne({ action: 'resume' });
    assert.equal(audit?.actor.username, 'admin');
    assert.equal(after.correctionReferences[0], audit?.id);
  });
  it('revokes the complete fixed approval set with a new epoch and preserves all recovery evidence', async () => {
    const runtime = await start();
    const op = await uncertain();
    await command('revoke', { approvalId: await approvalId(), apply: true, reason: 'Institution withdrew approval' });
    const record = await mongo.getMeta('record');
    const state = publicationSource(record!.publicationSource);
    assert.ok(state.approvals[0].revokedAt);
    assert.equal(state.approvals[0].epoch, 2);
    assert.ok(Object.values(state.intents).every(intent => !intent.pending));
    assert.deepEqual((await row()).operations, [op]);
    await assert.rejects(
      command('resume', { apply: true, reason: 'Attempt stale authority' }),
      /current unchanged approval/
    );
    const audit = await client.db(database).collection('publicationcorrection').findOne({ action: 'revoke' });
    assert.equal(audit?.actor.username, 'admin');
    assert.equal(audit?.approvalId, state.approvals[0].id);
    assert.equal((await runtime.store.get(key))?.completion, undefined);
  });
  it('refuses revocation while an approved sibling has an active lease', async () => {
    const runtime = await start();
    await runtime.store.claim({ ...key, destinationId: 'repository' }, 'sibling', 120000);
    await assert.rejects(
      command('revoke', { approvalId: await approvalId(), apply: true, reason: 'Incident' }),
      /active publication worker/
    );
  });
  it('never permits binding replacement while operations are uncertain or changes target identity', async () => {
    await start();
    await command('repair', { repair: 'link', apply: true, reason: 'Verified remote owner' });
    await uncertain();
    await assert.rejects(
      command('repair', {
        repair: 'relink',
        parameters: { objectId: 'two' },
        apply: true,
        reason: 'Wrong replacement',
      }),
      /uncertain operations/
    );
    assert.equal((await row()).binding?.objectId, 'one');
    configuration.destinations.archive.providerOptions = { changed: true };
    await assert.rejects(command('repair', { repair: 'not-declared' }), /Unsupported/);
  });
  it('retains uncertain journal entries even if a provider omits them from a repair result', async () => {
    await start();
    const op = await uncertain();
    await command('repair', {
      repair: 'link',
      parameters: { erase: true },
      apply: true,
      reason: 'Verified local checkpoint',
    });
    assert.deepEqual((await row()).operations, [op]);
  });
  it('uses Mongo uniqueness to refuse duplicate bindings across brands', async () => {
    const runtime = await start();
    const other = { ...key, brandId: 'elsewhere', oid: 'other' };
    await runtime.store.initialise(other, 'ledger', 'verified-target');
    await runtime.store.collection.updateOne(other, {
      $set: {
        binding: { namespace: 'ledger:actual', objectId: 'one', targetFingerprint: 'verified-target', evidence: {} },
        remoteNamespace: 'ledger:actual',
        remoteObjectId: 'one',
      },
    });
    await assert.rejects(command('repair', { repair: 'link', apply: true, reason: 'Verified owner' }), /duplicate key/);
    assert.equal((await row()).binding, undefined);
    assert.equal(
      (await client.db(database).collection('publicationcorrection').findOne({ action: 'repair' }))?.status,
      'interrupted'
    );
  });
  it('rechecks identity and record content after slow provider verification', async () => {
    const runtime = await start();
    repairFault = async () => {
      disabled = true;
    };
    await assert.rejects(
      command('repair', { repair: 'link', apply: true, reason: 'Verified binding' }),
      /current administrator/
    );
    disabled = false;
    repairFault = async () => {
      await mongo.recordCol.updateOne({ redboxOid: 'record' }, { $inc: { 'publicationSource.revision': 1 } });
    };
    await assert.rejects(
      command('repair', { repair: 'link', apply: true, reason: 'Verified binding' }),
      /source changed/
    );
    assert.equal((await runtime.store.get(key))?.binding, undefined);
  });
  it('refuses shared resource ownership, including another brand managing the same namespace', async () => {
    const runtime = await start();
    await runtime.store.collection.updateOne(key, { $set: { remoteNamespace: 'ledger:actual' } });
    await runtime.resources.claim(
      { providerId: 'ledger', namespace: 'ledger:actual', resourceKey: 'repository' },
      'other-brand',
      'active-resource',
      120000
    );
    await assert.rejects(
      command('repair', { repair: 'link', apply: true, reason: 'Incident repair' }),
      /active publication resource/
    );
  });
  it('fences workers during an administrative operation and releases the gate after refusal', async () => {
    const runtime = await start();
    repairFault = async () => {
      assert.equal((await runtime.configuration('brand'))?.processing.enabled, false);
      throw new Error('verification failed');
    };
    await assert.rejects(
      command('repair', { repair: 'link', apply: true, reason: 'Incident repair' }),
      /verification failed/
    );
    assert.equal((await runtime.configuration('brand'))?.processing.enabled, true);
    assert.equal((await row()).lease, null);
    const control = new PublicationAdminControl(client.db(database));
    const lock = await control.acquire('brand');
    await assert.rejects(
      command('resume', { apply: true, reason: 'Competing administrator' }),
      /administration is already active/
    );
    await control.release('brand', lock);
  });
  it('exercises the shared CLI parser, dry-run/apply, access denial and shutdown against actual Mongo helpers', async () => {
    await start();
    const cli = require(resolve(__dirname, '../../../../support/publication/admin.js'));
    let closed = 0;
    const load = async () => ({
      service: publication,
      close: async () => {
        closed++;
      },
    });
    const args = ['resume', '--brand', 'brand', '--username', 'admin', '--oid', 'record', '--destination', 'archive'];
    const before = await row();
    await cli.main(args, load, () => {});
    assert.deepEqual(await row(), before);
    await assert.rejects(
      cli.main([...args, '--apply'], load, () => {}),
      /--reason/
    );
    await cli.main([...args, '--apply', '--reason', 'CLI verified recovery'], load, () => {});
    assert.equal(
      (await client.db(database).collection('publicationcorrection').findOne({ action: 'resume' }))?.reason,
      'CLI verified recovery'
    );
    adminBrand = 'another';
    await assert.rejects(
      cli.main(args, load, () => {}),
      /current administrator/
    );
    assert.equal(closed, 3);
    const entry = resolve(__dirname, '../../../../support/publication/admin.js');
    assert.equal(spawnSync(process.execPath, [entry, '--help'], { encoding: 'utf8' }).status, 0);
    const invalid = spawnSync(process.execPath, [entry, ...args, '--apply'], { encoding: 'utf8' });
    assert.equal(invalid.status, 1);
    assert.match(invalid.stderr, /--reason/);
  });
  it('runs the actual CLI executable in a separate process with production services, real Mongo and the queue-disabled loader boundary', async () => {
    await start();
    const entry = resolve(__dirname, '../../../../support/publication/admin.js');
    const preload = resolve(__dirname, '../fixtures/publication-admin-cli.cjs');
    const marker = join(directory, `closed-${randomUUID()}`);
    const env = {
      ...process.env,
      PUB15_CLI_CONFIGURATION: JSON.stringify(configuration),
      PUB15_CLI_DATABASE: database,
      PUB15_CLI_CLOSED: marker,
    };
    const args = [
      '--require',
      preload,
      entry,
      'resume',
      '--brand',
      'brand',
      '--username',
      'admin',
      '--oid',
      'record',
      '--destination',
      'archive',
    ];
    const before = await row();
    const dry = spawnSync(process.execPath, args, { encoding: 'utf8', env, timeout: 30000 });
    assert.equal(dry.status, 0, dry.stderr);
    assert.equal(JSON.parse(dry.stdout).dryRun, true);
    assert.deepEqual(await row(), before);
    assert.equal(await readFile(marker, 'utf8'), 'closed');
    const applied = spawnSync(process.execPath, [...args, '--apply', '--reason', 'Executable recovery verified'], {
      encoding: 'utf8',
      env,
      timeout: 30000,
    });
    assert.equal(applied.status, 0, applied.stderr);
    assert.equal(JSON.parse(applied.stdout).applied, true);
    const audit = await client
      .db(database)
      .collection('publicationcorrection')
      .findOne({ reason: 'Executable recovery verified' });
    assert.equal(audit?.actor.username, 'admin');
    const denied = spawnSync(
      process.execPath,
      args.map(value => (value === 'admin' ? 'foreign-admin' : value)),
      { encoding: 'utf8', env, timeout: 30000 }
    );
    assert.equal(denied.status, 1);
    assert.match(denied.stderr, /current administrator/);
    assert.equal(await readFile(marker, 'utf8'), 'closed');
  });
  it('forwards existing Figshare command names through the CLI to declared provider repairs', async () => {
    await start();
    const cli = require(resolve(__dirname, '../../../../support/figshare/admin.js'));
    await cli.main(
      [
        'link',
        '--username',
        'admin',
        '--brand',
        'brand',
        '--oid',
        'record',
        '--destination',
        'archive',
        '--article-id',
        'one',
        '--apply',
        '--reason',
        'Legacy command verified binding',
      ],
      async () => ({ service: publication, close: async () => {} }),
      () => {}
    );
    assert.equal((await row()).binding?.objectId, 'one');
    const audit = await client.db(database).collection('publicationcorrection').findOne({ action: 'repair' });
    assert.equal(audit?.repair, 'link');
    assert.equal(audit?.actor.username, 'admin');
  });
  async function setupProvider(id: 'figshare' | 'oni') {
    configuration.sourcePolicies = [];
    configuration.destinations = {
      archive: {
        provider: id,
        displayName: id,
        enabled: true,
        archived: false,
        connection:
          id === 'figshare'
            ? { baseUrl: url, accountId: '1', token: 'test-token' }
            : {
                publicUrl: 'https://data.example.test',
                useCleanUrl: true,
                storage: {
                  driver: 'flydrive',
                  diskName: 'repository',
                  prefix: `pub15-${randomUUID()}`,
                  rootPath: '/objects',
                  workspacePath: '/workspace',
                  tempDir: '/unused',
                  keyEncoding: 'flydrive',
                },
                ingestion: {
                  enabled: true,
                  apiUrl: url,
                  adminToken: 'test-token',
                  pollIntervalMs: 1,
                  timeoutMs: 1000,
                  forceReindex: false,
                },
              },
        mapping: {},
        attachments: {},
        providerOptions: id === 'figshare' ? {} : { rootCollection: { targetRepoNamespace: 'test_repo' } },
        writeBack:
          id === 'figshare'
            ? {}
            : {
                citationUrlPath: 'metadata.citation_url',
                citationDoiPath: 'metadata.citation_doi',
                publicationErrorPath: 'metadata.publication_error',
              },
      },
    };
    const response = await records.create(
      brand,
      {
        redboxOid: 'record',
        metadata: { title: 'Recovery source' },
        authorization: { edit: ['admin', 'approver'], editRoles: [], view: [], viewRoles: [] },
      },
      { name: 'dataPublication', searchable: false, hooks: {} },
      { username: 'approver', type: 'local', roles: [] },
      false,
      false
    );
    assert.equal(response.isComplete(), true, JSON.stringify(response));
    const runtime = publication.runtime();
    const providers = publication.getProviders();
    const version = providers.find(provider => provider.id === id)!.stateVersion;
    // The real configuration resolver verifies the actual backend/target through the fixture's authority seam.
    const config = await runtime.configuration('brand');
    assert.ok(config);
    const registry = Reflect.get(publication, 'providerRegistry');
    const fingerprint: string = registry.get(id).targetFingerprint(config.destinations.archive);
    await runtime.store.ensureIndexes();
    await runtime.resources.ensureIndexes();
    await runtime.store.initialise(key, id, fingerprint, version);
    return runtime;
  }
  async function figshareSeed(binding = true) {
    const runtime = await setupProvider('figshare');
    const legacy = emptyFigshareEvidence('record', 'brand');
    if (binding) {
      legacy.binding = { namespace: url, accountId: '1', ownerId: '1', articleId: '51' };
      legacy.namespace = url;
      legacy.articleId = '51';
      await runtime.store.collection.updateOne(key, {
        $set: {
          binding: {
            namespace: url,
            objectId: '51',
            targetFingerprint: (await row()).targetFingerprint,
            evidence: { ownerId: '1' },
          },
          remoteNamespace: url,
          remoteObjectId: '51',
        },
      });
    }
    await runtime.store.collection.updateOne(key, { $set: { providerState: { legacy: figshareJson(legacy) } } });
    return { runtime, legacy };
  }
  async function saveFigshare(legacy: ReturnType<typeof emptyFigshareEvidence>, operation?: PublicationOperation) {
    await publication.runtime().store.collection.updateOne(key, {
      $set: { providerState: { legacy: figshareJson(legacy) }, ...(operation ? { operations: [operation] } : {}) },
    });
  }
  const providerOperation = (kind: string, evidence: PublicationObject = {}): PublicationOperation => ({
    id: randomUUID(),
    kind,
    approvalId: 'historical',
    approvalEpoch: 1,
    sourceGeneration: 1,
    intendedDigest: 'intended',
    submittedAt: '2026-10-19T00:00:00Z',
    outcome: 'uncertain',
    evidence,
  });
  async function correction(repair: string, parameters: PublicationObject = {}) {
    await command('repair', { repair, parameters, apply: true, reason: `Operator verified ${repair}` });
    const audit = await client.db(database).collection('publicationcorrection').findOne({ repair });
    assert.equal(audit?.actor.username, 'admin');
    assert.equal(audit?.status, 'applied');
    assert.equal(audit?.reason, `Operator verified ${repair}`);
    assert.equal((await row()).completion, undefined);
    assert.equal(remoteWrites, 0);
    return audit;
  }
  it('verifies Figshare link and relink without manufacturing completion, and retains previous binding evidence', async () => {
    await figshareSeed(false);
    await correction('link', { articleId: '51', ownerId: '1' });
    assert.equal((await row()).binding?.objectId, '51');
    article.id = 52;
    await correction('relink', { articleId: '52', ownerId: '1' });
    assert.equal((await row()).binding?.objectId, '52');
    assert.ok(Array.isArray((await row()).providerState.retiredBindings));
  });
  for (const retainedLegacy of [false, true]) {
    it(`verifies a migrated shared-only Figshare binding with ${retainedLegacy ? 'legacy' : 'empty'} provider evidence`, async () => {
      const { runtime } = await figshareSeed();
      const before = await row();
      const legacy = emptyFigshareEvidence(key.oid, key.brandId);
      await runtime.store.collection.updateOne(key, {
        $set: {
          providerState: retainedLegacy ? { legacy: figshareJson(legacy) } : {},
          binding: {
            ...before.binding!,
            evidence: { historical: true, migrationId: 'migration-v1:fixture' },
          },
        },
      });
      const historical = await row();
      const parameters = { articleId: '51', ownerId: '1' };
      for (const repair of ['link', 'relink'])
        assert.equal(Reflect.get(Object(await command('repair', { repair, parameters })), 'dryRun'), true);
      for (const apply of [false, true]) {
        for (const repair of ['link', 'relink'])
          await assert.rejects(
            command('repair', {
              repair,
              parameters: { ...parameters, articleId: '52' },
              apply,
              reason: 'Retain the historical shared object',
            }),
            /binding evidence disagree/
          );
        await assert.rejects(
          command('repair', {
            repair: 'link',
            parameters: { ...parameters, ownerId: '999' },
            apply,
            reason: 'Refuse a different remote owner',
          }),
          /identity does not match/
        );
      }
      assert.deepEqual((await row()).providerState, historical.providerState);
      assert.deepEqual((await row()).binding, historical.binding);
      await runtime.store.collection.updateOne(key, { $set: { 'binding.evidence.ownerId': '1' } });
      article.account_id = 2;
      for (const apply of [false, true])
        await assert.rejects(
          command('repair', {
            repair: 'link',
            parameters: { ...parameters, ownerId: '2' },
            apply,
            reason: 'Retain the verified historical owner',
          }),
          /cannot transfer/
        );
      article.account_id = 1;
      const uncertain = providerOperation('figshare:metadata');
      await runtime.store.collection.updateOne(key, { $set: { operations: [uncertain] } });
      for (const apply of [false, true])
        await assert.rejects(
          command('repair', {
            repair: 'link',
            parameters,
            apply,
            reason: 'Retain the unresolved historical operation',
          }),
          /Reconcile uncertain operations/
        );
      assert.deepEqual((await row()).operations, [uncertain]);
      await runtime.store.collection.updateOne(key, { $set: { operations: historical.operations } });
      await correction('link', parameters);
      const linked = await row();
      assert.equal(linked.binding?.objectId, historical.binding?.objectId);
      assert.equal(linked.binding?.namespace, historical.binding?.namespace);
      assert.equal(linked.binding?.targetFingerprint, historical.binding?.targetFingerprint);
      assert.ok(isPublicationObject(linked.providerState.legacy));
      assert.deepEqual(linked.providerState.legacy.binding, {
        namespace: url,
        accountId: '1',
        ownerId: '1',
        articleId: '51',
      });
      assert.deepEqual(linked.operations, historical.operations);
      assert.deepEqual(linked.work, historical.work);
      assert.equal(linked.source, null);
      assert.equal(linked.approvalId, '');
      await correction('link', parameters);
      assert.deepEqual((await row()).operations, linked.operations);
      assert.equal(remoteWrites, 0);
    });
  }
  it('refuses Figshare account/owner replacement and receipt-bearing relinks', async () => {
    const { legacy } = await figshareSeed();
    await assert.rejects(
      command('repair', { repair: 'link', parameters: { articleId: '51', ownerId: '999' } }),
      /identity does not match/
    );
    legacy.receipts = [
      {
        key: 'owned',
        localId: 'one',
        digest: 'sha',
        md5: 'abcd',
        size: 4,
        name: 'same-name',
        articleId: '51',
        fileId: '11',
        kind: 'hosted',
        state: 'available',
        desired: true,
      },
    ];
    await saveFigshare(legacy);
    await assert.rejects(command('repair', { repair: 'relink', parameters: { articleId: '52' } }), /managed receipts/);
    article.account_id = 2;
    await assert.rejects(
      command('repair', { repair: 'link', parameters: { articleId: '51' } }),
      /identity does not match|transfer/
    );
  });
  it('retains retired create evidence and journal; abandonment requires settled-operation proof and exact-token absence', async () => {
    const { legacy } = await figshareSeed(false);
    legacy.create = {
      token: 'create-nonce',
      binding: { namespace: url, accountId: '1', ownerId: '1' },
      startedAt: '2026-10-19T00:00:00Z',
      outcome: 'uncertain',
    };
    const op = providerOperation('figshare:create', { token: 'create-nonce' });
    await saveFigshare(legacy, op);
    await assert.rejects(command('repair', { repair: 'abandon-create' }), /settlement evidence/);
    visibleToken = 'create-nonce';
    article.title = 'ReDBox draft create-nonce';
    const proof = { priorOperationSettled: true, evidenceReference: 'incident:transport-settled' };
    await assert.rejects(command('repair', { repair: 'abandon-create', parameters: proof }), /exact create token/);
    visibleToken = undefined;
    await correction('abandon-create', proof);
    const saved = await row();
    assert.equal(saved.operations[0].id, op.id);
    assert.equal(saved.operations[0].outcome, 'not_applied');
    assert.ok(Array.isArray(saved.providerState.retiredCreates));
  });
  for (const boundary of ['before-journal', 'not-applied'] as const) {
    it(`abandons a create stopped ${boundary} while retaining exact token evidence`, async () => {
      const { legacy } = await figshareSeed(false);
      legacy.create = {
        token: 'stopped-create',
        binding: { namespace: url, accountId: '1', ownerId: '1' },
        startedAt: '2026-10-19T00:00:00Z',
        outcome: 'submitted',
      };
      const op = providerOperation('figshare:create', { token: legacy.create.token });
      op.outcome = 'not_applied';
      await saveFigshare(legacy, boundary === 'not-applied' ? op : undefined);
      const before = (await row()).operations;
      const proof = { priorOperationSettled: true, evidenceReference: `incident:create-${boundary}` };
      await assert.rejects(command('repair', { repair: 'abandon-create' }), /settlement evidence/);
      visibleToken = legacy.create.token;
      article.title = `ReDBox draft ${legacy.create.token}`;
      await assert.rejects(command('repair', { repair: 'abandon-create', parameters: proof }), /exact create token/);
      visibleToken = undefined;
      if (boundary === 'before-journal') {
        legacy.create.outcome = 'uncertain';
        await saveFigshare(legacy);
        await assert.rejects(command('repair', { repair: 'abandon-create', parameters: proof }), /journal/);
        legacy.create.outcome = 'submitted';
        await saveFigshare(legacy);
      } else {
        op.outcome = 'confirmed';
        await saveFigshare(legacy, op);
        await assert.rejects(command('repair', { repair: 'abandon-create', parameters: proof }), /journal/);
        op.outcome = 'not_applied';
        await saveFigshare(legacy, op);
      }
      await correction('abandon-create', proof);
      const saved = await row();
      assert.equal(saved.operations.length, before.length);
      if (boundary === 'not-applied') {
        assert.equal(saved.operations[0].id, op.id);
        assert.equal(saved.operations[0].outcome, 'not_applied');
      }
      assert.deepEqual(saved.providerState.retiredCreates, [figshareJson(legacy.create)]);
      assert.equal(decodeFigshareLegacy(saved.providerState.legacy).create, undefined);
    });
  }

  it('retains retired publication evidence and refuses reset on uncertain visibility or curation', async () => {
    const { legacy } = await figshareSeed();
    legacy.publish = {
      generation: 1,
      hash: 'payload',
      previousVersion: 1,
      outcome: 'uncertain',
      submittedAt: '2026-10-19T00:00:00Z',
    };
    const op = providerOperation('figshare:publish');
    await saveFigshare(legacy, op);
    await assert.rejects(command('repair', { repair: 'reset-publish' }), /settlement evidence/);
    const proof = { priorOperationSettled: true, evidenceReference: 'incident:publish-settled' };
    article.is_public = true;
    await assert.rejects(
      command('repair', { repair: 'reset-publish', parameters: proof }),
      /published or under curation/
    );
    article.is_public = false;
    await correction('reset-publish', proof);
    const saved = await row();
    assert.equal(saved.operations[0].id, op.id);
    assert.ok(Array.isArray(saved.providerState.retiredPublications));
  });
  it('resets an accepted private publication only with settlement proof while retaining its acknowledged journal', async () => {
    const { legacy } = await figshareSeed();
    legacy.publish = {
      generation: 1,
      hash: 'payload',
      previousVersion: 1,
      outcome: 'accepted',
      submittedAt: '2026-10-19T00:00:00Z',
    };
    const op = providerOperation('figshare:publish', { acknowledged: true });
    op.outcome = 'confirmed';
    await saveFigshare(legacy, op);
    await assert.rejects(command('repair', { repair: 'reset-publish' }), /settlement evidence/);
    const proof = { priorOperationSettled: true, evidenceReference: 'incident:accepted-publish-settled' };
    await correction('reset-publish', proof);
    const saved = await row();
    assert.equal(saved.operations[0].id, op.id);
    assert.equal(saved.operations[0].outcome, 'confirmed');
    assert.equal(saved.operations[0].evidence.acknowledged, true);
    assert.equal(saved.operations[0].evidence.administratorSettlementReference, proof.evidenceReference);
    assert.equal(saved.operations[0].evidence.verifiedPrivate, true);
    assert.deepEqual(saved.providerState.retiredPublications, [figshareJson(legacy.publish)]);
    assert.equal(decodeFigshareLegacy(saved.providerState.legacy).publish, undefined);
  });
  for (const boundary of ['before-journal', 'not-applied'] as const) {
    it(`settles a private publication stopped ${boundary} without inventing or regressing a journal`, async () => {
      const { legacy } = await figshareSeed();
      legacy.publish = {
        generation: 1,
        hash: 'payload',
        previousVersion: 1,
        outcome: 'submitted',
        submittedAt: '2026-10-19T00:00:00Z',
      };
      const op = providerOperation('figshare:publish');
      op.outcome = 'not_applied';
      await saveFigshare(legacy, boundary === 'not-applied' ? op : undefined);
      const before = (await row()).operations;
      const proof = { priorOperationSettled: true, evidenceReference: `incident:${boundary}` };
      await assert.rejects(command('repair', { repair: 'reset-publish' }), /settlement evidence/);
      if (boundary === 'before-journal') {
        for (const outcome of ['accepted', 'uncertain'] as const) {
          legacy.publish.outcome = outcome;
          await saveFigshare(legacy);
          await assert.rejects(command('repair', { repair: 'reset-publish', parameters: proof }), /journal evidence/);
        }
        legacy.publish.outcome = 'submitted';
        await saveFigshare(legacy);
      }
      await correction('reset-publish', proof);
      const saved = await row();
      assert.equal(saved.operations.length, before.length);
      if (boundary === 'not-applied') {
        assert.equal(saved.operations[0].id, op.id);
        assert.equal(saved.operations[0].outcome, 'not_applied');
      }
      assert.equal(decodeFigshareLegacy(saved.providerState.legacy).publish, undefined);
      assert.ok(Array.isArray(saved.providerState.retiredPublications));
    });
  }

  for (const repair of ['bind-file', 'resume-upload']) {
    it(`verifies Figshare ${repair} using the original owned receipt and audits the correction`, async () => {
      const { legacy } = await figshareSeed();
      legacy.receipts = [
        {
          key: 'owned',
          localId: 'one',
          digest: 'sha',
          md5: 'abcd',
          size: 4,
          name: 'same-name',
          articleId: '51',
          kind: 'hosted',
          state: 'initialising',
          desired: true,
        },
      ];
      await saveFigshare(legacy);
      const parameters = {
        receipt: 'owned',
        fileId: '11',
        priorOperationSettled: true,
        evidenceReference: 'incident:uploader-settled',
      };
      await assert.rejects(
        command('repair', { repair, parameters: { ...parameters, receipt: 'foreign' } }),
        /existing owned receipt/
      );
      file.computed_md5 = 'wrong';
      file.supplied_md5 = 'wrong';
      await assert.rejects(command('repair', { repair, parameters }), /checksum/);
      file.computed_md5 = 'abcd';
      file.supplied_md5 = 'abcd';
      if (repair === 'resume-upload') file.status = 'created';
      await correction(repair, parameters);
      const state = (await row()).providerState;
      assert.ok(isPublicationObject(state.legacy));
      const receipts = state.legacy.receipts;
      assert.ok(Array.isArray(receipts));
      assert.ok(isPublicationObject(receipts[0]));
      assert.equal(receipts[0].digest, 'sha');
      assert.equal(receipts[0].key, 'owned');
      assert.equal(receipts[0].fileId, '11');
    });
  }
  async function oniSeed() {
    const runtime = await setupProvider('oni');
    const destination = configuration.destinations.archive;
    const namespace = oniRepositoryIdentity(destination);
    const config = oniDestinationConfiguration(destination);
    const repository = createOniRepository(
      config,
      config.sites.publication,
      {
        getDatastream: async () => {
          throw new Error('No attachments');
        },
      },
      undefined,
      undefined,
      namespace
    );
    await repository.ensureStorageRoot();
    const prior = await repository.readObject('target-object');
    const desired = createOniOcflDesiredContent('ro-crate-metadata.json', [
      { logicalPath: 'ro-crate-metadata.json', size: 2, sha256: sha256('{}') },
    ]);
    const op = providerOperation('oni.commit', { namespace, prior: oniJson(prior), desired: oniJson(desired) });
    op.intendedDigest = desired.digest;
    await runtime.store.collection.updateOne(key, {
      $set: { operations: [op], providerState: { request: 'historical' } },
    });
    return { runtime, op, namespace, repository, config, prior, desired };
  }
  it('reconciles Oni unchanged OCFL with explicit settled-writer evidence on real filesystem and retains the operation', async () => {
    const { op } = await oniSeed();
    await assert.rejects(
      command('repair', { repair: 'reconcile-ocfl', parameters: { operationId: op.id } }),
      /further investigation/
    );
    await correction('reconcile-ocfl', {
      operationId: op.id,
      priorOperationSettled: true,
      evidenceReference: 'incident:ocfl-writer-drained',
    });
    assert.equal((await row()).operations[0].outcome, 'not_applied');
    assert.deepEqual((await row()).operations[0].evidence.prior, op.evidence.prior);
  });
  for (const kind of ['ocfl', 'ingestion'] as const) {
    it(`replays a settled Oni ${kind} correction after a lost administrative acknowledgement`, async () => {
      const { runtime, op, namespace } = await oniSeed();
      const parameters: PublicationObject = {
        operationId: op.id,
        priorOperationSettled: true,
        evidenceReference: 'incident:exact-operation-settled',
      };
      if (kind === 'ingestion') {
        op.kind = 'oni.index.structural';
        op.evidence = { namespace, depositInventory: 'a'.repeat(64) };
        const confirmed = {
          schemaVersion: 1,
          kind: 'present',
          objectId: 'object',
          storageIdentity: namespace,
          head: 'v1',
          inventoryDigest: 'a'.repeat(64),
          versionInventoryDigests: { v1: 'a'.repeat(64) },
          content: oniJson(
            createOniOcflDesiredContent('ro-crate-metadata.json', [
              { logicalPath: 'ro-crate-metadata.json', size: 2, sha256: sha256('{}') },
            ])
          ),
        };
        await runtime.store.collection.updateOne(key, {
          $set: { operations: [op], providerState: { request: 'historical', confirmed } },
        });
        parameters.acknowledgementVerified = true;
        parameters.acceptedAt = '2026-10-19T00:01:00Z';
      }
      const repair = `reconcile-${kind}`;
      const beforeRepair = await row();
      const unsupported =
        kind === 'ocfl' ? (['rejected', 'confirmed'] as const) : (['rejected', 'not_applied'] as const);
      for (const outcome of unsupported) {
        await runtime.store.collection.updateOne(key, { $set: { operations: [{ ...op, outcome }] } });
        for (const apply of [false, true])
          await assert.rejects(
            command('repair', { repair, parameters, apply, reason: 'Reject inconsistent terminal evidence' }),
            /recoverable|contradicts/
          );
        assert.deepEqual((await row()).operations, [{ ...op, outcome }]);
      }
      await runtime.store.collection.updateOne(key, { $set: { operations: beforeRepair.operations } });
      if (kind === 'ingestion') {
        await runtime.store.collection.updateOne(key, { $set: { operations: [{ ...op, kind: 'oni.index.future' }] } });
        for (const apply of [false, true])
          await assert.rejects(
            command('repair', { repair, parameters, apply, reason: 'Reject unknown index operation' }),
            /acknowledgement/
          );
        assert.equal((await row()).operations[0].kind, 'oni.index.future');
        await runtime.store.collection.updateOne(key, { $set: { operations: beforeRepair.operations } });
      }
      await correction(repair, parameters);
      const before = await row();
      assert.equal(Reflect.get(Object(await command('repair', { repair, parameters })), 'dryRun'), true);
      await correction(repair, parameters);
      const after = await row();
      assert.deepEqual(after.operations, before.operations);
      assert.deepEqual(after.providerState, before.providerState);
      assert.deepEqual(after.work, before.work);
      assert.equal(after.completion, undefined);
      assert.equal(remoteWrites, 0);
    });
  }
  for (const kind of ['create', 'publish'] as const)
    for (const checkpointed of [false, true]) {
      it(`reconciles migrated Figshare ${kind} ${checkpointed ? 'checkpointed' : 'intent'} evidence without a sealed approval or new authority`, async () => {
        const { legacy } = await figshareSeed(kind === 'publish');
        const op = providerOperation(`figshare:${kind}`, { historical: true });
        if (kind === 'create') {
          legacy.create = {
            token: 'migrated-create',
            binding: { namespace: url, accountId: '1', ownerId: '1' },
            startedAt: op.submittedAt,
            outcome: 'uncertain',
          };
          op.evidence.token = legacy.create.token;
          visibleToken = legacy.create.token;
          article.title = `ReDBox draft ${visibleToken}`;
        } else {
          legacy.publish = {
            generation: 1,
            hash: 'old-payload',
            previousVersion: 1,
            submittedAt: op.submittedAt,
            outcome: 'uncertain',
          };
          article.is_public = true;
          article.published_date = '2026-10-19T00:01:00Z';
          article.version = 2;
        }
        if (checkpointed) {
          if (kind === 'create') {
            legacy.binding = { ...legacy.create!.binding, articleId: '51' };
            legacy.create!.verifiedId = '51';
            legacy.create!.outcome = 'confirmed';
          } else legacy.publish!.outcome = 'observed';
        }
        await saveFigshare(legacy, op);
        const before = await row();
        assert.equal(before.source, null);
        if (kind === 'create' && checkpointed) article.id = 52;
        else if (kind === 'create') visibleToken = undefined;
        else article.is_public = false;
        for (const apply of [false, true])
          await assert.rejects(
            command('repair', { repair: 'reconcile-evidence', apply, reason: 'Keep uncertain historical evidence' }),
            /exact token|remains uncertain|owner identity/
          );
        assert.deepEqual((await row()).operations, before.operations);
        if (kind === 'create') visibleToken = 'migrated-create';
        else article.is_public = true;
        article.id = 51;
        article.account_id = 2;
        await assert.rejects(command('reconcile'), /owner/);
        article.account_id = 1;
        const report = await command('reconcile');
        assert.equal(Reflect.get(Object(report), 'readOnly'), true);
        assert.deepEqual(
          (await row()).operations,
          before.operations,
          'read-only reconciliation must not persist its proposal'
        );
        await correction('reconcile-evidence');
        const after = await row();
        assert.equal(after.operations[0].id, op.id);
        assert.equal(after.operations[0].outcome, 'confirmed');
        assert.equal(after.binding?.objectId, '51');
        assert.equal(after.source, null);
        assert.equal(after.approvalId, '');
        assert.deepEqual(after.work, before.work);
        await correction('reconcile-evidence');
        assert.deepEqual((await row()).operations, after.operations);
        assert.equal(remoteWrites, 0);
      });
    }
  it('retains source-less historical content operations that cannot be verified against an approved payload', async () => {
    const { legacy } = await figshareSeed();
    const op = providerOperation('figshare:metadata', { historical: true, metadataHash: 'unavailable' });
    await saveFigshare(legacy, op);
    for (const apply of [false, true])
      await assert.rejects(
        command('repair', { repair: 'reconcile-evidence', apply, reason: 'Keep unavailable historical payload' }),
        /approved content/
      );
    assert.deepEqual((await row()).operations, [op]);
    assert.equal((await row()).completion, undefined);
    assert.equal(remoteWrites, 0);
  });
  it('repairs Oni indexing only from an exact externally verified acknowledgement, never old readiness', async () => {
    const { runtime, namespace } = await oniSeed();
    const op = providerOperation('oni.index.structural', { namespace, depositInventory: 'a'.repeat(64) });
    const confirmed = {
      schemaVersion: 1,
      kind: 'present',
      objectId: 'object',
      storageIdentity: namespace,
      head: 'v1',
      inventoryDigest: 'a'.repeat(64),
      versionInventoryDigests: { v1: 'a'.repeat(64) },
      content: oniJson(
        createOniOcflDesiredContent('ro-crate-metadata.json', [
          { logicalPath: 'ro-crate-metadata.json', size: 2, sha256: 'a'.repeat(64) },
        ])
      ),
    };
    await runtime.store.collection.updateOne(key, {
      $set: { operations: [op], providerState: { request: 'historical', confirmed } },
    });
    await assert.rejects(
      command('repair', { repair: 'reconcile-ingestion', parameters: { operationId: op.id, ready: true } }),
      /acknowledgement/
    );
    await correction('reconcile-ingestion', {
      operationId: op.id,
      acknowledgementVerified: true,
      acceptedAt: '2026-10-19T00:01:00Z',
      evidenceReference: 'repository-log:rebuild-accepted',
    });
    const saved = await row();
    assert.equal(saved.operations[0].outcome, 'confirmed');
    assert.equal(saved.providerState.ingestion, undefined);
    assert.equal(saved.providerState.projection, undefined);
  });
  it('persists adapter read-back checkpoints for revoked historical work without resuming mutations or workflow', async () => {
    await start();
    const op = await uncertain();
    await command('revoke', { approvalId: await approvalId(), apply: true, reason: 'Institution revoked request' });
    const before = await row();
    await correction('reconcile-evidence');
    const saved = await row();
    assert.deepEqual(saved.providerState, { reconciled: true });
    assert.deepEqual(saved.operations, [op]);
    assert.deepEqual(saved.work, before.work);
    assert.equal(saved.workflowPending, before.workflowPending);
    await assert.rejects(command('resume'), /current unchanged approval/);
  });
  it('keeps evidence and source quarantine visible to inspection after configuration failure', async () => {
    await start();
    const source = publicationSource((await mongo.getMeta('record')).publicationSource);
    await client
      .db(database)
      .collection('record')
      .updateOne(
        { redboxOid: 'record' },
        {
          $set: {
            'publicationSource.saves': [
              ...source.saves,
              {
                token: 'quarantined-save',
                outcome: 'quarantined',
                sourceRevision: source.revision,
                requestedAt: new Date().toISOString(),
                recordDigest: 'unverified-interrupted-save',
                intents: Object.values(source.intents),
              },
            ],
          },
        }
      );
    configuration.processing.leaseMs = 1;
    const result = await command('inspect');
    assert.equal(Reflect.get(Object(result), 'configurationAvailable'), false);
    const saves = Reflect.get(Object(result), 'saves');
    assert.ok(Array.isArray(saves));
    assert.deepEqual(
      saves.find(save => save.token === 'quarantined-save'),
      {
        token: 'quarantined-save',
        outcome: 'quarantined',
        sourceRevision: source.revision,
        destinations: ['archive', 'repository'],
      }
    );
  });
  it('refuses brand corrections without edit access to affected records', async () => {
    await start();
    editAllowed = false;
    await assert.rejects(
      command('pause', { oid: undefined, destinationId: undefined, apply: true, reason: 'Maintenance' }),
      /current administrator/
    );
  });
  it('refuses a changed Figshare target instead of repointing an existing destination', async () => {
    await figshareSeed();
    configuration.destinations.archive.connection.accountId = '2';
    await assert.rejects(
      command('repair', { repair: 'link', parameters: { articleId: '51' } }),
      /target identity changed/
    );
  });
  it('refuses Oni corrections under another brand repository owner before any operation or binding exists', async () => {
    const runtime = await setupProvider('oni');
    const namespace = oniRepositoryIdentity(configuration.destinations.archive);
    await runtime.resources.claim(
      { providerId: 'oni', namespace, resourceKey: 'repository' },
      'elsewhere',
      'repository-worker',
      120000
    );
    for (const action of ['pause', 'resume'] as const)
      await assert.rejects(
        command(action, { oid: undefined, apply: true, reason: 'Maintenance' }),
        /active publication resource/
      );
    await assert.rejects(
      command('repair', { repair: 'reconcile-ocfl', apply: true, reason: 'Incident' }),
      /active publication resource/
    );
  });
  it('confirms a matching Oni OCFL deposit from real stored content without another version or fabricated completion', async () => {
    const { runtime, op, repository, prior, desired } = await oniSeed();
    await repository.writeDatasetObject(
      {
        rootId: 'target-object',
        rootCollectionId: 'root',
        dataRecordOid: 'record',
        datasetUrl: 'https://data.example.test/object',
        attachments: [],
        crateJson: {},
      },
      {
        oid: 'record',
        record: { redboxOid: 'record', metaMetadata: { brandId: 'brand' }, metadata: {} },
        options: {},
        user: {},
        creator: {},
      }
    );
    await runtime.store.collection.updateOne(key, {
      $set: {
        providerState: {
          request: 'historical',
          submitted: { operationId: op.id, prior: oniJson(prior), desired: oniJson(desired) },
        },
      },
    });
    const before = await repository.readObject('target-object');
    await correction('reconcile-ocfl', { operationId: op.id });
    const saved = await row();
    assert.equal(saved.operations[0].outcome, 'confirmed');
    assert.ok(isPublicationObject(saved.providerState.confirmed));
    assert.equal(saved.providerState.confirmed.head, 'v1');
    assert.deepEqual(await repository.readObject('target-object'), before);
    const settled = await row();
    assert.equal(
      Reflect.get(
        Object(await command('repair', { repair: 'reconcile-ocfl', parameters: { operationId: op.id } })),
        'dryRun'
      ),
      true
    );
    await correction('reconcile-ocfl', { operationId: op.id });
    assert.deepEqual((await row()).operations, settled.operations);
    assert.deepEqual((await row()).providerState, settled.providerState);
  });
});
