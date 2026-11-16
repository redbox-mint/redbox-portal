import { expect } from 'chai';
import { GenerationError } from '../../src/model/generation/errors';
import { decodeJsonPointer, getJsonPointer, setJsonPointer } from '../../src/model/generation/json-pointer';

describe('Generation JSON Pointer prototype safety', () => {
  const marker = '__redboxGenerationPointerPollution';
  let originalMarker: PropertyDescriptor | undefined;
  beforeEach(() => { originalMarker = Object.getOwnPropertyDescriptor(Object.prototype, marker); });
  afterEach(() => {
    if (originalMarker) Object.defineProperty(Object.prototype, marker, originalMarker);
    else Reflect.deleteProperty(Object.prototype, marker);
  });

  for (const segment of ['__proto__', 'constructor', 'prototype']) {
    it(`rejects reading through the reserved ${segment} segment`, () => {
      const pointer = `/${segment}/toString`;
      expect(() => getJsonPointer({}, pointer)).to.throw(GenerationError);
    });
    it(`rejects ${segment} writes before mutating the target or Object.prototype`, () => {
      const target = {};
      expect(() => setJsonPointer(target, `/ordinary/${segment}/${marker}`, true)).to.throw(GenerationError);
      expect(target).to.deep.equal({});
      expect(Object.getOwnPropertyDescriptor(Object.prototype, marker)).to.deep.equal(originalMarker);
    });
  }
  it('does not allow direct prototype assignment', () => {
    const target = {};
    expect(() => setJsonPointer(target, '/__proto__', { admin: true })).to.throw(GenerationError);
    expect(Object.getPrototypeOf(target)).to.equal(Object.prototype);
    expect(Object.prototype.hasOwnProperty.call(target, 'admin')).to.equal(false);
  });
  it('updates an existing array element without replacing the array or its siblings', () => {
    const contributors = [{ name: 'A', role: 'Author' }, { name: 'B', role: 'Editor' }];
    const target = { contributors };
    setJsonPointer(target, '/contributors/0/name', 'Updated');
    expect(target.contributors).to.equal(contributors);
    expect(target).to.deep.equal({ contributors: [{ name: 'Updated', role: 'Author' }, { name: 'B', role: 'Editor' }] });
  });
  it('preserves ordinary escaped names for reads and writes', () => {
    const target = {};
    const pointer = '/project~1name/part~0name';
    expect(decodeJsonPointer(pointer)).to.deep.equal(['project/name', 'part~name']);
    setJsonPointer(target, pointer, 'reviewed source');
    expect(target).to.deep.equal({ 'project/name': { 'part~name': 'reviewed source' } });
    expect(getJsonPointer(target, pointer)).to.equal('reviewed source');
  });
  it('permits ordinary field names containing reserved words', () => {
    const target = {};
    const pointer = '/constructorInfo/prototypeLabel/__proto__suffix';
    setJsonPointer(target, pointer, 'allowed');
    expect(getJsonPointer(target, pointer)).to.equal('allowed');
  });
});
