import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Record explorer user guidance', () => {
  it('describes supported repeated inspection separately from unavailable independent columns', () => {
    const copy = JSON.parse(
      readFileSync(resolve(__dirname, '../../../../language-defaults/en/translation.json'), 'utf8')
    );
    assert.match(copy['data-grids-repeating'], /display and inspect only/);
    assert.doesNotMatch(copy['data-grids-repeating'], /unavailable/);
    assert.match(copy['data-grids-repeating-unavailable'], /Unavailable as an independent column/);
    assert.match(copy['data-grids-repeating-unavailable'], /parent group/);
    assert.match(copy['data-grids-columns-apply-help'], /Lists and groups stay within one record row/);
    assert.match(copy['data-grids-columns-apply-help'], /cell details for full values/);
    assert.doesNotMatch(copy['data-grids-columns-apply-help'], /scalar fields/);
    assert.notEqual(copy['data-grids-cell-null-item'], copy['data-grids-cell-null']);
  });
});
