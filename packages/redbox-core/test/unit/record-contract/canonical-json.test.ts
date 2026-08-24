import { expect } from 'chai';

import {
  normalizeRedboxCanonicalJsonV1,
  RedboxCanonicalJsonError,
  type RedboxCanonicalJsonErrorReason,
  serializeRedboxCanonicalJsonV1,
} from '../../../src/record-contract/canonical-json';
import type { ContractJsonObject } from '../../../src/record-contract/types';

function expectCanonicalRejection(value: unknown, reason: RedboxCanonicalJsonErrorReason): void {
  try {
    serializeRedboxCanonicalJsonV1(value);
    expect.fail('Expected Redbox Canonical JSON v1 to reject the value.');
  } catch (error) {
    expect(error).to.be.instanceOf(RedboxCanonicalJsonError);
    expect((error as RedboxCanonicalJsonError).reason).to.equal(reason);
  }
}

function shuffled<T>(values: readonly T[], seed: number): T[] {
  const result = [...values];
  let state = seed >>> 0;
  for (let index = result.length - 1; index > 0; index -= 1) {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    const swapIndex = state % (index + 1);
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

describe('Redbox Canonical JSON v1', function () {
  it('uses recursive lexicographic object keys and ordinary JSON scalar/array encoding', function () {
    const value: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    value.a = [true, null, 'line\n', -0];
    value['2'] = 'two';
    value.nested = { b: 2, a: 1 };
    value['10'] = 'ten';
    value.__proto__ = 'safe';

    expect(serializeRedboxCanonicalJsonV1(value)).to.equal(
      '{"10":"ten","2":"two","__proto__":"safe","a":[true,null,"line\\n",0],"nested":{"a":1,"b":2}}'
    );
  });

  it('is independent of object insertion order across 100 deterministic randomized iterations', function () {
    const entries = [
      ['zeta', 1],
      ['alpha', 2],
      ['10', 3],
      ['2', 4],
      ['nested', { zebra: false, aardvark: true }],
    ] as const;
    const expected = serializeRedboxCanonicalJsonV1(Object.fromEntries(entries));

    for (let seed = 1; seed <= 100; seed += 1) {
      expect(serializeRedboxCanonicalJsonV1(Object.fromEntries(shuffled(entries, seed)))).to.equal(expected);
    }
  });

  it('preserves array order while allowing repeated non-cyclic object references', function () {
    const shared = { value: 1 };
    expect(serializeRedboxCanonicalJsonV1({ ordered: ['z', 'a'], first: shared, second: shared })).to.equal(
      '{"first":{"value":1},"ordered":["z","a"],"second":{"value":1}}'
    );
  });

  it('returns a deeply immutable JSON-safe clone', function () {
    const source = { nested: { value: 1 }, array: [{ value: 2 }] };
    const normalized = normalizeRedboxCanonicalJsonV1(source) as ContractJsonObject;

    expect(normalized).not.to.equal(source);
    expect(Object.isFrozen(normalized)).to.equal(true);
    expect(Object.isFrozen(normalized.nested)).to.equal(true);
    expect(Object.isFrozen(normalized.array)).to.equal(true);
    expect(Object.isFrozen((normalized.array as readonly ContractJsonObject[])[0])).to.equal(true);
  });

  it('rejects undefined, functions, symbols, bigint, and every non-finite number', function () {
    expectCanonicalRejection(undefined, 'non-json-type');
    expectCanonicalRejection({ value: undefined }, 'non-json-type');
    expectCanonicalRejection({ value: (): void => undefined }, 'non-json-type');
    expectCanonicalRejection({ value: Symbol('value') }, 'non-json-type');
    expectCanonicalRejection({ value: BigInt(1) }, 'non-json-type');
    expectCanonicalRejection({ value: Number.NaN }, 'non-finite-number');
    expectCanonicalRejection({ value: Number.POSITIVE_INFINITY }, 'non-finite-number');
    expectCanonicalRejection({ value: Number.NEGATIVE_INFINITY }, 'non-finite-number');
  });

  it('rejects object and array cycles', function () {
    interface CyclicObject {
      self?: CyclicObject;
    }
    const object: CyclicObject = {};
    object.self = object;
    const array: unknown[] = [];
    array.push(array);

    expectCanonicalRejection(object, 'cycle');
    expectCanonicalRejection(array, 'cycle');
  });

  it('rejects sparse/extended arrays, symbol keys, accessors, hidden fields, and non-plain objects safely', function () {
    const sparse = new Array<unknown>(1);
    const extended: unknown[] = [1];
    Object.defineProperty(extended, 'extra', { enumerable: true, value: 2 });
    const symbolKeyed = { value: 1 };
    Object.defineProperty(symbolKeyed, Symbol('hidden'), { enumerable: true, value: 2 });
    let getterInvoked = false;
    const accessor = {};
    Object.defineProperty(accessor, 'value', {
      enumerable: true,
      get: () => {
        getterInvoked = true;
        return 1;
      },
    });
    const hidden = {};
    Object.defineProperty(hidden, 'value', { enumerable: false, value: 1 });

    expectCanonicalRejection(sparse, 'sparse-or-extended-array');
    expectCanonicalRejection(extended, 'sparse-or-extended-array');
    expectCanonicalRejection(symbolKeyed, 'symbol-property');
    expectCanonicalRejection(accessor, 'accessor-property');
    expect(getterInvoked).to.equal(false);
    expectCanonicalRejection(hidden, 'non-enumerable-property');
    expectCanonicalRejection(new Date('2026-01-01T00:00:00.000Z'), 'non-plain-object');
  });
});
