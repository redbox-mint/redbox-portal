/* oxlint-disable typescript/no-explicit-any */
import { AppConfig } from './AppConfig.interface';

export type RaidMappingEngine = 'jsonata' | 'handlebars';

export interface RaidContributorMapping {
  fieldMap: { id: string };
  position: string;
  role: string;
  requireOrcid?: boolean;
}

export interface RaidMappingField {
  dest: string;
  engine: RaidMappingEngine;
  expression?: string;
  template?: string;
  parseJson?: boolean;
  omitIfEmpty?: boolean;
  contributorMap?: Record<string, RaidContributorMapping>;
}

export interface RaidPublishingConfigData {
  enabled: boolean;
  connection: {
    baseUrl: string;
    token: string;
    timeoutMs: number;
    oauth: { url: string; clientId: string; username: string; password: string; timeoutMs: number; expirySkewMs: number };
    retry: { maxAttempts: number; baseDelayMs: number; maxDelayMs: number; jitter: boolean; retryOnStatusCodes: number[] };
  };
  durableRetry: { jobName: string; schedule: string; maxAttempts: number };
  saveBodyInMeta: boolean;
  raidFieldName: string;
  orcidBaseUrl: string;
  types: Record<string, any>;
  mapping: Record<string, Record<string, RaidMappingField>>;
}

export const RAID_PUBLISHING_SCHEMA = {
  type: 'object',
  required: ['enabled', 'connection', 'durableRetry', 'raidFieldName', 'orcidBaseUrl', 'types', 'mapping'],
  properties: {
    enabled: { type: 'boolean', title: 'admin-config-label-enabled' },
    connection: {
      type: 'object', title: 'admin-config-label-connection',
      properties: {
        baseUrl: { type: 'string', title: 'admin-config-label-api-base-url' },
        token: { type: 'string', title: 'admin-config-label-api-token' },
        timeoutMs: { type: 'number', title: 'admin-config-label-request-timeout-ms' },
        oauth: {
          type: 'object', title: 'admin-config-label-oauth',
          properties: {
            url: { type: 'string', title: 'admin-config-label-token-url' },
            clientId: { type: 'string', title: 'admin-config-label-client-id' },
            username: { type: 'string', title: 'admin-config-label-username' },
            password: { type: 'string', title: 'admin-config-label-password' },
            timeoutMs: { type: 'number', title: 'admin-config-label-token-timeout-ms' },
            expirySkewMs: { type: 'number', title: 'admin-config-label-expiry-skew-ms' }
          }
        },
        retry: {
          type: 'object', title: 'admin-config-label-retries',
          properties: {
            maxAttempts: { type: 'number', title: 'admin-config-label-max-attempts' },
            baseDelayMs: { type: 'number', title: 'admin-config-label-base-delay-ms' },
            maxDelayMs: { type: 'number', title: 'admin-config-label-max-delay-ms' },
            jitter: { type: 'boolean', title: 'admin-config-label-jitter' },
            retryOnStatusCodes: { type: 'array', title: 'admin-config-label-retry-on-status-codes', items: { type: 'integer' } }
          }
        }
      }
    },
    durableRetry: {
      type: 'object', title: 'admin-config-label-durable-retry-job',
      properties: {
        jobName: { type: 'string', title: 'admin-config-label-job-name' },
        schedule: { type: 'string', title: 'admin-config-label-schedule' },
        maxAttempts: { type: 'number', title: 'admin-config-label-max-attempts' }
      }
    },
    saveBodyInMeta: { type: 'boolean', title: 'admin-config-label-save-request-body-in-record-metadata' },
    raidFieldName: { type: 'string', title: 'admin-config-label-raid-field-name' },
    orcidBaseUrl: { type: 'string', title: 'admin-config-label-orcid-base-url' },
    types: { type: 'object', title: 'admin-config-label-types' },
    mapping: { type: 'object', title: 'admin-config-label-field-mapping' }
  }
};

export class RaidPublishing extends AppConfig implements RaidPublishingConfigData {
  enabled = false;
  connection: RaidPublishingConfigData['connection'] = {
    baseUrl: '', token: '', timeoutMs: 30000,
    oauth: { url: '', clientId: '', username: '', password: '', timeoutMs: 10000, expirySkewMs: 30000 },
    retry: { maxAttempts: 3, baseDelayMs: 500, maxDelayMs: 10000, jitter: true, retryOnStatusCodes: [408, 425, 429, 500, 502, 503, 504] }
  };
  durableRetry = { jobName: 'RaidMintRetryJob', schedule: 'in 5 minutes', maxAttempts: 5 };
  saveBodyInMeta = true;
  raidFieldName = 'raidUrl';
  orcidBaseUrl = 'https://orcid.org/';
  types: Record<string, any> = {};
  mapping: Record<string, Record<string, RaidMappingField>> = {};
}
