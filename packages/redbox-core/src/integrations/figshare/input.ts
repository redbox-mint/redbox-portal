import type { ILogger } from '@researchdatabox/sails-ng-common';
import type { Services as Records } from '../../records/Records';
import type { AgendaQueue } from '../../queues/AgendaQueue';
import type { createFigshareConfiguration } from './config';
import type { createFigshareContext } from './context';
import type { createFigshareBindings } from './bindings';
import type { createFigshareMetadata } from './metadata';
import type { createFigshareAssets } from './assets';
import type { createFigshareEmbargo } from './embargo';
import type { createFigshareRuntime } from './runtime';
import type { createFigshareWorker } from './worker';

export interface FigshareInput {
  readonly log: ILogger;
  translate(key: string): string;
  readonly configuration: ReturnType<typeof createFigshareConfiguration>['resolveFigsharePublishingConfig'];
  readonly brandName: ReturnType<typeof createFigshareConfiguration>['getBrandName'];
  readonly context: ReturnType<typeof createFigshareContext>['createRunContext'];
  readonly bindings: Pick<ReturnType<typeof createFigshareBindings>, 'validateHandlebarsTemplate'>;
  readonly mapping: Pick<ReturnType<typeof createFigshareMetadata>, 'buildMetadataPayload'>;
  readonly assets: Pick<ReturnType<typeof createFigshareAssets>, 'syncAssetsPhase'>;
  readonly embargo: ReturnType<typeof createFigshareEmbargo>;
  readonly runtime: Pick<
    ReturnType<typeof createFigshareRuntime>,
    'runBuildMetadataPayload' | 'runSyncMetadataProgram'
  >;
  readonly worker: ReturnType<typeof createFigshareWorker>;
  readonly records: Pick<Records.Records, 'getMeta'>;
  readonly queue: Pick<AgendaQueue, 'schedule'>;
  work<T>(operation: () => Promise<T>): Promise<T>;
  drain(): Promise<void>;
  close(): Promise<void>;
}
