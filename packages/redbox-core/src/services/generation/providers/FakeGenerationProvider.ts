import {
  GenerationDeploymentConfig,
  GenerationProviderAdapter,
  GenerationProviderCapabilities,
  GenerationProviderConnectionContext,
  GenerationProviderHealth,
  GenerationProviderRequest,
  GenerationProviderResponse,
} from './types';

export class FakeGenerationProvider implements GenerationProviderAdapter {
  public readonly adapterId = 'fake';
  private fixtures = new Map<string, string>();

  public registerFixture(key: string, response: unknown): void {
    this.fixtures.set(key, typeof response === 'string' ? response : JSON.stringify(response));
  }

  public clearFixtures(): void {
    this.fixtures.clear();
  }

  public getConfigurationSchema(): Record<string, unknown> {
    return { type: 'object', additionalProperties: false };
  }

  public getSecretSchema(): Record<string, unknown> {
    return { type: 'object', additionalProperties: false };
  }

  public async getCapabilities(_deployment: GenerationDeploymentConfig): Promise<GenerationProviderCapabilities> {
    return { structuredOutput: true, nonStreaming: true, textInput: true, seed: true, zeroDataRetention: true };
  }

  public async healthCheck(
    _connection: GenerationProviderConnectionContext,
    deployment?: GenerationDeploymentConfig,
  ): Promise<GenerationProviderHealth> {
    return {
      ok: true,
      capabilities: await this.getCapabilities(deployment ?? { modelId: 'fake' }),
      checkedAt: new Date().toISOString(),
    };
  }

  public async invoke(input: GenerationProviderRequest, signal: AbortSignal): Promise<GenerationProviderResponse> {
    if (signal.aborted) {
      throw new DOMException('Generation request was aborted', 'AbortError');
    }
    const configuredFixture = input.deployment.parameters?.fixtureResponse;
    const content = this.fixtures.get(input.correlationId) ?? this.fixtures.get('default') ??
      (configuredFixture === undefined ? undefined : typeof configuredFixture === 'string' ? configuredFixture : JSON.stringify(configuredFixture));
    if (content === undefined) {
      throw new Error(`No fake generation fixture registered for ${input.correlationId}`);
    }
    return {
      content,
      requestedModel: input.deployment.modelId,
      actualModel: input.deployment.modelId,
      actualProvider: 'fake',
      finishReason: 'stop',
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    };
  }
}
