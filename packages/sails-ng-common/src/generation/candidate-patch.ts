export const GENERATION_GROUNDING_STATES = [
  'sourceBacked',
  'guidanceBacked',
  'sourceAndGuidance',
  'inferred',
  'requiresReview',
] as const;

export type GenerationGroundingState = (typeof GENERATION_GROUNDING_STATES)[number];

export interface GenerationEvidenceSummary {
  id: string;
  label: string;
  kind: 'source' | 'knowledge';
}

export interface GenerationCandidatePatchItem {
  fieldId: string;
  metadataPointer: string;
  value: unknown;
  operation: 'fill';
  valueHash: string;
  groundingState: GenerationGroundingState;
  reviewRequired: boolean;
  reviewReasonCode?: string;
  rationale: string;
  evidence: GenerationEvidenceSummary[];
}

export interface GenerationCandidatePatch {
  runId: string;
  candidateDigest: string;
  baseTargetDigest: string;
  items: GenerationCandidatePatchItem[];
}
