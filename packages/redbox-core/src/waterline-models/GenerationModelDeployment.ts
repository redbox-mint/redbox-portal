/// <reference path="../sails.ts" />
import { Attr, BeforeCreate, BeforeUpdate, Entity, toWaterlineModelDef } from '../decorators';
import { normalizeVersion, rejectPublishedUpdate } from './generation-model-helpers';

const normalize = (record: Record<string, unknown>, callback: (error?: Error) => void) => normalizeVersion(record, callback, 'parameters');
@BeforeCreate(normalize)
@BeforeUpdate(rejectPublishedUpdate)
@Entity('generationmodeldeployment', {
  indexes: [
    { attributes: { brandId: 1, key: 1, version: 1 }, unique: true },
    { attributes: { brandId: 1, key: 1, status: 1 } },
    { attributes: { brandId: 1, connectionId: 1 } },
  ],
})
export class GenerationModelDeploymentClass {
  @Attr({ type: 'string', required: true }) public brandId!: string;
  @Attr({ type: 'string', required: true }) public key!: string;
  @Attr({ type: 'number', required: true }) public version!: number;
  @Attr({ type: 'string', required: true }) public name!: string;
  @Attr({ type: 'string', defaultsTo: 'draft' }) public status!: string;
  @Attr({ type: 'string', required: true }) public connectionId!: string;
  @Attr({ type: 'string', required: true }) public modelId!: string;
  @Attr({ type: 'json' }) public parameters?: Record<string, unknown>;
  @Attr({ type: 'json' }) public routingPolicy?: Record<string, unknown>;
  @Attr({ type: 'json', required: true }) public requiredCapabilities!: Record<string, boolean>;
  @Attr({ type: 'json' }) public capabilitySnapshot?: Record<string, unknown>;
  @Attr({ type: 'string', required: true }) public contentHash!: string;
  @Attr({ type: 'string', required: true }) public createdBy!: string;
  @Attr({ type: 'string' }) public publishedBy?: string;
  @Attr({ type: 'string' }) public publishedAt?: string;
}
export const GenerationModelDeploymentWLDef = toWaterlineModelDef(GenerationModelDeploymentClass);
export interface GenerationModelDeploymentAttributes extends Sails.WaterlineAttributes {
  brandId: string; key: string; version: number; name: string; status: string; connectionId: string; modelId: string;
  parameters?: Record<string, unknown>; routingPolicy?: Record<string, unknown>; requiredCapabilities: Record<string, boolean>;
  capabilitySnapshot?: Record<string, unknown>; contentHash: string; createdBy: string; publishedBy?: string; publishedAt?: string;
}
export interface GenerationModelDeploymentWaterlineModel extends Sails.Model<GenerationModelDeploymentAttributes> { attributes: GenerationModelDeploymentAttributes; }
declare global { const GenerationModelDeployment: GenerationModelDeploymentWaterlineModel; }
