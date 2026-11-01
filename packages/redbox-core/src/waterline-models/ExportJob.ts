/// <reference path="../sails.ts" />
import { Attr, Entity, toWaterlineModelDef } from '../decorators';

/** ExportService owns native Mongo claims, publication, and the supporting indexes. */
@Entity('exportjob')
export class ExportJobClass {
  @Attr({ type: 'string', required: true, unique: true }) public jobId!: string;
  @Attr({ type: 'string', required: true }) public brandId!: string;
  @Attr({ type: 'string', required: true }) public portal!: string;
  @Attr({ type: 'string', required: true }) public requestedByUserId!: string;
  @Attr({ type: 'string', required: true }) public recordType!: string;
  @Attr({ type: 'string', required: true }) public format!: string;
  @Attr({ type: 'string', allowNull: true }) public modifiedBefore!: string | null;
  @Attr({ type: 'string', allowNull: true }) public modifiedAfter!: string | null;
  @Attr({ type: 'string', required: true }) public status!: string;
  @Attr({ type: 'number', allowNull: true }) public enqueuedAt!: number | null;
  @Attr({ type: 'number', allowNull: true }) public startedAt!: number | null;
  @Attr({ type: 'number', allowNull: true }) public completedAt!: number | null;
  @Attr({ type: 'number', allowNull: true }) public expiresAt!: number | null;
  @Attr({ type: 'string', allowNull: true }) public attemptId!: string | null;
  @Attr({ type: 'number', allowNull: true }) public heartbeatAt!: number | null;
  @Attr({ type: 'number', allowNull: true }) public deadlineAt!: number | null;
  @Attr({ type: 'number', allowNull: true }) public cleanupAfter!: number | null;
  @Attr({ type: 'string', required: true }) public diskName!: string;
  @Attr({ type: 'string', allowNull: true }) public objectKey!: string | null;
  @Attr({ type: 'number', allowNull: true }) public byteLength!: number | null;
  @Attr({ type: 'string', required: true }) public filename!: string;
  @Attr({ type: 'string', allowNull: true }) public authorizationContext!: string | null;
  @Attr({ type: 'string', allowNull: true }) public errorCode!: string | null;
  @Attr({ type: 'string', allowNull: true }) public errorMessage!: string | null;
  @Attr({ type: 'number', allowNull: true }) public cleanedAt!: number | null;
}

export const ExportJobWLDef = toWaterlineModelDef(ExportJobClass);

declare global {
  const ExportJob: { tableName: string; getDatastore(): { manager: import('mongodb').Db } };
}
