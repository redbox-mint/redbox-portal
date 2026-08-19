/// <reference path="../sails.ts" />
import { Attr, BeforeCreate, BeforeUpdate, Entity, toWaterlineModelDef } from '../decorators';
import { GenerationProfileDefinitionV1 } from '../model/generation';
import { normalizeVersion, rejectPublishedUpdate } from './generation-model-helpers';

const normalize = (record: Record<string, unknown>, callback: (error?: Error) => void) => normalizeVersion(record, callback, 'definition');
@BeforeCreate(normalize)
@BeforeUpdate(rejectPublishedUpdate)
@Entity('generationprofileversion', {
  indexes: [
    { attributes: { brandId: 1, profileId: 1, version: 1 }, unique: true },
    { attributes: { brandId: 1, profileId: 1, status: 1 } },
    { attributes: { brandId: 1, contentHash: 1 } },
  ],
})
export class GenerationProfileVersionClass {
  @Attr({ type: 'string', required: true }) public brandId!: string;
  @Attr({ type: 'string', required: true }) public profileId!: string;
  @Attr({ type: 'number', required: true }) public version!: number;
  @Attr({ type: 'string', defaultsTo: 'draft' }) public status!: string;
  @Attr({ type: 'number', defaultsTo: 1 }) public schemaVersion!: number;
  @Attr({ type: 'json', required: true }) public definition!: GenerationProfileDefinitionV1;
  @Attr({ type: 'string', required: true }) public contentHash!: string;
  @Attr({ type: 'string', required: true }) public createdBy!: string;
  @Attr({ type: 'string' }) public publishedBy?: string;
  @Attr({ type: 'string' }) public publishedAt?: string;
  @Attr({ type: 'string' }) public retiredBy?: string;
  @Attr({ type: 'string' }) public retiredAt?: string;
}
export const GenerationProfileVersionWLDef = toWaterlineModelDef(GenerationProfileVersionClass);
export interface GenerationProfileVersionAttributes extends Sails.WaterlineAttributes {
  brandId: string; profileId: string; version: number; status: string; schemaVersion: number;
  definition: GenerationProfileDefinitionV1; contentHash: string; createdBy: string;
  publishedBy?: string; publishedAt?: string; retiredBy?: string; retiredAt?: string;
}
export interface GenerationProfileVersionWaterlineModel extends Sails.Model<GenerationProfileVersionAttributes> { attributes: GenerationProfileVersionAttributes; }
declare global { const GenerationProfileVersion: GenerationProfileVersionWaterlineModel; }
