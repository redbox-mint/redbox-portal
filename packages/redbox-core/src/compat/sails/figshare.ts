import { Services as Owned } from '../../integrations/Figshare';
import * as config from '../../services/figshare-v2/config';
import * as context from '../../services/figshare-v2/context';
import * as bindings from '../../services/figshare-v2/bindings';
import * as mapping from '../../services/figshare-v2/metadata';
import * as assets from '../../services/figshare-v2/assets';
import * as embargo from '../../services/figshare-v2/embargo';
import * as runtime from '../../services/figshare-v2/runtime';
import * as worker from '../../services/figshare-v2/worker';
import {
  initializeFigshareWorkers,
  drainFigshareWorkers,
  figshareWork,
} from '../../services/figshare-v2/worker-lifecycle';

export class LegacyFigshare extends Owned.FigshareService {
  constructor() {
    super({
      get log() {
        return sails.log;
      },
      translate: key => TranslationService.t(key),
      configuration: (...args) => config.resolveFigsharePublishingConfig(...args),
      brandName: (...args) => config.getBrandName(...args),
      context: (...args) => context.createRunContext(...args),
      bindings,
      mapping,
      assets,
      embargo,
      runtime,
      worker,
      records: { getMeta: (...args) => RecordsService.getMeta(...args) },
      queue: { schedule: (...args) => AgendaQueueService.schedule(...args) },
      work: operation => figshareWork(sails, operation),
      drain: () => drainFigshareWorkers(sails),
      close: () => drainFigshareWorkers(sails),
    });
  }
  override init(): void {
    initializeFigshareWorkers(sails);
  }
  exports(): Record<string, unknown> {
    return Object.fromEntries(
      this._exportedMethods.map(name => {
        const method: unknown = Reflect.get(this, name);
        if (typeof method !== 'function') throw new Error('Missing Figshare comparison method.');
        return [name, method.bind(this)];
      })
    );
  }
}
