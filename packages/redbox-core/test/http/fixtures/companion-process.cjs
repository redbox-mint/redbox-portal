const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { mkdtemp, rm } = require('node:fs/promises');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const schedule = require('node-schedule');
const { CompanionUploads } = require('../../../dist/http/express/companion');
(async () => {
  const directory = await mkdtemp(join(tmpdir(), 'sr-companion-process-'));
  const owner = { config: {}, log: console };
  const input = {
    owner,
    path: '/companion',
    origins: ['http://127.0.0.1'],
    isReady: () => true,
    options: {
      secret: 'synthetic-companion-secret-at-least-32-characters',
      metrics: false,
      uploadUrls: ['http://localhost:1/upload'],
      filePath: directory,
      server: { host: 'localhost:1', protocol: 'http', path: '/companion' },
      providerOptions: {},
    },
  };
  const before = Object.keys(schedule.scheduledJobs).length;
  const uploads = new CompanionUploads(input),
    server = createServer();
  assert.equal(Object.keys(schedule.scheduledJobs).length, before, 'Construction starts no cron');
  assert.equal(server.listenerCount('upgrade'), 0);
  await Promise.all([uploads.initialize(server), uploads.initialize(server)]);
  assert.equal(server.listenerCount('upgrade'), 1, 'Repeated initialize attaches once');
  assert.equal(Object.keys(schedule.scheduledJobs).length, before + 1, 'Production cleanup starts during initialize');
  const duplicate = new CompanionUploads({ ...input, owner: { config: {}, log: console } });
  await assert.rejects(duplicate.initialize(createServer()), /Only one Companion app\(\).*per process/);
  await duplicate.close();
  await uploads.drain({ deadline: Date.now() + 1000 });
  await uploads.close();
  await uploads.close();
  assert.equal(server.listenerCount('upgrade'), 0);
  assert.equal(Object.keys(schedule.scheduledJobs).length, before + 1, 'Cleanup cron retains process lifetime after stop');
  const afterStop = new CompanionUploads({ ...input, owner: { config: {}, log: console } });
  await assert.rejects(afterStop.initialize(createServer()), /Only one Companion app\(\).*per process/);
  await afterStop.close();
  await rm(directory, { recursive: true, force: true });
  console.log(
    'Companion process qualification: construction inert, initialize once, production cron in initialize, singleton enforced after stop, isolated server closed.'
  );
  // The supported public API has no cleanup-cron disposer. Cron lives for this process.
  process.exit(0);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
