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
    enabled: { type: 'boolean', title: 'Enabled' },
    connection: {
      type: 'object', title: 'Connection',
      properties: {
        baseUrl: { type: 'string', title: 'API Base URL' },
        token: { type: 'string', title: 'API Token' },
        timeoutMs: { type: 'number', title: 'Request Timeout (ms)' },
        oauth: {
          type: 'object', title: 'OAuth',
          properties: {
            url: { type: 'string', title: 'Token URL' },
            clientId: { type: 'string', title: 'Client ID' },
            username: { type: 'string', title: 'Username' },
            password: { type: 'string', title: 'Password' },
            timeoutMs: { type: 'number', title: 'Token Timeout (ms)' },
            expirySkewMs: { type: 'number', title: 'Expiry Skew (ms)' }
          }
        },
        retry: {
          type: 'object', title: 'Retries',
          properties: {
            maxAttempts: { type: 'number', title: 'Max Attempts' },
            baseDelayMs: { type: 'number', title: 'Base Delay (ms)' },
            maxDelayMs: { type: 'number', title: 'Max Delay (ms)' },
            jitter: { type: 'boolean', title: 'Jitter' },
            retryOnStatusCodes: { type: 'array', title: 'Retry On Status Codes', items: { type: 'integer' } }
          }
        }
      }
    },
    durableRetry: {
      type: 'object', title: 'Durable Retry Job',
      properties: {
        jobName: { type: 'string', title: 'Job Name' },
        schedule: { type: 'string', title: 'Schedule' },
        maxAttempts: { type: 'number', title: 'Max Attempts' }
      }
    },
    saveBodyInMeta: { type: 'boolean', title: 'Save Request Body in Record Metadata' },
    raidFieldName: { type: 'string', title: 'RAiD Field Name' },
    orcidBaseUrl: { type: 'string', title: 'ORCID Base URL' },
    types: { type: 'object', title: 'Types' },
    mapping: { type: 'object', title: 'Field Mapping' }
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
