import assert from 'node:assert/strict';
import sinon from 'sinon';
import { resolve } from 'node:path';
import { nothingLogger } from '@researchdatabox/sails-ng-common';
import { PortalHttp } from '../../src/application/portal/http';
import { PageArtifacts } from '../../src/pages/Artifacts';
import { resolveCompanionConfiguration } from '../../src/config/companionDefaults';
import * as persistence from '../../src/persistence/branding/runtime';

describe('production Companion configuration binding', () => {
  for (const setting of [undefined, 'false']) {
    it(`preserves deferred upload lengths (${setting ?? 'default'}) in native provider options`, async () => {
      const sandbox = sinon.createSandbox();
      sandbox.stub(persistence, 'getBrandingRepository').returns({} as never);
      sandbox.stub(PageArtifacts.prototype, 'initialize').resolves();
      const companion = resolveCompanionConfiguration({
        UPPY_COMPANION_ENABLED: 'true',
        UPPY_GOOGLE_KEY: 'test-key',
        UPPY_GOOGLE_SECRET: 'test-secret',
        UPPY_COMPANION_SECRET: 'companion-test-secret-at-least-32-characters',
        UPPY_COMPANION_UPLOAD_URLS: 'http://localhost:1500',
        UPPY_COMPANION_TUS_DEFERRED_UPLOAD_LENGTH: setting,
      });
      const portal = {
        owner: {},
        log: nothingLogger,
        resolved: { views: [], assets: [] },
        config: {
          companion,
          branding: {},
          record: { maxUploadSize: 1000 },
          server: { rootContext: '', publicUrl: 'http://localhost:1500' },
        },
        data: {
          disks: { get: () => ({ stagingDisk: () => ({}), getStagingDiskConfig: () => ({ driver: 's3' }) }) },
          records: { get: () => ({}) },
          progress: { get: () => ({}) },
        },
      };
      const http = new PortalHttp(portal as never, { appPath: resolve('../..') });
      try {
        await http.initialize();
        const provider = Reflect.get(http, 'companion');
        const options = Reflect.get(provider, 'input').options;
        assert.equal(options.tusDeferredUploadLength, setting !== 'false');
      } finally {
        await http.close();
        sandbox.restore();
      }
    });
  }
});
