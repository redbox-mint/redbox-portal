/** Session/CSRF-protected JSON contracts for /app/ai-models. References are never secret values. */
export interface GenerationAdminParameters {
  temperature?: number;
  maxOutputTokens?: number;
  topP?: number;
  seed?: number;
  stopSequences?: string[];
  presencePenalty?: number;
  frequencyPenalty?: number;
  /** Existing fake-adapter fixture; preserve when editing. */
  fixtureResponse?: unknown;
}
export interface GenerationAdminRouting {
  zdr?: boolean;
  data_collection?: 'allow' | 'deny';
  allow_fallbacks?: boolean;
  sort?: 'price' | 'throughput' | 'latency';
  only?: string[];
  ignore?: string[];
  order?: string[];
}
export interface GenerationAdminConnectionDraft {
  key: string;
  name: string;
  adapterId: string;
  enabled: boolean;
  region?: string;
  authStrategy: 'bearer' | 'aws-default-chain' | 'none';
  /** Omit to retain on update; an installed scheme followed by a reference. */
  secretRef?: string;
  nonSecretHeaders?: Record<string, string>;
  timeoutMs: number;
}
export interface GenerationAdminConnection extends GenerationAdminConnectionDraft {
  id: string;
  endpoint: string;
  secretConfigured: boolean;
  lastHealthStatus?: string;
  lastHealthCheckedAt?: string;
}
export interface GenerationAdminModelDraft {
  name: string;
  connectionId: string;
  modelId: string;
  parameters?: GenerationAdminParameters;
  routingPolicy?: GenerationAdminRouting;
}
export interface GenerationAdminCreateModel extends GenerationAdminModelDraft { key: string; }
export interface GenerationAdminUpdateDraft extends GenerationAdminModelDraft { expectedContentHash: string; }
export interface GenerationAdminModelVersion extends GenerationAdminModelDraft {
  id: string;
  brandId: string;
  key: string;
  version: number;
  status: 'draft' | 'published' | 'retired';
  contentHash: string;
  requiredCapabilities: Record<string, boolean>;
  capabilitySnapshot?: Record<string, unknown>;
  createdBy: string;
  publishedBy?: string;
  publishedAt?: string;
}
export interface GenerationAdminModelGroup {
  key: string;
  name: string;
  versions: GenerationAdminModelVersion[];
  usageCount: number;
}
export interface GenerationAdminOverview {
  enabled: boolean;
  adapters: string[];
  secretSchemes: string[];
  bedrockRegions: string[];
  limits: {
    provider: { timeoutMs: number; maxRequestBytes: number; maxResponseBytes: number; maxRetries: number };
    outbound: { allowedHosts: string[] };
    cooldownMs: number;
    maxPromptChars: number;
  };
  connections: GenerationAdminConnection[];
  models: GenerationAdminModelGroup[];
}
export interface GenerationAdminTestConnection {
  connectionId?: string;
  connection: GenerationAdminConnectionDraft;
}
export interface GenerationAdminConnectionHealth {
  ok: boolean;
  secretConfigured: boolean;
  checkedAt: string;
  capabilities: Record<string, boolean>;
}
export interface GenerationAdminTryPrompt {
  draft: GenerationAdminModelDraft;
  prompt: string;
  mode: 'sample' | 'text';
}
export interface GenerationAdminPromptResult {
  output: string;
  requestedModel: string;
  actualModel?: string;
  actualProvider?: string;
  finishReason?: string;
  usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number; cost?: number };
  latencyMs: number;
}
export interface GenerationAdminErrorResponse {
  error: { code: string; messageKey: string; retryable: boolean };
}
