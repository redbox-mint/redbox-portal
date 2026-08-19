/// <reference path="../sails.ts" />
import { Attr, BeforeCreate, BeforeUpdate, Entity, buildInvalidNewRecordError, toWaterlineModelDef } from '../decorators';
import { GENERATION_GROUNDING_STATES } from '@researchdatabox/sails-ng-common';
import type { GenerationGroundingState } from '@researchdatabox/sails-ng-common';

const validate = (record: Record<string, unknown>, callback: (error?: Error) => void) => {
  if (record.metadataPointer !== undefined && !String(record.metadataPointer).startsWith('/')) {
    return callback(buildInvalidNewRecordError('Generation provenance metadataPointer is invalid'));
  }
  if (record.rationale !== undefined && String(record.rationale).length > 500) {
    return callback(buildInvalidNewRecordError('Generation provenance rationale exceeds 500 characters'));
  }
  if (record.evidenceRefs !== undefined && (!Array.isArray(record.evidenceRefs) || record.evidenceRefs.length > 50)) {
    return callback(buildInvalidNewRecordError('Generation provenance evidenceRefs is invalid'));
  }
  if (record.groundingState !== undefined && !GENERATION_GROUNDING_STATES.includes(record.groundingState as GenerationGroundingState)) {
    return callback(buildInvalidNewRecordError('Generation provenance groundingState is invalid'));
  }
  callback();
};

@BeforeCreate(validate)
@BeforeUpdate(validate)

@Entity('generationfieldprovenance', {
  indexes: [
    { attributes: { brandId: 1, runId: 1, profileFieldId: 1 }, unique: true },
    { attributes: { brandId: 1, targetRecordOid: 1 } },
    { attributes: { brandId: 1, targetRecordOid: 1, metadataPointer: 1 } },
  ],
})
export class GenerationFieldProvenanceClass {
  @Attr({ type: 'string', required: true }) public brandId!: string;
  @Attr({ type: 'string', required: true }) public runId!: string;
  @Attr({ type: 'string', required: true }) public targetRecordOid!: string;
  @Attr({ type: 'string', required: true }) public profileFieldId!: string;
  @Attr({ type: 'string', required: true }) public metadataPointer!: string;
  @Attr({ type: 'string', required: true }) public generatedValueHash!: string;
  @Attr({ type: 'string', required: true }) public candidateDigest!: string;
  @Attr({ type: 'json', required: true }) public evidenceRefs!: Array<Record<string, unknown>>;
  @Attr({ type: 'string', required: true }) public rationale!: string;
  @Attr({ type: 'string', required: true }) public groundingState!: GenerationGroundingState;
  @Attr({ type: 'boolean', defaultsTo: false }) public reviewRequired!: boolean;
  @Attr({ type: 'string' }) public reviewReasonCode?: string;
  @Attr({ type: 'string' }) public reviewedBy?: string;
  @Attr({ type: 'string' }) public reviewedAt?: string;
  @Attr({ type: 'string', required: true }) public generatedAt!: string;
  @Attr({ type: 'string', required: true }) public committedAt!: string;
}
export const GenerationFieldProvenanceWLDef = toWaterlineModelDef(GenerationFieldProvenanceClass);
export interface GenerationFieldProvenanceAttributes extends Sails.WaterlineAttributes {
  brandId: string; runId: string; targetRecordOid: string; profileFieldId: string; metadataPointer: string;
  generatedValueHash: string; candidateDigest: string; evidenceRefs: Array<Record<string, unknown>>; rationale: string;
  groundingState: GenerationGroundingState; reviewRequired: boolean; reviewReasonCode?: string; reviewedBy?: string;
  reviewedAt?: string; generatedAt: string; committedAt: string;
}
export interface GenerationFieldProvenanceWaterlineModel extends Sails.Model<GenerationFieldProvenanceAttributes> { attributes: GenerationFieldProvenanceAttributes; }
declare global { const GenerationFieldProvenance: GenerationFieldProvenanceWaterlineModel; }
