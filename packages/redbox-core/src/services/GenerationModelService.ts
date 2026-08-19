import { Services as services } from '../CoreService';
import { canonicalHash, GenerationDeploymentConfig, GenerationError, GenerationProviderAdapter } from '../model/generation';
import type { GenerationModelConnectionAttributes } from '../waterline-models/GenerationModelConnection';
import type { GenerationModelDeploymentAttributes } from '../waterline-models/GenerationModelDeployment';
import { requireService } from './generation/require-service';

interface RegistryLike { get(id: string): GenerationProviderAdapter; }
interface SecretResolverLike { resolve(secretRef: string): Promise<string>; status(secretRef: string): Promise<{ configured: boolean; scheme: string }>; }

export namespace Services {
  export class GenerationModelService extends services.Core.Service {
    protected override _exportedMethods = ['createConnection', 'safeConnection', 'createDeployment', 'testDeployment', 'publishDeployment'];

    public async createConnection(
      brandId: string,
      input: Omit<GenerationModelConnectionAttributes, 'id' | 'brandId' | 'nameLower'>,
    ): Promise<GenerationModelConnectionAttributes> {
      return GenerationModelConnection.create({
        ...input,
        brandId,
        nameLower: input.name.trim().toLowerCase(),
      }).fetch();
    }

    public async safeConnection(connection: GenerationModelConnectionAttributes): Promise<Record<string, unknown>> {
      const resolver = requireService<SecretResolverLike>('generationsecretresolverservice', ['resolve', 'status']);
      const secretStatus = connection.secretRef ? await resolver.status(connection.secretRef) : { configured: false, scheme: '' };
      return {
        id: connection.id, key: connection.key, name: connection.name, adapterId: connection.adapterId,
        enabled: connection.enabled, endpoint: connection.endpoint, authStrategy: connection.authStrategy,
        secretRef: connection.secretRef, secretConfigured: secretStatus.configured, dataPolicy: connection.dataPolicy,
        timeoutMs: connection.timeoutMs, lastHealthStatus: connection.lastHealthStatus,
        lastHealthCheckedAt: connection.lastHealthCheckedAt,
      };
    }

    public async createDeployment(
      brandId: string,
      input: Omit<GenerationModelDeploymentAttributes, 'id' | 'brandId' | 'contentHash'>,
    ): Promise<GenerationModelDeploymentAttributes> {
      const connection = await GenerationModelConnection.findOne({ id: input.connectionId, brandId });
      if (!connection) throw new GenerationError('GENERATION_DEPLOYMENT_INCOMPATIBLE', 'Generation model connection was not found');
      const contentHash = canonicalHash({ ...input, brandId });
      return GenerationModelDeployment.create({ ...input, brandId, contentHash }).fetch();
    }

    public async testDeployment(brandId: string, deploymentId: string): Promise<Record<string, unknown>> {
      const deployment = await GenerationModelDeployment.findOne({ id: deploymentId, brandId });
      if (!deployment) throw new GenerationError('GENERATION_DEPLOYMENT_INCOMPATIBLE', 'Generation deployment was not found');
      const connection = await GenerationModelConnection.findOne({ id: deployment.connectionId, brandId, enabled: true });
      if (!connection) throw new GenerationError('GENERATION_DEPLOYMENT_INCOMPATIBLE', 'Generation connection was not found');
      const registry = requireService<RegistryLike>('generationproviderregistryservice', ['get']);
      const resolver = requireService<SecretResolverLike>('generationsecretresolverservice', ['resolve', 'status']);
      const adapter = registry.get(connection.adapterId);
      const secret = connection.secretRef ? await resolver.resolve(connection.secretRef) : undefined;
      const config: GenerationDeploymentConfig = {
        modelId: deployment.modelId, parameters: deployment.parameters, routingPolicy: deployment.routingPolicy,
        requiredCapabilities: deployment.requiredCapabilities,
      };
      const health = await adapter.healthCheck({
        endpoint: connection.endpoint, secret, timeoutMs: connection.timeoutMs,
        nonSecretHeaders: connection.nonSecretHeaders,
      }, config);
      const required = deployment.requiredCapabilities ?? {};
      if (!health.ok || Object.entries(required).some(([key, needed]) => needed && !health.capabilities[key as keyof typeof health.capabilities])) {
        throw new GenerationError('GENERATION_DEPLOYMENT_INCOMPATIBLE', 'Generation deployment does not provide required capabilities');
      }
      return { ...health };
    }

    public async publishDeployment(brandId: string, deploymentId: string, actorId: string): Promise<GenerationModelDeploymentAttributes> {
      const capabilitySnapshot = await this.testDeployment(brandId, deploymentId);
      const updated = await GenerationModelDeployment.updateOne({ id: deploymentId, brandId, status: 'draft' }).set({
        status: 'published', capabilitySnapshot, publishedBy: actorId, publishedAt: new Date().toISOString(),
      });
      if (!updated) throw new GenerationError('GENERATION_INVALID_STATE', 'Only draft deployments may be published');
      return updated;
    }
  }
}
