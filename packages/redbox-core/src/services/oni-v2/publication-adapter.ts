import { attestWithProviderRepair } from '../publication/attestation';
import { publicationOperationEvidence, publicationOperationRequiresRecovery } from '../publication/operations';
import { oniPublicationRepairs } from './publication-admin';
import { randomUUID } from 'node:crypto';
import { cloneDeep } from 'lodash';
import type {
  PublicationObject,
  PublicationOperation,
  PublicationProvider,
  PublicationProviderOutcome,
  PublicationResourceExecution,
} from '../publication/contracts';
import {
  BUILTIN_PUBLICATION_DEFINITIONS,
  isPublicationObject,
  publicationTargetFingerprint,
} from '../publication/builtins';
import { publicationDigest } from '../publication/canonical';
import { unresolvedPublicationOperation } from '../publication/execution';
import { PublicationBindingConflict } from '../publication/ownership';
import {
  oniDestinationConfiguration,
  oniJson,
  oniRepositoryIdentity,
  assertOniRepositoryConfiguration,
} from './publication-config';
import {
  prepareOniSource,
  describeOniSource,
  decodeOniCrate,
  oniSourceRecord,
  oniAttachmentIdentity,
  type OniPublicationHooks,
  type OniExecution,
} from './publication-source';
import { decodeOniState, decodeOniDesired, decodeOniEvidence } from './publication-state';
import { createOniOcflDesiredContent, sha256 } from './ocflReconciliation';
import { createRootCollectionCrate } from './crate';
import { requestOniIndex, waitForOniIndex } from './ingestion';
import type { OniCrateBuildResult, OniOcflDesiredContent, OniOcflObjectEvidence, OniPublishInput } from './types';

const definition = BUILTIN_PUBLICATION_DEFINITIONS.find(value => value.id === 'oni')!;
const valid = <T>(value: T) => ({ valid: true as const, value });
const invalid = (code: string) => ({
  valid: false as const,
  issues: [{ path: '', code, message: 'Invalid Oni publication input; evidence retained' }],
});
type Outcome = PublicationProviderOutcome<PublicationObject>;
class OniRepair extends Error {}
export function createOniPublicationProvider(
  hooks: () => OniPublicationHooks
): PublicationProvider<PublicationObject, PublicationObject, PublicationObject> {
  const execute = (context: OniExecution, recovery = false, observe = false) =>
    runOni(context, hooks(), recovery, observe);
  return {
    ...definition,
    attestOperation: context => attestWithProviderRepair(context, oniPublicationRepairs(hooks)),
    validateConfiguration(value) {
      const result = definition.validateConfiguration(value);
      if (!result.valid) return result;
      try {
        oniDestinationConfiguration(result.value);
        return result;
      } catch {
        return invalid('oni-configuration');
      }
    },
    targetFingerprint: value =>
      publicationTargetFingerprint('oni', [
        oniRepositoryIdentity(value),
        oniDestinationConfiguration(value).rootCollection.targetRepoNamespace,
      ]),
    sourceMaintenancePaths: configuration => {
      const writeBack = oniDestinationConfiguration(configuration).writeBack;
      return [writeBack.citationUrlPath, writeBack.citationDoiPath, writeBack.publicationErrorPath];
    },
    decodeState(value, version) {
      try {
        return valid(decodeOniState(value, version));
      } catch {
        return invalid('oni-state');
      }
    },
    upgradeState(value, version) {
      try {
        return valid(decodeOniState(value, version));
      } catch {
        return invalid('oni-state-version');
      }
    },
    decodePreparedSource(value) {
      try {
        if (
          !isPublicationObject(value) ||
          typeof value.namespace !== 'string' ||
          !isPublicationObject(value.material) ||
          !Array.isArray(value.outputPaths)
        )
          throw new Error('Invalid source');
        decodeOniCrate(value.crate);
        return valid(value);
      } catch {
        return invalid('oni-source');
      }
    },
    async prepareSource(input) {
      try {
        return valid(await prepareOniSource(input, hooks()));
      } catch {
        return invalid('oni-preflight');
      }
    },
    async describeSource(input, prepared) {
      return describeOniSource(input, prepared, hooks());
    },
    summariseStatus(state) {
      return {
        deposit: state.confirmed ? 'confirmed' : 'unverified',
        publication: 'unverified',
        ingestion:
          isPublicationObject(state.ingestion) && state.ingestion.state === 'confirmed'
            ? 'confirmed'
            : isPublicationObject(state.ingestion) && state.ingestion.state === 'not_required'
              ? 'not_required'
              : state.confirmed
                ? 'pending'
                : 'unverified',
        visibility: 'unverified',
      };
    },
    synchronise: context => execute(context),
    reconcile: context => execute(context, true),
    observe: context => execute(context, false, true),
    administrativeResources: configuration => [
      { namespace: oniRepositoryIdentity(configuration), resourceKey: 'repository' },
    ],
    repairs: oniPublicationRepairs(hooks),
  };
}
async function runOni(
  context: OniExecution,
  hooks: OniPublicationHooks,
  recovery: boolean,
  observe: boolean
): Promise<Outcome> {
  let state = cloneDeep(context.state);
  const request = publicationDigest([
    context.approval.id,
    context.approval.epoch,
    context.sourceGeneration,
    context.approval.source.digest,
  ]);
  const config = hooks.configuration(
    oniSourceRecord(context.source.metadata, context.oid, context.brandId),
    oniDestinationConfiguration(context.configuration)
  );
  const site = config.sites.publication;
  const ingestionIdentity = publicationDigest(site.ingestion?.apiUrl ?? '');
  assertOniRepositoryConfiguration(context.configuration, config);
  const crate = decodeOniCrate(context.prepared.crate);
  const namespace = oniRepositoryIdentity(context.configuration);
  if (context.prepared.namespace !== namespace)
    return { kind: 'repair_required', state, reason: 'oni_repository_changed', evidence: {} };
  const input: OniPublishInput = {
    oid: context.oid,
    record: oniSourceRecord(context.source.metadata, context.oid, context.brandId),
    options: {},
    user: { username: context.approval.approver.username },
    creator: { username: context.approval.creator?.username },
  };
  const repository = hooks.repository(
    config,
    site,
    {
      getDatastream: async (oid, fileId) => {
        if (oid !== crate.dataRecordOid) throw new OniRepair('oni_attachment_source_mismatch');
        const file = crate.attachments.find(value => value.fileId === fileId);
        if (!file) throw new OniRepair('oni_attachment_not_approved');
        return { readstream: await context.openAttachment(oniAttachmentIdentity(oid, fileId), file.logicalPath) };
      },
    },
    namespace
  );
  const confirmedIds = new Set<string>();
  const operations = cloneDeep([...context.operations]);
  const proof = (op: PublicationOperation) =>
    publicationOperationEvidence(
      op.identity ?? {
        ...context,
        providerId: 'oni',
        targetFingerprint: context.approval.targetFingerprints[context.destinationId],
      },
      op,
      op.identity?.remote ??
        (op.outcome === 'confirmed' ? op.confirmation?.remote : undefined) ?? { namespace, objectId: crate.rootId }
    );
  const settled = (op: PublicationOperation): PublicationOperation =>
    ['confirmed', 'not_applied', 'rejected'].includes(op.outcome) ? { ...op, confirmation: proof(op) } : op;
  const checkpoint = async () => context.checkpoint(state, [...confirmedIds]);
  const journal = async (op: PublicationOperation) => {
    op = settled(op);
    await context.journal(op);
    const index = operations.findIndex(item => item.id === op.id);
    if (index >= 0) operations[index] = op;
    else operations.push(op);
    if (op.outcome === 'confirmed') confirmedIds.add(op.id);
  };
  const operation = (kind: string, digest: string, evidence: PublicationObject): PublicationOperation => ({
    id: randomUUID(),
    kind,
    approvalId: context.approval.id,
    approvalEpoch: context.approval.epoch,
    sourceGeneration: context.sourceGeneration,
    intendedDigest: digest,
    submittedAt: new Date().toISOString(),
    outcome: 'submitted',
    evidence,
  });
  const reconcile = async (op: PublicationOperation, resource: PublicationResourceExecution, foreign: boolean) => {
    if (op.evidence.namespace !== namespace) throw new OniRepair('oni_operation_repository_mismatch');
    if (op.kind === 'oni.initialize') {
      // readObject first loads and verifies the OCFL storage root without creating it.
      try {
        await repository.readObject(config.rootCollection.rootCollectionId);
      } catch {
        throw new OniRepair('oni_storage_root_unverified');
      }
      const updated: PublicationOperation = {
        ...op,
        outcome: 'confirmed',
        evidence: { ...op.evidence, storageRootVerified: true },
      };
      if (foreign) await resource.journal(updated);
      else await journal(updated);
      return;
    }
    if (op.kind.startsWith('oni.index.')) {
      const acknowledged = resource.operations.find(
        entry =>
          entry.operation.id === op.id &&
          entry.operation.outcome === 'confirmed' &&
          typeof entry.operation.evidence.acceptedAt === 'string'
      );
      // Settled repository entries may be compacted after their record receipt is durable.
      // Only a retained confirmed acceptance can replace that entry; readiness alone is insufficient.
      const retained = !foreign
        ? context.operations.find(
            entry =>
              entry.id === op.id && entry.outcome === 'confirmed' && typeof entry.evidence.acceptedAt === 'string'
          )
        : undefined;
      const evidence = (acknowledged?.operation ?? retained)?.evidence;
      if (!evidence) throw new OniRepair('oni_ingestion_submission_unverified');
      const preparedIngestion = isPublicationObject(context.prepared.material)
        ? context.prepared.material.ingestion
        : undefined;
      const legacyIdentity =
        !foreign &&
        op.approvalId === context.approval.id &&
        op.approvalEpoch === context.approval.epoch &&
        op.sourceGeneration === context.sourceGeneration &&
        isPublicationObject(preparedIngestion) &&
        typeof preparedIngestion.apiUrl === 'string'
          ? publicationDigest(preparedIngestion.apiUrl)
          : undefined;
      // Submission acknowledgement does not settle a repository-wide rebuild. A failed poll or
      // expired owner must leave a barrier for the next record, even though the POST succeeded.
      if (!site.ingestion?.enabled || (evidence.ingestionIdentity ?? legacyIdentity) !== ingestionIdentity)
        throw new OniRepair('oni_ingestion_configuration_changed');
      const type =
        op.kind === 'oni.index.structural' ? 'structural' : op.kind === 'oni.index.search' ? 'search' : undefined;
      if (!type) throw new OniRepair('oni_ingestion_submission_unverified');
      if (!resource.operations.some(entry => entry.operation.id === op.id)) {
        // Restore the retained record receipt under this repository lease before polling or
        // appending readiness. This restores confirmed evidence, never a new index request.
        await resource.journal({ ...op, outcome: 'confirmed', evidence: { ...op.evidence, ...evidence } });
      }
      if (typeof evidence.readyAt !== 'string') await waitForOniIndex(type, site.ingestion, context.signal);
      const updated: PublicationOperation = {
        ...op,
        outcome: 'confirmed',
        evidence: { ...evidence, readyAt: evidence.readyAt ?? new Date().toISOString() },
      };
      if (foreign) await resource.journal(updated);
      else await journal(updated);
      return;
    }
    if (!['oni.commit', 'oni.root'].includes(op.kind)) throw new OniRepair('oni_ingestion_submission_unverified');
    const prior = decodeOniEvidence(op.evidence.prior);
    const desired = decodeOniDesired(op.evidence.desired);
    if (op.intendedDigest !== desired.digest) throw new OniRepair('oni_operation_digest_mismatch');
    const resolution = await (async () => {
      if (op.outcome === 'confirmed' && isPublicationObject(op.evidence.confirmed)) {
        // A later approved version may replace the head. Its verified immutable history still
        // proves incorporation of this exact confirmed commit, without restoring the old head.
        const confirmed = decodeOniEvidence(op.evidence.confirmed);
        const current = await repository.readObject(prior.objectId);
        if (
          confirmed.kind !== 'present' ||
          current.kind !== 'present' ||
          confirmed.objectId !== prior.objectId ||
          confirmed.storageIdentity !== namespace ||
          current.storageIdentity !== namespace ||
          confirmed.content.digest !== desired.digest ||
          current.versionInventoryDigests[confirmed.head] !== confirmed.inventoryDigest
        )
          throw new OniRepair('oni_ocfl_historical_evidence_mismatch');
        return { kind: 'confirmed' as const, evidence: confirmed };
      }
      return repository.reconcileCommit({
        prior,
        desired,
        priorWriterQuiesced: op.evidence.writerQuiesced === true,
      });
    })();
    if (resolution.kind === 'repair_required') throw new OniRepair(`oni_ocfl_${resolution.reason}`);
    const updated: PublicationOperation = {
      ...op,
      outcome: resolution.kind === 'confirmed' ? 'confirmed' : 'not_applied',
      evidence: {
        ...op.evidence,
        ...(resolution.kind === 'confirmed' ? { confirmed: oniJson(resolution.evidence) } : {}),
      },
    };
    if (foreign) await resource.journal(updated);
    else await journal(updated);
    if (
      !foreign &&
      op.kind === 'oni.commit' &&
      op.approvalId === context.approval.id &&
      op.approvalEpoch === context.approval.epoch &&
      op.sourceGeneration === context.sourceGeneration &&
      resolution.kind === 'confirmed'
    ) {
      state.confirmed = oniJson(resolution.evidence);
      await checkpoint();
    }
  };
  try {
    return await context.withResourceLease(namespace, 'repository', async suppliedResource => {
      const resource: PublicationResourceExecution = {
        ...suppliedResource,
        journal: op => suppliedResource.journal(settled(op)),
      };
      // Resource evidence can survive a lost per-record checkpoint or a different record owning the next lease.
      const reconciled = new Set<string>();
      for (const entry of resource.operations.filter(
        entry =>
          unresolvedPublicationOperation(entry.operation) ||
          (entry.operation.outcome === 'not_applied' &&
            context.operations.some(
              local => local.id === entry.operation.id && unresolvedPublicationOperation(local)
            )) ||
          (entry.operation.kind.startsWith('oni.index.') &&
            entry.operation.outcome === 'confirmed' &&
            (typeof entry.operation.evidence.readyAt !== 'string' ||
              context.operations.some(
                local => local.id === entry.operation.id && local.evidence.readyAt !== entry.operation.evidence.readyAt
              )))
      )) {
        const own =
          entry.work.brandId === context.brandId &&
          entry.work.oid === context.oid &&
          entry.work.destinationId === context.destinationId;
        const local = context.operations.find(op => op.id === entry.operation.id);
        if (own && !local) {
          // The host journals the resource, then the record, then rechecks authority before send.
          // With no record intent, this operation could never have invoked its transport.
          await resource.journal({
            ...entry.operation,
            outcome: 'not_applied',
            evidence: { ...entry.operation.evidence, recordIntentAbsent: true },
          });
          continue;
        }
        if (own && local && entry.operation.outcome === 'not_applied' && unresolvedPublicationOperation(local)) {
          // The host persists settlement repository-first. A lost record update must
          // incorporate that exact terminal receipt, not require another remote proof.
          // Both journals still validate immutable operation identity and evidence.
          await journal(entry.operation);
          reconciled.add(entry.operation.id);
          continue;
        }
        await reconcile(entry.operation, resource, !own || !local);
        reconciled.add(entry.operation.id);
      }
      if (recovery) {
        for (const op of context.operations.filter(
          op => publicationOperationRequiresRecovery(op) && !reconciled.has(op.id)
        ))
          await reconcile(op, resource, false);
        await checkpoint();
        return { kind: 'waiting', state, reason: 'oni_reconciled_resume', nextCheckAt: Date.now() + 1 };
      }
      if (state.request !== request) {
        state = {
          request,
          ...(Object.keys(state).length
            ? {
                previous: {
                  request: state.request ?? null,
                  confirmed: state.confirmed ?? null,
                  ingestion: state.ingestion ?? null,
                  projection: state.projection ?? null,
                },
              }
            : {}),
        };
      }
      if (observe) {
        if (!state.confirmed) throw new OniRepair('oni_deposit_unverified');
        const confirmed = decodeOniEvidence(state.confirmed);
        const current = await repository.readObject(crate.rootId);
        if (
          current.kind !== 'present' ||
          confirmed.kind !== 'present' ||
          current.inventoryDigest !== confirmed.inventoryDigest
        )
          throw new OniRepair('oni_deposit_changed');
        return { kind: 'waiting', state, reason: 'oni_visibility_unverified' };
      }
      if (context.binding && (context.binding.namespace !== namespace || context.binding.objectId !== crate.rootId))
        throw new OniRepair('oni_binding_changed');
      if (!context.binding)
        await context.bind({
          namespace,
          objectId: crate.rootId,
          targetFingerprint: context.approval.targetFingerprints[context.destinationId],
          evidence: { datasetUrl: crate.datasetUrl },
        });
      const desired = desiredContent(crate, config.metadata.jsonldFilename, context);
      if (!state.prepared) {
        state.prepared = {
          desired: oniJson(desired),
          crate: cloneDeep(context.prepared.crate),
          preparedAt: new Date().toISOString(),
        };
        await checkpoint();
      }
      if (!state.confirmed) {
        const confirmedOperation = context.operations.find(
          op =>
            op.kind === 'oni.commit' &&
            op.outcome === 'confirmed' &&
            op.approvalId === context.approval.id &&
            op.approvalEpoch === context.approval.epoch &&
            op.sourceGeneration === context.sourceGeneration &&
            op.intendedDigest === desired.digest
        );
        if (confirmedOperation) {
          const resolution = await repository.reconcileCommit({
            prior: decodeOniEvidence(confirmedOperation.evidence.prior),
            desired,
            priorWriterQuiesced: false,
          });
          if (resolution.kind !== 'confirmed') throw new OniRepair('oni_confirmed_deposit_changed');
          state.confirmed = oniJson(resolution.evidence);
          await checkpoint();
        }
      }
      if (!state.confirmed) {
        // Root initialization is idempotent, but remains an explicitly guarded shared mutation.
        const init = operation('oni.initialize', publicationDigest(namespace), { namespace });
        await context.mutate(init, () => repository.ensureStorageRoot());
        await journal({
          ...init,
          outcome: 'confirmed',
          evidence: { ...init.evidence, writerQuiesced: (await repository.writerQuiesced?.()) === true },
        });
        await checkpoint();
        const root = await repository.readObject(config.rootCollection.rootCollectionId);
        if (root.kind === 'absent') {
          const rootCrate: OniCrateBuildResult = {
            ...crate,
            rootId: config.rootCollection.rootCollectionId,
            attachments: [],
            crateJson: createRootCollectionCrate(config),
          };
          await commit(rootCrate, desiredContent(rootCrate, config.metadata.jsonldFilename, context), root, 'oni.root');
        }
        const prior = await repository.readObject(crate.rootId);
        await commit(crate, desired, prior, 'oni.commit');
      }
      const confirmed = decodeOniEvidence(state.confirmed);
      if (
        confirmed.kind !== 'present' ||
        confirmed.objectId !== crate.rootId ||
        confirmed.content.digest !== desired.digest
      )
        throw new OniRepair('oni_deposit_unverified');
      const currentDeposit = await repository.readObject(crate.rootId);
      if (currentDeposit.kind !== 'present' || currentDeposit.inventoryDigest !== confirmed.inventoryDigest)
        throw new OniRepair('oni_confirmed_deposit_changed');
      if (!state.ingestion) {
        state.ingestion = {
          state: site.ingestion?.enabled === true ? 'pending' : 'not_required',
          depositInventory: confirmed.inventoryDigest,
        };
        await checkpoint();
      }
      if (!isPublicationObject(state.ingestion) || state.ingestion.depositInventory !== confirmed.inventoryDigest)
        throw new OniRepair('oni_ingestion_deposit_mismatch');
      if (state.ingestion.state === 'pending') {
        if (!site.ingestion?.enabled) throw new OniRepair('oni_ingestion_configuration_changed');
        for (const type of ['structural', 'search'] as const) {
          const saved = state.ingestion[type];
          if (isPublicationObject(saved) && saved.ready === true) continue;
          let indexOperation = context.operations.find(op => isPublicationObject(saved) && op.id === saved.operationId);
          if (!isPublicationObject(saved)) {
            // A confirmed journal entry closes the response/checkpoint gap without issuing a second rebuild.
            const acknowledged = context.operations.find(
              op =>
                op.kind === `oni.index.${type}` &&
                op.outcome === 'confirmed' &&
                op.approvalId === context.approval.id &&
                op.sourceGeneration === context.sourceGeneration &&
                op.evidence.depositInventory === confirmed.inventoryDigest
            );
            const op =
              acknowledged ??
              operation(`oni.index.${type}`, confirmed.inventoryDigest, {
                namespace,
                depositInventory: confirmed.inventoryDigest,
                ingestionIdentity,
              });
            indexOperation = op;
            if (!acknowledged) {
              await context.mutate(op, () => requestOniIndex(type, site.ingestion!, context.signal));
              await journal({
                ...op,
                outcome: 'confirmed',
                evidence: { ...op.evidence, acceptedAt: new Date().toISOString() },
              });
            }
            state.ingestion[type] = { operationId: op.id, requestedAt: op.submittedAt, ready: false };
            await checkpoint();
          }
          if (!indexOperation) throw new OniRepair('oni_ingestion_submission_unverified');
          if (
            indexOperation.outcome === 'confirmed' &&
            !resource.operations.some(entry => entry.operation.id === indexOperation.id)
          )
            await resource.journal(indexOperation);
          const ready = await waitForOniIndex(type, site.ingestion, context.signal);
          if (!reconciled.has(indexOperation.id))
            await journal({
              ...indexOperation,
              outcome: 'confirmed',
              evidence: {
                ...indexOperation.evidence,
                readyAt: indexOperation.evidence.readyAt ?? new Date().toISOString(),
              },
            });
          state.ingestion[type] = {
            ...(state.ingestion[type] as PublicationObject),
            ready: true,
            count: Number(ready.count),
            confirmedAt: new Date().toISOString(),
          };
          await checkpoint();
        }
        state.ingestion.state = 'confirmed';
        state.ingestion.confirmedAt = new Date().toISOString();
        await checkpoint();
      }
      if (!state.projection) {
        await context.assertAuthority();
        await hooks.project(context, config, crate.datasetUrl);
        state.projection = { confirmedAt: new Date().toISOString() };
        await checkpoint();
      }
      const ingestion = state.ingestion.state === 'not_required' ? ('not_required' as const) : ('confirmed' as const);
      return {
        kind: 'completed',
        state,
        links: { datasetUrl: crate.datasetUrl },
        evidence: {
          approvalId: context.approval.id,
          approvalEpoch: context.approval.epoch,
          sourceGeneration: context.sourceGeneration,
          sourceDigest: publicationDigest({
            ...context.source,
            attachments: context.source.attachments.map(({ staged: _staged, ...attachment }) => attachment),
          }),
          confirmedAt: new Date().toISOString(),
          operations: operations.filter(op => op.outcome === 'confirmed').map(proof),
          remote: { namespace, objectId: crate.rootId },
          deposit: { head: confirmed.head, inventoryDigest: confirmed.inventoryDigest, desiredDigest: desired.digest },
          ingestion: { state: ingestion, evidence: cloneDeep(state.ingestion) },
          visibility: 'unverified',
        },
      };
      async function commit(
        value: OniCrateBuildResult,
        content: OniOcflDesiredContent,
        prior: OniOcflObjectEvidence,
        kind: string
      ) {
        const op = operation(kind, content.digest, { namespace, prior: oniJson(prior), desired: oniJson(content) });
        if (kind === 'oni.commit') {
          state.submitted = { operationId: op.id, prior: oniJson(prior), desired: oniJson(content) };
          await checkpoint();
        }
        let invoked = false;
        try {
          await context.mutate(op, () => {
            invoked = true;
            return repository.writeDatasetObject(value, input);
          });
        } catch (error) {
          const quiesced = (await repository.writerQuiesced?.()) === true;
          // Preserve a positive receipt only after ALL I/O has settled. It is never inferred from lease expiry.
          if (invoked && quiesced)
            await journal({ ...op, outcome: 'uncertain', evidence: { ...op.evidence, writerQuiesced: true } });
          throw error;
        }
        const writerQuiesced = (await repository.writerQuiesced?.()) === true;
        const resolution = await repository.reconcileCommit({
          prior,
          desired: content,
          priorWriterQuiesced: writerQuiesced,
        });
        if (resolution.kind !== 'confirmed') throw new OniRepair('oni_commit_readback_unverified');
        await journal({
          ...op,
          outcome: 'confirmed',
          evidence: { ...op.evidence, confirmed: oniJson(resolution.evidence), writerQuiesced },
        });
        if (kind === 'oni.commit') state.confirmed = oniJson(resolution.evidence);
        await checkpoint();
      }
    });
  } catch (error) {
    if (error instanceof PublicationBindingConflict)
      return { kind: 'repair_required', state, reason: 'oni_remote_binding_conflict', evidence: {} };
    if (error instanceof OniRepair) return { kind: 'repair_required', state, reason: error.message, evidence: {} };
    throw error;
  }
}
function desiredContent(
  crate: OniCrateBuildResult,
  metadataPath: string,
  context: OniExecution
): OniOcflDesiredContent {
  const bytes = Buffer.from(JSON.stringify(crate.crateJson, null, 2));
  return createOniOcflDesiredContent(metadataPath, [
    { logicalPath: metadataPath, size: bytes.length, sha256: sha256(bytes) },
    ...crate.attachments.map(file => {
      const sealed = context.source.attachments.find(
        value =>
          value.id === oniAttachmentIdentity(crate.dataRecordOid, file.fileId) && value.logicalPath === file.logicalPath
      );
      if (!sealed?.digest) throw new OniRepair('oni_attachment_digest_unavailable');
      return { logicalPath: file.logicalPath, size: sealed.size, sha256: sealed.digest };
    }),
  ]);
}
