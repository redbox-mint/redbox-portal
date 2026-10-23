import { Services as Owned } from '../../integrations/Raid';
import { legacyConfigToPublishing } from './raidConfiguration';

export class LegacyRaid extends Owned.Raid {
  constructor() {
    super({
      get log() {
        return sails.log;
      },
      brand: value => BrandingService.getBrandById(value) ?? BrandingService.getBrand(value),
      configuration: brand =>
        typeof AppConfigService !== 'undefined'
          ? AppConfigService.getAppConfigurationForBrand?.(brand)?.raidPublishing
          : undefined,
      defaultConfiguration: () => legacyConfigToPublishing(sails.config.raid),
      records: {
        getMeta: (...args) => RecordsService.getMeta(...args),
        appendToRecord: (...args) => RecordsService.appendToRecord(...args),
      },
      queue: { schedule: (...args) => AgendaQueueService.schedule(...args) },
      audit: {
        startAudit: (...args) =>
          typeof IntegrationAuditService !== 'undefined' ? IntegrationAuditService.startAudit(...args) : null,
        completeAudit: (...args) =>
          typeof IntegrationAuditService !== 'undefined' ? IntegrationAuditService.completeAudit(...args) : undefined,
        failAudit: (...args) =>
          typeof IntegrationAuditService !== 'undefined' ? IntegrationAuditService.failAudit(...args) : undefined,
      },
    });
  }
  exports(): Record<string, unknown> {
    return Object.fromEntries(
      this._exportedMethods.map(name => {
        const method: unknown = Reflect.get(this, name);
        if (typeof method !== 'function') throw new Error('Missing RAiD comparison method.');
        return [name, method.bind(this)];
      })
    );
  }
}
