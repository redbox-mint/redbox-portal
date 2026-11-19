import type { GenerationAdminConnection, GenerationAdminModelVersion, GenerationAdminOverview } from '@researchdatabox/sails-ng-common';
export const openrouter: GenerationAdminConnection = {
  id: 'connection-or', key: 'openrouter', name: 'OpenRouter', adapterId: 'openrouter', enabled: true,
  authStrategy: 'bearer', secretRef: 'env:OPENROUTER_API_KEY', timeoutMs: 90000,
  endpoint: 'https://openrouter.ai/api/v1', secretConfigured: true,
  nonSecretHeaders: { 'X-Title': 'ReDBox' },
};
export const bedrock: GenerationAdminConnection = {
  id: 'connection-br', key: 'bedrock', name: 'Amazon Bedrock', adapterId: 'bedrock', enabled: true,
  authStrategy: 'aws-default-chain', region: 'ap-southeast-2', timeoutMs: 90000,
  endpoint: 'https://bedrock-runtime.ap-southeast-2.amazonaws.com', secretConfigured: true,
};
export const model: GenerationAdminModelVersion = {
  id: 'model-v2', brandId: 'brand', key: 'rdmp', name: 'RDMP model', version: 2, status: 'draft',
  connectionId: 'connection-or', modelId: 'anthropic/claude-haiku-4.5', contentHash: 'a'.repeat(64),
  requiredCapabilities: { structuredOutput: true, nonStreaming: true, textInput: true }, createdBy: 'admin',
  parameters: { temperature: 0.2, maxOutputTokens: 4096, topP: 0.9, seed: 7, stopSequences: ['END'], presencePenalty: 0.1, frequencyPenalty: -0.1 },
  routingPolicy: { zdr: true, data_collection: 'deny', allow_fallbacks: false, sort: 'price', only: ['Anthropic'], ignore: ['Other'], order: ['Anthropic'] },
};
export const overview: GenerationAdminOverview = {
  enabled: true, adapters: ['openrouter', 'bedrock', 'fake'], secretSchemes: ['env'], bedrockRegions: ['ap-southeast-2'],
  limits: { provider: { timeoutMs: 90000, maxRequestBytes: 512000, maxResponseBytes: 256000, maxRetries: 1 }, outbound: { allowedHosts: ['openrouter.ai'] }, cooldownMs: 5000, maxPromptChars: 2000 },
  connections: [openrouter, bedrock], models: [{ key: 'rdmp', name: model.name, usageCount: 1,
    versions: [model, { ...model, id: 'model-v1', version: 1, status: 'published' }] }],
};
