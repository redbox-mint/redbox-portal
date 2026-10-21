import { AppConfig } from './AppConfig.interface';
import type { PublicationObject, PublicationSourcePolicy } from '../services/publication/contracts';

/** Shared processing switches, durable staging and bounded timing/retry defaults.
 * @public
 * @extensionPoint Configure through the brand AppConfig editor; provider schemas validate each named destination.
 * @see https://github.com/redbox-mint/redbox-portal/wiki/Shared-Publication-Configuration
 */
export interface PublicationProcessing {
  /** Explicit brand processing switch; migration leaves it false. */
  enabled: boolean;
  /** Current local persistence account with record edit access. */
  serviceUsername: string;
  /** Must be local for enabled processing. */
  serviceUserType: string;
  /** Durable Flydrive disk accessible to all eligible workers. */
  stagingDisk?: string;
  /** Post-save acceleration delay in positive milliseconds. */
  coalesceMs: number;
  /** Destination lease lifetime; at least three heartbeat intervals. */
  leaseMs: number;
  /** Lease renewal interval in positive milliseconds. */
  heartbeatMs: number;
  /** Maximum durable failure attempts per retry episode. */
  maxAttempts: number;
  /** Exponential durable retry base in milliseconds. */
  retryBaseMs: number;
  /** Default non-failure readiness observation interval. */
  observationMs: number;
  /** Cleanup timing; staging grace is at least one hour. */
  cleanupMs: number;
}
/** Named provider destination; referenced provider/target identity and output ownership remain fixed.
 * @public
 * @extensionPoint Configure through the brand AppConfig editor; provider schemas validate each named destination.
 * @see https://github.com/redbox-mint/redbox-portal/wiki/Shared-Publication-Configuration
 */
export interface PublicationDestination extends PublicationObject {
  /** Registered provider ID; fixed once referenced by evidence. */
  provider: string;
  /** Human-readable destination label used in status. */
  displayName: string;
  /** Destination mutation switch, independent of brand processing. */
  enabled: boolean;
  /** Retains evidence while preventing new selection; cannot be enabled. */
  archived: boolean;
  /** Provider-specific endpoint, account/repository and runtime secret settings. */
  connection: PublicationObject;
  /** Provider-specific content bindings and mapping structure. */
  mapping: PublicationObject;
  /** Provider-specific selected-byte and asset configuration. */
  attachments: PublicationObject;
  /** Exclusive safe metadata output paths, including provider-required outputs. */
  writeBack: Record<string, string | string[]>;
  /** Provider-specific lifecycle, identity and crate/article options. */
  providerOptions: PublicationObject;
}
/** Frozen rule for local advancement from current all/any destination completion.
 * @public
 * @extensionPoint Configure through the brand AppConfig editor; provider schemas validate each named destination.
 * @see https://github.com/redbox-mint/redbox-portal/wiki/Shared-Publication-Configuration
 */
export interface PublicationWorkflowRule {
  /** Stable rule identity frozen with the approval. */
  id: string;
  /** Positive rule version; changed rules cannot adopt older approval scope. */
  version: number;
  /** Record type to which this coordinator rule applies. */
  recordType: string;
  /** Nonempty fixed named destination set. */
  destinations: string[];
  /** All waits for every member; any advances once while siblings continue. */
  completion: 'all' | 'any';
  /** Workflow target after current provider-confirmed completion. */
  targetStage: string;
}
/** Versioned per-brand configuration for destinations, source authority and central workflow.
 * @public
 * @extensionPoint Configure through the brand AppConfig editor; provider schemas validate each named destination.
 * @see https://github.com/redbox-mint/redbox-portal/wiki/Shared-Publication-Configuration
 */
export interface PublicationPublishingConfigData {
  /** Unified configuration schema version, independent of provider state. */
  schemaVersion: 1;
  /** Shared enablement, local service identity, staging and timing. */
  processing: PublicationProcessing;
  /** Named stable destination IDs mapped to provider configuration. */
  destinations: Record<string, PublicationDestination>;
  /** Trusted save-event approval or explicit auto-sync policies. */
  sourcePolicies: PublicationSourcePolicy[];
  /** Central all/any workflow rules; remote outcomes remain independent. */
  workflow: { rules: PublicationWorkflowRule[] };
}
export const DEFAULT_PUBLICATION_PROCESSING: Readonly<PublicationProcessing> = Object.freeze({
  enabled: false,
  serviceUsername: '',
  serviceUserType: 'local',
  coalesceMs: 5000,
  leaseMs: 120000,
  heartbeatMs: 20000,
  maxAttempts: 5,
  retryBaseMs: 60000,
  observationMs: 120000,
  cleanupMs: 300000,
});
/** Brand processing is opt-in; new destinations also default to disabled. @public */
export class PublicationPublishing extends AppConfig implements PublicationPublishingConfigData {
  schemaVersion = 1 as const;
  processing = { ...DEFAULT_PUBLICATION_PROCESSING };
  /** Named stable destination IDs mapped to provider configuration. */
  destinations: Record<string, PublicationDestination> = {};
  /** Trusted save-event approval or explicit auto-sync policies. */
  sourcePolicies: PublicationSourcePolicy[] = [];
  /** Central all/any workflow rules; remote outcomes remain independent. */
  workflow: { rules: PublicationWorkflowRule[] } = { rules: [] };
  static getFieldOrder(): string[] {
    return ['schemaVersion', 'processing', 'destinations', 'sourcePolicies', 'workflow'];
  }
}
const id = { type: 'string', pattern: '^[a-z][a-z0-9-]{0,63}$' };
const destinationSet = { type: 'array', items: id, minItems: 1, uniqueItems: true };
export const PUBLICATION_DESTINATION_SCHEMA: PublicationObject = {
  type: 'object',
  additionalProperties: false,
  required: ['provider', 'displayName', 'connection', 'mapping', 'attachments', 'writeBack', 'providerOptions'],
  properties: {
    provider: id,
    displayName: { type: 'string', minLength: 1 },
    enabled: { type: 'boolean', default: false },
    archived: { type: 'boolean', default: false },
    connection: { type: 'object' },
    mapping: { type: 'object' },
    attachments: { type: 'object' },
    providerOptions: { type: 'object' },
    writeBack: {
      type: 'object',
      additionalProperties: {
        anyOf: [
          { type: 'string', minLength: 1 },
          { type: 'array', items: { type: 'string', minLength: 1 } },
        ],
      },
    },
  },
};
export const PUBLICATION_PUBLISHING_SCHEMA: PublicationObject = {
  type: 'object',
  additionalProperties: false,
  required: ['schemaVersion', 'processing', 'destinations', 'sourcePolicies', 'workflow'],
  properties: {
    schemaVersion: { type: 'integer', const: 1 },
    processing: {
      type: 'object',
      additionalProperties: false,
      required: ['enabled'],
      properties: {
        enabled: { type: 'boolean', default: false },
        serviceUsername: { type: 'string' },
        serviceUserType: { type: 'string' },
        stagingDisk: { type: 'string', minLength: 1 },
        ...Object.fromEntries(
          Object.entries(DEFAULT_PUBLICATION_PROCESSING)
            .filter(([, value]) => typeof value === 'number')
            .map(([key, value]) => [
              key,
              { type: 'integer', minimum: 1, maximum: Number.MAX_SAFE_INTEGER, default: value },
            ])
        ),
      },
    },
    destinations: { type: 'object', propertyNames: id, additionalProperties: PUBLICATION_DESTINATION_SCHEMA },
    sourcePolicies: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'version', 'mode', 'recordType', 'event', 'destinations'],
        properties: {
          id,
          version: { type: 'integer', minimum: 1 },
          mode: { enum: ['approval', 'auto-sync'] },
          recordType: { type: 'string', minLength: 1 },
          event: { type: 'string', minLength: 1 },
          destinations: destinationSet,
          grantCondition: { type: 'string' },
          continuationCondition: { type: 'string' },
        },
      },
    },
    workflow: {
      type: 'object',
      additionalProperties: false,
      required: ['rules'],
      properties: {
        rules: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['id', 'recordType', 'destinations', 'completion', 'targetStage'],
            properties: {
              id,
              version: { type: 'integer', minimum: 1, default: 1 },
              recordType: { type: 'string', minLength: 1 },
              destinations: destinationSet,
              completion: { enum: ['all', 'any'] },
              targetStage: { type: 'string', minLength: 1 },
            },
          },
        },
      },
    },
  },
};
