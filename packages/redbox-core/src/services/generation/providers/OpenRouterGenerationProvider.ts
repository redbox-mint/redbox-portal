import {
  GenerationDeploymentConfig,
  GenerationProviderAdapter,
  GenerationProviderCapabilities,
  GenerationProviderConnectionContext,
  GenerationProviderHealth,
  GenerationProviderRequest,
  GenerationProviderResponse,
} from './types';
import { GenerationError } from '../../../model/generation';

interface OpenRouterResponse {
  model?: string;
  provider?: string;
  choices?: Array<{
    finish_reason?: string;
    message?: { content?: string; refusal?: string };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    cost?: number;
  };
}

export class OpenRouterGenerationProvider implements GenerationProviderAdapter {
  public readonly adapterId = 'openrouter';

  public getConfigurationSchema(): Record<string, unknown> {
    return {
      type: 'object',
      additionalProperties: false,
      required: ['endpoint'],
      properties: { endpoint: { type: 'string', format: 'uri', const: 'https://openrouter.ai/api/v1' } },
    };
  }

  public getSecretSchema(): Record<string, unknown> {
    return {
      type: 'object',
      additionalProperties: false,
      required: ['bearerToken'],
      properties: { bearerToken: { type: 'string', minLength: 1, writeOnly: true } },
    };
  }

  public async getCapabilities(_deployment: GenerationDeploymentConfig): Promise<GenerationProviderCapabilities> {
    return { structuredOutput: true, nonStreaming: true, textInput: true };
  }

  public async healthCheck(
    connection: GenerationProviderConnectionContext,
    deployment?: GenerationDeploymentConfig,
  ): Promise<GenerationProviderHealth> {
    return {
      ok: this.resolveEndpoint(connection.endpoint) !== null && !!deployment?.modelId,
      capabilities: await this.getCapabilities(deployment ?? { modelId: '' }),
      checkedAt: new Date().toISOString(),
    };
  }

  public async invoke(input: GenerationProviderRequest, signal: AbortSignal): Promise<GenerationProviderResponse> {
    const endpoint = this.resolveEndpoint(input.connection.endpoint);
    if (!endpoint) {
      throw new GenerationError('GENERATION_DEPLOYMENT_INCOMPATIBLE', 'OpenRouter endpoint is not allowed');
    }
    if (!input.connection.secret) {
      throw new GenerationError('GENERATION_PROVIDER_UNAVAILABLE', 'OpenRouter credential is not configured');
    }
    const timeoutController = new AbortController();
    const abort = () => timeoutController.abort();
    signal.addEventListener('abort', abort, { once: true });
    const timeout = setTimeout(abort, input.connection.timeoutMs);
    try {
      const routingPolicy = input.deployment.routingPolicy ?? {};
      const safeHeaders = Object.fromEntries(Object.entries(input.connection.nonSecretHeaders ?? {}).filter(([name]) =>
        !['authorization', 'content-type', 'host', 'cookie', 'set-cookie', 'x-forwarded-host', 'x-forwarded-proto'].includes(name.toLowerCase())));
      const requestBody = JSON.stringify({
        ...(input.deployment.parameters ?? {}),
        model: input.deployment.modelId,
        messages: input.messages,
        stream: false,
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'redbox_generation_candidate', strict: true, schema: input.responseSchema },
        },
        provider: { ...routingPolicy, require_parameters: true },
      });
      const maxRequestBytes = Number(sails?.config?.generation?.provider?.maxRequestBytes ?? 512_000);
      if (Buffer.byteLength(requestBody, 'utf8') > maxRequestBytes) {
        throw new GenerationError('GENERATION_PROFILE_INVALID', 'Generation provider request exceeded the configured limit');
      }
      const response = await fetch(`${endpoint}/chat/completions`, {
        method: 'POST',
        redirect: 'error',
        headers: {
          'Content-Type': 'application/json',
          ...safeHeaders,
          Authorization: `Bearer ${input.connection.secret}`,
        },
        body: requestBody,
        signal: timeoutController.signal,
      });
      if (!response.ok) {
        if (response.status === 408 || response.status === 504) {
          throw new GenerationError('GENERATION_PROVIDER_TIMEOUT', 'Generation provider timed out', true, input.correlationId);
        }
        if (response.status === 429) {
          throw new GenerationError('GENERATION_PROVIDER_RATE_LIMITED', 'Generation provider rate limited the request', true, input.correlationId);
        }
        throw new GenerationError('GENERATION_PROVIDER_UNAVAILABLE', 'Generation provider is unavailable', response.status >= 500, input.correlationId);
      }
      const maxBytes = Number(sails?.config?.generation?.provider?.maxResponseBytes ?? 256_000);
      const text = await response.text();
      if (Buffer.byteLength(text, 'utf8') > maxBytes) {
        throw new GenerationError('GENERATION_OUTPUT_PARSE_FAILED', 'Generation provider response exceeded the configured limit');
      }
      let body: OpenRouterResponse;
      try {
        body = JSON.parse(text) as OpenRouterResponse;
      } catch {
        throw new GenerationError('GENERATION_OUTPUT_PARSE_FAILED', 'Generation provider returned malformed JSON');
      }
      const choice = body.choices?.[0];
      if (!choice?.message?.content || choice.message.refusal) {
        throw new GenerationError('GENERATION_OUTPUT_PARSE_FAILED', 'Generation provider did not return a candidate');
      }
      return {
        content: choice.message.content,
        requestedModel: input.deployment.modelId,
        actualModel: body.model,
        actualProvider: body.provider,
        finishReason: choice.finish_reason,
        usage: {
          inputTokens: body.usage?.prompt_tokens,
          outputTokens: body.usage?.completion_tokens,
          totalTokens: body.usage?.total_tokens,
          cost: body.usage?.cost,
        },
      };
    } catch (error) {
      if (error instanceof GenerationError) {
        throw error;
      }
      if (timeoutController.signal.aborted) {
        throw new GenerationError('GENERATION_PROVIDER_TIMEOUT', 'Generation provider timed out', true, input.correlationId);
      }
      throw new GenerationError('GENERATION_PROVIDER_UNAVAILABLE', 'Generation provider is unavailable', true, input.correlationId);
    } finally {
      clearTimeout(timeout);
      signal.removeEventListener('abort', abort);
    }
  }

  private resolveEndpoint(value: string): string | null {
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:' || url.hostname !== 'openrouter.ai' || url.port || url.username || url.password ||
        url.search || url.hash || url.pathname.replace(/\/+$/, '') !== '/api/v1') {
        return null;
      }
      return 'https://openrouter.ai/api/v1';
    } catch {
      return null;
    }
  }
}
