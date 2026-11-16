import assert from 'node:assert/strict';
import { resolveExtensionsV2 } from '../../src/extensions/v2';
import type { RedboxExtensionV2 } from '../../src/extensions';
import type { BoundControllerFactory } from '../../src/http';

// Public-import compilation belongs to docs:audit; real HTTP qualification is
// HookExampleMongo.test.ts through production composition with disposable services.
const published: {
  registerRedboxExtension(): RedboxExtensionV2;
  bindHealthController(example: { health(): boolean }): BoundControllerFactory;
} = require('../../../../support/documentation/examples/hook-override');

describe('published hook override example', () => {
  it('resolves the example and owns its module lifecycle', async () => {
    const result = await resolveExtensionsV2(
      [{ name: 'example', root: process.cwd(), declaration: published.registerRedboxExtension() }],
      {
        bindings: [published.bindHealthController({ health: () => false })],
        routing: { rootContext: '', policyNames: [], precedence: [], legacyOrder: false },
      }
    );
    assert.equal(result.modules.length, 1);
    assert.equal(result.controllerRegistrations.length, 1);
    assert.equal(result.routeRegistrations.length, 1);
    const controller = result.controllerRegistrations[0].declaration;
    const route = result.routeRegistrations[0].declaration;
    assert.equal(route.controller, controller.name);
    assert.equal(route.action, 'read');
    assert.deepEqual(controller.actions, ['read']);
    const example = result.modules[0].declaration.create(undefined as never) as {
      initialize(): Promise<void>;
      close(): Promise<void>;
      health(): boolean;
    };
    assert.equal(example.health(), false);
    try {
      await example.initialize();
      assert.equal(example.health(), true);
    } finally {
      await example.close();
    }
    assert.equal(example.health(), false);
  });
});
