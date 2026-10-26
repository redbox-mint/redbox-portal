import type { ILogger } from '@researchdatabox/sails-ng-common';
import type { BrandingModel } from '../../model/storage/BrandingModel';
import type { Services as Records } from '../../records/Records';
import type { OniPublishingSiteConfig } from '../../configmodels/OniPublishing';
import type { OniRecordModel, OniOcflRepository, ResolvedOniPublishingConfigData } from '../../services/oni-v2/types';
import type { OniAuditService } from './audit';
import type { runPublishDatasetProgram, OniLoggerSink } from './runtime';

export interface OniInput {
  readonly log: ILogger;
  configuration(record?: OniRecordModel): ResolvedOniPublishingConfigData | null;
  brand(record?: OniRecordModel): BrandingModel;
  brandName(record?: OniRecordModel): string;
  creator(username: string): Promise<unknown>;
  readonly records: Pick<Records.Records, 'updateMetaInternal'>;
  readonly audit: OniAuditService;
  createRepository(config: ResolvedOniPublishingConfigData, site: OniPublishingSiteConfig): OniOcflRepository;
  runWork<T>(operation: () => Promise<T>): Promise<T>;
  publish: (
    ...args: Parameters<typeof runPublishDatasetProgram> extends [OniLoggerSink, ...infer Args] ? Args : never
  ) => ReturnType<typeof runPublishDatasetProgram>;
}
