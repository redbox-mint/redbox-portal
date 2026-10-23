import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';

/** Diagnostic of the actual pinned provider. Passing demonstrates the integration blocker, not acceptance. */
describe('Companion 7.1.1 public lifecycle probe', function () {
  this.timeout(30000);
  it('observes process-shared emitters, startup timers and an unreturned unfiltered socket owner', async () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const directory = await mkdtemp(join(tmpdir(), 'sr-companion-probe-'));
    const companion: typeof import('@uppy/companion') = await import('@uppy/companion');
    const localRequire = createRequire(require.resolve('@uppy/companion/package.json'));
    const schedule: typeof import('node-schedule') = localRequire('node-schedule');
    const before = new Set(Object.keys(schedule.scheduledJobs));
    const server = createServer();
    try {
      const options = {
        metrics: false,
        secret: 'diagnostic-secret-with-more-than-32-characters',
        filePath: directory,
        server: { host: '127.0.0.1:1', protocol: 'http', path: '/companion' },
        providerOptions: {},
        corsOrigins: ['http://127.0.0.1'],
        uploadUrls: ['http://127.0.0.1/'],
      };
      const first = companion.app(options),
        second = companion.app(options);
      assert.equal(first.emitter, second.emitter, 'Independent applications share the same provider emitter');
      assert(
        Object.keys(schedule.scheduledJobs).some(key => !before.has(key)),
        'Factory starts ordinary cleanup before activation'
      );
      const result = companion.socket(server, options);
      assert.equal(result, undefined);
      assert.equal(server.listenerCount('upgrade'), 1);
      const socketSource = await import('node:fs/promises').then(fs =>
        fs.readFile(join(dirname(require.resolve('@uppy/companion/package.json')), 'dist/server/socket.js'), 'utf8')
      );
      assert(socketSource.includes('new WebSocketServer({ server })'));
      assert(!('close' in first));
      console.log(
        'Companion probe: shared emitter=true; pre-activation cleanup=true; socket owner returned=false; unfiltered upgrade listener=1. No production integration accepted.'
      );
    } finally {
      // Diagnostic cleanup only: these internal handles are not a supported production ownership API.
      for (const key of Object.keys(schedule.scheduledJobs))
        if (!before.has(key)) schedule.scheduledJobs[key]!.cancel();
      server.removeAllListeners('upgrade');
      server.close();
      await rm(directory, { recursive: true, force: true });
      if (previous === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previous;
    }
  });
});
