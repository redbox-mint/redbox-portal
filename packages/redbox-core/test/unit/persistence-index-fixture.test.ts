import assert from 'node:assert/strict';
import { lstatSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('persistence index deployment fixture', () => {
  it('keeps a packable fixture identical to the generated-hook template', () => {
    const root = resolve(__dirname, '../../../..');
    const fixture = resolve(root, 'support/resources/mongodb-persistence-indexes.js');
    const template = resolve(
      root,
      'packages/redbox-dev-tools/templates/hook-archetype/standard/support/mongodb-persistence-indexes.js.hbs'
    );
    assert(lstatSync(fixture).isFile(), 'npm pack omits symbolic links; deployment fixtures must be regular files');
    assert.deepEqual(readFileSync(fixture), readFileSync(template));
  });
});
