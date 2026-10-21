import { publicationDigest } from './canonical';
import type { PublicationWorkKey, PublicationOperation } from './contracts';

/** A transport acknowledgement is not a provider checkpoint. Missing legacy acknowledgements fail closed. @internal */
export const publicationOperationRequiresRecovery = (operation: PublicationOperation): boolean =>
  operation.outcome === 'submitted' ||
  operation.outcome === 'uncertain' ||
  (operation.outcome === 'confirmed' && operation.checkpointed !== true);

/** Versioned identity-derived transport key. Evidence/outcome/checkpoint changes never alter it. @internal */
export function publicationOperationIdempotencyKey(
  work: PublicationWorkKey & { providerId: string; targetFingerprint: string },
  operation: PublicationOperation
): string {
  if (operation.idempotencyKey !== undefined) {
    if (!/^rbpub-v1-[a-f0-9]{64}$/.test(operation.idempotencyKey))
      throw new Error('Invalid host publication idempotency key');
    return operation.idempotencyKey;
  }
  return `rbpub-v1-${publicationDigest({
    version: 1,
    brandId: work.brandId,
    oid: work.oid,
    destinationId: work.destinationId,
    providerId: work.providerId,
    targetFingerprint: work.targetFingerprint,
    id: operation.id,
    kind: operation.kind,
    approvalId: operation.approvalId,
    approvalEpoch: operation.approvalEpoch,
    sourceGeneration: operation.sourceGeneration,
    intendedDigest: operation.intendedDigest,
    submittedAt: operation.submittedAt,
  })}`;
}

/** Build receipt provenance; adapters override key/digest/remote with observed values where supplied by the provider.
 * This helper constructs evidence only. The execution boundary independently validates it against durable intent.
 * @public
 * @see https://github.com/redbox-mint/redbox-portal/wiki/Publication-Provider-Development
 */
export function publicationOperationEvidence(
  work: PublicationWorkKey & { providerId: string; targetFingerprint: string },
  operation: PublicationOperation,
  remote?: import('./contracts').PublicationRemoteIdentity
): import('./contracts').PublicationOperationEvidence {
  return {
    brandId: work.brandId,
    oid: work.oid,
    destinationId: work.destinationId,
    providerId: work.providerId,
    targetFingerprint: work.targetFingerprint,
    operationId: operation.id,
    idempotencyKey: publicationOperationIdempotencyKey(work, operation),
    approvalId: operation.approvalId,
    approvalEpoch: operation.approvalEpoch,
    sourceGeneration: operation.sourceGeneration,
    intendedDigest: operation.intendedDigest,
    ...(remote ? { remote: { namespace: remote.namespace, objectId: remote.objectId } } : {}),
  };
}

/** A refused receipt is retained separately; it must never overwrite the durable operation intent. @internal */
export class PublicationEvidenceMismatch extends Error {
  constructor(
    readonly operationId: string,
    readonly field: string,
    readonly evidence: unknown
  ) {
    super(`publication_operation_evidence_mismatch:${field.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`)}`);
    this.name = 'PublicationEvidenceMismatch';
  }
}

/** Shared journal, acknowledgement and completion fence, including historical/legacy operations. @internal */
export function assertPublicationOperationEvidence(
  work: PublicationWorkKey & {
    providerId: string;
    targetFingerprint: string;
    binding?: import('./contracts').PublicationBinding;
  },
  operation: PublicationOperation,
  evidence: import('./contracts').PublicationOperationEvidence | undefined
): void {
  const fail = (field: string): never => {
    throw new PublicationEvidenceMismatch(operation.id ?? 'legacy-unknown', field, evidence ?? null);
  };
  if (!evidence || typeof evidence !== 'object') return fail('missing');
  // Empty approval and generation zero are explicit historical coordinates, not current authority.
  // Missing/malformed legacy intent is refused, rather than filled from the current request.
  if (
    typeof operation.id !== 'string' ||
    !operation.id ||
    typeof operation.kind !== 'string' ||
    !operation.kind ||
    typeof operation.approvalId !== 'string' ||
    !Number.isSafeInteger(operation.approvalEpoch) ||
    operation.approvalEpoch < 0 ||
    !Number.isSafeInteger(operation.sourceGeneration) ||
    operation.sourceGeneration < 0 ||
    typeof operation.intendedDigest !== 'string' ||
    !operation.intendedDigest ||
    typeof operation.submittedAt !== 'string' ||
    !operation.submittedAt ||
    !work.brandId ||
    !work.oid ||
    !work.destinationId ||
    !work.providerId ||
    !work.targetFingerprint
  )
    return fail('legacy_identity_incomplete');
  if (operation.idempotencyKey !== undefined && !/^rbpub-v1-[a-f0-9]{64}$/.test(operation.idempotencyKey))
    return fail('idempotencyKey');
  const expected = publicationOperationEvidence(
    work,
    operation,
    operation.identity?.remote ??
      (operation.outcome === 'confirmed' ? operation.confirmation?.remote : undefined) ??
      work.binding
  );
  for (const field of [
    'brandId',
    'oid',
    'destinationId',
    'providerId',
    'targetFingerprint',
    'operationId',
    'idempotencyKey',
    'approvalId',
    'approvalEpoch',
    'sourceGeneration',
    'intendedDigest',
  ] as const) {
    if (evidence[field] !== expected[field]) fail(field);
  }
  if (
    expected.remote &&
    (!evidence.remote ||
      evidence.remote.namespace !== expected.remote.namespace ||
      evidence.remote.objectId !== expected.remote.objectId)
  )
    fail('remote');
  if (
    evidence.remote &&
    (typeof evidence.remote.namespace !== 'string' ||
      !evidence.remote.namespace ||
      typeof evidence.remote.objectId !== 'string' ||
      !evidence.remote.objectId)
  )
    fail('remote');
}

/** Validate the complete set, so omitted, duplicated and unrelated receipts cannot satisfy completion. @internal */
export function assertPublicationCompletionOperations(
  work: Parameters<typeof assertPublicationOperationEvidence>[0],
  operations: readonly PublicationOperation[],
  evidence: import('./contracts').PublicationCompletionEvidence
): void {
  if (!evidence || typeof evidence !== 'object')
    throw new PublicationEvidenceMismatch('', 'operations', evidence ?? null);
  const proofs = evidence.operations ?? [];
  const confirmed = operations.filter(operation => operation.outcome === 'confirmed');
  if (!Array.isArray(proofs)) throw new PublicationEvidenceMismatch('', 'operations', evidence);
  for (const [index, operation] of confirmed.entries()) {
    const matches = proofs.filter(proof => proof?.operationId === operation.id);
    assertPublicationOperationEvidence(
      work,
      operation,
      matches.length === 1 ? matches[0] : matches.length === 0 ? proofs[index] : undefined
    );
  }
  for (const proof of proofs)
    if (!proof || !confirmed.some(operation => operation.id === proof.operationId))
      throw new PublicationEvidenceMismatch(proof?.operationId ?? '', 'operationId', proof ?? null);
}
/** Old completion without operation proof remains history until a supported adapter verifies it again. @internal */
export function publicationCompletionOperationsVerified(
  work: Parameters<typeof assertPublicationOperationEvidence>[0],
  operations: readonly PublicationOperation[],
  evidence: import('./contracts').PublicationCompletionEvidence
): boolean {
  try {
    assertPublicationCompletionOperations(work, operations, evidence);
    return true;
  } catch {
    return false;
  }
}
