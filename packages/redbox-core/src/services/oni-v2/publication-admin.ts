import { cloneDeep } from 'lodash';
import { publicationOperationEvidence } from '../publication/operations';
import { publicationDigest } from '../publication/canonical';
import type { PublicationRepair, PublicationRepairContext, PublicationRepairResult } from '../publication/contracts';
import { isPublicationObject } from '../publication/builtins';
import { unresolvedPublicationOperation } from '../publication/execution';
import { oniDestinationConfiguration, oniRepositoryIdentity, oniJson } from './publication-config';
import { decodeOniDesired, decodeOniEvidence } from './publication-state';
import type { OniPublicationHooks } from './publication-source';

export function oniPublicationRepairs(hooks: () => OniPublicationHooks): PublicationRepair[] {
  return [
    {
      id: 'reconcile-initialization',
      description:
        'Verify an existing storage root, or an empty root/workspace with referenced proof that the initializer has settled.',
      run: context => repairOni('initialization', context, hooks()),
    },
    {
      id: 'reconcile-evidence',
      description: 'Persist verified adapter reconciliation without sending mutations or claiming completion.',
      run: context => context.reconcile(),
    },
    {
      id: 'reconcile-ocfl',
      description:
        'Read exact inventory/content; unchanged heads additionally require referenced proof that the previous writer has settled.',
      run: context => repairOni('ocfl', context, hooks()),
    },
    {
      id: 'settle-unapplied-ingestion',
      description: 'Record an exact externally verified non-application receipt for a settled indexing request.',
      run: context => repairOni('unapplied-ingestion', context, hooks()),
    },
    {
      id: 'reconcile-ingestion',
      description:
        'Record an externally verified acknowledgement of this exact rebuild/deposit; readiness alone is insufficient and object visibility remains unverified.',
      run: context => repairOni('ingestion', context, hooks()),
    },
  ];
}
async function repairOni(
  kind: string,
  context: PublicationRepairContext,
  hooks: OniPublicationHooks
): Promise<PublicationRepairResult> {
  const namespace = oniRepositoryIdentity(context.configuration);
  const config = oniDestinationConfiguration(context.configuration);
  const state = cloneDeep(context.state);
  const operations = cloneDeep([...context.operations]);
  const operation = operations.find(op => op.id === context.parameters.operationId);
  if (
    !operation ||
    (!unresolvedPublicationOperation(operation) &&
      ![
        'confirmed',
        ...(['ocfl', 'initialization', 'unapplied-ingestion'].includes(kind) ? ['not_applied'] : []),
      ].includes(operation.outcome)) ||
    operation.evidence.namespace !== namespace
  )
    throw new Error('An explicit recoverable operation in this repository is required');
  return context.withResourceLease(namespace, 'repository', async resource => {
    const shared = resource.operations.find(entry => entry.operation.id === operation.id);
    if (
      shared &&
      (shared.work.brandId !== context.brandId ||
        shared.work.oid !== context.oid ||
        shared.work.destinationId !== context.destinationId)
    )
      throw new Error('Resource operation belongs to different work');
    if (kind === 'unapplied-ingestion') {
      const reference = context.parameters.evidenceReference;
      if (
        !['oni.index.structural', 'oni.index.search'].includes(operation.kind) ||
        !isPublicationObject(state.confirmed) ||
        operation.evidence.depositInventory !== state.confirmed.inventoryDigest ||
        operation.intendedDigest !== operation.evidence.depositInventory ||
        context.parameters.intendedDigest !== operation.intendedDigest ||
        context.parameters.nonApplicationVerified !== true ||
        context.parameters.priorOperationSettled !== true ||
        typeof reference !== 'string' ||
        !reference.trim() ||
        typeof operation.evidence.acceptedAt === 'string' ||
        typeof operation.evidence.readyAt === 'string' ||
        typeof shared?.operation.evidence.acceptedAt === 'string' ||
        typeof shared?.operation.evidence.readyAt === 'string'
      )
        throw new Error(
          'Exact indexing request/deposit/digest and referenced non-application and settlement receipts are required'
        );
      const replay =
        operation.outcome === 'not_applied' &&
        operation.evidence.administratorSettlementReference === reference &&
        operation.evidence.externalNonApplicationVerified === true;
      const resourceSettled =
        shared?.operation.outcome === 'not_applied' &&
        shared.operation.evidence.administratorSettlementReference === reference &&
        shared.operation.evidence.externalNonApplicationVerified === true;
      if (
        (!unresolvedPublicationOperation(operation) && !replay) ||
        (shared && !unresolvedPublicationOperation(shared.operation) && !resourceSettled)
      )
        throw new Error('A terminal indexing operation cannot be reclassified by non-application repair');
      if (!replay) {
        // Repository readiness cannot show that a rebuild never ran. As with
        // Figshare mutable updates, require an explicit exact external receipt.
        operation.outcome = 'not_applied';
        operation.evidence = {
          ...operation.evidence,
          administratorSettlementReference: reference,
          externalNonApplicationVerified: true,
        };
      }
    } else if (kind === 'initialization') {
      if (operation.kind !== 'oni.initialize' || operation.intendedDigest !== publicationDigest(namespace))
        throw new Error('An exact storage initialization operation is required');
      const repository = hooks.repository(
        config,
        config.sites.publication,
        {
          getDatastream: async () => {
            throw new Error('Administrative recovery cannot write attachment bytes');
          },
        },
        namespace
      );
      if (!repository.inspectStorageRoot) throw new Error('Read-only storage root inspection is unavailable');
      const root = await repository.inspectStorageRoot();
      const reference = context.parameters.evidenceReference;
      const externallySettled =
        context.parameters.priorOperationSettled === true && typeof reference === 'string' && !!reference.trim();
      if (root === 'absent' && operation.evidence.writerQuiesced !== true && !externallySettled)
        throw new Error('An empty storage root requires referenced proof that the prior initializer has settled');
      const outcome = root === 'present' ? 'confirmed' : 'not_applied';
      if (!unresolvedPublicationOperation(operation) && operation.outcome !== outcome)
        throw new Error('Storage root inspection contradicts the retained terminal operation');
      operation.outcome = outcome;
      operation.evidence = {
        ...operation.evidence,
        ...(root === 'present' ? { storageRootVerified: true } : { storageRootAbsent: true }),
        ...(externallySettled ? { administratorSettlementReference: reference } : {}),
      };
    } else if (kind === 'ocfl') {
      if (!['oni.commit', 'oni.root'].includes(operation.kind)) throw new Error('An OCFL commit operation is required');
      const desired = decodeOniDesired(operation.evidence.desired);
      const prior = decodeOniEvidence(operation.evidence.prior);
      if (operation.intendedDigest !== desired.digest) throw new Error('OCFL operation digest mismatch');
      const repository = hooks.repository(
        config,
        config.sites.publication,
        {
          getDatastream: async () => {
            throw new Error('Administrative recovery cannot write attachment bytes');
          },
        },
        namespace
      );
      const reference = context.parameters.evidenceReference;
      const externallySettled =
        context.parameters.priorOperationSettled === true && typeof reference === 'string' && !!reference.trim();
      const resolution = await repository.reconcileCommit({
        prior,
        desired,
        priorWriterQuiesced: operation.evidence.writerQuiesced === true || externallySettled,
      });
      if (resolution.kind === 'repair_required')
        throw new Error(`OCFL evidence requires further investigation: ${resolution.reason}`);
      const outcome = resolution.kind === 'confirmed' ? 'confirmed' : 'not_applied';
      if (!unresolvedPublicationOperation(operation) && operation.outcome !== outcome)
        throw new Error('OCFL read-back contradicts the retained terminal operation');
      operation.outcome = outcome;
      operation.evidence = {
        ...operation.evidence,
        ...(externallySettled ? { administratorSettlementReference: reference } : {}),
        ...(resolution.kind === 'confirmed' ? { confirmed: oniJson(resolution.evidence) } : {}),
      };
      if (
        resolution.kind === 'confirmed' &&
        operation.kind === 'oni.commit' &&
        isPublicationObject(state.submitted) &&
        state.submitted.operationId === operation.id
      )
        state.confirmed = oniJson(resolution.evidence);
    } else {
      const reference = context.parameters.evidenceReference;
      const acceptedAt = context.parameters.acceptedAt;
      if (
        !['oni.index.structural', 'oni.index.search'].includes(operation.kind) ||
        !isPublicationObject(state.confirmed) ||
        operation.evidence.depositInventory !== state.confirmed.inventoryDigest ||
        context.parameters.acknowledgementVerified !== true ||
        typeof reference !== 'string' ||
        !reference.trim() ||
        typeof acceptedAt !== 'string' ||
        !Number.isFinite(Date.parse(acceptedAt)) ||
        Date.parse(acceptedAt) < Date.parse(operation.submittedAt)
      )
        throw new Error(
          'A referenced, verified acknowledgement for this exact rebuild and confirmed deposit is required; index readiness is insufficient'
        );
      operation.outcome = 'confirmed';
      operation.evidence = { ...operation.evidence, acceptedAt, administratorAcknowledgementReference: reference };
      // Normal authorised execution still polls readiness and performs guarded projection; this repair never declares success.
    }
    operation.confirmation = publicationOperationEvidence(
      { ...context, providerId: 'oni' },
      operation,
      operation.identity?.remote ?? operation.confirmation?.remote ?? context.binding
    );
    if (shared) await resource.journal(operation);
    return { state, operations, checkpointedOperationIds: operation.outcome === 'confirmed' ? [operation.id] : [] };
  });
}
