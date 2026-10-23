import { firstValueFrom } from 'rxjs';
import { Services as Owned, EmailChannel as OwnedEmailChannel } from '../../integrations/IntegrationNotifications';
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
export class LegacyIntegrationNotification extends Owned.IntegrationNotificationService {
  constructor() {
    super({
      get log() {
        return sails.log;
      },
      get email() {
        return EmailService;
      },
      configuration: async brandId => {
        const resolvedBrandId =
          (brandId ? BrandingService.getBrandById(brandId)?.id : undefined) ?? BrandingService.getDefault()?.id;
        if (!resolvedBrandId) {
          sails.log.error(
            'IntegrationNotificationService:: Could not resolve a brand id for notification config; skipping.'
          );
          return null;
        }
        const config = await AppConfigService.getAppConfigByBrandAndKey(resolvedBrandId, 'integrationNotification');
        return isRecord(config) ? config : null;
      },
      state: {
        get: name => firstValueFrom(CacheService.get(name)),
        set: async (name, value, expiry) => {
          CacheService.set(name, value, expiry);
        },
      },
    });
  }
  exports(): Record<string, unknown> {
    return { dispatch: this.dispatch.bind(this) };
  }
}
export class LegacyEmailChannel extends OwnedEmailChannel {
  constructor() {
    super({
      get email() {
        return EmailService;
      },
      get log() {
        return sails.log;
      },
    });
  }
}
