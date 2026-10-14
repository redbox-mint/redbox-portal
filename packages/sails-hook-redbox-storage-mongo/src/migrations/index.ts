import type { RedboxMigration } from '@researchdatabox/redbox-core';
import { recordRevisionBackfillMigration } from './recordRevisionBackfill';

export * from './recordRevisionBackfill';

export const MigrationExports: RedboxMigration[] = [recordRevisionBackfillMigration];

/** Synchronous registry consumed by the generated ReDBox migration shim. */
export function registerRedboxMigrations(): RedboxMigration[] {
  return MigrationExports;
}
