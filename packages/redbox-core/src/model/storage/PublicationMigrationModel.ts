import type { PublicationAttribution } from '../../services/publication/contracts';
import type { PublicationDestinationIdentity } from '../../services/publication/configuration';

/** Separate from AppConfig: preparing fences both frameworks; committed authority only rolls forward. */
export interface PublicationMigrationModel {
  schemaVersion: 1;
  brandId: string;
  migrationId: string;
  revision: number;
  authority: 'preparing' | 'shared';
  phase: 'paused' | 'prepared' | 'converted' | 'verified' | 'committed';
  inventoryFingerprint: string;
  configurationFingerprint: string;
  sourceFingerprint: string;
  assignments: Record<string, string>;
  usedDestinations: Record<string, PublicationDestinationIdentity>;
  verifiedTargets: Record<string, string>;
  counts: { sources: number; converted: number; quarantined: number };
  globalFailures: string[];
  actor: PublicationAttribution;
  reason: string;
  settlementReference: string;
  startedAt: string;
  committedAt?: string;
  history?: Array<{ phase: PublicationMigrationModel['phase']; at: string; globalFailures: string[] }>;
}
