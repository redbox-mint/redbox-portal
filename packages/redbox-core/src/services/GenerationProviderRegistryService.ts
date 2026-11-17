import { Services as services } from '../CoreService';
import type { GenerationProviderAdapter, GenerationProviderFactory } from '../model/generation';
import { GenerationError } from '../model/generation';
import { BedrockGenerationProvider } from './generation/providers/BedrockGenerationProvider';
import { FakeGenerationProvider } from './generation/providers/FakeGenerationProvider';
import { OpenRouterGenerationProvider } from './generation/providers/OpenRouterGenerationProvider';

export namespace Services {
  export class GenerationProviderRegistry extends services.Core.Service {
    protected override _exportedMethods = ['init', 'register', 'get', 'list'];
    private factories = new Map<string, GenerationProviderFactory>();

    public override init(): void {
      const configured = new Set(sails.config.generation.adapters);
      if (configured.has('bedrock')) this.register('bedrock', () => new BedrockGenerationProvider());
      if (configured.has('openrouter')) this.register('openrouter', () => new OpenRouterGenerationProvider());
      if (configured.has('fake')) this.register('fake', () => new FakeGenerationProvider());
    }

    public register(id: string, factory: GenerationProviderFactory): void {
      const normalized = id.trim().toLowerCase();
      if (!normalized || this.factories.has(normalized)) {
        throw new Error(`Generation provider adapter '${normalized}' is already registered or invalid`);
      }
      const adapter = factory();
      if (adapter.adapterId !== normalized) {
        throw new Error(`Generation provider factory '${normalized}' returned adapter '${adapter.adapterId}'`);
      }
      this.factories.set(normalized, factory);
    }

    public get(id: string): GenerationProviderAdapter {
      const factory = this.factories.get(id.trim().toLowerCase());
      if (!factory) {
        throw new GenerationError('GENERATION_DEPLOYMENT_INCOMPATIBLE', 'Configured generation provider is not installed');
      }
      return factory();
    }

    public list(): string[] {
      return [...this.factories.keys()].sort();
    }
  }
}
