import { AppConfig } from './AppConfig.interface';

export type SiemAdapterType =
  | 'splunk-hec-json'
  | 'otel-otlp-logs'
  | 'syslog-rfc5424-json'
  | 'cef'
  | 'leef';

export type SiemEventCategory =
  | 'authentication'
  | 'authorization'
  | 'userManagement'
  | 'recordLifecycle'
  | 'integrationAudit'
  | 'attachmentAccess';

export type SiemSeverity = 'info' | 'warning' | 'error' | 'critical';

export interface SiemRetryConfig {
  maxAttempts?: number;
  retryDelayMs?: number;
  retryBackoffMultiplier?: number;
}

export interface SiemDestinationConfig {
  id: string;
  name: string;
  enabled: boolean;
  adapterType: SiemAdapterType;
  endpointUrl: string;
  token?: string;
  username?: string;
  password?: string;
  headers?: Record<string, string>;
  formatOptions?: Record<string, unknown>;
  timeoutMs?: number;
  retry?: SiemRetryConfig;
}

export interface SiemEventSelectionConfig {
  categories: Record<SiemEventCategory, boolean>;
  severity: Record<string, SiemSeverity>;
}

export interface SiemRedactionConfig {
  denylistedPaths: string[];
  maxPayloadBytes: number;
  includeActorEmail: boolean;
  includeIpAddress: boolean;
  includeUserAgent: boolean;
}

export interface SiemDeliveryConfig {
  batchSize: number;
  maxAttempts: number;
  retryDelayMs: number;
  retryBackoffMultiplier: number;
  deadLetterRetentionDays: number;
  nonBlocking: boolean;
}

export const DEFAULT_SIEM_EVENT_SELECTION: SiemEventSelectionConfig = {
  categories: {
    authentication: true,
    authorization: true,
    userManagement: true,
    recordLifecycle: true,
    integrationAudit: true,
    attachmentAccess: true,
  },
  severity: {
    'authentication.login.failure': 'warning',
    'authorization.failure': 'warning',
    'integration.failure': 'error',
  },
};

export const DEFAULT_SIEM_REDACTION: SiemRedactionConfig = {
  denylistedPaths: [
    'password',
    'token',
    'secret',
    'authorization',
    'headers.Authorization',
    'connection.token',
    'connection.password',
  ],
  maxPayloadBytes: 64 * 1024,
  includeActorEmail: false,
  includeIpAddress: false,
  includeUserAgent: false,
};

export const DEFAULT_SIEM_DELIVERY: SiemDeliveryConfig = {
  batchSize: 50,
  maxAttempts: 3,
  retryDelayMs: 60 * 1000,
  retryBackoffMultiplier: 2,
  deadLetterRetentionDays: 30,
  nonBlocking: true,
};

export class SiemConfiguration extends AppConfig {
  enabled = false;
  destinations: SiemDestinationConfig[] = [];
  events: SiemEventSelectionConfig = DEFAULT_SIEM_EVENT_SELECTION;
  redaction: SiemRedactionConfig = DEFAULT_SIEM_REDACTION;
  delivery: SiemDeliveryConfig = DEFAULT_SIEM_DELIVERY;
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
          formatOptions: { type: 'object' },
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
