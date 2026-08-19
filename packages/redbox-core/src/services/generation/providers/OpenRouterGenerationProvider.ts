import {
  APICallError,
  JSONParseError,
  NoObjectGeneratedError,
  NoOutputGeneratedError,
  Output,
  TypeValidationError,
  generateText,
  jsonSchema,
} from 'ai';
import { createOpenAICompatible, type MetadataExtractor } from '@ai-sdk/openai-compatible';
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

const BLOCKED_HEADERS = new Set([
  'authorization',
  'content-type',
  'cookie',
  'host',
  'set-cookie',
  'x-forwarded-host',
  'x-forwarded-proto',
]);

interface OpenRouterMetadata {
  actualProvider?: string;
  cost?: number;
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
    deployment?: GenerationDeploymentConfig
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

    const maxRequestBytes = Number(sails?.config?.generation?.provider?.maxRequestBytes ?? 512_000);
    const maxResponseBytes = Number(sails?.config?.generation?.provider?.maxResponseBytes ?? 256_000);
    const safeHeaders = Object.fromEntries(
      Object.entries(input.connection.nonSecretHeaders ?? {}).filter(
        ([name]) => !BLOCKED_HEADERS.has(name.toLowerCase())
      )
    );
    const routingPolicy = input.deployment.routingPolicy ?? {};
    const deploymentParameters = this.pickDeploymentParameters(input.deployment.parameters ?? {});
    const fetchImplementation = globalThis.fetch;
    const provider = createOpenAICompatible({
      name: 'openrouter',
      baseURL: endpoint,
      apiKey: input.connection.secret,
      headers: safeHeaders,
      supportsStructuredOutputs: true,
      fetch: this.createGuardedFetch(fetchImplementation, maxRequestBytes, maxResponseBytes),
      transformRequestBody: (sdkBody: Record<string, unknown>): Record<string, unknown> => ({
        ...sdkBody,
        ...deploymentParameters,
        model: input.deployment.modelId,
        stream: false,
        tools: undefined,
        plugins: undefined,
        provider: { ...routingPolicy, require_parameters: true },
      }),
      metadataExtractor: this.createMetadataExtractor(),
    });

    const abortController = new AbortController();
    const abort = (): void => abortController.abort();
    if (signal.aborted) {
      abort();
    } else {
      signal.addEventListener('abort', abort, { once: true });
    }
    const timeout = setTimeout(abort, input.connection.timeoutMs);

    try {
      const result = await generateText({
        model: provider(input.deployment.modelId),
        messages: input.messages,
        output: Output.object({
          schema: jsonSchema<unknown>(input.responseSchema),
          name: 'redbox_generation_candidate',
        }),
        maxRetries: 0,
        abortSignal: abortController.signal,
        telemetry: { isEnabled: false, recordInputs: false, recordOutputs: false },
        providerOptions: { openrouter: { strictJsonSchema: true } },
      });
      const metadata = this.readMetadata(result.providerMetadata?.openrouter);
      return {
        content: JSON.stringify(result.output),
        requestedModel: input.deployment.modelId,
        actualModel: result.response.modelId,
        actualProvider: metadata.actualProvider,
        finishReason: result.rawFinishReason ?? result.finishReason,
        usage: {
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          totalTokens: result.usage.totalTokens,
          cost: metadata.cost,
        },
      };
    } catch (error) {
      const generationError = this.findGenerationError(error);
      if (generationError) {
        throw generationError;
      }
      if (abortController.signal.aborted) {
        throw new GenerationError(
          'GENERATION_PROVIDER_TIMEOUT',
          'Generation provider timed out',
          true,
          input.correlationId
        );
      }
      if (APICallError.isInstance(error)) {
        if (error.statusCode === 408 || error.statusCode === 504) {
          throw new GenerationError(
            'GENERATION_PROVIDER_TIMEOUT',
            'Generation provider timed out',
            true,
            input.correlationId
          );
        }
        if (error.statusCode === 429) {
          throw new GenerationError(
            'GENERATION_PROVIDER_RATE_LIMITED',
            'Generation provider rate limited the request',
            true,
            input.correlationId
          );
        }
        throw new GenerationError(
          'GENERATION_PROVIDER_UNAVAILABLE',
          'Generation provider is unavailable',
          error.isRetryable || error.statusCode === undefined || error.statusCode >= 500,
          input.correlationId
        );
      }
      if (
        NoObjectGeneratedError.isInstance(error) ||
        NoOutputGeneratedError.isInstance(error) ||
        JSONParseError.isInstance(error) ||
        TypeValidationError.isInstance(error)
      ) {
        throw new GenerationError(
          'GENERATION_OUTPUT_PARSE_FAILED',
          'Generation provider did not return a valid candidate'
        );
      }
      throw new GenerationError(
        'GENERATION_PROVIDER_UNAVAILABLE',
        'Generation provider is unavailable',
        true,
        input.correlationId
      );
    } finally {
      clearTimeout(timeout);
      signal.removeEventListener('abort', abort);
    }
  }

  private createGuardedFetch(
    fetchImplementation: typeof fetch,
    maxRequestBytes: number,
    maxResponseBytes: number
  ): typeof fetch {
    return async (request, init) => {
      if (typeof init?.body !== 'string' || Buffer.byteLength(init.body, 'utf8') > maxRequestBytes) {
        throw new GenerationError(
          'GENERATION_PROFILE_INVALID',
          'Generation provider request exceeded the configured limit'
        );
      }
      const response = await fetchImplementation(request, { ...init, redirect: 'error' });
      const declaredLength = Number(response.headers.get('content-length'));
      if (Number.isFinite(declaredLength) && declaredLength > maxResponseBytes) {
        throw new GenerationError(
          'GENERATION_OUTPUT_PARSE_FAILED',
          'Generation provider response exceeded the configured limit'
        );
      }
      const body = await response.text();
      if (Buffer.byteLength(body, 'utf8') > maxResponseBytes) {
        throw new GenerationError(
          'GENERATION_OUTPUT_PARSE_FAILED',
          'Generation provider response exceeded the configured limit'
        );
      }
      return new Response(body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    };
  }

  private createMetadataExtractor(): MetadataExtractor {
    return {
      extractMetadata: async ({ parsedBody }) => {
        if (!this.isRecord(parsedBody)) {
          return undefined;
        }
        const usage = this.isRecord(parsedBody.usage) ? parsedBody.usage : undefined;
        const actualProvider = typeof parsedBody.provider === 'string' ? parsedBody.provider : undefined;
        const cost = typeof usage?.cost === 'number' ? usage.cost : undefined;
        return actualProvider === undefined && cost === undefined
          ? undefined
          : { openrouter: { actualProvider, cost } };
      },
      createStreamExtractor: () => ({
        processChunk: (_parsedChunk: unknown): void => undefined,
        buildMetadata: () => undefined,
      }),
    };
  }

  private readMetadata(value: unknown): OpenRouterMetadata {
    if (!this.isRecord(value)) {
      return {};
    }
    return {
      actualProvider: typeof value.actualProvider === 'string' ? value.actualProvider : undefined,
      cost: typeof value.cost === 'number' ? value.cost : undefined,
    };
  }

  private pickDeploymentParameters(parameters: Record<string, unknown>): Record<string, unknown> {
    const allowed = new Set([
      'frequency_penalty',
      'max_tokens',
      'presence_penalty',
      'seed',
      'stop',
      'temperature',
      'top_p',
    ]);
    return Object.fromEntries(Object.entries(parameters).filter(([name]) => allowed.has(name)));
  }

  private findGenerationError(error: unknown): GenerationError | undefined {
    let current = error;
    for (let depth = 0; depth < 5; depth += 1) {
      if (current instanceof GenerationError) {
        return current;
      }
      if (!this.isRecord(current) || !('cause' in current)) {
        return undefined;
      }
      current = current.cause;
    }
    return undefined;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  private resolveEndpoint(value: string): string | null {
    try {
      const url = new URL(value);
      if (
        url.protocol !== 'https:' ||
        url.hostname !== 'openrouter.ai' ||
        url.port ||
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        url.pathname.replace(/\/+$/, '') !== '/api/v1'
      ) {
        return null;
      }
      return 'https://openrouter.ai/api/v1';
    } catch {
      return null;
    }
  }
}
