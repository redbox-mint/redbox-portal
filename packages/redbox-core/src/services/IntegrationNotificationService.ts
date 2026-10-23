import { LegacyIntegrationNotification, LegacyEmailChannel } from '../compat/sails/integrationNotifications';
export type {
  IntegrationNotificationPayload,
  IntegrationNotificationChannel,
} from '../integrations/IntegrationNotifications';
export namespace Services {
  export class IntegrationNotificationService extends LegacyIntegrationNotification {}
}
export class EmailChannel extends LegacyEmailChannel {}
declare global {
  let IntegrationNotificationService: Services.IntegrationNotificationService;
}
