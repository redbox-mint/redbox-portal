import assert from 'node:assert/strict';
import {
  getMigrationLedgerRepository,
  runPendingMigrations,
  DashboardConfigService,
} from '@researchdatabox/redbox-core';

describe('Migration ledger in the loaded portal', function () {
  it('asserts the selected adapter and dashboard migration history before serving dashboards', async () => {
    const repository = getMigrationLedgerRepository();
    assert.equal(
      repository.constructor.name,
      'PrismaMigrationLedgerRepository'
    );
    assert.equal(await repository.isExecuted(DashboardConfigService.DASHBOARD_CONFIGURATION_MIGRATION_NAME), true);
  });

  it('does not replay logged bodies and resumes failed and skipped pending bodies', async () => {
    const repository = getMigrationLedgerRepository();
    const prefix = '20990101T000000-p2-portal-';
    const calls: string[] = [];
    const previous = process.env.REDBOX_SKIP_MIGRATIONS;
    const migrations = [
      {
        name: `${prefix}02`,
        source: 'test',
        up: async () => {
          calls.push('02');
        },
      },
      {
        name: `${prefix}01`,
        source: 'test',
        up: async () => {
          calls.push('01');
        },
      },
    ];
    try {
      process.env.REDBOX_SKIP_MIGRATIONS = 'true';
      await runPendingMigrations(migrations);
      assert.deepEqual(calls, []);
      assert.equal(await repository.isExecuted(`${prefix}01`), false);
      delete process.env.REDBOX_SKIP_MIGRATIONS;
      await runPendingMigrations(migrations);
      assert.deepEqual(calls, ['01', '02']);
      await runPendingMigrations(
        migrations.map(entry => ({
          ...entry,
          up: async () => {
            throw Error('logged body replayed');
          },
        }))
      );
      const failure = Error('injected portal body failure');
      await assert.rejects(
        runPendingMigrations([
          {
            name: `${prefix}03`,
            up: async () => {
              throw failure;
            },
          },
        ]),
        (error: unknown) => (error as Error).cause === failure
      );
      assert.equal(await repository.isExecuted(`${prefix}03`), false);
      await runPendingMigrations([
        {
          name: `${prefix}03`,
          up: async () => {
            calls.push('03');
          },
        },
      ]);
      assert.deepEqual(calls, ['01', '02', '03']);
    } finally {
      if (previous === undefined) delete process.env.REDBOX_SKIP_MIGRATIONS;
      else process.env.REDBOX_SKIP_MIGRATIONS = previous;
      for (const suffix of ['01', '02', '03']) await repository.removeExecution(prefix + suffix);
    }
  });
});
