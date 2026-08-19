/// <reference path="../sails.ts" />
import { Attr, BeforeCreate, BeforeUpdate, Entity, buildInvalidNewRecordError, toWaterlineModelDef } from '../decorators';
import { containsEmbeddedSecret, normalizeStableEntity } from './generation-model-helpers';

const normalize = (record: Record<string, unknown>, callback: (error?: Error) => void) => {
  if (containsEmbeddedSecret(record.nonSecretHeaders) || containsEmbeddedSecret(record.dataPolicy)) {
    callback(buildInvalidNewRecordError('Embedded secret values are prohibited; use secretRef'));
    return;
  }
  const endpoint = String(record.endpoint ?? '').trim();
  if (endpoint) {
    try {
      const url = new URL(endpoint);
      if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) throw new Error('unsafe');
      record.endpoint = url.toString().replace(/\/$/, '');
    } catch {
      callback(buildInvalidNewRecordError('Generation connection endpoint must be a credential-free HTTPS URL'));
      return;
    }
  }
  normalizeStableEntity(record, callback);
};
@BeforeCreate(normalize)
@BeforeUpdate(normalize)
@Entity('generationmodelconnection', {
  indexes: [
    { attributes: { brandId: 1, key: 1 }, unique: true },
    { attributes: { brandId: 1, adapterId: 1, enabled: 1 } },
  ],
})
export class GenerationModelConnectionClass {
  @Attr({ type: 'string', required: true }) public brandId!: string;
  @Attr({ type: 'string', required: true }) public key!: string;
  @Attr({ type: 'string', required: true }) public name!: string;
  @Attr({ type: 'string', required: true }) public nameLower!: string;
  @Attr({ type: 'string', required: true }) public adapterId!: string;
  @Attr({ type: 'boolean', defaultsTo: true }) public enabled!: boolean;
  @Attr({ type: 'string', required: true }) public endpoint!: string;
  @Attr({ type: 'string', required: true }) public authStrategy!: string;
  @Attr({ type: 'string' }) public secretRef?: string;
  @Attr({ type: 'json' }) public nonSecretHeaders?: Record<string, string>;
  @Attr({ type: 'json' }) public dataPolicy?: Record<string, unknown>;
  @Attr({ type: 'number', defaultsTo: 90000 }) public timeoutMs!: number;
  @Attr({ type: 'string', required: true }) public createdBy!: string;
  @Attr({ type: 'string', required: true }) public updatedBy!: string;
  @Attr({ type: 'string' }) public lastHealthStatus?: string;
  @Attr({ type: 'string' }) public lastHealthCheckedAt?: string;
}
export const GenerationModelConnectionWLDef = toWaterlineModelDef(GenerationModelConnectionClass);
export interface GenerationModelConnectionAttributes extends Sails.WaterlineAttributes {
  brandId: string; key: string; name: string; nameLower: string; adapterId: string; enabled: boolean;
  endpoint: string; authStrategy: string; secretRef?: string; nonSecretHeaders?: Record<string, string>;
  dataPolicy?: Record<string, unknown>; timeoutMs: number; createdBy: string; updatedBy: string;
  lastHealthStatus?: string; lastHealthCheckedAt?: string;
}
export interface GenerationModelConnectionWaterlineModel extends Sails.Model<GenerationModelConnectionAttributes> { attributes: GenerationModelConnectionAttributes; }
declare global { const GenerationModelConnection: GenerationModelConnectionWaterlineModel; }
