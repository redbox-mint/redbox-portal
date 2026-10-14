import { AppConfig } from './AppConfig.interface';
import {
  DEFAULT_SIEM_EVENT_SELECTION,
  DEFAULT_SIEM_REDACTION,
  DEFAULT_SIEM_DELIVERY,
  SiemDestinationConfig,
  SiemEventSelectionConfig,
  SiemRedactionConfig,
  SiemDeliveryConfig,
} from '@researchdatabox/sails-ng-common';
export {
  DEFAULT_SIEM_EVENT_SELECTION,
  DEFAULT_SIEM_REDACTION,
  DEFAULT_SIEM_DELIVERY,
  SIEM_ADAPTER_TYPES,
  SIEM_CATEGORIES,
  SIEM_SEVERITIES,
  SiemConfigurationError,
  normalizeSiemConfiguration,
  normalizeSiemDestination,
  normalizeSiemRedaction,
  isSiemSecretHeader,
} from '@researchdatabox/sails-ng-common';
export type {
  SiemConfigDto,
  SiemAdapterType,
  SiemEventCategory,
  SiemSeverity,
  SiemRetryConfig,
  SiemDestinationConfig,
  SiemEventSelectionConfig,
  SiemRedactionConfig,
  SiemDeliveryConfig,
} from '@researchdatabox/sails-ng-common';

export class SiemConfiguration extends AppConfig {
  enabled = false;
  destinations: SiemDestinationConfig[] = [];
  events: SiemEventSelectionConfig = structuredClone(DEFAULT_SIEM_EVENT_SELECTION);
  redaction: SiemRedactionConfig = structuredClone(DEFAULT_SIEM_REDACTION);
  delivery: SiemDeliveryConfig = structuredClone(DEFAULT_SIEM_DELIVERY);
}

export const SIEM_CONFIGURATION_SCHEMA = {
  type: 'object',
  properties: {
    enabled: { type: 'boolean', title: 'Enabled' },
    destinations: {
      type: 'array',
      title: 'Destinations',
      items: {
        type: 'object',
        required: ['id', 'name', 'enabled', 'adapterType', 'endpointUrl'],
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          enabled: { type: 'boolean' },
          adapterType: {
            type: 'string',
            enum: ['splunk-hec-json', 'otel-otlp-logs', 'syslog-rfc5424-json', 'cef', 'leef'],
          },
          endpointUrl: { type: 'string' },
          token: { type: 'string' },
          username: { type: 'string' },
          password: { type: 'string' },
          headers: { type: 'object', additionalProperties: { type: 'string' } },
          timeoutMs: { type: 'number' },
          retry: { type: 'object' },
        },
      },
    },
    events: { type: 'object' },
    redaction: { type: 'object' },
    delivery: { type: 'object' },
  },
};
