import type {
  FormRuntimeAction,
  GenerationCandidatePatch,
  GenerationRuntimeInitialValue,
  GenerationRunPhase,
  GenerationRunStatus,
  GenerationDocument,
} from '@researchdatabox/sails-ng-common';

export type GenerationOutputType = import('@researchdatabox/sails-ng-common').GenerationProfileOutput;
export type GenerationProfileDefinitionV1 = import('@researchdatabox/sails-ng-common').GenerationProfileDefinition;
export type GenerationProfileSourceSlot = GenerationProfileDefinitionV1['sourceSlots'][number];
export type GenerationProfileQuestion = GenerationProfileDefinitionV1['questions'][number];
export type GenerationProfileTargetField = GenerationProfileDefinitionV1['targetFields'][number];

export interface GenerationBindingDefinition {
  brandId: string;
  key: string;
  sourceRecordType?: string;
  targetRecordType: string;
  targetFormName?: string;
  targetStartingWorkflowStage: string;
  sourceWorkflowStages?: string[];
  sourceModes?: Array<'view' | 'edit'>;
  allowedRoles: string[];
  action: Omit<FormRuntimeAction, 'id' | 'bindingKey' | 'sourceOid'>;
  sourceRelationship?: {
    sourceSlotId: string;
    metadataPointer: string;
  };
  sourceValueMappings?: GenerationSourceValueMapping[];
  allowMultipleTargetsPerSource: boolean;
  maxSuccessfulRunsPerIntent: number;
}

export interface GenerationSourceValueMapping {
  sourceMetadataPointer: string;
  targetMetadataPointer: string;
}

export interface GenerationActorContext {
  brandId: string;
  branding: string;
  portal: string;
  userId: string;
  username: string;
  roles: string[];
}

export interface GenerationSourceReference {
  slotId: string;
  recordType: string;
  oid: string;
  revision?: string;
  payloadHash?: string;
}

export interface GenerationTargetDescriptor {
  recordType: string;
  formName?: string;
  mode: 'create';
  initialTargetHash?: string;
  targetOid?: string;
}

export interface GenerationRunAudit {
  id: string;
  brandId: string;
  status: GenerationRunStatus;
  phase: GenerationRunPhase;
  attemptCount: number;
  sourceRefs: GenerationSourceReference[];
  targetDescriptor: GenerationTargetDescriptor;
  candidateDigest?: string;
}

export interface GenerationEvidence {
  id: string;
  label: string;
  kind: 'source' | 'knowledge';
  content: unknown;
  contentHash: string;
  authority?: string;
  tags?: string[];
  questionId?: string;
  selectedOptions?: Array<{ value: string; label: string }>;
}

export interface GenerationEvidenceAlias {
  alias: string;
  evidenceId: string;
}

export interface GenerationFrozenInput {
  sources: Array<{ slotId: string; recordType: string; oid: string; values: Record<string, unknown> }>;
  answers: Array<{ id: string; value: unknown }>;
  targetForm: GenerationTargetDescriptor;
  targetDraft: Record<string, unknown>;
  baseTargetDigest: string;
  sourceEvidence: GenerationEvidence[];
}

export interface GenerationArtifactPayload {
  documents?: GenerationDocument[];
  frozenInput?: GenerationFrozenInput;
  knowledge?: GenerationEvidence[];
  providerRequest?: GenerationProviderRequest;
  rawResponse?: unknown;
  candidate?: GenerationCandidatePatch;
  completionValues?: GenerationRuntimeInitialValue[];
  validationDiagnostics?: Array<Record<string, unknown>>;
}

export interface GenerationProviderCapabilities {
  structuredOutput: boolean;
  nonStreaming: boolean;
  textInput: boolean;
  seed?: boolean;
  zeroDataRetention?: boolean;
}

export interface GenerationProviderConnectionContext {
  endpoint: string;
  secret?: string;
  timeoutMs: number;
  nonSecretHeaders?: Record<string, string>;
}

export interface GenerationDeploymentConfig {
  modelId: string;
  parameters?: Record<string, unknown>;
  routingPolicy?: Record<string, unknown>;
  requiredCapabilities?: Partial<GenerationProviderCapabilities>;
}

export interface GenerationProviderRequest {
  connection: GenerationProviderConnectionContext;
  deployment: GenerationDeploymentConfig;
  messages: Array<{ role: 'system' | 'user'; content: string }>;
  responseSchema?: Record<string, unknown>;
  correlationId: string;
}

export interface GenerationProviderResponse {
  content: string;
  requestedModel: string;
  actualModel?: string;
  actualProvider?: string;
  finishReason?: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    cost?: number;
  };
  routerMetadata?: Record<string, string | number | boolean>;
}

export interface GenerationProviderHealth {
  ok: boolean;
  capabilities: GenerationProviderCapabilities;
  checkedAt: string;
  safeMessage?: string;
}

export interface GenerationProviderAdapter {
  readonly adapterId: string;
  getConfigurationSchema(): Record<string, unknown>;
  getSecretSchema(): Record<string, unknown>;
  getCapabilities(deployment: GenerationDeploymentConfig): Promise<GenerationProviderCapabilities>;
  healthCheck(
    connection: GenerationProviderConnectionContext,
    deployment?: GenerationDeploymentConfig,
  ): Promise<GenerationProviderHealth>;
  invoke(input: GenerationProviderRequest, signal: AbortSignal): Promise<GenerationProviderResponse>;
}

export type GenerationProviderFactory = () => GenerationProviderAdapter;
