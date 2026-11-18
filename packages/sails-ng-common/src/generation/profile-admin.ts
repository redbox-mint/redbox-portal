import type { GenerationQuestion } from './question';
import type { GenerationDocumentPolicy } from './document';

export type GenerationProfileOutput =
  | { kind: 'string' | 'richText'; maxLength?: number }
  | { kind: 'boolean' | 'date' }
  | { kind: 'enum'; values: string[] }
  | { kind: 'enumArray'; values: string[]; maxItems?: number }
  | { kind: 'object' | 'objectArray'; properties: Record<string, GenerationProfileOutput>; maxItems?: number };
export interface GenerationProfileDefinition {
  purpose: string;
  systemInstructions: string;
  targetForm?: { recordType: string; formName: string };
  sourceSlots: Array<{ id: string; recordType: string; allowedPaths: string[]; maxBytes: number; required?: boolean }>;
  documentSources?: GenerationDocumentPolicy;
  questions: Array<Omit<GenerationQuestion, 'defaultValue'> & { sourceDefaultExpression?: string }>;
  targetFields: Array<{
    id: string; label?: string; metadataPointer: string; expectedComponentClasses: string[];
    options?: Array<{ value: string; label: string }>;
    output: GenerationProfileOutput; operation: 'fill'; maxLength?: number; knowledgeTags?: string[]; reviewedAnswerIds?: string[];
    grounding: 'sourceRequired' | 'guidanceRequired' | 'sourceOrGuidance' | 'inferenceAllowed';
    fallback?: { value: unknown; reasonCode: string; reviewRequired: boolean };
  }>;
  knowledgeCollectionVersionIds: string[];
  modelDeploymentId: string;
  contextLimits: { totalBytes: number; maxKnowledgeChunks: number; maxChunkBytes: number };
  fixtureTests?: Array<Record<string, unknown>>;
}
export interface ProfileField {
  pointer: string; label: string; group: string; component: string; output?: GenerationProfileOutput;
  options?: Array<{ value: string; label: string }>; personal?: boolean; sensitive?: boolean;
}
export interface ProfileForm { name: string; label: string; recordType: string; fields: ProfileField[] }
export interface ProfileProblem { section: string; row?: string; messageKey: string; label?: string; form?: string }
export interface ProfileVersion {
  id: string; version: number; status: string; definition: GenerationProfileDefinition; contentHash: string;
  createdBy: string; createdByName?: string; publishedByName?: string; retiredByName?: string; createdAt?: string; publishedBy?: string; publishedAt?: string; retiredBy?: string; retiredAt?: string;
  problems: ProfileProblem[];
}
export interface ProfileUsage { key: string; name: string; href: string }
export interface ProfileSummary {
  id: string; key: string; name: string; publishedVersionId?: string; versions: ProfileVersion[];
  uses: ProfileUsage[]; hasPublished: boolean; runCount: number;
}
export interface ProfileOverview {
  enabled: boolean; profiles: ProfileSummary[];
  recordTypes: Array<{ name: string; label: string; formName?: string }>;
  forms: ProfileForm[];
  models: Array<{ id: string; key: string; name: string; version: number; provider: string; available: boolean }>;
  guidance: Array<{ id: string; name: string; version: number; topics: string[] }>;
  limits: { context: { maxTotalBytes: number; maxFieldBytes: number; maxKnowledgeChunks: number; maxChunkBytes: number };
    documents: GenerationDocumentPolicy; cooldownMs: number };
}
export interface ProfileDraft { name: string; definition: GenerationProfileDefinition; expectedContentHash: string }
export interface ProfileTestResult {
  name: string; passed: boolean; ranAt: string; errorKey?: string;
  fields: Array<{ label: string; value?: unknown; evidence: string[]; passed: boolean; reviewRequired?: boolean; errorKey?: string }>;
}
export interface ProfileDeletion { deleted: boolean; uses: ProfileUsage[]; hasPublished: boolean; runCount: number }
