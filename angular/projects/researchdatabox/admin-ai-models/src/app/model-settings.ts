import type {
  GenerationAdminConnection, GenerationAdminConnectionDraft, GenerationAdminModelDraft,
  GenerationAdminOverview,
} from '@researchdatabox/sails-ng-common/runtime';

export const adapterLabels: Record<string, string> = {
  openrouter: 'ai-models-adapter-openrouter', bedrock: 'ai-models-adapter-bedrock', fake: 'ai-models-adapter-fake',
};
export const curatedModels: Record<string, string[]> = {
  openrouter: ['anthropic/claude-haiku-4.5', 'anthropic/claude-sonnet-4.5', 'openai/gpt-4.1-mini', 'google/gemini-2.5-flash'],
  bedrock: ['amazon.nova-lite-v1:0', 'amazon.nova-pro-v1:0', 'anthropic.claude-3-5-haiku-20241022-v1:0'],
  fake: ['redbox-fixture-rdmp-1'],
};
export const numericSettings = ['maxOutputTokens', 'topP', 'seed', 'presencePenalty', 'frequencyPenalty'] as const;
export type NumericSetting = typeof numericSettings[number] | 'temperature';
export type Issues = Record<string, string>;
export const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
export const slug = (name: string): string => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100).replace(/-$/, '');
export const validKey = (key: string): boolean => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(key) && key.length <= 100;
const validText = (text: string): boolean => !!text.trim() && text.trim().length <= 200;
const invalid = 'ai-models-validation-range';

/** Explicit allowlist: never round-trip health, endpoints, audit fields or dataPolicy. */
export function connectionDraft(connection: GenerationAdminConnectionDraft): GenerationAdminConnectionDraft {
  const { key, name, adapterId, enabled, authStrategy, timeoutMs, region, secretRef, apiKey, nonSecretHeaders } = connection;
  return { key, name, adapterId, enabled, authStrategy, timeoutMs,
    ...(adapterId === 'bedrock' ? { region } : {}),
    ...(authStrategy === 'bearer' && secretRef ? { secretRef } : {}),
    ...(authStrategy === 'bearer' && apiKey ? { apiKey } : {}),
    ...(nonSecretHeaders ? { nonSecretHeaders: clone(nonSecretHeaders) } : {}),
  };
}
export function modelDraft(model: GenerationAdminModelDraft): GenerationAdminModelDraft {
  return clone({ name: model.name, connectionId: model.connectionId, modelId: model.modelId,
    parameters: model.parameters ?? {}, routingPolicy: model.routingPolicy ?? {} });
}
export function validateConnection(d: GenerationAdminConnectionDraft, overview: GenerationAdminOverview): Issues {
  const issues: Issues = {};
  if (!validText(d.name)) issues['name'] = 'ai-models-validation-name';
  if (!validKey(d.key)) issues['key'] = 'ai-models-validation-key';
  if (!overview.adapters.includes(d.adapterId)) issues['adapterId'] = 'ai-models-validation-adapter-updated';
  if (!Number.isInteger(d.timeoutMs / 1000) || d.timeoutMs <= 0 || d.timeoutMs > overview.limits.provider.timeoutMs) issues['timeoutMs'] = invalid;
  if (d.adapterId === 'bedrock' && !overview.bedrockRegions.includes(d.region ?? '')) issues['region'] = 'ai-models-validation-region';
  if (d.authStrategy === 'bearer') {
    const [scheme, ...reference] = (d.secretRef ?? '').split(':');
    if (!d.apiKey?.trim() && (!overview.secretSchemes.includes(scheme) || !reference.join(':').trim() || (d.secretRef?.length ?? 0) > 500)) issues['secretRef'] = 'ai-models-validation-secret-updated';
  }
  const headers = Object.entries(d.nonSecretHeaders ?? {});
  if (headers.length > 30 || headers.some(([key, value]) =>
    !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(key) || /authorization|cookie|host|token|key|secret|password/i.test(key) ||
    value.length > 2000 || /[\r\n]/.test(value))) issues['headers'] = 'ai-models-validation-headers';
  return issues;
}
export function accepts(adapter: string, setting: string): boolean {
  return adapter === 'openrouter' || adapter === 'bedrock' && ['temperature', 'maxOutputTokens', 'topP', 'stopSequences'].includes(setting);
}
export function validateModel(d: GenerationAdminModelDraft, connection?: GenerationAdminConnection): Issues {
  const issues: Issues = {};
  if (!validText(d.name)) issues['name'] = 'ai-models-validation-name';
  if (!validText(d.modelId)) issues['modelId'] = 'ai-models-validation-model';
  if (!connection?.enabled) issues['connectionId'] = 'ai-models-validation-connection-updated';
  const p = d.parameters ?? {};
  const ranges: [NumericSetting, number, number, boolean][] = [
    ['temperature', 0, connection?.adapterId === 'bedrock' ? 1 : 2, false],
    ['maxOutputTokens', 1, Infinity, true], ['topP', 0, 1, false], ['seed', -Infinity, Infinity, true],
    ['presencePenalty', -2, 2, false], ['frequencyPenalty', -2, 2, false],
  ];
  for (const [name, min, max, integer] of ranges) {
    const value = p[name];
    if (value !== undefined && (!Number.isFinite(value) || value < min || value > max || integer && !Number.isInteger(value))) issues[name] = invalid;
  }
  if (p.stopSequences && (p.stopSequences.length > 4 || p.stopSequences.some(value => !value.trim()))) issues['stopSequences'] = 'ai-models-validation-stops';
  for (const name of ['only', 'ignore', 'order'] as const) {
    const values = d.routingPolicy?.[name];
    if (values && (values.length > 100 || values.some(value => !validText(value)))) issues[name] = 'ai-models-validation-routing';
  }
  return issues;
}


export const modelNames: Record<string, string> = {
  'anthropic/claude-haiku-4.5': 'Claude Haiku 4.5 · Anthropic',
  'anthropic/claude-sonnet-4.5': 'Claude Sonnet 4.5 · Anthropic',
  'openai/gpt-4.1-mini': 'GPT-4.1 mini · OpenAI',
  'google/gemini-2.5-flash': 'Gemini 2.5 Flash · Google',
  'amazon.nova-lite-v1:0': 'Amazon Nova Lite', 'amazon.nova-pro-v1:0': 'Amazon Nova Pro',
  'anthropic.claude-3-5-haiku-20241022-v1:0': 'Claude 3.5 Haiku · Anthropic',
  'redbox-fixture-rdmp-1': 'ai-models-demo-model',
};
