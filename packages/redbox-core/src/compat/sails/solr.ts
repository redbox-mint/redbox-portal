import { solrExportedMethods } from '../../queries/Solr';
import { Services as Owned } from '../../queries/Solr';
import type { QueueService } from '../../QueueService';
import { retainHttpRequestFollowup } from '../../middleware/requestLifetime';
export namespace Services {
  export class SolrSearchService extends Owned.SolrSearchService {
    public constructor() {
      super({
        get config() {
          return sails.config.solr;
        },
        get log() {
          return sails.log;
        },
        retainFollowup: work =>
          retainHttpRequestFollowup(
            sails,
            work.then(() => {})
          ),
      });
      void this.processDynamicImports();
    }
    public init(): void {
      if (typeof sails === 'undefined' || typeof sails.on !== 'function') return;
      sails.on('ready', async () => {
        this.queueService = sails.services[sails.config.queue.serviceName] as unknown as QueueService;
        this.initClient();
        await this.buildSchema();
      });
    }
    public exports(): Record<string, unknown> {
      return Object.fromEntries(
        this._exportedMethods.map(name => {
          const method: unknown = Reflect.get(this, name);
          if (typeof method !== 'function') throw new Error('Missing Solr operation: ' + name);
          return [name, method.bind(this)];
        })
      );
    }
  }
}

const instanceKey = Symbol.for('@researchdatabox/redbox-core/comparison/solr');
export function sailsSolrExports(): Record<string, unknown> {
  const methods = solrExportedMethods;
  return Object.fromEntries(
    methods.map(name => [
      name,
      (...args: unknown[]) => {
        let instance = Reflect.get(sails, instanceKey) as Services.SolrSearchService | undefined;
        if (!instance) {
          instance = new Services.SolrSearchService();
          Object.defineProperty(sails, instanceKey, { value: instance });
        }
        const method: unknown = Reflect.get(instance, name);
        if (typeof method !== 'function') throw new Error('Missing comparison operation: ' + name);
        return Reflect.apply(method, instance, args);
      },
    ])
  );
}
