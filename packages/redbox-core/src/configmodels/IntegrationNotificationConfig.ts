import { AppConfig } from './AppConfig.interface';

export class IntegrationNotificationConfig extends AppConfig {}

export const INTEGRATION_NOTIFICATION_SCHEMA = {
  type: 'object',
  title: 'admin-config-label-integration-notification',
  properties: {
    enabled: { type: 'boolean', title: 'admin-config-label-enabled', default: false },
    statuses: { type: 'array', title: 'admin-config-label-statuses', items: { type: 'string' }, default: ['failed'] },
    recipients: { type: 'array', title: 'admin-config-label-recipients', items: { type: 'string' }, default: [] },
    recordUrlBase: { type: 'string', title: 'admin-config-label-record-url-base', default: '' },
    throttle: {
      type: 'object',
      title: 'admin-config-label-throttle',
      properties: {
        enabled: { type: 'boolean', title: 'admin-config-label-enabled', default: false },
        windowSeconds: { type: 'number', title: 'admin-config-label-window-seconds', default: 300 },
      },
    },
    recoveryAlerts: { type: 'boolean', title: 'admin-config-label-recovery-alerts', default: false },
    channels: {
      type: 'array',
      title: 'admin-config-label-channels',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['email', 'slack', 'webhook'], title: 'admin-config-label-channel-type' },
          enabled: { type: 'boolean', title: 'admin-config-label-enabled' },
          recipients: { type: 'array', items: { type: 'string' }, title: 'admin-config-label-recipients' },
          template: { type: 'string', title: 'admin-config-label-template-name' },
        },
      },
    },
    perIntegration: {
      type: 'object',
      title: 'admin-config-label-per-integration-overrides',
      patternProperties: {
        '^[a-zA-Z0-9_-]+$': {
          type: 'object',
          title: 'admin-config-label-integration-override',
          properties: {
            statuses: { type: 'array', items: { type: 'string' } },
            recipients: { type: 'array', items: { type: 'string' } },
            channels: { type: 'array', items: { type: 'object' } },
            throttle: {
              type: 'object',
              properties: {
                enabled: { type: 'boolean' },
                windowSeconds: { type: 'number' },
              },
            },
            recoveryAlerts: { type: 'boolean' },
            recordUrlBase: { type: 'string' },
          },
        },
      },
    },
  },
};
