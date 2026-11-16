/// <reference path="../sails.ts" />
import { Attr, BeforeCreate, BeforeUpdate, Entity, toWaterlineModelDef } from '../decorators';
import { normalizeStableEntity } from './generation-model-helpers';

@BeforeCreate(normalizeStableEntity)
@BeforeUpdate(normalizeStableEntity)
@Entity('generationprofile', {
  indexes: [
    { attributes: { brandId: 1, key: 1 }, unique: true },
    { attributes: { brandId: 1, nameLower: 1 }, unique: true },
    { attributes: { brandId: 1, enabled: 1 } },
  ],
})
export class GenerationProfileClass {
  @Attr({ type: 'string', required: true }) public brandId!: string;
  @Attr({ type: 'string', required: true }) public key!: string;
  @Attr({ type: 'string', required: true }) public name!: string;
  @Attr({ type: 'string', required: true }) public nameLower!: string;
  @Attr({ type: 'string' }) public description?: string;
  @Attr({ type: 'string' }) public latestVersionId?: string;
  @Attr({ type: 'string' }) public publishedVersionId?: string;
  @Attr({ type: 'boolean', defaultsTo: true }) public enabled!: boolean;
  @Attr({ type: 'string', required: true }) public createdBy!: string;
  @Attr({ type: 'string', required: true }) public updatedBy!: string;
}

export const GenerationProfileWLDef = toWaterlineModelDef(GenerationProfileClass);
export interface GenerationProfileAttributes extends Sails.WaterlineAttributes {
  brandId: string; key: string; name: string; nameLower: string; description?: string;
  latestVersionId?: string; publishedVersionId?: string; enabled: boolean; createdBy: string; updatedBy: string;
}
export interface GenerationProfileWaterlineModel extends Sails.Model<GenerationProfileAttributes> { attributes: GenerationProfileAttributes; }
declare global { const GenerationProfile: GenerationProfileWaterlineModel; }
