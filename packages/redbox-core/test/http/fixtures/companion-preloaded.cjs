const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { mkdtemp, rm } = require('node:fs/promises');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { CompanionUploads } = require('../../../dist/http/express/companion');
(async () => {
  await import('@uppy/companion');
  const directory = await mkdtemp(join(tmpdir(), 'sr-companion-preloaded-'));
  try {
    const uploads = new CompanionUploads({
      owner: { config: {}, log: console },
      path: '/companion',
      origins: ['http://127.0.0.1'],
      isReady: () => true,
      options: {
        secret: 'synthetic-companion-secret-at-least-32-characters',
        metrics: false,
        filePath: directory,
        uploadUrls: ['http://localhost:1/upload'],
        providerOptions: {},
        server: { host: 'localhost:1', protocol: 'http', path: '/companion' },
      },
    });
    await assert.rejects(uploads.initialize(createServer()), /owned logging boundary/);
    await uploads.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
  console.log('Preloaded unsafe Companion refused before app construction');
  process.exit(0);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
