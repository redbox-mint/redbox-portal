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
import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { defaultProvider } from '@aws-sdk/credential-provider-node';
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

interface BedrockEndpoint {
  baseUrl: string;
  region: string;
}

export class BedrockGenerationProvider implements GenerationProviderAdapter {
  public readonly adapterId = 'bedrock';

  public getConfigurationSchema(): Record<string, unknown> {
    return {
      type: 'object',
      additionalProperties: false,
      required: ['endpoint'],
      properties: {
        endpoint: {
          type: 'string',
          format: 'uri',
          pattern: '^https://bedrock-runtime\\.[a-z0-9-]+\\.amazonaws\\.com/?$',
        },
      },
    };
  }

  public getSecretSchema(): Record<string, unknown> {
    return {
      type: 'object',
      additionalProperties: false,
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
      throw new GenerationError('GENERATION_DEPLOYMENT_INCOMPATIBLE', 'Amazon Bedrock endpoint is not allowed');
    }

    const maxRequestBytes = Number(sails?.config?.generation?.provider?.maxRequestBytes ?? 512_000);
    const maxResponseBytes = Number(sails?.config?.generation?.provider?.maxResponseBytes ?? 256_000);
    const safeHeaders = Object.fromEntries(
      Object.entries(input.connection.nonSecretHeaders ?? {}).filter(
        ([name]) => !BLOCKED_HEADERS.has(name.toLowerCase()),
      ),
    );
    const apiKey = input.connection.secret || process.env['AWS_BEARER_TOKEN_BEDROCK'];
    const provider = createAmazonBedrock({
      region: endpoint.region,
      baseURL: endpoint.baseUrl,
      ...(apiKey ? { apiKey } : { credentialProvider: defaultProvider() }),
      headers: safeHeaders,
      fetch: this.createGuardedFetch(globalThis.fetch, maxRequestBytes, maxResponseBytes),
    });

    const abortController = new AbortController();
    const abort = (): void => abortController.abort();
    if (signal.aborted) {
      abort();
    } else {
      signal.addEventListener('abort', abort, { once: true });
    }
    const timeout = setTimeout(abort, input.connection.timeoutMs);
    const parameters = input.deployment.parameters ?? {};
    const instructions = input.messages
      .filter((message) => message.role === 'system')
      .map((message) => message.content)
      .join('\n\n');
    const messages = input.messages.filter((message) => message.role !== 'system');

    try {
      const result = await generateText({
        model: provider(input.deployment.modelId),
        ...(instructions ? { instructions } : {}),
        messages,
        output: Output.object({
          schema: jsonSchema<unknown>(input.responseSchema),
          name: 'redbox_generation_candidate',
        }),
        maxRetries: 0,
        abortSignal: abortController.signal,
        telemetry: { isEnabled: false, recordInputs: false, recordOutputs: false },
        ...this.pickCallSettings(parameters),
      });
      return {
        content: JSON.stringify(result.output),
        requestedModel: input.deployment.modelId,
        actualModel: result.response.modelId,
        actualProvider: 'amazon-bedrock',
        finishReason: result.rawFinishReason ?? result.finishReason,
        usage: {
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          totalTokens: result.usage.totalTokens,
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
          input.correlationId,
        );
      }
      if (APICallError.isInstance(error)) {
        if (error.statusCode === 408 || error.statusCode === 504) {
          throw new GenerationError(
            'GENERATION_PROVIDER_TIMEOUT',
            'Generation provider timed out',
            true,
            input.correlationId,
          );
        }
        if (error.statusCode === 429) {
          throw new GenerationError(
            'GENERATION_PROVIDER_RATE_LIMITED',
            'Generation provider rate limited the request',
            true,
            input.correlationId,
          );
        }
        throw new GenerationError(
          'GENERATION_PROVIDER_UNAVAILABLE',
          'Generation provider is unavailable',
          error.isRetryable || error.statusCode === undefined || error.statusCode >= 500,
          input.correlationId,
        );
      }
      if (
        NoObjectGeneratedError.isInstance(error)
        || NoOutputGeneratedError.isInstance(error)
        || JSONParseError.isInstance(error)
        || TypeValidationError.isInstance(error)
      ) {
        throw new GenerationError(
          'GENERATION_OUTPUT_PARSE_FAILED',
          'Generation provider did not return a valid candidate',
        );
      }
      throw new GenerationError(
        'GENERATION_PROVIDER_UNAVAILABLE',
        'Generation provider is unavailable',
        true,
        input.correlationId,
      );
    } finally {
      clearTimeout(timeout);
      signal.removeEventListener('abort', abort);
    }
  }

  private pickCallSettings(parameters: Record<string, unknown>): {
    maxOutputTokens?: number;
    temperature?: number;
    topP?: number;
    stopSequences?: string[];
  } {
    const maxOutputTokens = this.numberParameter(parameters, ['maxOutputTokens', 'max_tokens'], 1);
    const temperature = this.numberParameter(parameters, ['temperature'], 0, 1);
    const topP = this.numberParameter(parameters, ['topP', 'top_p'], 0, 1);
    const stopSequences = Array.isArray(parameters.stopSequences)
      ? parameters.stopSequences.filter((value): value is string => typeof value === 'string')
      : Array.isArray(parameters.stop)
        ? parameters.stop.filter((value): value is string => typeof value === 'string')
        : undefined;
    return {
      ...(maxOutputTokens !== undefined ? { maxOutputTokens: Math.floor(maxOutputTokens) } : {}),
      ...(temperature !== undefined ? { temperature } : {}),
      ...(topP !== undefined ? { topP } : {}),
      ...(stopSequences?.length ? { stopSequences } : {}),
    };
  }

  private numberParameter(
    parameters: Record<string, unknown>,
    names: string[],
    minimum: number,
    maximum = Number.POSITIVE_INFINITY,
  ): number | undefined {
    const value = names.map((name) => parameters[name]).find((candidate) => typeof candidate === 'number');
    return typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum
      ? value
      : undefined;
  }

  private createGuardedFetch(
    fetchImplementation: typeof fetch,
    maxRequestBytes: number,
    maxResponseBytes: number,
  ): typeof fetch {
    return async (request, init) => {
      if (typeof init?.body !== 'string' || Buffer.byteLength(init.body, 'utf8') > maxRequestBytes) {
        throw new GenerationError(
          'GENERATION_PROFILE_INVALID',
          'Generation provider request exceeded the configured limit',
        );
      }
      const response = await fetchImplementation(request, { ...init, redirect: 'error' });
      const declaredLength = Number(response.headers.get('content-length'));
      if (Number.isFinite(declaredLength) && declaredLength > maxResponseBytes) {
        throw new GenerationError(
          'GENERATION_OUTPUT_PARSE_FAILED',
          'Generation provider response exceeded the configured limit',
        );
      }
      const body = await response.text();
      if (Buffer.byteLength(body, 'utf8') > maxResponseBytes) {
        throw new GenerationError(
          'GENERATION_OUTPUT_PARSE_FAILED',
          'Generation provider response exceeded the configured limit',
        );
      }
      return new Response(body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    };
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

  private resolveEndpoint(value: string): BedrockEndpoint | null {
    try {
      const url = new URL(value);
      const match = /^bedrock-runtime\.([a-z0-9-]+)\.amazonaws\.com$/.exec(url.hostname);
      if (
        url.protocol !== 'https:'
        || !match?.[1]
        || url.port
        || url.username
        || url.password
        || url.search
        || url.hash
        || (url.pathname !== '/' && url.pathname !== '')
      ) {
        return null;
      }
      return { baseUrl: `https://${url.hostname}`, region: match[1] };
    } catch {
      return null;
    }
  }
}
