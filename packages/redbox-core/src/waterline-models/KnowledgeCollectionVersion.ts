/// <reference path="../sails.ts" />
import { Attr, BeforeCreate, BeforeUpdate, Entity, toWaterlineModelDef } from '../decorators';
import { normalizeVersion, rejectPublishedUpdate } from './generation-model-helpers';
import { canonicalHash } from '../model/generation';

const normalize = (record: Record<string, unknown>, callback: (error?: Error) => void) => normalizeVersion(record, (error) => {
  if (!error) record.contentHash = canonicalHash({ manifest: record.manifest, version: record.version });
  callback(error);
}, 'manifest');
@BeforeCreate(normalize)
@BeforeUpdate(rejectPublishedUpdate)
@Entity('knowledgecollectionversion', {
  indexes: [
    { attributes: { brandId: 1, collectionId: 1, version: 1 }, unique: true },
    { attributes: { brandId: 1, collectionId: 1, contentHash: 1 }, unique: true },
  ],
})
export class KnowledgeCollectionVersionClass {
  @Attr({ type: 'string', required: true }) public brandId!: string;
  @Attr({ type: 'string', required: true }) public collectionId!: string;
  @Attr({ type: 'number', required: true }) public version!: number;
  @Attr({ type: 'string', defaultsTo: 'draft' }) public status!: string;
  @Attr({ type: 'json', required: true }) public manifest!: Record<string, unknown>;
  @Attr({ type: 'string', defaultsTo: 'tagged' }) public retrievalStrategy!: string;
  @Attr({ type: 'string', required: true }) public contentHash!: string;
  @Attr({ type: 'string', required: true }) public createdBy!: string;
  @Attr({ type: 'string' }) public publishedBy?: string;
  @Attr({ type: 'string' }) public publishedAt?: string;
  @Attr({ type: 'string' }) public retiredBy?: string;
  @Attr({ type: 'string' }) public retiredAt?: string;
}
export const KnowledgeCollectionVersionWLDef = toWaterlineModelDef(KnowledgeCollectionVersionClass);
export interface KnowledgeCollectionVersionAttributes extends Sails.WaterlineAttributes {
  brandId: string; collectionId: string; version: number; status: string; manifest: Record<string, unknown>;
  retrievalStrategy: string; contentHash: string; createdBy: string; publishedBy?: string; publishedAt?: string;
  retiredBy?: string; retiredAt?: string;
}
export interface KnowledgeCollectionVersionWaterlineModel extends Sails.Model<KnowledgeCollectionVersionAttributes> { attributes: KnowledgeCollectionVersionAttributes; }
declare global { const KnowledgeCollectionVersion: KnowledgeCollectionVersionWaterlineModel; }
