import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import sinon from 'sinon';
import { nothingLogger } from '@researchdatabox/sails-ng-common';
import { PortalHttp } from '../../src/application/portal/http';
import { PageArtifacts } from '../../src/pages/Artifacts';
import { mountStaticPageArtifacts } from '../../src/http/express/pageAssets';
import * as persistence from '../../src/persistence/branding/runtime';

describe('production page artifact precedence', () => {
  it('serves hook assets and bundle hashes before the compiled core artifact', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'sr-portal-assets-'));
    const sandbox = sinon.createSandbox();
    sandbox.stub(persistence, 'getBrandingRepository').returns({} as never);
    const high = join(directory, 'hook-high');
    const low = join(directory, 'hook-low');
    const compiled = join(directory, '.tmp/public');
    const source = join(directory, 'assets');
    const server = createServer();
    let http: PortalHttp | undefined;
    try {
      await mkdir(join(directory, 'views'));
      for (const [root, value] of [
        [high, 'high'],
        [low, 'low'],
        [compiled, 'core'],
        [source, 'source'],
      ]) {
        await mkdir(join(root, 'default/default/styles'), { recursive: true });
        await mkdir(join(root, 'angular/example/browser'), { recursive: true });
        await writeFile(join(root, 'default/default/styles/custom.css'), value);
        await writeFile(join(root, `angular/example/browser/main-${value}.js`), value);
      }
      await writeFile(join(compiled, 'default/default/styles/core-only.css'), 'core-only');
      const portal = {
        owner: {},
        log: nothingLogger,
        resolved: { views: [], assets: [high, low] },
        config: {
          companion: { enabled: false },
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
      http = new PortalHttp(portal as never, { appPath: directory });
      await http.initialize();
      const artifacts: PageArtifacts = Reflect.get(http, 'artifacts');
      const router = express();
      mountStaticPageArtifacts(router, artifacts);
      server.on('request', router);
      await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
      const address = server.address();
      assert(address && typeof address !== 'string');
      const base = `http://127.0.0.1:${address.port}`;
      assert.equal(await (await fetch(base + '/institution/rdmp/styles/custom.css')).text(), 'high');
      assert.equal(artifacts.bundleHash('example', 'main'), 'high');
      assert.equal(await (await fetch(base + '/institution/rdmp/styles/core-only.css')).text(), 'core-only');
    } finally {
      if (server.listening)
        await new Promise<void>((resolve, reject) => server.close(error => (error ? reject(error) : resolve())));
      await http?.close();
      sandbox.restore();
      await rm(directory, { recursive: true, force: true });
    }
  });
});
