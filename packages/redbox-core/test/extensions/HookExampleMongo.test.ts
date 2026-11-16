import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ApplicationModule } from '../../src/application';
import type { RedboxExtensionV2 } from '../../src/extensions';
import type { BoundControllerFactory } from '../../src/http';
import { referenceReadDeclarations } from '../../src/http/referenceRoutes';
import { referenceProductionFixture } from '../http/fastify/referenceProductionFixture';

// The published source lives outside this package's compiler root. Its own
// documentation audit typechecks it; this regression exercises it at runtime.
type Example = ApplicationModule & { health(): boolean };
const entry = require.resolve('../../../../support/documentation/examples/hook-override');
const published: {
  registerRedboxExtension(): RedboxExtensionV2;
  bindHealthController(example: Pick<Example, 'health'>): BoundControllerFactory;
} = require(entry);

describe('published hook override example', function () {
  this.timeout(120000);
  it('resolves and serves the example through its owned module lifecycle', async () => {
    const declaration = published.registerRedboxExtension();
    assert.equal(declaration.apiVersion, 2);
    assert.equal(declaration.modules!.length, 1);
    assert.equal(declaration.controllers!.length, 1);
    assert.equal(declaration.routes!.length, 1);
    assert.equal(declaration.routes![0].controller, declaration.controllers![0].name);
    const hostname = JSON.parse(
      execFileSync('tailscale', ['status', '--json'], { encoding: 'utf8' })
    ).Self.DNSName.replace(/\.$/, '');
    assert(hostname, 'Tailscale DNS name required');
    const port = Number(process.env.DOCS_EXAMPLE_HOST_PORT ?? '49247');
    const origin = `http://${hostname}:${port}`;
    let example: Example | undefined;
    const fixture = await referenceProductionFixture(true, undefined, undefined, {
      declarations: referenceReadDeclarations,
      configuration: {
        server: {
          hostname: '0.0.0.0',
          port,
          rootContext: '',
          trustProxy: false,
          publicUrl: origin,
          stopDeadlineMs: 30000,
        },
      },
      artifacts: async directory => {
        const manifestPath = path.join(directory, 'package.json');
        const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
        manifest.dependencies['docs-example'] = '1.0.0';
        await writeFile(manifestPath, JSON.stringify(manifest));
        const provider = path.join(directory, 'node_modules/docs-example');
        await mkdir(provider);
        await writeFile(
          path.join(provider, 'package.json'),
          JSON.stringify({ name: 'docs-example', main: 'index.cjs', redbox: { extension: './index.cjs' } })
        );
        await writeFile(provider + '/index.cjs', 'module.exports=require(' + JSON.stringify(entry) + ');');
      },
      bindings: {
        module: registration => {
          assert.equal(registration.declaration.name, 'example');
          return () => (example = registration.declaration.create(undefined as never) as Example);
        },
      },
      httpBindings: () => [published.bindHealthController({ health: () => example!.health() })],
    });
    try {
      assert(example);
      assert.equal(fixture.portal.config.server.publicUrl, origin);
      const url = origin + '/example/health';
      const ready = await fetch(url);
      assert.equal(ready.status, 200);
      assert.deepEqual(await ready.json(), { ready: true });
      await example.close!();
      const closed = await fetch(url);
      assert.equal(closed.status, 200);
      assert.deepEqual(await closed.json(), { ready: false });
    } finally {
      await fixture.close();
    }
    assert.equal(example!.health(), false);
  });
});
