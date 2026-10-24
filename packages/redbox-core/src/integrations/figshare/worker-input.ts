import type { ILogger } from '@researchdatabox/sails-ng-common';
import type { Services as Records } from '../../records/Records';
import type { UserModel } from '../../model/storage/UserModel';
import type { BrandingModel } from '../../model/storage/BrandingModel';
import type { RecordTypeModel } from '../../model/storage/RecordTypeModel';
import type { WorkflowDefinition } from '../../persistence/reference/ReferenceRepositories';
import type { FigshareSyncStore } from '../../services/figshare-v2/sync-store';
import type { FigshareSourceIntents } from '../../records/FigshareSourceIntents';
import type { AgendaQueue } from '../../queues/AgendaQueue';
import type { createFigshareConfiguration } from './config';
import type { createFigshareContext } from './context';
import type { createFigshareManagedAssets } from './managed-assets';
import type { createFigshareEmbargo } from './embargo';
import type { createFigshareAudit } from './audit';

export interface FigshareWorkerInput {
  readonly records: Pick<
    Records.Records,
    'getMeta' | 'getFigshareIntentStorage' | 'hasEditAccess' | 'setRecordFields' | 'updateMetaInternal'
  >;
  brandById(id: string): BrandingModel | undefined;
  user(name: string): Promise<UserModel | null | undefined>;
  recordType(brand: BrandingModel, name: string): Promise<RecordTypeModel | null | undefined>;
  workflowStep(type: RecordTypeModel, name: string): Promise<WorkflowDefinition | null | undefined>;
  readonly queue: Pick<AgendaQueue, 'now'>;
  readonly configuration: ReturnType<typeof createFigshareConfiguration>['resolveFigsharePublishingConfig'];
  readonly context: ReturnType<typeof createFigshareContext>['createRunContext'];
  readonly assets: ReturnType<typeof createFigshareManagedAssets>;
  readonly embargo: ReturnType<typeof createFigshareEmbargo>['syncEmbargoPhase'];
  readonly eligible: FigshareSourceIntents['currentExecutionEligible'];
  readonly audit: ReturnType<typeof createFigshareAudit>;
  readonly log: ILogger;
  store(): FigshareSyncStore;
  work<T>(operation: () => Promise<T>): Promise<T>;
}

export interface FigshareAdminInput extends Pick<
  FigshareWorkerInput,
  'records' | 'brandById' | 'user' | 'configuration' | 'context' | 'log' | 'store' | 'work'
> {
  administrator(roles: UserModel['roles']): unknown;
}
