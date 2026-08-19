/// <reference path="../sails.ts" />
import { Attr, BeforeCreate, BeforeUpdate, Entity, buildInvalidNewRecordError, toWaterlineModelDef } from '../decorators';
import { normalizeStableEntity } from './generation-model-helpers';

const normalize = (record: Record<string, unknown>, callback: (error?: Error) => void) => {
  normalizeStableEntity(record, (error) => {
    if (error) return callback(error);
    const sourceModes = record.sourceModes;
    if (sourceModes !== undefined && (!Array.isArray(sourceModes) || sourceModes.some((mode) => !['view', 'edit'].includes(String(mode))))) {
      return callback(buildInvalidNewRecordError('Generation binding sourceModes must contain only view or edit'));
    }
    if (record.targetMode !== undefined && record.targetMode !== 'create') {
      return callback(buildInvalidNewRecordError('Generation binding targetMode must be create'));
    }
    if (record.maxSuccessfulRunsPerIntent !== undefined && record.maxSuccessfulRunsPerIntent !== 1) {
      return callback(buildInvalidNewRecordError('Generation binding allows one successful run per intent'));
    }
    if (record.allowMultipleTargetsPerSource !== undefined && record.allowMultipleTargetsPerSource !== true) {
      return callback(buildInvalidNewRecordError('Generation binding must allow multiple targets per source'));
    }
    const relationship = record.sourceRelationship;
    if (relationship !== undefined && (!relationship || typeof relationship !== 'object' ||
      !String(Reflect.get(relationship, 'sourceSlotId') ?? '').trim() ||
      !String(Reflect.get(relationship, 'metadataPointer') ?? '').startsWith('/'))) {
      return callback(buildInvalidNewRecordError('Generation binding sourceRelationship is invalid'));
    }
    callback();
  });
};

@BeforeCreate(normalize)
@BeforeUpdate(normalize)
@Entity('generationbinding', {
  indexes: [
    { attributes: { brandId: 1, key: 1 }, unique: true },
    { attributes: { brandId: 1, sourceRecordType: 1, enabled: 1 } },
    { attributes: { brandId: 1, targetRecordType: 1, enabled: 1 } },
  ],
})
export class GenerationBindingClass {
  @Attr({ type: 'string', required: true }) public brandId!: string;
  @Attr({ type: 'string', required: true }) public key!: string;
  @Attr({ type: 'string', required: true }) public name!: string;
  @Attr({ type: 'string', required: true }) public nameLower!: string;
  @Attr({ type: 'string' }) public description?: string;
  @Attr({ type: 'boolean', defaultsTo: true }) public enabled!: boolean;
  @Attr({ type: 'string', required: true }) public profileId!: string;
  @Attr({ type: 'string', required: true }) public sourceRecordType!: string;
  @Attr({ type: 'json' }) public sourceWorkflowStages?: string[];
  @Attr({ type: 'json' }) public sourceModes?: string[];
  @Attr({ type: 'string', required: true }) public targetRecordType!: string;
  @Attr({ type: 'string' }) public targetFormName?: string;
  @Attr({ type: 'string', required: true }) public targetStartingWorkflowStage!: string;
  @Attr({ type: 'string', defaultsTo: 'create' }) public targetMode!: string;
  @Attr({ type: 'json', required: true }) public allowedRoles!: string[];
  @Attr({ type: 'json', required: true }) public action!: Record<string, unknown>;
  @Attr({ type: 'json', required: true }) public sourceRelationship!: Record<string, unknown>;
  @Attr({ type: 'boolean', defaultsTo: true }) public allowMultipleTargetsPerSource!: boolean;
  @Attr({ type: 'number', defaultsTo: 1 }) public maxSuccessfulRunsPerIntent!: number;
  @Attr({ type: 'string', required: true }) public createdBy!: string;
  @Attr({ type: 'string', required: true }) public updatedBy!: string;
}
export const GenerationBindingWLDef = toWaterlineModelDef(GenerationBindingClass);
export interface GenerationBindingAttributes extends Sails.WaterlineAttributes {
  brandId: string; key: string; name: string; nameLower: string; description?: string; enabled: boolean;
  profileId: string; sourceRecordType: string; sourceWorkflowStages?: string[]; sourceModes?: string[];
  targetRecordType: string; targetFormName?: string; targetStartingWorkflowStage: string; targetMode: string;
  allowedRoles: string[]; action: Record<string, unknown>; sourceRelationship: Record<string, unknown>;
  allowMultipleTargetsPerSource: boolean; maxSuccessfulRunsPerIntent: number; createdBy: string; updatedBy: string;
}
export interface GenerationBindingWaterlineModel extends Sails.Model<GenerationBindingAttributes> { attributes: GenerationBindingAttributes; }
declare global { const GenerationBinding: GenerationBindingWaterlineModel; }
