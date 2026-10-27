import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { runInNewContext } from 'node:vm';
import { nothingLogger } from '@researchdatabox/sails-ng-common';
import { selectedAgendaMongoOptions } from '../../src/queues/indexes';
import type { AgendaQueueConfig } from '../../src/config/agendaQueue.config';

describe('executable maintenance backend selection', () => {
  for (const mode of ['inspect', 'ensure']) {
    for (const selection of ['sqs-only', 'mongo-override', 'empty-mongo', 'empty-sqs', 'implicit-mongo']) {
      it(`${mode} selects Agenda Mongo only when required (${selection})`, async () => {
        const agendaQueue: AgendaQueueConfig = {
          options: {
            backend: selection === 'empty-mongo' ? 'mongodb' : 'sqs',
            db: 'mongodb://unselected.invalid/jobs',
          },
          jobs: selection.startsWith('empty')
            ? {}
            : { custom: { fnName: 'configured.job', backend: selection === 'mongo-override' ? 'mongodb' : 'sqs' } },
        };
        if (selection === 'implicit-mongo') {
          delete agendaQueue.options;
          agendaQueue.jobs = { custom: { fnName: 'configured.job' } };
        }
        const completed = Promise.withResolvers<void>();
        let selected: unknown;
        let calls = 0;
        const guide = readFileSync(
          path.resolve(__dirname, '../../../../support/wiki/Persistence-Index-Preparation.md'),
          'utf8'
        );
        assert.ok(guide.includes(`--entrypoint node rbportal-mount app.express.cjs --maintenance=indexes:${mode}`));
        const fakeProcess = {
          env: {
            REDBOX_APPLICATION_CONFIG: 'application.cjs',
            REDBOX_ENVIRONMENT_CONFIG: 'environment.cjs',
            REDBOX_LOCAL_CONFIG: 'local.cjs',
            REDBOX_ADMIN_PASSWORD: 'maintenance-test-password',
            REDBOX_ADMIN_TOKEN: 'maintenance-test-token',
          },
          argv: ['node', 'app.express.cjs', `--maintenance=indexes:${mode}`],
          chdir() {},
          stdout: { write() {} },
          uptime: () => 0,
          exitCode: 0,
        };
        const portal = { config: { logging: { level: 'info' }, agendaQueue }, owner: {}, preflight: {} };
        const requirePort = (name: string) => {
          if (name === 'node:path') return path;
          if (name === 'pino') return Object.assign(() => nothingLogger, { destination: () => ({}) });
          if (name.endsWith('/configuration')) return { ConfigurationError: class extends Error {} };
          if (name.endsWith('/extensions')) return { ExtensionError: class extends Error {} };
          if (name.endsWith('/portal'))
            return {
              createPortalApplication: async (options: {
                files: Record<string, string>;
                env: Record<string, string>;
              }) => {
                assert.deepEqual(
                  { ...options.files },
                  {
                    application: 'application.cjs',
                    environment: 'environment.cjs',
                    local: 'local.cjs',
                  }
                );
                assert.deepEqual(
                  { ...options.env },
                  {
                    REDBOX_ADMIN_PASSWORD: 'maintenance-test-password',
                    REDBOX_ADMIN_TOKEN: 'maintenance-test-token',
                  }
                );
                return portal;
              },
              selectedAgendaMongoOptions,
              prepareSelectedPersistenceIndexes: async (
                _owner: unknown,
                actualMode: string,
                scopes: { agenda?: unknown }
              ) => {
                assert.equal(actualMode, mode);
                selected = scopes.agenda;
                calls++;
                return { ready: true };
              },
              cleanupPersistence: async () => {
                completed.resolve();
              },
              persistenceStatus: () => ({}),
            };
          throw new Error('Unexpected executable dependency: ' + name);
        };
        runInNewContext(readFileSync(path.resolve(__dirname, '../../../../app.express.cjs'), 'utf8'), {
          require: requirePort,
          process: fakeProcess,
          __dirname: path.resolve(__dirname, '../../../..'),
          console,
        });
        await completed.promise;
        assert.equal(calls, 1);
        assert.deepEqual(
          selected,
          selection === 'implicit-mongo'
            ? {}
            : selection === 'mongo-override' || selection === 'empty-mongo'
              ? agendaQueue.options
              : undefined
        );
      });
    }
  }
});
