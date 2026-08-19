import { promises as fs } from 'node:fs';
import path from 'node:path';
import { Services as services } from '../CoreService';
import type { BrandingModel } from '../model';
import { canonicalHash, GenerationError, GenerationProfileDefinitionV1 } from '../model/generation';
import type { GenerationBindingAttributes } from '../waterline-models/GenerationBinding';
import type { KnowledgeCollectionAttributes } from '../waterline-models/KnowledgeCollection';
import type { GenerationModelConnectionAttributes } from '../waterline-models/GenerationModelConnection';
import type { GenerationModelDeploymentAttributes } from '../waterline-models/GenerationModelDeployment';
import type { GenerationKnowledgeDocumentInput } from './GenerationKnowledgeService';
import { requireService, requireWaterlineRows } from './generation/require-service';

type Manifest = { kind: string; key: string; [key: string]: unknown };
interface ModelServiceLike {
  createConnection(brandId: string, input: Record<string, unknown>): Promise<GenerationModelConnectionAttributes>;
  createDeployment(brandId: string, input: Record<string, unknown>): Promise<GenerationModelDeploymentAttributes>;
  publishDeployment(brandId: string, id: string, actorId: string): Promise<GenerationModelDeploymentAttributes>;
}
interface KnowledgeServiceLike {
  createCollection(brandId: string, input: Record<string, unknown>, actorId: string): Promise<{ id: string }>;
  createVersion(brandId: string, collectionId: string, manifest: Record<string, unknown>, actorId: string): Promise<{ id: string }>;
  publish(brandId: string, versionId: string, docs: GenerationKnowledgeDocumentInput[], actorId: string): Promise<{ id: string }>;
}
interface ProfileServiceLike {
  create(brandId: string, input: Record<string, unknown>, actorId: string): Promise<{ profile: { id: string }; version: { id: string } }>;
  createDraft(brandId: string, profileId: string, sourceVersionId: string, actorId: string): Promise<{ id: string }>;
  updateDraft(brandId: string, versionId: string, definition: GenerationProfileDefinitionV1): Promise<{ id: string }>;
  publish(brandId: string, versionId: string, actorId: string): Promise<{ id: string }>;
}
interface BindingServiceLike { createOrUpdate(brandId: string, input: Record<string, unknown>): Promise<GenerationBindingAttributes>; }

const KIND_ORDER: Record<string, number> = { connection: 0, deployment: 1, knowledge: 2, profile: 3, binding: 4 };

export namespace Services {
  export class GenerationBootstrapService extends services.Core.Service {
    protected override _exportedMethods = ['bootstrap'];

    public async bootstrap(brand: BrandingModel): Promise<void> {
      if (!sails.config.generation.enabled || !sails.config.generation.bootstrap.enabled) return;
      const root = path.resolve(String(sails.config.bootstrap.bootstrapDataPath ?? 'bootstrap-data'), sails.config.generation.bootstrap.directory);
      let files: string[];
      try {
        files = (await fs.readdir(root)).filter((file) => file.endsWith('.json')).sort();
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          this.logger.verbose(`Generation bootstrap directory is absent: ${root}`);
          return;
        }
        throw error;
      }
      const manifests: Array<{ filename: string; manifest: Manifest }> = [];
      for (const filename of files) {
        try {
          const parsed = JSON.parse(await fs.readFile(path.join(root, filename), 'utf8')) as Manifest;
          if (!parsed.kind || !parsed.key) throw new Error('kind and key are required');
          manifests.push({ filename, manifest: parsed });
        } catch (error) {
          this.logger.warn(`Skipped invalid generation bootstrap file '${filename}': ${error instanceof Error ? error.message : 'invalid JSON'}`);
        }
      }
      manifests.sort((a, b) => (KIND_ORDER[a.manifest.kind] ?? 99) - (KIND_ORDER[b.manifest.kind] ?? 99) || a.filename.localeCompare(b.filename));
      for (const item of manifests) {
        try {
          await this.loadManifest(String(brand.id), root, item.manifest);
        } catch (error) {
          const safe = error instanceof GenerationError ? error.code : error instanceof Error ? error.message : 'unknown error';
          this.logger.warn(`Skipped generation bootstrap file '${item.filename}': ${safe}`);
        }
      }
    }

    private async loadManifest(brandId: string, root: string, manifest: Manifest): Promise<void> {
      const actor = 'bootstrap-data';
      switch (manifest.kind) {
        case 'connection': await this.loadConnection(brandId, manifest, actor); return;
        case 'deployment': await this.loadDeployment(brandId, manifest, actor); return;
        case 'knowledge': await this.loadKnowledge(brandId, root, manifest, actor); return;
        case 'profile': await this.loadProfile(brandId, manifest, actor); return;
        case 'binding': await this.loadBinding(brandId, manifest, actor); return;
        default: throw new Error(`Unsupported generation manifest kind '${manifest.kind}'`);
      }
    }

    private async loadConnection(brandId: string, manifest: Manifest, actor: string): Promise<void> {
      if ('apiKey' in manifest || 'token' in manifest || 'password' in manifest || 'authorization' in manifest) {
        throw new Error('Embedded secrets are prohibited');
      }
      if (await GenerationModelConnection.findOne({ brandId, key: manifest.key })) return;
      const modelService = requireService<ModelServiceLike>('generationmodelservice', ['createConnection', 'createDeployment', 'publishDeployment']);
      await modelService.createConnection(brandId, {
        key: manifest.key, name: manifest.name, adapterId: manifest.adapterId, enabled: manifest.enabled ?? true,
        endpoint: manifest.endpoint, authStrategy: manifest.authStrategy, secretRef: manifest.secretRef,
        nonSecretHeaders: manifest.nonSecretHeaders, dataPolicy: manifest.dataPolicy,
        timeoutMs: manifest.timeoutMs ?? sails.config.generation.provider.timeoutMs,
        createdBy: actor, updatedBy: actor,
      });
    }

    private async loadDeployment(brandId: string, manifest: Manifest, actor: string): Promise<void> {
      const connection = await GenerationModelConnection.findOne({ brandId, key: String(manifest.connectionKey ?? '') });
      if (!connection) throw new Error('Referenced generation connection was not found');
      const version = Number(manifest.version ?? 1);
      const existing = await GenerationModelDeployment.findOne({ brandId, key: manifest.key, version });
      if (existing?.status === 'published') return;
      const modelService = requireService<ModelServiceLike>('generationmodelservice', ['createConnection', 'createDeployment', 'publishDeployment']);
      const deployment = existing ?? await modelService.createDeployment(brandId, {
        key: manifest.key, version, name: manifest.name, status: 'draft', connectionId: connection.id,
        modelId: manifest.modelId, parameters: manifest.parameters, routingPolicy: manifest.routingPolicy,
        requiredCapabilities: manifest.requiredCapabilities ?? { structuredOutput: true, nonStreaming: true, textInput: true },
        capabilitySnapshot: undefined, createdBy: actor, publishedBy: undefined, publishedAt: undefined,
      });
      await modelService.publishDeployment(brandId, deployment.id, actor);
    }

    private async loadKnowledge(brandId: string, root: string, manifest: Manifest, actor: string): Promise<void> {
      let collection = await KnowledgeCollection.findOne({ brandId, key: manifest.key });
      const service = requireService<KnowledgeServiceLike>('generationknowledgeservice', ['createCollection', 'createVersion', 'publish']);
      collection ??= await service.createCollection(brandId, { key: manifest.key, name: manifest.name, description: manifest.description }, actor) as typeof collection;
      if (!collection) throw new Error('Knowledge collection could not be created');
      const docs = await Promise.all(((manifest.documents ?? []) as Array<Record<string, unknown>>).map(async (doc, ordinal) => {
        const relative = String(doc.file ?? '');
        const resolved = path.resolve(root, relative);
        if (!relative || !resolved.startsWith(`${root}${path.sep}`)) throw new Error('Knowledge file path is invalid');
        return {
          documentKey: String(doc.documentKey ?? ''), title: String(doc.title ?? ''),
          authority: String(doc.authority ?? 'approvedGuidance') as GenerationKnowledgeDocumentInput['authority'],
          effectiveFrom: typeof doc.effectiveFrom === 'string' ? doc.effectiveFrom : undefined,
          effectiveTo: typeof doc.effectiveTo === 'string' ? doc.effectiveTo : undefined,
          owner: typeof doc.owner === 'string' ? doc.owner : undefined,
          classification: String(doc.classification ?? 'public'), sourceUri: relative, mediaType: 'text/markdown' as const,
          content: await fs.readFile(resolved, 'utf8'), tags: Array.isArray(doc.tags) ? doc.tags.map(String) : [], ordinal,
        };
      }));
      if (collection.publishedVersionId) {
        const current = await KnowledgeCollectionVersion.findOne({ id: collection.publishedVersionId, brandId, collectionId: collection.id });
        if (current?.contentHash === canonicalHash({ manifest: manifest.manifest ?? {}, documents: docs })) return;
      }
      const version = await service.createVersion(brandId, collection.id, (manifest.manifest ?? {}) as Record<string, unknown>, actor);
      await service.publish(brandId, version.id, docs, actor);
    }

    private async loadProfile(brandId: string, manifest: Manifest, actor: string): Promise<void> {
      const existing = await GenerationProfile.findOne({ brandId, key: manifest.key });
      const deployment = await GenerationModelDeployment.findOne({ brandId, key: String(manifest.modelDeploymentKey ?? ''), status: 'published' });
      const knowledgeKeys = Array.isArray(manifest.knowledgeCollectionKeys)
        ? manifest.knowledgeCollectionKeys.filter((key): key is string => typeof key === 'string')
        : [];
      const knowledge = requireWaterlineRows<KnowledgeCollectionAttributes>(
        await KnowledgeCollection.find({ brandId, key: { in: knowledgeKeys } }),
        'KnowledgeCollection',
      );
      if (!deployment || knowledge.length !== knowledgeKeys.length || knowledge.some((item) => !item.publishedVersionId)) {
        throw new Error('Profile dependencies are not published');
      }
      const knowledgeByKey = new Map(knowledge.map((item) => [item.key, item]));
      const definition = {
        ...(manifest.definition as GenerationProfileDefinitionV1),
        modelDeploymentId: deployment.id,
        knowledgeCollectionVersionIds: knowledgeKeys.map((key) => knowledgeByKey.get(key)!.publishedVersionId!),
      };
      const service = requireService<ProfileServiceLike>('generationprofileservice', ['create', 'createDraft', 'updateDraft', 'publish']);
      if (existing?.publishedVersionId) {
        const current = await GenerationProfileVersion.findOne({ id: existing.publishedVersionId, brandId, profileId: existing.id });
        if (current?.contentHash === canonicalHash(definition)) return;
        if (!current) throw new Error('Published profile version was not found');
        const draft = await service.createDraft(brandId, existing.id, current.id, actor);
        await service.updateDraft(brandId, draft.id, definition);
        await service.publish(brandId, draft.id, actor);
      } else {
        const created = await service.create(brandId, {
          key: manifest.key, name: manifest.name, description: manifest.description, definition,
        }, actor);
        await service.publish(brandId, created.version.id, actor);
      }
    }

    private async loadBinding(brandId: string, manifest: Manifest, actor: string): Promise<void> {
      const profile = await GenerationProfile.findOne({ brandId, key: String(manifest.profileKey ?? '') });
      if (!profile?.publishedVersionId) throw new Error('Binding profile is not published');
      const service = requireService<BindingServiceLike>('generationbindingservice', ['createOrUpdate']);
      const { kind: _kind, profileKey: _profileKey, ...value } = manifest;
      await service.createOrUpdate(brandId, {
        ...value, profileId: profile.id, targetMode: 'create', createdBy: actor, updatedBy: actor,
      });
    }
  }
}
