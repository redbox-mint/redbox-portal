import type { ILogger } from '@researchdatabox/sails-ng-common';
import type { RecordsService } from '../../RecordsService';
import type { BrandingModel } from '../../model/storage/BrandingModel';
import type { DoiRecordModel, DoiPublishing, DoiRunContext, DoiOperationResult } from '../../services/doi-v2/types';
import type { IntegrationAuditContext } from '../../queries/IntegrationAudits';
import type { IntegrationAuditAction } from '../../model/storage/IntegrationAuditModel';

export interface DoiAudit {
  start(
    oid: string,
    action: IntegrationAuditAction,
    runContext: DoiRunContext,
    summary: Record<string, unknown>,
    parent?: IntegrationAuditContext | null
  ): IntegrationAuditContext | null;
  complete(context: IntegrationAuditContext | null | undefined, details: Record<string, unknown>): void | Promise<void>;
  fail(
    context: IntegrationAuditContext | null | undefined,
    error: unknown,
    details: Record<string, unknown>
  ): void | Promise<void>;
}
export interface DoiProgramOptions {
  auditContext?: IntegrationAuditContext | null;
  requestSummary?: Record<string, unknown>;
}
export interface DoiInput {
  readonly log: ILogger;
  translate(key: string): string;
  readonly configuration: {
    record(record?: DoiRecordModel): DoiPublishing | null;
    brand(brand: BrandingModel | string): DoiPublishing | null;
  };
  readonly audit: DoiAudit;
  readonly records: Pick<RecordsService, 'updateMetaInternal'>;
  readonly programs: {
    create(
      config: DoiPublishing,
      context: DoiRunContext,
      payload: Record<string, unknown>,
      options?: DoiProgramOptions
    ): Promise<DoiOperationResult>;
    update(
      config: DoiPublishing,
      context: DoiRunContext,
      doi: string,
      payload: Record<string, unknown>,
      options?: DoiProgramOptions
    ): Promise<DoiOperationResult>;
    delete(
      config: DoiPublishing,
      context: DoiRunContext,
      doi: string,
      options?: DoiProgramOptions
    ): Promise<DoiOperationResult>;
    changeState(
      config: DoiPublishing,
      context: DoiRunContext,
      doi: string,
      event: string,
      options?: DoiProgramOptions
    ): Promise<DoiOperationResult>;
  };
}
