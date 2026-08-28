import { strict as assert } from 'node:assert';
import * as sinon from 'sinon';
import { boundedDiagnosticValue } from '../../src/utilities/BoundedDiagnostics';

describe('BoundedDiagnostics', () => {
  const secretSentinel = 'neutral-key-embedded-secret-must-stay-opaque';

  it('rejects plain strings and neutral-key strings as opaque categories', () => {
    const neutralKeyValue = {
      detail: `prefix:${secretSentinel}:suffix`,
      message: secretSentinel,
      response: {
        body: secretSentinel,
      },
    };

    assert.deepEqual(boundedDiagnosticValue(secretSentinel), { category: 'string' });
    assert.deepEqual(boundedDiagnosticValue(neutralKeyValue), { category: 'object' });
    const serialized = JSON.stringify(boundedDiagnosticValue(neutralKeyValue));
    assert.equal(serialized.includes(secretSentinel), false);
    assert.equal(serialized.includes('detail'), false);
    assert.equal(serialized.includes('message'), false);
    assert.equal(serialized.includes('response'), false);
    assert.equal(serialized.includes('body'), false);
  });

  it('emits only allowlisted codes and validated own numeric status metadata', () => {
    assert.deepEqual(
      boundedDiagnosticValue({
        code: 'econnreset',
        statusCode: 503,
        detail: secretSentinel,
        response: { status: 401, body: secretSentinel },
      }),
      { category: 'object', code: 'ECONNRESET', status: 503 }
    );
    assert.deepEqual(boundedDiagnosticValue({ code: `ERR_${secretSentinel}`, status: 99 }), {
      category: 'object',
    });
    assert.deepEqual(boundedDiagnosticValue({ code: secretSentinel, status: 600 }), {
      category: 'object',
    });
    assert.deepEqual(boundedDiagnosticValue({ status: 204.5, statusCode: '503' }), {
      category: 'object',
    });
  });

  it('rejects oversized codes before attempting case normalization', () => {
    const oversizedCode = `econnreset${secretSentinel.repeat(100_000)}`;
    const toUpperCaseStub = sinon.stub(String.prototype, 'toUpperCase').throws(new Error(secretSentinel));
    const projected = (() => {
      try {
        return boundedDiagnosticValue({ code: oversizedCode, status: 503 });
      } finally {
        toUpperCaseStub.restore();
      }
    })();

    assert.equal(toUpperCaseStub.callCount, 0);
    assert.deepEqual(projected, { category: 'object', status: 503 });
    assert.equal(JSON.stringify(projected).includes(secretSentinel), false);
  });

  it('does not invoke accessors while reading diagnostic metadata', () => {
    let accessorInvocations = 0;
    const failure = Object.create(null);
    Object.defineProperties(failure, {
      code: {
        get: () => {
          accessorInvocations += 1;
          throw new Error(secretSentinel);
        },
      },
      status: {
        get: () => {
          accessorInvocations += 1;
          throw new Error(secretSentinel);
        },
      },
      statusCode: {
        get: () => {
          accessorInvocations += 1;
          throw new Error(secretSentinel);
        },
      },
    });

    assert.deepEqual(boundedDiagnosticValue(failure), { category: 'object' });
    assert.equal(accessorInvocations, 0);
  });

  it('contains hostile proxied objects, arrays, functions, and reflection traps', () => {
    let propertyDescriptorTrapInvocations = 0;
    const throwingTrap = () => {
      throw new Error(secretSentinel);
    };
    const throwingPropertyDescriptorTrap = () => {
      propertyDescriptorTrapInvocations += 1;
      throw new Error(secretSentinel);
    };
    const hostileObject = new Proxy(Object.create(null), {
      get: throwingTrap,
      getOwnPropertyDescriptor: throwingPropertyDescriptorTrap,
      getPrototypeOf: throwingTrap,
      ownKeys: throwingTrap,
    });
    const hostileArray = new Proxy([], {
      get: throwingTrap,
      getOwnPropertyDescriptor: throwingPropertyDescriptorTrap,
      getPrototypeOf: throwingTrap,
      ownKeys: throwingTrap,
    });
    const hostileFunction = new Proxy(() => secretSentinel, {
      apply: throwingTrap,
      get: throwingTrap,
      getOwnPropertyDescriptor: throwingPropertyDescriptorTrap,
      getPrototypeOf: throwingTrap,
      ownKeys: throwingTrap,
    });
    const revokedObject = Proxy.revocable({}, {});
    const revokedArray = Proxy.revocable([], {});
    const revokedFunction = Proxy.revocable(() => secretSentinel, {});
    revokedObject.revoke();
    revokedArray.revoke();
    revokedFunction.revoke();

    assert.doesNotThrow(() => boundedDiagnosticValue(hostileObject));
    assert.deepEqual(boundedDiagnosticValue(hostileObject), { category: 'unavailable' });
    assert.deepEqual(boundedDiagnosticValue(hostileArray), { category: 'unavailable' });
    assert.deepEqual(boundedDiagnosticValue(hostileFunction), { category: 'function' });
    assert.deepEqual(boundedDiagnosticValue(revokedObject.proxy), { category: 'unavailable' });
    assert.deepEqual(boundedDiagnosticValue(revokedArray.proxy), { category: 'unavailable' });
    assert.deepEqual(boundedDiagnosticValue(revokedFunction.proxy), { category: 'function' });

    const serialized = JSON.stringify([
      boundedDiagnosticValue(hostileObject),
      boundedDiagnosticValue(hostileArray),
      boundedDiagnosticValue(hostileFunction),
      boundedDiagnosticValue(revokedObject.proxy),
      boundedDiagnosticValue(revokedArray.proxy),
      boundedDiagnosticValue(revokedFunction.proxy),
    ]);
    assert.equal(propertyDescriptorTrapInvocations, 0);
    assert.equal(serialized.includes(secretSentinel), false);
  });

  it('keeps deeply nested and oversized values at fixed size and depth', () => {
    const oversizedString = secretSentinel.repeat(100_000);
    const deepValue: { child?: object; neutral?: string } = {};
    let cursor = deepValue;
    for (let index = 0; index < 10_000; index += 1) {
      const child: { child?: object; neutral?: string } = { neutral: oversizedString };
      cursor.child = child;
      cursor = child;
    }
    const oversizedArray = Array<string>(100_000).fill(oversizedString);

    const projectedObject = boundedDiagnosticValue(deepValue);
    const projectedArray = boundedDiagnosticValue(oversizedArray);
    assert.deepEqual(projectedObject, { category: 'object' });
    assert.deepEqual(projectedArray, { category: 'array' });
    assert.equal(Buffer.byteLength(JSON.stringify(projectedObject), 'utf8') < 128, true);
    assert.equal(Buffer.byteLength(JSON.stringify(projectedArray), 'utf8') < 128, true);
    assert.equal(JSON.stringify([projectedObject, projectedArray]).includes(secretSentinel), false);
  });

  it('returns fixed categories for every primitive without exposing primitive values', () => {
    assert.deepEqual(boundedDiagnosticValue(null), { category: 'null' });
    assert.deepEqual(boundedDiagnosticValue(undefined), { category: 'undefined' });
    assert.deepEqual(boundedDiagnosticValue(false), { category: 'boolean' });
    assert.deepEqual(boundedDiagnosticValue(42), { category: 'number' });
    assert.deepEqual(boundedDiagnosticValue(42n), { category: 'bigint' });
    assert.deepEqual(boundedDiagnosticValue(Symbol(secretSentinel)), { category: 'symbol' });
  });
});
