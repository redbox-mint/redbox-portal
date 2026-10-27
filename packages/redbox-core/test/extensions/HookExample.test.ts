import assert from 'node:assert/strict';
import { resolveExtensions } from '../../src/extensions';
import { registerRedboxExtension } from '../../../../support/documentation/examples/hook-override';

describe('published hook override example', () => {
  it('resolves the example module, handler and route together', () => {
    const result = resolveExtensions([
      { name: 'example', root: process.cwd(), declaration: registerRedboxExtension() },
    ]);
    assert.equal(result.modules.length, 1);
    assert.equal(result.handlers.length, 1);
    assert.equal(result.routes.length, 1);
    assert.equal(result.routes[0].declaration.handler, result.handlers[0].declaration.name);
  });
});
