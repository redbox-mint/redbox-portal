import { GenerationEvidenceSummary, GenerationGroundingState } from './candidate-patch';

export const GENERATION_PROVENANCE_DISPLAY_STATES = ['generated', 'edited', 'removed'] as const;
export type GenerationProvenanceDisplayState = (typeof GENERATION_PROVENANCE_DISPLAY_STATES)[number];

export interface GenerationFieldProvenanceView {
  id: string;
  runId: string;
  profileFieldId: string;
  metadataPointer: string;
  displayState: GenerationProvenanceDisplayState;
  groundingState: GenerationGroundingState;
  reviewRequired: boolean;
  reviewReasonCode?: string;
  reviewedAt?: string;
  rationale: string;
  evidence: GenerationEvidenceSummary[];
  generatedAt: string;
  committedAt?: string;
}

export interface GenerationProvenanceResponse {
  recordOid: string;
  fields: GenerationFieldProvenanceView[];
}
