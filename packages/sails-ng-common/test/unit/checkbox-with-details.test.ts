import assert from 'node:assert/strict';
import { readCheckboxWithDetailsRows } from '../../src';

describe('readCheckboxWithDetailsRows', () => {
  it('keeps the selection without inventing answers from malformed details', () => {
    for (const details of ['PNG', ['PNG'], null, undefined, 42]) {
      assert.deepEqual(readCheckboxWithDetailsRows([{ value: 'image', details }]), [{ value: 'image', details: {} }]);
    }
    const details = { format: 'PNG', note: null };
    assert.deepEqual(readCheckboxWithDetailsRows([{ value: 'image', details }]), [{ value: 'image', details }]);
  });
});
