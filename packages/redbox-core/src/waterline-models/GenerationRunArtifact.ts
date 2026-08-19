/// <reference path="../sails.ts" />
import { Attr, BeforeCreate, BeforeUpdate, Entity, buildInvalidNewRecordError, buildInvalidUpdateRecordError, toWaterlineModelDef } from '../decorators';

const PLAINTEXT_FIELDS = ['payload', 'prompt', 'source', 'response', 'candidate', 'rawResponse'];
const validate = (record: Record<string, unknown>, callback: (error?: Error) => void, update: boolean) => {
  if (PLAINTEXT_FIELDS.some((field) => record[field] !== undefined)) {
    callback((update ? buildInvalidUpdateRecordError : buildInvalidNewRecordError)('Plaintext generation artifact fields are prohibited'));
    return;
  }
  const expiresAt = record.expiresAt === undefined && update ? Date.now() : Date.parse(String(record.expiresAt ?? ''));
  if (!Number.isFinite(expiresAt)) {
    callback((update ? buildInvalidUpdateRecordError : buildInvalidNewRecordError)('A valid expiresAt timestamp is required'));
    return;
  }
  if (!update && expiresAt <= Date.now()) {
    callback(buildInvalidNewRecordError('Generation artifact expiresAt must be in the future'));
    return;
  }
  callback();
};
const validateCreate = (record: Record<string, unknown>, callback: (error?: Error) => void) => validate(record, callback, false);
const validateUpdate = (record: Record<string, unknown>, callback: (error?: Error) => void) => validate(record, callback, true);

@BeforeCreate(validateCreate)
@BeforeUpdate(validateUpdate)
@Entity('generationrunartifact', {
  indexes: [
    { attributes: { brandId: 1, runId: 1 }, unique: true },
    { attributes: { expiresAt: 1 }, expireAfterSeconds: 0 },
  ],
})
export class GenerationRunArtifactClass {
  @Attr({ type: 'string', required: true }) public brandId!: string;
  @Attr({ type: 'string', required: true }) public runId!: string;
  @Attr({ type: 'string', columnType: 'datetime', required: true }) public expiresAt!: string;
  @Attr({ type: 'string', required: true }) public encryptionKeyId!: string;
  @Attr({ type: 'string', required: true }) public iv!: string;
  @Attr({ type: 'string', required: true }) public authTag!: string;
  @Attr({ type: 'string', required: true }) public ciphertext!: string;
  @Attr({ type: 'number', defaultsTo: 1 }) public payloadVersion!: number;
  @Attr({ type: 'json', required: true }) public contentKinds!: string[];
}
export const GenerationRunArtifactWLDef = toWaterlineModelDef(GenerationRunArtifactClass);
export interface GenerationRunArtifactAttributes extends Sails.WaterlineAttributes {
  brandId: string; runId: string; expiresAt: string; encryptionKeyId: string; iv: string;
  authTag: string; ciphertext: string; payloadVersion: number; contentKinds: string[];
}
export interface GenerationRunArtifactWaterlineModel extends Sails.Model<GenerationRunArtifactAttributes> { attributes: GenerationRunArtifactAttributes; }
declare global { const GenerationRunArtifact: GenerationRunArtifactWaterlineModel; }
