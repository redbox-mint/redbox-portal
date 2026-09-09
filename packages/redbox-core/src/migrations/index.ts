import type { RedboxMigration } from '../loader/MigrationRunner';
import {
  RecordDefinitionMigrationService,
  RECORD_DEFINITION_MIGRATION_NAME,
} from '../services/RecordDefinitionMigrationService';
import { LegacyDatabaseMigrationError } from '../record-workflow-administration/legacyDatabaseMigration';

/** Core registration consumed by the normal generated migration config and MigrationRunner. */
export function registerRedboxMigrations(): RedboxMigration[] {
  return [
    {
      name: RECORD_DEFINITION_MIGRATION_NAME,
      source: 'core:record-definitions-v1',
      async up() {
        try {
          const report = await new RecordDefinitionMigrationService().migrate();
          sails.log.info('Record-definition migration complete', report);
        } catch (error) {
          // Adapter errors may contain documents, connection strings or credentials.
          if (error instanceof LegacyDatabaseMigrationError) throw error;
          throw new Error(
            'Record-definition migration failed. Run read-only preflight and inspect database consistency.'
          );
        }
      },
    },
  ];
}
