import {
  buildLineagePaths,
  getJSONPointerByArrayPaths,
  getObjectWithJsonPointer,
  LineagePaths
} from '../../src';

let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);

describe('Naming Helpers: buildLineagePaths', () => {
  it('merges base and more path segments and computes angularComponentsJsonPointer', () => {
    const base: LineagePaths = {
      formConfig: ['root', 'fields'],
      dataModel: ['model', 1],
      angularComponents: ['components', 0],
    };
    const more: LineagePaths = {
      formConfig: ['child'],
      dataModel: ['childModel'],
      angularComponents: ['childComp', 'sub'],
    };

    const result = buildLineagePaths(base, more);

    expect(result.formConfig).to.deep.equal(['root', 'fields', 'child']);
    expect(result.dataModel).to.deep.equal(['model', 1, 'childModel']);
    expect(result.angularComponents).to.deep.equal(['components', 0, 'childComp', 'sub']);
    expect(result.angularComponentsJsonPointer).to.equal('/components/0/childComp/sub');
  });

  it('handles undefined inputs by defaulting to empty arrays and empty angularComponentsJsonPointer', () => {
    const result = buildLineagePaths();
    expect(result.formConfig).to.deep.equal([]);
    expect(result.dataModel).to.deep.equal([]);
    expect(result.angularComponents).to.deep.equal([]);
    // JSON Pointer for empty path is an empty string per RFC 6901
    expect(result.angularComponentsJsonPointer).to.equal('');
  });

  it('returns base when more is undefined and computes angularComponentsJsonPointer from base.angularComponents only', () => {
    const base: LineagePaths = {
      formConfig: ['a'],
      dataModel: ['b'],
      angularComponents: ['x', 1],
    };
    const result = buildLineagePaths(base);
    expect(result.formConfig).to.deep.equal(['a']);
    expect(result.dataModel).to.deep.equal(['b']);
    expect(result.angularComponents).to.deep.equal(['x', 1]);
    expect(result.angularComponentsJsonPointer).to.equal('/x/1');
  });

  it('returns more when base is undefined and computes angularComponentsJsonPointer from more.angularComponents', () => {
    const more: LineagePaths = {
      formConfig: ['cfg'],
      dataModel: ['dm'],
      angularComponents: ['ac', 'leaf'],
    };
    const result = buildLineagePaths(undefined as unknown as LineagePaths, more);
    expect(result.formConfig).to.deep.equal(['cfg']);
    expect(result.dataModel).to.deep.equal(['dm']);
    expect(result.angularComponents).to.deep.equal(['ac', 'leaf']);
    expect(result.angularComponentsJsonPointer).to.equal('/ac/leaf');
  });

  it('escapes special characters in angularComponents for angularComponentsJsonPointer per RFC 6901', () => {
    const result = buildLineagePaths(
      undefined as unknown as LineagePaths,
      {
        formConfig: [],
        dataModel: [],
        angularComponents: ['a/b', 'x~y'],
      }
    );
    // '/' -> '~1', '~' -> '~0'
    expect(result.angularComponentsJsonPointer).to.equal('/a~1b/x~0y');
  });
});

describe('Naming Helpers: getJSONPointerByArrayPaths', () => {
  it('returns a JSON Pointer string for nested segments and array indexes', () => {
    const pointer = getJSONPointerByArrayPaths(['components', 0, 'child']);
    expect(pointer).to.equal('/components/0/child');
  });

  it('escapes special characters per RFC 6901 and handles empty input', () => {
    const escaped = getJSONPointerByArrayPaths(['a/b', 'c~d']);
    expect(escaped).to.equal('/a~1b/c~0d');

    const empty = getJSONPointerByArrayPaths([]);
    expect(empty).to.equal('');
  });
});

describe('Naming Helpers: getObjectWithJsonPointer', () => {
  it('retrieves a reference when given an array of path segments', () => {
    const doc = {
      components: [
        {
          child: {
            value: 42,
          },
        },
      ],
    };

    const ref = getObjectWithJsonPointer(doc, ['components', '0', 'child', 'value']);
    expect(ref.val).to.equal(42);
    expect(ref.key).to.equal('value');
    expect(ref.obj).to.equal(doc.components[0].child);
  });

  it('retrieves a reference when given a JSON Pointer string with escaped tokens', () => {
    const doc = {
      'a/b': {
        'c~d': ['end'],
      },
    };

    const ref = getObjectWithJsonPointer(doc, '/a~1b/c~0d/0');
    expect(ref.val).to.equal('end');
    expect(ref.key).to.equal(0);
    expect(ref.obj).to.equal(doc['a/b']['c~d']);
  });
});
