import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import sinon from 'sinon';
import { nothingLogger } from '@researchdatabox/sails-ng-common';
import { createPortalApplication } from '../../src/application/portal/application';
import * as maintenance from '../../src/persistence/maintenance';
import { persistenceStatus } from '../../src/persistence/runtime';
import { agendaQueueDefaultJobs } from '../../src/config/agendaQueueJobs';

describe('production queue index preflight', () => {
  for (const mongoOverride of [false, true]) {
    it(`selects only effective backends before initializing modules (Mongo override: ${mongoOverride})`, async () => {
      const directory = await mkdtemp(join(tmpdir(), 'sr-queue-preflight-'));
      const boundary = new Error('Observed startup preflight boundary');
      const inspect = sinon.stub(maintenance, 'prepareSelectedPersistenceIndexes').rejects(boundary);
      try {
        const installed = join(directory, 'node_modules/test-storage');
        await mkdir(installed, { recursive: true });
        await writeFile(join(directory, 'package.json'), JSON.stringify({ dependencies: { 'test-storage': '1.0.0' } }));
        await writeFile(
          join(installed, 'package.json'),
          JSON.stringify({ main: 'index.cjs', redbox: { extension: '.' } })
        );
        await writeFile(
          join(installed, 'index.cjs'),
          `
          exports.registerRedboxExtension = () => ({ apiVersion: 1, modules: [{ name: 'storage', create() { throw Error('Must not initialize'); } }] });
          exports.inspectPrismaStagedStorage = exports.ensurePrismaStagedStorageIndexes = async () => [];
        `
        );
        const application = join(directory, 'application.cjs');
        await writeFile(
          application,
          'module.exports=' +
            JSON.stringify({
              agendaQueue: {
                options: {
                  backend: 'sqs',
                  db: 'mongodb://unselected.invalid/jobs',
                  sqs: { queueUrl: 'https://sqs.example.invalid/jobs' },
                },
                jobs: {
                  ...Object.fromEntries(Object.keys(agendaQueueDefaultJobs).map(name => [name, { backend: 'sqs' }])),
                  ...(mongoOverride ? { extra: { fnName: 'solrsearchservice.solrDelete', backend: 'mongodb' } } : {}),
                },
              },
            })
        );
        const portal = await createPortalApplication({
          appPath: directory,
          log: nothingLogger,
          files: { application },
          env: { REDBOX_SESSION_SECRET: 'queue-preflight-secret-at-least-32-characters' },
        });
        await assert.rejects(portal.application.initialize(), error => error === boundary);
        assert.equal(inspect.callCount, 1);
        assert.deepEqual(
          inspect.firstCall.args[2]?.agenda,
          mongoOverride ? portal.config.agendaQueue.options : undefined
        );
        await portal.application.stop();
        assert.equal(persistenceStatus(portal.owner).pools, 0);
      } finally {
        inspect.restore();
        await rm(directory, { recursive: true, force: true });
      }
    });
  }
});
