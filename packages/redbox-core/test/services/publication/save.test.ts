import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Disk } from 'flydrive';
import { FSDriver } from 'flydrive/drivers/fs';
import { PublicationPublishing } from '../../../src/configmodels/PublicationPublishing';
import { publicationContentDigest, publicationRecordDigest } from '../../../src/services/publication/canonical';
import { PublicationStaging } from '../../../src/services/publication/staging';
import { allocatePublicationGeneratedValues, sealPublicationSource } from '../../../src/services/publication/source';
import {
  createPublicationSaveSession,
  preparePublicationSave,
  assertPublicationContinuation,
  PublicationApprovalValidationError,
  type PublicationSaveSession,
  type PublicationSourceRuntime,
} from '../../../src/services/publication/save';
import type { PublicationApproval, PublicationSourcePolicy } from '../../../src/services/publication/contracts';
import { configuredDestination, reviewProvider } from '../../fixtures/publication/provider';

describe('Publication save policy orchestration (PUB-07)', function () {
  let directory: string;
  let runtime: PublicationSourceRuntime;
  let session: PublicationSaveSession;
  let record: Record<string, unknown>;
  let providerMutations: number;
  let serviceChecks: number;
  let failedDestinations: Set<string>;
  const actor = { username: 'approver', type: 'local', disabled: false, roles: [] };
  const attribution = { username: 'approver', userType: 'local' };
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'publication-save-'));
    const staging = new PublicationStaging(
      'durable',
      new Disk(new FSDriver({ location: directory, visibility: 'private' }))
    );
    const configuration = new PublicationPublishing();
    configuration.processing.enabled = true;
    configuration.destinations = {
      archive: { ...configuredDestination(), enabled: true },
      repository: { ...configuredDestination(), enabled: true },
    };
    configuration.sourcePolicies = [
      {
        id: 'approve',
        version: 1,
        mode: 'approval',
        recordType: 'dataPublication',
        event: 'onTransitionWorkflow',
        destinations: ['repository', 'archive'],
        grantCondition: '<%= record.workflow.stage === "queued" && user.username === "approver" %>',
        continuationCondition: '<%= record.metadata.allowed === true %>',
      },
    ];
    session = createPublicationSaveSession();
    record = {
      redboxOid: 'record',
      metaMetadata: { brandId: 'brand', type: 'dataPublication', createdBy: 'creator' },
      metadata: { title: 'Source', allowed: true },
      workflow: { stage: 'queued' },
    };
    providerMutations = 0;
    serviceChecks = 0;
    failedDestinations = new Set();
    runtime = {
      configuration,
      refresh: async () => runtime,
      assertGrantAccess: async (_record, user) => {
        if (user.username !== 'approver' || user.disabled) throw new Error('No edit access');
      },
      attribution: async () => ({ requester: attribution, approver: attribution }),
      creator: async () => ({ username: 'creator', userType: 'aaf' }),
      assertContinuationAccess: async () => {
        serviceChecks++;
      },
      prepare: async (candidate, policy, sourceRevision, generated) => {
        if (policy.destinations.some(id => failedDestinations.has(id))) throw new Error('Private mapping detail');
        const provider = {
          ...reviewProvider,
          synchronise: async () => {
            providerMutations++;
            throw new Error('Remote mutation');
          },
        };
        return sealPublicationSource(
          {
            brandId: 'brand',
            oid: 'record',
            requestId: 'stable-test',
            sourceRevision,
            record: JSON.parse(JSON.stringify(candidate)),
            maintenancePaths: [],
            relatedInputs: {},
            attachments: [],
            generatedValues: allocatePublicationGeneratedValues(generated),
            destinations: policy.destinations.map(id => ({
              id,
              provider,
              configuration: configuration.destinations[id],
              targetFingerprint: 'verified',
              mappingContextVersion: 1,
              managedFields: ['title'],
            })),
            resolveCrosswalk: async () => {
              throw new Error('No crosswalk');
            },
          },
          staging
        );
      },
    };
  });
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });
  function prepare(events = ['onTransitionWorkflow'], original?: Record<string, unknown>) {
    return preparePublicationSave({
      session,
      runtime,
      record,
      original,
      brandId: 'brand',
      oid: 'record',
      events,
      user: actor,
    });
  }
  function withApproval(approval: PublicationApproval) {
    return {
      ...record,
      metadata: record.metadata,
      publicationSource: {
        schemaVersion: 1,
        revision: approval.sourceRevision,
        pending: true,
        initialising: false,
        approvals: [structuredClone(approval)],
        intents: {},
        saves: [],
      },
    };
  }
  it('grants one sealed fixed destination set with distinct creator/requester/approver attribution and no provider mutation', async () => {
    const prepared = await prepare();
    assert.equal(prepared.intent.kind, 'content');
    const approval = prepared.intent.approvals[0];
    assert.deepEqual(approval.destinationIds, ['archive', 'repository']);
    assert.deepEqual(approval.requester, attribution);
    assert.deepEqual(approval.approver, attribution);
    assert.deepEqual(approval.creator, { username: 'creator', userType: 'aaf' });
    runtime.configuration.sourcePolicies[0].destinations.pop();
    assert.deepEqual(approval.destinationIds, ['archive', 'repository']);
    assert.equal(providerMutations, 0);
  });
  it('rejects JSON forged save sessions before preparation', async () => {
    session = JSON.parse(JSON.stringify(session));
    await assert.rejects(prepare(), /trusted save session/);
  });
  it('rejects calls from an already finished containing save', async () => {
    session.closed = true;
    await assert.rejects(prepare(), /trusted save session/);
  });
  it('does not infer approval from queue fields, record JSON or hook-style options', async () => {
    record.publicationIntent = { approvals: ['forged'] };
    record.requester = 'approver';
    const prepared = await prepare(['unconfigured-event']);
    assert.deepEqual(prepared.intent.approvals, []);
    assert.equal(prepared.intent.kind, 'content');
  });
  it('keeps drafts saveable without calling publication preflight', async () => {
    failedDestinations.add('archive');
    runtime.prepare = async () => {
      throw new Error('Draft must not hash attachments');
    };
    const prepared = await prepare(['onUpdate']);
    assert.equal(prepared.intent.approvals.length, 0);
    assert.equal(prepared.intent.preparationFailures?.length, 0);
  });
  it('rejects the whole explicit set if any destination fails local validation', async () => {
    failedDestinations.add('repository');
    await assert.rejects(prepare(), PublicationApprovalValidationError);
    assert.equal(session.prepared, undefined);
    assert.equal(providerMutations, 0);
  });
  it('records auto-sync errors independently while valid destinations retain authority', async () => {
    runtime.configuration.sourcePolicies[0].mode = 'auto-sync';
    failedDestinations.add('repository');
    const prepared = await prepare();
    assert.deepEqual(
      prepared.intent.approvals.map(approval => approval.destinationIds),
      [['archive']]
    );
    assert.equal(prepared.intent.preparationFailures?.[0].destinationId, 'repository');
    assert.ok(!JSON.stringify(prepared.intent).includes('Private mapping detail'));
    assert.equal(providerMutations, 0);
  });
  it('uses one generated timestamp for all auto-sync destinations and reuses it across finalisation', async () => {
    runtime.configuration.sourcePolicies[0].mode = 'auto-sync';
    const first = await prepare();
    const values = Object.values(first.sealed).map(source => source.descriptor.generatedValues);
    assert.deepEqual(values[0], values[1]);
    const final = await prepare();
    assert.deepEqual(final.generated, first.generated);
  });
  it('invalidates changed content even when the event cannot grant replacement authority', async () => {
    const original = structuredClone(record);
    record.metadata = { title: 'Edited draft' };
    const prepared = await prepare(['onUpdate'], original);
    assert.equal(prepared.intent.kind, 'content');
    assert.equal(prepared.intent.approvals.length, 0);
  });
  it('does not turn save bookkeeping into a new source revision', async () => {
    const original = structuredClone(record);
    original.publicationSource = {
      schemaVersion: 1,
      revision: 1,
      pending: false,
      initialising: false,
      approvals: [],
      intents: {},
      saves: [],
    };
    record.metaMetadata = { ...(original.metaMetadata as object), lastSavedBy: 'other', lastSaveDate: 'later' };
    assert.equal(publicationContentDigest(original), publicationContentDigest(record));
    assert.equal((await prepare(['onUpdate'], original)).intent.kind, 'preserve');
  });
  it('fingerprints BSON-compatible optional values and dates while rejecting cyclic record inputs', () => {
    assert.equal(
      publicationRecordDigest({ metadata: { optional: undefined, date: new Date('2026-02-03T04:05:06Z') } }),
      publicationRecordDigest({ metadata: { optional: null, date: '2026-02-03T04:05:06.000Z' } })
    );
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    assert.throws(() => publicationRecordDigest({ metadata: cyclic }), /acyclic JSON/);
  });
  it('rejects source edits made during asynchronous preparation', async () => {
    const original = runtime.prepare;
    runtime.prepare = async (...args) => {
      const sealed = await original(...args);
      record.metadata = { title: 'Edited during preflight' };
      return sealed;
    };
    await assert.rejects(prepare(), /changed during preparation/);
  });
  it('retains institutional approval after approver departure and a framework stage transition', async () => {
    const approval = (await prepare()).intent.approvals[0];
    const current = { ...withApproval(approval), workflow: { stage: 'published' } };
    runtime.assertGrantAccess = async () => {
      throw new Error('Departed approver');
    };
    runtime.attribution = async () => {
      throw new Error('Departed approver must never be loaded');
    };
    await assertPublicationContinuation(runtime, current, approval);
    assert.equal(serviceChecks, 1);
  });
  it('still enforces current continuation and service permission checks', async () => {
    const approval = (await prepare()).intent.approvals[0];
    const current = withApproval(approval);
    runtime.assertContinuationAccess = async () => {
      throw new Error('Service no longer has edit access');
    };
    await assert.rejects(assertPublicationContinuation(runtime, current, approval), /no longer has edit access/);
    runtime.assertContinuationAccess = async () => {};
    current.metadata = { allowed: false };
    await assert.rejects(assertPublicationContinuation(runtime, current, approval), /no longer current/);
  });
  it('rejects revoked epochs and source supersession independently of grant-stage eligibility', async () => {
    const approval = (await prepare()).intent.approvals[0];
    const current = withApproval(approval);
    current.publicationSource.approvals[0].epoch++;
    await assert.rejects(assertPublicationContinuation(runtime, current, approval), /no longer current/);
    current.publicationSource.approvals[0] = approval;
    current.publicationSource.revision++;
    await assert.rejects(assertPublicationContinuation(runtime, current, approval), /no longer current/);
  });
  it('uses the persisted approval policy rather than caller-supplied scope or policy fields', async () => {
    const approval = (await prepare()).intent.approvals[0];
    const current = { ...withApproval(approval), metadata: { allowed: false } };
    const forgedPolicy: PublicationSourcePolicy = {
      ...approval.policy,
      id: 'permissive',
      continuationCondition: 'true',
    };
    runtime.configuration.sourcePolicies.push(forgedPolicy);
    await assert.rejects(
      assertPublicationContinuation(runtime, current, { ...approval, policy: forgedPolicy }),
      /no longer current/
    );
    assert.equal(serviceChecks, 0);
  });
});
