import { Services as services } from '../CoreService';
import { canonicalHash, GenerationError, GenerationEvidence } from '../model/generation';
import type { KnowledgeCollectionAttributes } from '../waterline-models/KnowledgeCollection';
import type { KnowledgeCollectionVersionAttributes } from '../waterline-models/KnowledgeCollectionVersion';
import type { KnowledgeDocumentAttributes } from '../waterline-models/KnowledgeDocument';
import type { KnowledgeChunkAttributes } from '../waterline-models/KnowledgeChunk';
import { requireWaterlineRows } from './generation/require-service';

const AUTHORITY_ORDER: Record<string, number> = {
  binding: 0,
  institutionPolicy: 1,
  approvedGuidance: 2,
  funderGuidance: 3,
  example: 4,
};

export interface GenerationKnowledgeDocumentInput {
  documentKey: string;
  title: string;
  authority: keyof typeof AUTHORITY_ORDER;
  effectiveFrom?: string;
  effectiveTo?: string;
  owner?: string;
  classification: string;
  sourceUri?: string;
  mediaType?: 'text/plain' | 'text/markdown';
  content: string;
  tags?: string[];
  ordinal?: number;
}

export namespace Services {
  export class GenerationKnowledgeService extends services.Core.Service {
    protected override _exportedMethods = ['createCollection', 'createVersion', 'chunkDocument', 'publish', 'retrieve'];

    public async createCollection(
      brandId: string,
      input: { key: string; name: string; description?: string },
      actorId: string,
    ): Promise<KnowledgeCollectionAttributes> {
      return KnowledgeCollection.create({
        ...input,
        brandId,
        nameLower: input.name.trim().toLowerCase(),
        enabled: true,
        createdBy: actorId,
        updatedBy: actorId,
      }).fetch();
    }

    public async createVersion(
      brandId: string,
      collectionId: string,
      manifest: Record<string, unknown>,
      actorId: string,
      retrievalStrategy = 'tagged',
    ): Promise<KnowledgeCollectionVersionAttributes> {
      const collection = await KnowledgeCollection.findOne({ id: collectionId, brandId });
      if (!collection) throw new GenerationError('GENERATION_PROFILE_INVALID', 'Knowledge collection was not found');
      const versions = requireWaterlineRows<KnowledgeCollectionVersionAttributes>(
        await KnowledgeCollectionVersion.find({ brandId, collectionId }),
        'KnowledgeCollectionVersion',
      );
      const version = Math.max(0, ...versions.map((item) => Number(item.version))) + 1;
      const created = await KnowledgeCollectionVersion.create({
        brandId, collectionId, version, status: 'draft', manifest, retrievalStrategy,
        contentHash: canonicalHash(manifest), createdBy: actorId,
      }).fetch();
      await KnowledgeCollection.updateOne({ id: collectionId, brandId }).set({ latestVersionId: created.id, updatedBy: actorId });
      return created;
    }

    public chunkDocument(document: GenerationKnowledgeDocumentInput, maxChunkBytes: number): Array<Omit<KnowledgeChunkAttributes, 'id' | 'brandId' | 'collectionVersionId' | 'documentId'>> {
      if (!['text/plain', 'text/markdown'].includes(document.mediaType ?? 'text/markdown')) {
        throw new GenerationError('GENERATION_PROFILE_INVALID', 'Only plain text and Markdown knowledge are supported');
      }
      if (!document.content.trim() || maxChunkBytes <= 0) {
        throw new GenerationError('GENERATION_PROFILE_INVALID', 'Knowledge content and a positive chunk bound are required');
      }
      const blocks = document.content.replace(/\r\n/g, '\n').split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
      const chunks: string[] = [];
      let current = '';
      for (const block of blocks) {
        if (Buffer.byteLength(block, 'utf8') > maxChunkBytes) {
          if (current) { chunks.push(current); current = ''; }
          let remainder = block;
          while (Buffer.byteLength(remainder, 'utf8') > maxChunkBytes) {
            let end = Math.min(remainder.length, maxChunkBytes);
            while (end > 1 && Buffer.byteLength(remainder.slice(0, end), 'utf8') > maxChunkBytes) end--;
            chunks.push(remainder.slice(0, end));
            remainder = remainder.slice(end);
          }
          if (remainder) current = remainder;
        } else if (!current || Buffer.byteLength(`${current}\n\n${block}`, 'utf8') <= maxChunkBytes) {
          current = current ? `${current}\n\n${block}` : block;
        } else {
          chunks.push(current);
          current = block;
        }
      }
      if (current) chunks.push(current);
      return chunks.map((content, ordinal) => {
        const heading = content.split('\n').find((line) => /^#{1,6}\s/.test(line))?.replace(/^#{1,6}\s+/, '');
        return {
          chunkKey: `${document.documentKey}:${String(ordinal + 1).padStart(3, '0')}`,
          ordinal,
          heading,
          content,
          contentHash: canonicalHash(content),
          tags: [...new Set(document.tags ?? [])].sort(),
        };
      });
    }

    public async publish(
      brandId: string,
      versionId: string,
      documents: GenerationKnowledgeDocumentInput[],
      actorId: string,
    ): Promise<KnowledgeCollectionVersionAttributes> {
      const version = await KnowledgeCollectionVersion.findOne({ id: versionId, brandId, status: 'draft' });
      if (!version) throw new GenerationError('GENERATION_INVALID_STATE', 'Only draft knowledge versions may be published');
      const documentKeys = documents.map((document) => document.documentKey);
      if (new Set(documentKeys).size !== documentKeys.length) throw new GenerationError('GENERATION_PROFILE_INVALID', 'Knowledge document keys must be unique');
      for (const [index, input] of documents.entries()) {
        if (!(input.authority in AUTHORITY_ORDER)) throw new GenerationError('GENERATION_PROFILE_INVALID', 'Knowledge authority is invalid');
        if (input.effectiveFrom && input.effectiveTo && Date.parse(input.effectiveFrom) > Date.parse(input.effectiveTo)) {
          throw new GenerationError('GENERATION_PROFILE_INVALID', 'Knowledge effective date range is invalid');
        }
        const document = await KnowledgeDocument.create({
          ...input, brandId, collectionVersionId: versionId, mediaType: input.mediaType ?? 'text/markdown',
          contentHash: canonicalHash(input.content), ordinal: input.ordinal ?? index,
        }).fetch();
        const chunks = this.chunkDocument(input, sails.config.generation.context.maxChunkBytes);
        for (const chunk of chunks) {
          await KnowledgeChunk.create({ ...chunk, brandId, collectionVersionId: versionId, documentId: document.id }).fetch();
        }
      }
      const contentHash = canonicalHash({ manifest: version.manifest, documents });
      const published = await KnowledgeCollectionVersion.updateOne({ id: versionId, brandId, status: 'draft' }).set({
        status: 'published', contentHash, publishedBy: actorId, publishedAt: new Date().toISOString(),
      });
      if (!published) throw new GenerationError('GENERATION_INVALID_STATE', 'Knowledge version changed concurrently');
      await KnowledgeCollection.updateOne({ id: version.collectionId, brandId }).set({ publishedVersionId: versionId, updatedBy: actorId });
      return published;
    }

    public async retrieve(
      brandId: string,
      versionIds: string[],
      tags: string[],
      limits: { maxChunks: number; maxBytes: number },
      at = new Date(),
    ): Promise<GenerationEvidence[]> {
      if (!versionIds.length || !tags.length) return [];
      const versions = requireWaterlineRows<KnowledgeCollectionVersionAttributes>(
        await KnowledgeCollectionVersion.find({ id: { in: versionIds }, brandId, status: 'published' }),
        'KnowledgeCollectionVersion',
      );
      if (versions.length !== new Set(versionIds).size) throw new GenerationError('GENERATION_PROFILE_INVALID', 'Pinned knowledge version is unavailable');
      const documents = requireWaterlineRows<KnowledgeDocumentAttributes>(
        await KnowledgeDocument.find({ brandId, collectionVersionId: { in: versionIds } }),
        'KnowledgeDocument',
      );
      const activeDocuments = documents.filter((document) =>
        (!document.effectiveFrom || Date.parse(document.effectiveFrom) <= at.getTime()) &&
        (!document.effectiveTo || Date.parse(document.effectiveTo) >= at.getTime()));
      const documentById = new Map(activeDocuments.map((document) => [document.id, document]));
      const chunks = requireWaterlineRows<KnowledgeChunkAttributes>(
        await KnowledgeChunk.find({ brandId, collectionVersionId: { in: versionIds } }),
        'KnowledgeChunk',
      );
      const tagSet = new Set(tags);
      const ordered = chunks
        .filter((chunk) => documentById.has(chunk.documentId) && (chunk.tags ?? []).some((tag) => tagSet.has(tag)))
        .sort((a, b) => {
          const aDoc = documentById.get(a.documentId)!;
          const bDoc = documentById.get(b.documentId)!;
          return (AUTHORITY_ORDER[aDoc.authority] - AUTHORITY_ORDER[bDoc.authority]) ||
            (aDoc.ordinal - bDoc.ordinal) || (a.ordinal - b.ordinal) || a.chunkKey.localeCompare(b.chunkKey);
        });
      const result: GenerationEvidence[] = [];
      let bytes = 0;
      for (const chunk of ordered) {
        const chunkBytes = Buffer.byteLength(chunk.content, 'utf8');
        if (result.length >= limits.maxChunks || bytes + chunkBytes > limits.maxBytes) break;
        const document = documentById.get(chunk.documentId)!;
        result.push({
          id: `knowledge:${chunk.collectionVersionId}:${chunk.chunkKey}`,
          label: `${document.title}${chunk.heading ? ` — ${chunk.heading}` : ''}`,
          kind: 'knowledge', content: chunk.content, contentHash: chunk.contentHash,
          authority: document.authority, tags: chunk.tags,
        });
        bytes += chunkBytes;
      }
      return result;
    }
  }
}
