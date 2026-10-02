import { GenerationCandidatePatch } from './candidate-patch';
import { GenerationRuntimeInitialValue } from './form-runtime-meta';
import { GenerationQuestion } from './question';
import { GenerationDocument, GenerationDocumentPolicy } from './document';

export const GENERATION_RUN_STATUSES = [
  'draft',
  'queued',
  'running',
  'validating',
  'completed',
  'failed',
  'cancelRequested',
  'cancelled',
  'committing',
  'committed',
  'expired',
] as const;

export type GenerationRunStatus = (typeof GENERATION_RUN_STATUSES)[number];

export const GENERATION_RUN_PHASES = ['context', 'provider', 'validation', 'population', 'saveCommit'] as const;
export type GenerationRunPhase = (typeof GENERATION_RUN_PHASES)[number];

export const GENERATION_TERMINAL_STATUSES: ReadonlyArray<GenerationRunStatus> = [
  'committed',
  'cancelled',
  'expired',
];

export interface GenerationSafeError {
  code: string;
  messageKey: string;
  retryable: boolean;
  correlationId?: string;
}

export interface GenerationRunView {
  runId: string;
  status: GenerationRunStatus;
  phase: GenerationRunPhase;
  attemptCount: number;
  retryable: boolean;
  questions: GenerationQuestion[];
  result: GenerationCandidatePatch | null;
  completionValues?: GenerationRuntimeInitialValue[];
  error?: GenerationSafeError;
  artifactExpiresAt?: string;
  documentPolicy?: GenerationDocumentPolicy;
  documents?: GenerationDocument[];
}

export interface GenerationExecuteRequest {
  /** Explicit selection at execution; null clears an optional record source. */
  sourceOid?: string | null;
  documentIds?: string[];
  documentsReviewed?: boolean;
  documentNotes?: string;
  answers: Array<{ id: string; value: unknown }>;
  targetForm: {
    recordType: string;
    formName?: string;
    mode: 'create';
  };
  targetDraft: Record<string, unknown>;
}

export interface GenerationCommitRequest {
  targetOid: string;
  candidateDigest: string;
  reviewedFieldIds: string[];
}

export interface GenerationCommitResult {
  runId: string;
  targetOid: string;
  committed: boolean;
  provenanceCount: number;
}

export function isGenerationRunStatus(value: unknown): value is GenerationRunStatus {
  return typeof value === 'string' && (GENERATION_RUN_STATUSES as readonly string[]).includes(value);
}

export function isGenerationRunPhase(value: unknown): value is GenerationRunPhase {
  return typeof value === 'string' && (GENERATION_RUN_PHASES as readonly string[]).includes(value);
}
