import { defineApiRoute } from '../define';
import { z } from '../zod-openapi';
import { responseField } from '../schemas/common';
import { connectionDraftSchema, createModelSchema, testConnectionSchema, tryPromptSchema, updateModelSchema } from '../../services/generation/model-admin-validation';
import type { HttpMethod } from '../types';

const error = z.object({ error: z.object({ code: z.string(), messageKey: z.string(), retryable: z.boolean(), correlationId: z.string().optional() }) });
const id = z.string().min(1).max(200);
const connection = z.object({
  id, key: z.string(), name: z.string(), adapterId: z.string(), enabled: z.boolean(), endpoint: z.string(),
  authStrategy: z.string(), secretRef: z.string().optional(), secretConfigured: z.boolean(), region: z.string().optional(),
  nonSecretHeaders: z.record(z.string(), z.string()), timeoutMs: z.number(),
  lastHealthStatus: z.string().optional(), lastHealthCheckedAt: z.string().optional(),
});
const deployment = z.object({
  id, brandId: id, key: z.string(), name: z.string(), version: z.number().int(), status: z.enum(['draft', 'published', 'retired']),
  connectionId: id, modelId: z.string(), parameters: z.record(z.string(), z.unknown()).optional(),
  routingPolicy: z.record(z.string(), z.unknown()).optional(), requiredCapabilities: z.record(z.string(), z.boolean()),
  contentHash: z.string(), createdBy: z.string(), capabilitySnapshot: z.record(z.string(), z.unknown()).optional(),
  publishedBy: z.string().optional(), publishedAt: z.string().optional(),
});
const uses = z.array(z.object({ key: z.string(), name: z.string() }));
const deletion = z.object({ deleted: z.boolean(), uses });
const health = z.object({ ok: z.boolean(), secretConfigured: z.boolean(), checkedAt: z.string(), capabilities: z.record(z.string(), z.boolean()), latencyMs: z.number(), errorCode: z.string().optional() });
const overview = z.object({
  enabled: z.boolean(), adapters: z.array(z.string()), secretSchemes: z.array(z.string()), bedrockRegions: z.array(z.string()),
  limits: z.object({ provider: z.object({ timeoutMs: z.number(), maxRequestBytes: z.number(), maxResponseBytes: z.number(), maxRetries: z.number() }),
    outbound: z.object({ allowedHosts: z.array(z.string()) }), cooldownMs: z.number(), maxPromptChars: z.number() }),
  connections: z.array(connection), models: z.array(z.object({ key: z.string(), name: z.string(), versions: z.array(deployment), usageCount: z.number(), uses })),
});
const promptResult = z.object({
  output: z.string(), requestedModel: z.string(), actualModel: z.string().optional(), actualProvider: z.string().optional(),
  finishReason: z.string().optional(), latencyMs: z.number(), usage: z.object({ inputTokens: z.number().optional(),
    outputTokens: z.number().optional(), totalTokens: z.number().optional(), cost: z.number().optional() }).optional(),
});
function route(method: HttpMethod, path: string, action: string, summary: string, response: z.ZodType, body?: z.ZodType, param?: string) {
  return defineApiRoute({
    method, path: '/:branding/:portal/app/ai-models' + path, controller: 'GenerationModelAdminController', action,
    csrf: true, security: [{ sessionAuth: [] }], extensions: { 'x-redbox-roles': ['Admin'] }, tags: ['AI models'], summary,
    description: 'Session-authenticated Admin for the route brand. Raw JSON; errors contain translated codes and never provider bodies.',
    request: { ...(param ? { params: z.object({ [param]: id }) } : {}),
      ...(body ? { body: { required: true, content: { 'application/json': { schema: body } } } } : {}) },
    responses: {
      200: responseField(response, 'Operation result'), 400: responseField(error, 'Invalid settings'),
      403: responseField(error, 'Brand Admin session and CSRF required'), 404: responseField(error, 'Unknown connection or model version'),
      409: responseField(error, 'Stale draft, immutable version, duplicate key or published profile usage'),
      413: responseField(error, 'Request body too large'), 422: responseField(error, 'Model or connection incompatible'),
      429: responseField(error, 'Shared test cooldown or provider rate limit'),
      502: responseField(error, 'Invalid provider output'), 503: responseField(error, 'Disabled, unavailable or credential failure'),
      504: responseField(error, 'Provider timeout'),
    },
  });
}
export const generationModelAdminRoutes = [
  route('delete', '/connections/:connectionId', 'deleteConnection', 'Delete an unused provider and clear its key', deletion, undefined, 'connectionId'),
  route('delete', '/models/by-key/:key', 'deleteModel', 'Delete all model versions unless a profile uses one', deletion, undefined, 'key'),
  route('delete', '/models/:deploymentId', 'discardDraft', 'Discard an unused draft version', deletion, undefined, 'deploymentId'),
  route('get', '/overview', 'overview', 'Get AI model configuration', overview),
  route('post', '/connections', 'createConnection', 'Create a provider connection', connection, connectionDraftSchema),
  route('put', '/connections/:connectionId', 'updateConnection', 'Update a provider connection', connection, connectionDraftSchema, 'connectionId'),
  route('post', '/connections/test', 'testConnection', 'Test an unsaved provider connection', health, testConnectionSchema),
  route('post', '/models', 'createModel', 'Create model draft v1', deployment, createModelSchema),
  route('post', '/models/:deploymentId/versions', 'newVersion', 'Copy a model version to the next draft version', deployment, undefined, 'deploymentId'),
  route('put', '/models/:deploymentId', 'updateDraft', 'Save a model draft with an expected content hash', deployment, updateModelSchema, 'deploymentId'),
  route('post', '/models/:deploymentId/publish', 'publish', 'Publish a model draft', deployment, undefined, 'deploymentId'),
  route('post', '/models/:deploymentId/retire', 'retire', 'Retire a version unless a published profile uses it', deployment, undefined, 'deploymentId'),
  route('post', '/try-prompt', 'tryPrompt', 'Try an unsaved model draft', promptResult, tryPromptSchema),
];
