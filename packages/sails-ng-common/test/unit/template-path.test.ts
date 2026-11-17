import { expect } from 'chai';
import { pathParent, pathSegments } from '../../src/template-path';

describe('template path segments', () => {
  it('preserves literal keys, offsets, parent traversal and array markers', () => {
    expect(pathSegments('../metadata.[a.b/字].rows[].name')).to.deep.equal([
      { name: 'metadata', start: 3, end: 11 },
      { name: 'a.b/字', start: 12, end: 19 },
      { name: 'rows', start: 20, end: 24 },
      { name: 'name', start: 27, end: 31 },
    ]);
    expect(pathParent('../metadata.[a.b/字].rows[].name')).to.equal('../metadata.[a.b/字].rows[]');
    expect(pathSegments('')).to.deep.equal([]);
    expect(pathSegments('../../[]')).to.deep.equal([]);
  });

  it('retains the existing handling of incomplete and nested bracket literals', () => {
    expect(pathSegments('[missing.child')).to.deep.equal([
      { name: 'missing', start: 1, end: 8 },
      { name: 'child', start: 9, end: 14 },
    ]);
    expect(pathSegments('[[nested].tail')).to.deep.equal([
      { name: '[nested', start: 0, end: 9 },
      { name: 'tail', start: 10, end: 14 },
    ]);
    expect(pathSegments('a]b/c')).to.deep.equal([
      { name: 'a', start: 0, end: 1 },
      { name: 'b', start: 2, end: 3 },
      { name: 'c', start: 4, end: 5 },
    ]);
  });

  it('handles long unfinished bracket paths without repeated suffix scans', () => {
    const count = 100_000;
    expect(pathSegments('['.repeat(count) + 'tail')).to.deep.equal([
      { name: 'tail', start: count, end: count + 4 },
    ]);
    const segments = pathSegments('[\\'.repeat(count));
    expect(segments).to.have.length(count);
    expect(segments[count - 1]).to.deep.equal({ name: '\\', start: count * 2 - 1, end: count * 2 });
  });
});
