import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

describe('record-contract contributor documentation', function () {
  it('keeps the wiki example identical to its compile-checked fixture', function () {
    const repositoryRoot = process.cwd();
    const fixture = fs
      .readFileSync(path.join(repositoryRoot, 'support/documentation/examples/record-contract-contributor.ts'), 'utf8')
      .trim();
    const wiki = fs.readFileSync(
      path.join(repositoryRoot, 'support/wiki/Record-Schema-Contract-Contributors.md'),
      'utf8'
    );
    const example = wiki.match(
      /<!-- record-contract-contributor-example:start -->\n```typescript\n([\s\S]*?)\n```\n<!-- record-contract-contributor-example:end -->/
    );

    assert.ok(example, 'the contributor example markers and TypeScript fence must be present');
    assert.equal(example[1].trim(), fixture);
  });
});
