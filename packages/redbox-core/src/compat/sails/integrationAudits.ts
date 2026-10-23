import { Services as Domain } from '../../queries/IntegrationAudits';
import type { StorageService } from '../../StorageService';
export class LegacyIntegrationAuditService extends Domain.IntegrationAuditService {
  storageService!: StorageService;
  public constructor() {
    super({
      get storage() {
        return instance.storageService;
      },
      get log() {
        return sails.log;
      },
      get environment() {
        return String(sails.config.environment ?? process.env.NODE_ENV ?? '');
      },
      enqueue: (name, entry) => AgendaQueueService.now(name, entry),
      emitSecurityEvent: entry =>
        typeof SecurityEventService !== 'undefined'
          ? SecurityEventService.emitFromIntegrationAudit(entry)
          : Promise.resolve(),
    });
    const instance = this;
  }
  protected _exportedMethods: string[] = [
    'init',
    'startAudit',
    'completeAudit',
    'failAudit',
    'getAuditLog',
    'getTraceAuditLog',
    'getStatusSummary',
    'getStatusSummaryWithOutcomes',
    'registerOutcomeMapper',
    'storeIntegrationAudit',
  ];
  public init() {
    const that = this;
    sails.after(['hook:redbox:storage:ready', 'hook:redbox:datastream:ready', 'ready'], () => that.getServices(that));
  }

  private getServices(ref: LegacyIntegrationAuditService = this) {
    ref.getStorageService(ref);
  }

  getStorageService(ref: LegacyIntegrationAuditService = this) {
    ref.storageService = sails.services[sails.config.storage.serviceName] as unknown as StorageService;
  }

  public exports(): Record<string, unknown> {
    return Object.fromEntries(
      this._exportedMethods.map(name => {
        const method: unknown = Reflect.get(this, name);
        if (typeof method !== 'function') throw new Error('Missing comparison operation: ' + name);
        return [name, method.bind(this)];
      })
    );
  }
}
const key = Symbol.for('@researchdatabox/redbox-core/comparison/integrationAudits');
export function sailsIntegrationAuditExports(): Record<string, unknown> {
  const methods = Object.keys(new LegacyIntegrationAuditService().exports());
  return Object.fromEntries(
    methods.map(name => [
      name,
      (...args: unknown[]) => {
        let instance = Reflect.get(sails, key) as LegacyIntegrationAuditService | undefined;
        if (!instance) {
          instance = new LegacyIntegrationAuditService();
          Object.defineProperty(sails, key, { value: instance });
        }
        const method: unknown = Reflect.get(instance, name);
        if (typeof method !== 'function') throw new Error('Missing comparison operation: ' + name);
        return Reflect.apply(method, instance, args);
      },
    ])
  );
}
