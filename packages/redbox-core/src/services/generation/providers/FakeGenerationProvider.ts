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
    let content = this.fixtures.get(input.correlationId) ?? this.fixtures.get('default') ??
      (configuredFixture === undefined ? undefined : typeof configuredFixture === 'string' ? configuredFixture : JSON.stringify(configuredFixture));
    // New profiles use their own field IDs. Produce deterministic values from
    // the schema and supplied evidence when the built-in RDMP fixture does not fit.
    // Explicit registered fixtures keep precedence, including invalid-output tests.
    const schema = input.responseSchema as any;
    const fields = schema?.properties?.answers?.properties;
    const configured = typeof configuredFixture === 'object' && configuredFixture ? configuredFixture as any : undefined;
    if (fields && !this.fixtures.has(input.correlationId) && !this.fixtures.has('default') &&
        Object.keys(fields).some(key => !configured?.answers?.[key])) {
      let facts: any[] = [];
      try {
        const message = input.messages.find(m => m.content.startsWith('BEGIN UNTRUSTED EVIDENCE'));
        const data = JSON.parse(message!.content.split('\n').slice(1, -1).join('\n'));
        facts = [...data.projectFacts, ...data.reviewedAnswers.map((a: any) => ({ id: a.evidenceId, content: a.value })), ...data.approvedKnowledge];
      } catch { /* Schema-only demos still have deterministic values. */ }
      const valueFor = (contract: any, allowed: string[]): unknown => {
        const values = facts.filter(f => allowed.includes(f.id)).map(f => f.content);
        if (contract.enum) return contract.enum[0];
        if (contract.type === 'boolean') return values.find(v => typeof v === 'boolean') ?? false;
        if (contract.format === 'date') return '2026-01-01';
        if (contract.type === 'array') return [valueFor(contract.items, allowed)];
        if (contract.type === 'object') return Object.fromEntries(Object.entries(contract.properties).map(([k, v]) => [k, valueFor(v, allowed)]));
        return String(values.find(v => typeof v === 'string') ?? 'Synthetic demonstration suggestion').slice(0, contract.maxLength ?? 200);
      };
      content = JSON.stringify({ answers: Object.fromEntries(Object.entries(fields).map(([id, raw]) => {
        const field = raw as any;
        const allowed = field.properties.evidenceIds.items.enum ?? [];
        return [id, { value: valueFor(field.properties.value, allowed), evidenceIds: allowed.slice(0, 1), rationale: 'Deterministic demonstration using the supplied evidence.' }];
      })) });
    }
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
