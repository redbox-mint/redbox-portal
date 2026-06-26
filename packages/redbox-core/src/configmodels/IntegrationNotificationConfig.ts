import { AppConfig } from './AppConfig.interface';

export class IntegrationNotificationConfig extends AppConfig {}

export const INTEGRATION_NOTIFICATION_SCHEMA = {
  type: 'object',
  title: 'Integration Notification',
  properties: {
    enabled: { type: 'boolean', title: 'Enabled', default: false },
    statuses: { type: 'array', title: 'Statuses', items: { type: 'string' }, default: ['failed'] },
    recipients: { type: 'array', title: 'Recipients', items: { type: 'string' }, default: [] },
    recordUrlBase: { type: 'string', title: 'Record URL Base', default: '' },
    throttle: {
      type: 'object',
      title: 'Throttle',
      properties: {
        enabled: { type: 'boolean', title: 'Enabled', default: false },
        windowSeconds: { type: 'number', title: 'Window (seconds)', default: 300 },
      },
    },
    recoveryAlerts: { type: 'boolean', title: 'Recovery Alerts', default: false },
    channels: {
      type: 'array',
      title: 'Channels',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['email', 'slack', 'webhook'], title: 'Channel Type' },
          enabled: { type: 'boolean', title: 'Enabled' },
          recipients: { type: 'array', items: { type: 'string' }, title: 'Recipients' },
          template: { type: 'string', title: 'Template Name' },
        },
      },
    },
    perIntegration: {
      type: 'object',
      title: 'Per-Integration Overrides',
      patternProperties: {
        '^[a-zA-Z0-9_-]+$': {
          type: 'object',
          title: 'Integration Override',
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
