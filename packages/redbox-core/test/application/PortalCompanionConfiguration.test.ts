import assert from 'node:assert/strict';
import sinon from 'sinon';
import * as brandingPersistence from '../../src/persistence/branding/runtime';
import { nativeBindingFixture } from './nativeBindingFixture';
import { sourcePortal } from './sourcePortal';
import { resolveCompanionConfiguration } from '../../src/config/companionDefaults';
import { portalCompanion } from '../../src/application/portal/rawHttp';

describe('production Companion configuration binding', function () {
  this.timeout(30000);
  for (const setting of [undefined, 'false']) {
    it(`preserves deferred upload lengths (${setting ?? 'default'}) in native provider options`, async () => {
      const companion = resolveCompanionConfiguration({
        UPPY_COMPANION_ENABLED: 'true', UPPY_GOOGLE_KEY: 'test-key', UPPY_GOOGLE_SECRET: 'test-secret',
        UPPY_COMPANION_SECRET: 'companion-test-secret-at-least-32-characters',
        UPPY_COMPANION_UPLOAD_URLS: 'http://configured.example',
        ...(setting ? { UPPY_COMPANION_TUS_DEFERRED_UPLOAD_LENGTH: setting } : {}),
      });
      const f = await nativeBindingFixture({ companion });
      const sandbox = sinon.createSandbox();
      const raw = f.portal.installation.raw!;
      let host: Awaited<ReturnType<typeof sourcePortal.createHost>> | undefined;
      try {
        // Input-binding test: real production owner, with uninitialized domain ports.
        sandbox.stub(brandingPersistence, 'getBrandingRepository').returns({} as never);
        sandbox.stub(f.portal.data.disks, 'get').returns({ stagingDisk: () => ({}), primaryDisk: () => ({}),
          getStagingDiskConfig: () => ({ driver: 's3' }) } as never);
        sandbox.stub(f.portal.data.records, 'get').returns({} as never);
        sandbox.stub(f.portal.data.progress, 'get').returns({} as never);
        host = await sourcePortal.createHost(f.portal);
        assert.equal(host.host.constructor.name, 'FastifyHost');
        await raw.initialize();
        const provider = portalCompanion(raw);
        assert(provider, 'Production raw owner must construct Companion');
        assert.equal(Reflect.get(provider, 'input').options.tusDeferredUploadLength, setting !== 'false');
      } finally {
        await raw.close();
        sandbox.restore();
        await host?.host.stop();
        await f.close();
      }
    });
  }
});
