import { strict as assert } from 'node:assert';
import path from 'node:path';
import { describe, it } from 'mocha';
import { AUTHORIZATION_MIGRATION_NAME } from '../../src/services/AuthorizationMigrationService';

interface LocalMigration {
  readonly name: string;
  readonly up: (params: { context: { services: Record<string, unknown> } }) => Promise<void>;
}

const migrationPath = path.resolve(__dirname, '../../../../api/migrations/20260828T120000-authorization-model-v1.js');

describe('authorization migration entry point', () => {
  it('delegates to the idempotent service and rejects bounded blocker summaries', async () => {
    const migration = require(migrationPath) as LocalMigration;
    assert.equal(migration.name, AUTHORIZATION_MIGRATION_NAME);
    let runs = 0;
    const context = {
      services: {
        authorizationmigrationservice: {
          async run() {
            runs += 1;
            return { issues: [] };
          },
        },
      },
    };
    await migration.up({ context });
    await migration.up({ context });
    assert.equal(runs, 2);

    await assert.rejects(
      migration.up({
        context: {
          services: {
            authorizationmigrationservice: {
              async run() {
                return {
                  issues: [
                    { code: 'duplicate-brand-role-key', severity: 'blocker' },
                    { code: 'duplicate-brand-role-key', severity: 'blocker' },
                  ],
                };
              },
            },
          },
        },
      }),
      /duplicate-brand-role-key.*2/u
    );
  });
});
