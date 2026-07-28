import { expect } from 'chai';
import { transformNestedValues } from '../../src/utilities/NestedValueUtils';

describe('NestedValueUtils', function () {
  it('clones containers and supplies index-normalised paths', function () {
    const source = { people: [{ name: 'Ada' }] };
    const paths: string[] = [];

    const result = transformNestedValues(source, {
      transform: (value, context) => {
        paths.push(context.path);
        return typeof value === 'string' ? { value: value.toUpperCase(), traverse: false } : undefined;
      },
    });

    expect(result.value).to.deep.equal({ people: [{ name: 'ADA' }] });
    expect(result.value).not.to.equal(source);
    expect(paths).to.include('people[].name');
    expect(source.people[0].name).to.equal('Ada');
  });

  it('supports mutation, subtree skipping and object-property omission', function () {
    const source = {
      keep: { value: 'change' },
      skip: { value: 'unchanged' },
      remove: undefined,
    };

    const result = transformNestedValues(source, {
      mutate: true,
      transform: (value, context) => {
        if (context.path === 'skip') {
          return { value, traverse: false };
        }
        if (context.path === 'remove') {
          return { value, omit: true, traverse: false };
        }
        return typeof value === 'string' ? { value: value.toUpperCase(), traverse: false } : undefined;
      },
    });

    expect(result.value).to.equal(source);
    expect(source).to.deep.equal({
      keep: { value: 'CHANGE' },
      skip: { value: 'unchanged' },
    });
    expect(result.changed).to.equal(true);
  });

  it('can distinguish repeated references from active circular references', function () {
    const shared = { value: 'shared' };
    const source: Record<string, unknown> = { first: shared, second: shared };
    source.self = source;

    const result = transformNestedValues(source, {
      referenceTracking: 'ancestors',
      onCircular: () => ({ value: '[Circular]', traverse: false }),
    });

    expect(result.value).to.deep.equal({
      first: { value: 'shared' },
      second: { value: 'shared' },
      self: '[Circular]',
    });
  });

  it('sorts object keys when requested', function () {
    const result = transformNestedValues({ z: 1, a: 2, m: 3 }, { sortObjectKeys: true });

    expect(Object.keys(result.value as Record<string, unknown>)).to.deep.equal(['a', 'm', 'z']);
  });
});
