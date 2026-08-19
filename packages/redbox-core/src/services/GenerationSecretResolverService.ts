import { Services as services } from '../CoreService';
import { GenerationError } from '../model/generation';

export type GenerationSecretResolver = (reference: string) => Promise<string>;

export namespace Services {
  export class GenerationSecretResolverService extends services.Core.Service {
    protected override _exportedMethods = ['register', 'resolve', 'status'];
    private resolvers = new Map<string, GenerationSecretResolver>([
      ['env', async (reference: string) => process.env[reference] ?? ''],
    ]);

    public register(scheme: string, resolver: GenerationSecretResolver): void {
      const normalized = scheme.trim().toLowerCase();
      if (!normalized || this.resolvers.has(normalized)) {
        throw new Error(`Secret resolver '${normalized}' is already registered or invalid`);
      }
      this.resolvers.set(normalized, resolver);
    }

    public async resolve(secretRef: string): Promise<string> {
      const separator = secretRef.indexOf(':');
      if (separator <= 0 || separator === secretRef.length - 1) {
        throw new GenerationError('GENERATION_NOT_CONFIGURED', 'Generation secret reference is invalid');
      }
      const scheme = secretRef.slice(0, separator).toLowerCase();
      const reference = secretRef.slice(separator + 1);
      const resolver = this.resolvers.get(scheme);
      if (!resolver) {
        throw new GenerationError('GENERATION_NOT_CONFIGURED', 'Generation secret resolver is not installed');
      }
      try {
        const secret = await resolver(reference);
        if (!secret) {
          throw new Error('missing');
        }
        return secret;
      } catch {
        throw new GenerationError('GENERATION_NOT_CONFIGURED', 'Generation secret is not configured');
      }
    }

    public async status(secretRef: string): Promise<{ configured: boolean; scheme: string }> {
      const scheme = secretRef.includes(':') ? secretRef.split(':', 1)[0].toLowerCase() : '';
      try {
        await this.resolve(secretRef);
        return { configured: true, scheme };
      } catch {
        return { configured: false, scheme };
      }
    }
  }
}
