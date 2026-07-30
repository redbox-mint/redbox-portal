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
    enabled: { type: 'boolean' },
    connection: { type: 'object' },
    durableRetry: { type: 'object' },
    saveBodyInMeta: { type: 'boolean' },
    raidFieldName: { type: 'string' },
    orcidBaseUrl: { type: 'string' },
    types: { type: 'object' },
    mapping: { type: 'object' }
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
