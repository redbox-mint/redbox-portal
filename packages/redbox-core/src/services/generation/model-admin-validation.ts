import { GenerationError } from '../../model/generation';
import { z } from '../../api-routes/zod-openapi';

export const BEDROCK_REGIONS = [
  'us-east-1', 'us-east-2', 'us-west-2', 'ap-south-1', 'ap-south-2', 'ap-northeast-1',
  'ap-northeast-2', 'ap-northeast-3', 'ap-southeast-1', 'ap-southeast-2', 'ap-southeast-3',
  'ap-southeast-4', 'ca-central-1', 'eu-central-1', 'eu-central-2', 'eu-west-1', 'eu-west-2',
  'eu-west-3', 'eu-north-1', 'eu-south-1', 'eu-south-2', 'sa-east-1',
] as const;
const text = z.string().trim().min(1).max(200);
const key = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(100);
export const modelParametersSchema = z.object({
  temperature: z.number().min(0).max(2).optional(),
  maxOutputTokens: z.number().int().positive().optional(),
  topP: z.number().min(0).max(1).optional(),
  seed: z.number().int().optional(),
  stopSequences: z.array(z.string().min(1).refine(value => !!value.trim())).max(4).optional(),
  presencePenalty: z.number().min(-2).max(2).optional(),
  frequencyPenalty: z.number().min(-2).max(2).optional(),
  fixtureResponse: z.unknown().optional(),
}).strict();
const providers = z.array(text).max(100);
export const modelRoutingSchema = z.object({
  zdr: z.boolean().optional(), data_collection: z.enum(['allow', 'deny']).optional(),
  allow_fallbacks: z.boolean().optional(), sort: z.enum(['price', 'throughput', 'latency']).optional(),
  only: providers.optional(), ignore: providers.optional(), order: providers.optional(),
}).strict();
export const modelDraftSchema = z.object({
  name: text, connectionId: text, modelId: text,
  parameters: modelParametersSchema.optional(), routingPolicy: modelRoutingSchema.optional(),
}).strict();
export const createModelSchema = modelDraftSchema.extend({ key });
export const updateModelSchema = modelDraftSchema.extend({ expectedContentHash: z.string().regex(/^[a-f0-9]{64}$/) });
export const connectionDraftSchema = z.object({
  key, name: text, adapterId: text, enabled: z.boolean(),
  region: z.enum(BEDROCK_REGIONS).optional(),
  authStrategy: z.enum(['bearer', 'aws-default-chain', 'none']),
  secretRef: z.string().max(500).optional(),
  apiKey: z.string().trim().min(1).max(8000).refine(value => !['__REDACTED__', '__CLEAR_SECRET__'].includes(value)).optional(),
  nonSecretHeaders: z.record(z.string(), z.string().max(2000)).optional(),
  timeoutMs: z.number().int().positive().max(2_147_483_647),
}).strict();
export const testConnectionSchema = z.object({
  connectionId: text.optional(), connection: connectionDraftSchema,
}).strict();
export const tryPromptSchema = z.object({
  draft: modelDraftSchema, prompt: z.string().min(1).max(2000).refine(value => !!value.trim()),
  mode: z.enum(['sample', 'text']),
}).strict();

export type ConnectionDraft = z.infer<typeof connectionDraftSchema>;
export type ModelDraft = z.infer<typeof modelDraftSchema>;

export function parseAdminInput<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new GenerationError('GENERATION_REQUEST_INVALID', 'Invalid AI model settings');
  return result.data;
}

/** Convert stored OpenRouter settings when cloning legacy deployments into an editable draft. */
export function sdkParameters(parameters: Record<string, unknown> = {}): Record<string, unknown> {
  const aliases: Record<string, string> = {
    max_tokens: 'maxOutputTokens', top_p: 'topP', stop: 'stopSequences',
    presence_penalty: 'presencePenalty', frequency_penalty: 'frequencyPenalty',
  };
  const result = { ...parameters };
  for (const [legacy, sdk] of Object.entries(aliases)) {
    if (Object.hasOwn(result, legacy)) {
      if (!Object.hasOwn(result, sdk)) result[sdk] = result[legacy];
      delete result[legacy];
    }
  }
  return result;
}

export function validateModelDraft(input: unknown, adapterId: string): ModelDraft {
  const draft = parseAdminInput(modelDraftSchema, input);
  if ((adapterId === 'bedrock' && (draft.parameters?.temperature ?? 0) > 1) ||
      (adapterId !== 'fake' && Object.hasOwn(draft.parameters ?? {}, 'fixtureResponse')) ||
      (adapterId !== 'openrouter' && Object.keys(draft.routingPolicy ?? {}).length)) {
    throw new GenerationError('GENERATION_REQUEST_INVALID', 'Settings are incompatible with this adapter');
  }
  return draft;
}

export const sensitiveHeaderName = /authorization|cookie|host|token|key|secret|password/i;
