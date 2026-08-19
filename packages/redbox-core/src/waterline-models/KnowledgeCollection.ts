/// <reference path="../sails.ts" />
import { Attr, BeforeCreate, BeforeUpdate, Entity, toWaterlineModelDef } from '../decorators';
import { normalizeStableEntity } from './generation-model-helpers';

@BeforeCreate(normalizeStableEntity)
@BeforeUpdate(normalizeStableEntity)
@Entity('knowledgecollection', { indexes: [{ attributes: { brandId: 1, key: 1 }, unique: true }] })
export class KnowledgeCollectionClass {
  @Attr({ type: 'string', required: true }) public brandId!: string;
  @Attr({ type: 'string', required: true }) public key!: string;
  @Attr({ type: 'string', required: true }) public name!: string;
  @Attr({ type: 'string', required: true }) public nameLower!: string;
  @Attr({ type: 'string' }) public description?: string;
  @Attr({ type: 'boolean', defaultsTo: true }) public enabled!: boolean;
  @Attr({ type: 'string' }) public latestVersionId?: string;
  @Attr({ type: 'string' }) public publishedVersionId?: string;
  @Attr({ type: 'string', required: true }) public createdBy!: string;
  @Attr({ type: 'string', required: true }) public updatedBy!: string;
}
export const KnowledgeCollectionWLDef = toWaterlineModelDef(KnowledgeCollectionClass);
export interface KnowledgeCollectionAttributes extends Sails.WaterlineAttributes {
  brandId: string; key: string; name: string; nameLower: string; description?: string; enabled: boolean;
  latestVersionId?: string; publishedVersionId?: string; createdBy: string; updatedBy: string;
}
export interface KnowledgeCollectionWaterlineModel extends Sails.Model<KnowledgeCollectionAttributes> { attributes: KnowledgeCollectionAttributes; }
declare global { const KnowledgeCollection: KnowledgeCollectionWaterlineModel; }
