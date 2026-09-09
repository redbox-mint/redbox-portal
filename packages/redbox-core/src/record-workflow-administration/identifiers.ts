import { createHash } from 'node:crypto';
import {
  RECORD_DEFINITION_KEY_PATTERN,
  parseRecordDefinitionBrandId,
  parseRecordDefinitionDraftId,
  parseRecordDefinitionId,
  parseRecordDefinitionKey,
  parseRecordDefinitionRevisionId,
  parseWorkflowTransitionId,
  type RecordDefinitionDraftId,
  type RecordDefinitionId,
  type RecordDefinitionKey,
  type RecordDefinitionRevisionId,
  type WorkflowTransitionId,
} from '@researchdatabox/sails-ng-common';

export const RECORD_DEFINITION_REVISION_NUMBER_MAX = Number.MAX_SAFE_INTEGER;

export interface CanonicalRecordDefinitionIdentityInput {
  readonly brandId: string;
  readonly recordTypeKey: string;
}

export interface CanonicalWorkflowTransitionIdentityInput extends CanonicalRecordDefinitionIdentityInput {
  /** Stable semantic key supplied by migration or the administration service. */
  readonly stableKey: string;
}

function lengthPrefix(parts: readonly string[]): string {
  return parts.map(part => `${Buffer.byteLength(part, 'utf8')}:${part}`).join('|');
}

function digest(parts: readonly string[]): string {
  return createHash('sha256').update(lengthPrefix(parts)).digest('hex').slice(0, 32);
}

function canonicalIdentity(input: CanonicalRecordDefinitionIdentityInput): {
  readonly brandId: string;
  readonly recordTypeKey: RecordDefinitionKey;
} {
  return {
    brandId: parseRecordDefinitionBrandId(input.brandId),
    recordTypeKey: parseRecordDefinitionKey(input.recordTypeKey),
  };
}

export function deriveRecordDefinitionId(input: CanonicalRecordDefinitionIdentityInput): RecordDefinitionId {
  const identity = canonicalIdentity(input);
  return parseRecordDefinitionId(
    `rti_${digest(['record-definition-identity-v1', identity.brandId, identity.recordTypeKey])}`
  );
}

export function deriveRecordDefinitionDraftId(input: CanonicalRecordDefinitionIdentityInput): RecordDefinitionDraftId {
  const identity = canonicalIdentity(input);
  return parseRecordDefinitionDraftId(
    `rdd_${digest(['record-definition-draft-v1', identity.brandId, identity.recordTypeKey])}`
  );
}

export function deriveRecordDefinitionRevisionId(
  input: CanonicalRecordDefinitionIdentityInput,
  revisionNumber: number
): RecordDefinitionRevisionId {
  const identity = canonicalIdentity(input);
  if (!Number.isSafeInteger(revisionNumber) || revisionNumber < 1) {
    throw new TypeError('Record-definition revision number is invalid.');
  }
  return parseRecordDefinitionRevisionId(
    `rdr_${digest(['record-definition-revision-v1', identity.brandId, identity.recordTypeKey, String(revisionNumber)])}`
  );
}

/** The transition ID is stable and deliberately independent of action bindings. */
export function deriveWorkflowTransitionId(input: CanonicalWorkflowTransitionIdentityInput): WorkflowTransitionId {
  const identity = canonicalIdentity(input);
  if (!RECORD_DEFINITION_KEY_PATTERN.test(input.stableKey)) {
    throw new TypeError('Workflow transition stable key is invalid.');
  }
  return parseWorkflowTransitionId(
    `wft_${digest(['workflow-transition-v1', identity.brandId, identity.recordTypeKey, input.stableKey])}`
  );
}
