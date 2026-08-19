import { Services as services } from '../CoreService';
import { canonicalHash, GenerationError, GenerationOutputType, GenerationProfileDefinitionV1 } from '../model/generation';
import type { GenerationProfileAttributes } from '../waterline-models/GenerationProfile';
import type { GenerationProfileVersionAttributes } from '../waterline-models/GenerationProfileVersion';
import { requireWaterlineRows } from './generation/require-service';

const SUPPORTED_OUTPUTS = new Set(['string', 'richText', 'boolean', 'date', 'enum', 'enumArray', 'object', 'objectArray']);
const EXCLUDED_COMPONENT_PARTS = ['attachment', 'file', 'map', 'recordselector', 'workspace', 'button', 'integration', 'identifier'];

function assertUnique(values: string[], label: string): void {
  const normalized = values.map((value) => value.trim());
  if (normalized.some((value) => !value) || new Set(normalized).size !== normalized.length) {
    throw new GenerationError('GENERATION_PROFILE_INVALID', `${label} identifiers must be non-empty and unique`);
  }
}

export namespace Services {
  export class GenerationProfileService extends services.Core.Service {
    protected override _exportedMethods = [
      'validateDefinition', 'create', 'createDraft', 'updateDraft', 'publish', 'retire', 'resolvePublished',
    ];

    public validateDefinition(definition: GenerationProfileDefinitionV1, poc = true): GenerationProfileDefinitionV1 {
      if (!definition || !definition.purpose?.trim() || !definition.systemInstructions?.trim()) {
        throw new GenerationError('GENERATION_PROFILE_INVALID', 'Profile purpose and system instructions are required');
      }
      if (!Array.isArray(definition.sourceSlots) || !definition.sourceSlots.length) {
        throw new GenerationError('GENERATION_PROFILE_INVALID', 'At least one source slot is required');
      }
      assertUnique(definition.sourceSlots.map((slot) => slot.id), 'Source slot');
      assertUnique(definition.questions.map((question) => question.id), 'Question');
      assertUnique(definition.targetFields.map((field) => field.id), 'Target field');
      if (poc && definition.questions.length !== 5) {
        throw new GenerationError('GENERATION_PROFILE_INVALID', 'The POC requires exactly five non-branching questions');
      }
      if (!definition.targetFields.length) {
        throw new GenerationError('GENERATION_PROFILE_INVALID', 'At least one target field is required');
      }
      for (const slot of definition.sourceSlots) {
        if (!slot.recordType?.trim() || slot.maxBytes <= 0 || slot.maxBytes > sails.config.generation.context.maxFieldBytes ||
          !slot.allowedPaths.length || new Set(slot.allowedPaths).size !== slot.allowedPaths.length) {
          throw new GenerationError('GENERATION_PROFILE_INVALID', `Source slot '${slot.id}' is incomplete`);
        }
        slot.allowedPaths.forEach((pointer) => this.assertPointer(pointer, 'source'));
      }
      for (const question of definition.questions) {
        if (!question.labelKey?.trim() || !question.type || (question.maxLength !== undefined && question.maxLength <= 0)) {
          throw new GenerationError('GENERATION_PROFILE_INVALID', `Question '${question.id}' is invalid`);
        }
        const isChoice = question.type === 'enum' || question.type === 'multiEnum';
        const options = question.options ?? [];
        if ((isChoice && (!options.length || new Set(options.map((option) => option.value)).size !== options.length ||
          options.some((option) => !option.value?.trim() || !option.labelKey?.trim()))) || (!isChoice && options.length > 0)) {
          throw new GenerationError('GENERATION_PROFILE_INVALID', `Question '${question.id}' has invalid options`);
        }
        if (question.maxLength !== undefined && question.type !== 'text' && question.type !== 'textarea') {
          throw new GenerationError('GENERATION_PROFILE_INVALID', `Question '${question.id}' has an unsupported length limit`);
        }
        if (question.sourceDefaultExpression?.includes('condition')) {
          throw new GenerationError('GENERATION_PROFILE_INVALID', 'Conditional questions are not supported in the POC');
        }
        if (question.sourceDefaultExpression) {
          this.assertPointer(question.sourceDefaultExpression, 'question default');
          if (!definition.sourceSlots.some((slot) => slot.allowedPaths.includes(question.sourceDefaultExpression!))) {
            throw new GenerationError('GENERATION_PROFILE_INVALID', `Question '${question.id}' default is outside the source allowlist`);
          }
        }
      }
      for (const field of definition.targetFields) {
        this.assertPointer(field.metadataPointer, 'target');
        if (field.operation !== 'fill' || !SUPPORTED_OUTPUTS.has(field.output?.kind)) {
          throw new GenerationError('GENERATION_PROFILE_INVALID', `Target field '${field.id}' uses an unsupported operation or type`);
        }
        if (!field.expectedComponentClasses.length || field.expectedComponentClasses.some((component) =>
          EXCLUDED_COMPONENT_PARTS.some((part) => component.toLowerCase().includes(part)))) {
          throw new GenerationError('GENERATION_PROFILE_INVALID', `Target field '${field.id}' references an unsupported component`);
        }
        this.validateOutput(field.output, field.id);
        if (field.fallback && field.fallback.reviewRequired !== true) {
          throw new GenerationError('GENERATION_PROFILE_INVALID', `Target field '${field.id}' fallback must require review`);
        }
      }
      if (!definition.modelDeploymentId?.trim()) {
        throw new GenerationError('GENERATION_PROFILE_INVALID', 'A model deployment is required');
      }
      if (definition.contextLimits.totalBytes <= 0 || definition.contextLimits.totalBytes > sails.config.generation.context.maxTotalBytes ||
        definition.contextLimits.maxKnowledgeChunks < 0 || definition.contextLimits.maxKnowledgeChunks > sails.config.generation.context.maxKnowledgeChunks ||
        definition.contextLimits.maxChunkBytes <= 0 || definition.contextLimits.maxChunkBytes > sails.config.generation.context.maxChunkBytes) {
        throw new GenerationError('GENERATION_PROFILE_INVALID', 'Context limits are invalid');
      }
      return definition;
    }

    public async create(
      brandId: string,
      input: { key: string; name: string; description?: string; definition: GenerationProfileDefinitionV1 },
      actorId: string,
    ): Promise<{ profile: GenerationProfileAttributes; version: GenerationProfileVersionAttributes }> {
      const definition = this.validateDefinition(input.definition);
      const profile = await GenerationProfile.create({
        brandId, key: input.key, name: input.name, nameLower: input.name.trim().toLowerCase(), description: input.description,
        createdBy: actorId, updatedBy: actorId, enabled: true,
      }).fetch();
      const version = await GenerationProfileVersion.create({
        brandId, profileId: profile.id, version: 1, status: 'draft', schemaVersion: 1,
        definition, contentHash: canonicalHash(definition), createdBy: actorId,
      }).fetch();
      await GenerationProfile.updateOne({ id: profile.id, brandId }).set({ latestVersionId: version.id });
      return { profile: { ...profile, latestVersionId: version.id }, version };
    }

    public async createDraft(brandId: string, profileId: string, sourceVersionId: string, actorId: string): Promise<GenerationProfileVersionAttributes> {
      const source = await GenerationProfileVersion.findOne({ id: sourceVersionId, profileId, brandId });
      if (!source) throw new GenerationError('GENERATION_PROFILE_INVALID', 'Generation profile version was not found');
      const existing = requireWaterlineRows<GenerationProfileVersionAttributes>(
        await GenerationProfileVersion.find({ brandId, profileId }),
        'GenerationProfileVersion',
      );
      const next = Math.max(0, ...existing.map((item) => Number(item.version))) + 1;
      const draft = await GenerationProfileVersion.create({
        brandId, profileId, version: next, status: 'draft', schemaVersion: source.schemaVersion,
        definition: source.definition, contentHash: canonicalHash(source.definition), createdBy: actorId,
      }).fetch();
      await GenerationProfile.updateOne({ id: profileId, brandId }).set({ latestVersionId: draft.id, updatedBy: actorId });
      return draft;
    }

    public async updateDraft(
      brandId: string,
      versionId: string,
      definition: GenerationProfileDefinitionV1,
      expectedContentHash?: string,
    ): Promise<GenerationProfileVersionAttributes> {
      const current = await GenerationProfileVersion.findOne({ id: versionId, brandId });
      if (!current || current.status !== 'draft') throw new GenerationError('GENERATION_INVALID_STATE', 'Only draft profile versions may be edited');
      if (expectedContentHash && current.contentHash !== expectedContentHash) throw new GenerationError('GENERATION_INVALID_STATE', 'Profile draft changed concurrently');
      const validated = this.validateDefinition(definition);
      const updated = await GenerationProfileVersion.updateOne({ id: versionId, brandId, status: 'draft' }).set({
        definition: validated, contentHash: canonicalHash(validated),
      });
      if (!updated) throw new GenerationError('GENERATION_INVALID_STATE', 'Profile draft changed concurrently');
      return updated;
    }

    public async publish(brandId: string, versionId: string, actorId: string): Promise<GenerationProfileVersionAttributes> {
      const version = await GenerationProfileVersion.findOne({ id: versionId, brandId });
      if (!version || version.status !== 'draft') throw new GenerationError('GENERATION_INVALID_STATE', 'Only draft profile versions may be published');
      this.validateDefinition(version.definition);
      const deployment = await GenerationModelDeployment.findOne({ id: version.definition.modelDeploymentId, brandId, status: 'published' });
      if (!deployment) throw new GenerationError('GENERATION_PROFILE_INVALID', 'Published model deployment was not found');
      for (const id of version.definition.knowledgeCollectionVersionIds) {
        if (!await KnowledgeCollectionVersion.findOne({ id, brandId, status: 'published' })) {
          throw new GenerationError('GENERATION_PROFILE_INVALID', 'Published knowledge version was not found');
        }
      }
      const publishedAt = new Date().toISOString();
      const published = await GenerationProfileVersion.updateOne({ id: versionId, brandId, status: 'draft' }).set({
        status: 'published', publishedBy: actorId, publishedAt,
      });
      if (!published) throw new GenerationError('GENERATION_INVALID_STATE', 'Profile draft changed concurrently');
      await GenerationProfile.updateOne({ id: version.profileId, brandId }).set({ publishedVersionId: versionId, updatedBy: actorId });
      return published;
    }

    public async retire(brandId: string, versionId: string, actorId: string): Promise<GenerationProfileVersionAttributes> {
      const updated = await GenerationProfileVersion.updateOne({ id: versionId, brandId, status: 'published' }).set({
        status: 'retired', retiredBy: actorId, retiredAt: new Date().toISOString(),
      });
      if (!updated) throw new GenerationError('GENERATION_INVALID_STATE', 'Published profile version was not found');
      return updated;
    }

    public async resolvePublished(brandId: string, profileId: string): Promise<GenerationProfileVersionAttributes> {
      const profile = await GenerationProfile.findOne({ id: profileId, brandId, enabled: true });
      if (!profile?.publishedVersionId) throw new GenerationError('GENERATION_PROFILE_INVALID', 'Generation profile is not published');
      const version = await GenerationProfileVersion.findOne({ id: profile.publishedVersionId, profileId, brandId, status: 'published' });
      if (!version) throw new GenerationError('GENERATION_PROFILE_INVALID', 'Published generation profile version was not found');
      return version;
    }

    private assertPointer(pointer: string, kind: string): void {
      if (!pointer?.startsWith('/') || pointer.includes('..') || pointer.includes('\\')) {
        throw new GenerationError('GENERATION_PROFILE_INVALID', `Invalid ${kind} JSON pointer '${pointer}'`);
      }
    }

    private validateOutput(output: GenerationOutputType, fieldId: string): void {
      const fail = (): never => {
        throw new GenerationError('GENERATION_PROFILE_INVALID', `Target field '${fieldId}' has an invalid output contract`);
      };
      if (output.kind === 'string' || output.kind === 'richText') {
        if (output.maxLength !== undefined && (!Number.isInteger(output.maxLength) || output.maxLength <= 0)) fail();
        return;
      }
      if (output.kind === 'enum' || output.kind === 'enumArray') {
        if (!output.values.length || output.values.some((value) => !value.trim()) || new Set(output.values).size !== output.values.length) fail();
        if (output.kind === 'enumArray' && output.maxItems !== undefined &&
          (!Number.isInteger(output.maxItems) || output.maxItems <= 0 || output.maxItems > output.values.length)) fail();
        return;
      }
      if (output.kind === 'object' || output.kind === 'objectArray') {
        if (!Object.keys(output.properties).length) fail();
        for (const [key, nested] of Object.entries(output.properties)) {
          if (!key.trim()) fail();
          this.validateOutput(nested, `${fieldId}.${key}`);
        }
        if (output.kind === 'objectArray' && output.maxItems !== undefined && (!Number.isInteger(output.maxItems) || output.maxItems <= 0)) fail();
      }
    }
  }
}
