const { portalFixture: fixture } = require("../../helpers/portalFixture.cjs");
import assert from 'node:assert/strict';
import {
  getMigrationLedgerRepository,
  DashboardConfigService,
} from '@researchdatabox/redbox-core';
import { runApplicationMigrations } from '@researchdatabox/redbox-core/application';

describe('Migration ledger in the loaded portal', function () {
  it('asserts the selected adapter and dashboard migration history before serving dashboards', async () => {
    const repository = getMigrationLedgerRepository(fixture.owner);
    assert.equal(
      repository.constructor.name,
      'PrismaMigrationLedgerRepository'
    );
    assert.equal(await repository.isExecuted(DashboardConfigService.DASHBOARD_CONFIGURATION_MIGRATION_NAME), true);
  });

  it('does not replay logged bodies and resumes failures after read-only inspection', async () => {
    const repository = getMigrationLedgerRepository(fixture.owner);
    const prefix = '20990101T000000-p2-portal-';
    const calls: string[] = [];
    const run = (selected: Parameters<typeof runApplicationMigrations>[0]) => runApplicationMigrations(selected, { ledger: repository, context: fixture.owner, log: fixture.log });
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
      assert.equal((await repository.executedNames()).includes(`${prefix}01`), false);
      assert.deepEqual(calls, []);
      assert.equal(await repository.isExecuted(`${prefix}01`), false);
      await run(migrations);
      assert.deepEqual(calls, ['01', '02']);
      await run(
        migrations.map(entry => ({
          ...entry,
          up: async () => {
            throw Error('logged body replayed');
          },
        }))
      );
      const failure = Error('injected portal body failure');
      await assert.rejects(
        run([
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
      await run([
        {
          name: `${prefix}03`,
          up: async () => {
            calls.push('03');
          },
        },
      ]);
      assert.deepEqual(calls, ['01', '02', '03']);
    } finally {
      for (const suffix of ['01', '02', '03']) await repository.removeExecution(prefix + suffix);
    }
  });
});
