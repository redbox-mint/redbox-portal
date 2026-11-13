/// <reference path="../sails.ts" />
import { Attr, Entity, toWaterlineModelDef } from '../decorators';

@Entity('knowledgedocument', {
  indexes: [
    { attributes: { brandId: 1, collectionVersionId: 1, documentKey: 1 }, unique: true },
    { attributes: { brandId: 1, collectionVersionId: 1, ordinal: 1 } },
  ],
})
export class KnowledgeDocumentClass {
  @Attr({ type: 'string', required: true }) public brandId!: string;
  @Attr({ type: 'string', required: true }) public collectionVersionId!: string;
  @Attr({ type: 'string', required: true }) public documentKey!: string;
  @Attr({ type: 'string', required: true }) public title!: string;
  @Attr({ type: 'string', required: true }) public authority!: string;
  @Attr({ type: 'string' }) public effectiveFrom?: string;
  @Attr({ type: 'string' }) public effectiveTo?: string;
  @Attr({ type: 'string' }) public owner?: string;
  @Attr({ type: 'string', required: true }) public classification!: string;
  @Attr({ type: 'string' }) public sourceUri?: string;
  @Attr({ type: 'string', defaultsTo: 'text/markdown' }) public mediaType!: string;
  @Attr({ type: 'string', required: true }) public content!: string;
  @Attr({ type: 'string', required: true }) public contentHash!: string;
  @Attr({ type: 'json' }) public tags?: string[];
  @Attr({ type: 'number', defaultsTo: 0 }) public ordinal!: number;
}
export const KnowledgeDocumentWLDef = toWaterlineModelDef(KnowledgeDocumentClass);
export interface KnowledgeDocumentAttributes extends Sails.WaterlineAttributes {
  brandId: string; collectionVersionId: string; documentKey: string; title: string; authority: string;
  effectiveFrom?: string; effectiveTo?: string; owner?: string; classification: string; sourceUri?: string;
  mediaType: string; content: string; contentHash: string; tags?: string[]; ordinal: number;
}
export interface KnowledgeDocumentWaterlineModel extends Sails.Model<KnowledgeDocumentAttributes> { attributes: KnowledgeDocumentAttributes; }
declare global { const KnowledgeDocument: KnowledgeDocumentWaterlineModel; }
