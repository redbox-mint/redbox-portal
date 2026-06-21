let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);
import { assertNoNullByteObjectKeys } from '../../src/utilities/JsonObjectKeyValidation';

describe('JsonObjectKeyValidation', () => {
  it('allows primitive values, arrays, and ordinary object keys', () => {
    expect(() => assertNoNullByteObjectKeys({
      title: 'Example',
      nested: [{ value: 1 }, { value: null }]
    })).to.not.throw();
  });

  it('rejects object keys containing null bytes at any depth', () => {
    expect(() => assertNoNullByteObjectKeys({
      nested: [{ ['bad\0key']: true }]
    }, 'payload')).to.throw('Invalid JSON object key at payload.nested[0]');
  });
});
