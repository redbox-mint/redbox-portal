/// <reference path="../sails.ts" />
import { Attr, BeforeCreate, BeforeUpdate, Entity, buildInvalidNewRecordError, buildInvalidUpdateRecordError, toWaterlineModelDef } from '../decorators';
import { GENERATION_RUN_PHASES, GENERATION_RUN_STATUSES } from '@researchdatabox/sails-ng-common';
import type { GenerationRunPhase, GenerationRunStatus } from '@researchdatabox/sails-ng-common';
import type { GenerationSourceReference, GenerationTargetDescriptor } from '../model/generation';

const validate = (record: Record<string, unknown>, callback: (error?: Error) => void, update: boolean) => {
  const invalid = (message: string) => (update ? buildInvalidUpdateRecordError : buildInvalidNewRecordError)(message);
  if (record.status !== undefined && !GENERATION_RUN_STATUSES.includes(record.status as GenerationRunStatus)) {
    return callback(invalid('Generation run status is invalid'));
  }
  if (record.phase !== undefined && !GENERATION_RUN_PHASES.includes(record.phase as GenerationRunPhase)) {
    return callback(invalid('Generation run phase is invalid'));
  }
  if (record.attemptCount !== undefined && (!Number.isInteger(record.attemptCount) || Number(record.attemptCount) < 0)) {
    return callback(invalid('Generation run attemptCount must be a non-negative integer'));
  }
  if (record.diagnosticRetentionDays !== undefined &&
    (!Number.isInteger(record.diagnosticRetentionDays) || Number(record.diagnosticRetentionDays) < 0 || Number(record.diagnosticRetentionDays) > 30)) {
    return callback(invalid('Generation run diagnostic retention must be between zero and thirty days'));
  }
  if (record.errorSummary !== undefined && String(record.errorSummary).length > 300) {
    return callback(invalid('Generation run errorSummary exceeds 300 characters'));
  }
  if (['prompt', 'rawResponse', 'sourceMetadata', 'candidate', 'secret'].some((field) => record[field] !== undefined)) {
    return callback(invalid('Generation run durable audit cannot contain diagnostic content'));
  }
  callback();
};

@BeforeCreate((record, callback) => validate(record, callback, false))
@BeforeUpdate((record, callback) => validate(record, callback, true))

@Entity('generationrun', {
  indexes: [
    { attributes: { brandId: 1, id: 1 }, unique: true },
    { attributes: { brandId: 1, initiatedByUserId: 1, createdAt: -1 } },
    { attributes: { brandId: 1, status: 1, createdAt: 1 } },
    { attributes: { brandId: 1, 'targetDescriptor.targetOid': 1 } },
    { attributes: { brandId: 1, bindingId: 1, createdAt: -1 } },
  ],
})
export class GenerationRunClass {
  @Attr({ type: 'string', required: true }) public brandId!: string;
  @Attr({ type: 'string', required: true }) public bindingId!: string;
  @Attr({ type: 'string', required: true }) public profileVersionId!: string;
  @Attr({ type: 'string', required: true }) public modelDeploymentId!: string;
  @Attr({ type: 'json', required: true }) public knowledgeCollectionVersionIds!: string[];
  @Attr({ type: 'string', required: true }) public initiatedByUserId!: string;
  @Attr({ type: 'string', required: true }) public initiatedByUsername!: string;
  @Attr({ type: 'json', required: true }) public sourceRefs!: GenerationSourceReference[];
  @Attr({ type: 'json', required: true }) public targetDescriptor!: GenerationTargetDescriptor;
  @Attr({ type: 'string', defaultsTo: 'draft' }) public status!: GenerationRunStatus;
  @Attr({ type: 'string', defaultsTo: 'context' }) public phase!: GenerationRunPhase;
  @Attr({ type: 'number', defaultsTo: 0 }) public attemptCount!: number;
  @Attr({ type: 'string' }) public queueJobId?: string;
  @Attr({ type: 'string' }) public cancelRequestedAt?: string;
  @Attr({ type: 'string' }) public inputDigest?: string;
  @Attr({ type: 'string' }) public candidateDigest?: string;
  @Attr({ type: 'json' }) public candidateSummary?: Record<string, number>;
  @Attr({ type: 'string' }) public requestedProvider?: string;
  @Attr({ type: 'string' }) public requestedModel?: string;
  @Attr({ type: 'string' }) public actualProvider?: string;
  @Attr({ type: 'string' }) public actualModel?: string;
  @Attr({ type: 'json' }) public routerMetadata?: Record<string, unknown>;
  @Attr({ type: 'json' }) public usage?: Record<string, number>;
  @Attr({ type: 'string' }) public errorCode?: string;
  @Attr({ type: 'string' }) public errorSummary?: string;
  @Attr({ type: 'boolean', defaultsTo: false }) public retryable!: boolean;
  @Attr({ type: 'string' }) public queuedAt?: string;
  @Attr({ type: 'string' }) public startedAt?: string;
  @Attr({ type: 'string' }) public completedAt?: string;
  @Attr({ type: 'string' }) public committedAt?: string;
  @Attr({ type: 'string' }) public lastHeartbeatAt?: string;
  @Attr({ type: 'string', required: true }) public artifactExpiresAt!: string;
  @Attr({ type: 'number', defaultsTo: 0 }) public diagnosticRetentionDays!: number;
}
export const GenerationRunWLDef = toWaterlineModelDef(GenerationRunClass);
export interface GenerationRunAttributes extends Sails.WaterlineAttributes {
  brandId: string; bindingId: string; profileVersionId: string; modelDeploymentId: string;
  knowledgeCollectionVersionIds: string[]; initiatedByUserId: string; initiatedByUsername: string;
  sourceRefs: GenerationSourceReference[]; targetDescriptor: GenerationTargetDescriptor; status: GenerationRunStatus;
  phase: GenerationRunPhase; attemptCount: number; queueJobId?: string; cancelRequestedAt?: string; inputDigest?: string;
  candidateDigest?: string; candidateSummary?: Record<string, number>; requestedProvider?: string; requestedModel?: string;
  actualProvider?: string; actualModel?: string; routerMetadata?: Record<string, unknown>; usage?: Record<string, number>;
  errorCode?: string; errorSummary?: string; retryable: boolean; queuedAt?: string; startedAt?: string; completedAt?: string;
  committedAt?: string; lastHeartbeatAt?: string; artifactExpiresAt: string; diagnosticRetentionDays: number;
}
export interface GenerationRunWaterlineModel extends Sails.Model<GenerationRunAttributes> { attributes: GenerationRunAttributes; }
declare global { const GenerationRun: GenerationRunWaterlineModel; }
