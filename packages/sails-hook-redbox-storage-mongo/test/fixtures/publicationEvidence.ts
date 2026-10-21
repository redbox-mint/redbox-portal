import assert from 'node:assert/strict';
import {
  PublicationExecution,
  type PublicationOperationEvidence,
  type PublicationProviderOutcome,
  type PublicationObject,
} from '@researchdatabox/redbox-core';

/** The same provider-independent matrix is run through all three real adapters. */
export const publicationEvidenceFields = [
  'operationId',
  'idempotencyKey',
  'destinationId',
  'brandId',
  'oid',
  'providerId',
  'targetFingerprint',
  'approvalId',
  'approvalEpoch',
  'sourceGeneration',
  'intendedDigest',
  'remote.namespace',
  'remote.objectId',
  'missing',
] as const;
export type EvidenceField = (typeof publicationEvidenceFields)[number];
export function corruptPublicationEvidence(proof: PublicationOperationEvidence | undefined, field: EvidenceField) {
  assert.ok(proof, 'adapter must supply structured operation evidence');
  if (field === 'missing') return undefined;
  const result = structuredClone(proof);
  if (field === 'remote.namespace' || field === 'remote.objectId') {
    assert.ok(result.remote, 'adapter must name the observed remote identity');
    result.remote[field === 'remote.namespace' ? 'namespace' : 'objectId'] += '-different';
  } else if (field === 'approvalEpoch' || field === 'sourceGeneration') result[field] += 1;
  else result[field] += '-different';
  return result;
}
export async function withPublicationEvidenceMismatch(
  stage: 'journal' | 'completion',
  field: EvidenceField,
  run: () => Promise<void>
): Promise<void> {
  const journal = PublicationExecution.prototype.journal;
  const accept = PublicationExecution.prototype.acceptOutcome;
  let injected = false;
  if (stage === 'journal')
    PublicationExecution.prototype.journal = function (operation) {
      if (!injected && operation.outcome === 'confirmed') {
        injected = true;
        return journal.call(this, {
          ...operation,
          confirmation: corruptPublicationEvidence(operation.confirmation, field),
        });
      }
      return journal.call(this, operation);
    };
  else
    PublicationExecution.prototype.acceptOutcome = function (outcome: PublicationProviderOutcome<PublicationObject>) {
      if (!injected && outcome.kind === 'completed') {
        const evidence = structuredClone(outcome.evidence);
        assert.ok(evidence.operations?.length, 'completion must supply journal-bound evidence');
        const proof = corruptPublicationEvidence(evidence.operations[0], field);
        evidence.operations = proof ? [proof, ...evidence.operations.slice(1)] : [];
        injected = true;
        return accept.call(this, { ...outcome, evidence });
      }
      return accept.call(this, outcome);
    };
  try {
    await run();
    assert.equal(injected, true, 'the real adapter must reach the requested evidence boundary');
  } finally {
    PublicationExecution.prototype.journal = journal;
    PublicationExecution.prototype.acceptOutcome = accept;
  }
}
