/// <reference path="../sails.ts" />
import { Attr, Entity, toWaterlineModelDef } from '../decorators';

@Entity('knowledgechunk', {
  indexes: [
    { attributes: { brandId: 1, collectionVersionId: 1, chunkKey: 1 }, unique: true },
    { attributes: { brandId: 1, collectionVersionId: 1, tags: 1 } },
    { attributes: { brandId: 1, collectionVersionId: 1, documentId: 1, ordinal: 1 } },
  ],
})
export class KnowledgeChunkClass {
  @Attr({ type: 'string', required: true }) public brandId!: string;
  @Attr({ type: 'string', required: true }) public collectionVersionId!: string;
  @Attr({ type: 'string', required: true }) public documentId!: string;
  @Attr({ type: 'string', required: true }) public chunkKey!: string;
  @Attr({ type: 'number', required: true }) public ordinal!: number;
  @Attr({ type: 'string' }) public heading?: string;
  @Attr({ type: 'string', required: true }) public content!: string;
  @Attr({ type: 'string', required: true }) public contentHash!: string;
  @Attr({ type: 'json' }) public tags?: string[];
  @Attr({ type: 'json' }) public retrievalMetadata?: Record<string, unknown>;
}
export const KnowledgeChunkWLDef = toWaterlineModelDef(KnowledgeChunkClass);
export interface KnowledgeChunkAttributes extends Sails.WaterlineAttributes {
  brandId: string; collectionVersionId: string; documentId: string; chunkKey: string; ordinal: number;
  heading?: string; content: string; contentHash: string; tags?: string[]; retrievalMetadata?: Record<string, unknown>;
}
export interface KnowledgeChunkWaterlineModel extends Sails.Model<KnowledgeChunkAttributes> { attributes: KnowledgeChunkAttributes; }
declare global { const KnowledgeChunk: KnowledgeChunkWaterlineModel; }
