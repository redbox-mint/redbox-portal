import assert from 'node:assert/strict';
import sinon from 'sinon';
import { ObjectId } from 'mongodb';
import { assertCacheEntryWrite, assertJsonValue, InvalidCacheEntryError } from '../../src/persistence/cache/validation';
import {
  initializeCachePersistence,
  cleanupCachePersistence,
  getCacheEntryRepository,
} from '../../src/persistence/cache/runtime';

describe('cache repository JSON boundary', function () {
  for (const [label, value] of Object.entries({
    date: new Date(),
    buffer: Buffer.from('synthetic'),
    bson: new ObjectId(),
    bigint: 1n,
    function: () => 'synthetic',
    symbol: Symbol('synthetic'),
    undefined,
    nan: NaN,
    infinity: Infinity,
    nestedUndefined: { child: undefined },
    arrayUndefined: [undefined],
    sparse: Array(1),
    arraySubclass: new (class Values extends Array {})(),
    instance: new (class Value {
      value = 1;
    })(),
  })) {
    it(`rejects ${label} without serialization`, function () {
      assert.throws(() => assertJsonValue(value), InvalidCacheEntryError);
    });
  }

  it('accepts all JSON primitives, nested containers, null prototypes and repeated noncyclic references', function () {
    const shared = { value: null };
    assertJsonValue([null, false, true, 0, 42.5, '', 'value', { children: [shared, shared] }, Object.create(null)]);
    assertCacheEntryWrite({ name: 'absent-data', ts_added: 2_200_000_000 });
    assertCacheEntryWrite({ name: 'null-data', data: null, ts_added: 1 });
  });

  it('rejects cycles, accessors, toJSON, symbol keys, hidden members and array extras', function () {
    const cycle: unknown[] = [];
    cycle.push(cycle);
    let invoked = false;
    const getter = {
      get value() {
        invoked = true;
        return 1;
      },
    };
    const toJSON = {
      toJSON() {
        invoked = true;
        return 'serialized';
      },
    };
    for (const value of [
      cycle,
      getter,
      toJSON,
      { [Symbol()]: 1 },
      Object.defineProperty({}, 'hidden', { value: 1 }),
      Object.assign([1], { extra: 2 }),
    ]) {
      assert.throws(() => assertJsonValue(value), InvalidCacheEntryError);
    }
    assert.equal(invoked, false);
  });

  it('rejects explicit undefined data and invalid epoch/name fields', function () {
    for (const value of [
      { name: 'a', data: undefined, ts_added: 1 },
      { name: 1, ts_added: 1 },
      { name: '', ts_added: 1 },
      { name: 'a', ts_added: '1' },
      { name: 'a', ts_added: Infinity },
    ]) {
      assert.throws(() => assertCacheEntryWrite(value), InvalidCacheEntryError);
    }
  });
});
