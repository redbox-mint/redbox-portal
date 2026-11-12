import { strict as assert } from 'node:assert';
import { projectRelatedDisplayMetadata as project, relatedDisplayReferencesEqual, retainRelatedDisplayValues, RelatedFormDescriptors } from '../../src';

const contract: RelatedFormDescriptors = {
  displayTargets: [{ metadataPointer: '/group/title', relationId: 'activity' }, { metadataPointer: '/rows', relationId: 'activity' }],
  relations: [{ relationId: 'activity', referenceTokens: ['reference'], oidTokens: ['oid'] }], sources: [],
};
describe('related display local projection', () => {
  it('removes active nested and whole repeatable values without mutating raw data', () => {
    const raw = { reference: { oid: 'a' }, group: { title: 'source', local: false }, rows: [{ title: 'source' }], answer: null };
    assert.deepEqual(project(raw, contract), { reference: { oid: 'a' }, group: { local: false }, answer: null });
    assert.equal(raw.group.title, 'source');
    assert.deepEqual(project({ ...raw, rows: [], group: { ...raw.group, title: 'refresh' } }, contract), project(raw, contract));
  });
  it('treats selected, unavailable and invalid references as protected; empty references as local', () => {
    for (const reference of ['a', ['a', 'a'], { oid: 'a' }, false, {}, [{ bad: true }]]) {
      assert.deepEqual(project({ reference, rows: null }, contract), { reference });
    }
    for (const reference of [undefined, null, '', [], '  ', { oid: ' ' }]) {
      const raw = { reference, rows: null };
      if (reference === undefined) assert.deepEqual(project(raw, contract), { rows: null });
      else assert.equal(project(raw, contract), raw);
    }
  });
  it('preserves presence, escaped keys and unrelated local inputs', () => {
    const escaped = { ...contract, displayTargets: [{ metadataPointer: '/a~1b/~0key', relationId: 'activity' }] };
    assert.deepEqual(project({ reference: 'a', 'a/b': { '~key': null, local: 0 } }, escaped), { reference: 'a', 'a/b': { local: 0 } });
    assert.deepEqual(project({ reference: 'a' }, escaped), { reference: 'a' });
    assert.deepEqual(project({ reference: null, rows: null }, contract), { reference: null, rows: null });
    assert.deepEqual(project({ reference: null }, contract), { reference: null });
  });
  it('distinguishes a literal empty-key target from the metadata root', () => {
    const emptyKey = { ...contract, displayTargets: [{ metadataPointer: '/', relationId: 'activity' }] };
    assert.deepEqual(project({ reference: 'a', '': 'display', local: 'answer' }, emptyKey),
      { reference: 'a', local: 'answer' });
  });
  it('keeps the legacy identity path and detects reference/unlink changes', () => {
    const raw = { rows: null };
    assert.equal(project(raw), raw);
    assert.equal(relatedDisplayReferencesEqual({ reference: 'a' }, { reference: null }, contract), false);
    assert.equal(relatedDisplayReferencesEqual({ reference: 'a' }, { reference: 'b' }, contract), false);
    assert.equal(relatedDisplayReferencesEqual({ reference: 'a' }, { reference: 'a' }, contract), true);
  });
  it('retains expression-owned controls during server sync without contaminating submissions', () => {
    const displayed = { reference: 'a', group: { title: 'fresh source', local: 'old' }, rows: [1] };
    const candidate = { reference: 'a', group: { title: 'stored copy', local: 'server' }, rows: null };
    const controls = retainRelatedDisplayValues(candidate, displayed, contract);
    assert.deepEqual(controls, { reference: 'a', group: { title: 'fresh source', local: 'server' }, rows: [1] });
    assert.deepEqual(project(controls, contract), { reference: 'a', group: { local: 'server' } });
    assert.equal(candidate.group.title, 'stored copy');
    const unlinked = retainRelatedDisplayValues({ reference: null, rows: null }, displayed, contract);
    assert.deepEqual(project(unlinked, contract), { reference: null, rows: null, group: { local: 'old' } });
    assert.equal((unlinked.group as Record<string, unknown>).title, undefined);
    assert.equal(unlinked.rows, null);
  });
});

describe('transient container presence', () => {
  it('does not invent an empty group when a source first populates a missing target', () => {
    assert.deepEqual(project({ reference: 'a', group: { title: 'new source' } }, contract), project({ reference: 'a' }, contract));
    assert.deepEqual(project({ reference: 'a', group: {} }, contract), { reference: 'a' });
  });
  it('never restores an old stored copy when the display is unavailable', () => {
    assert.deepEqual(project(retainRelatedDisplayValues({ reference: 'a', rows: ['old copy'] }, { reference: 'a' }, contract), contract), { reference: 'a' });
  });
  it('does not retain an old source display when adopting a different reference', () => {
    const controls = retainRelatedDisplayValues({ reference: 'b' }, { reference: 'a', rows: ['old'] }, contract);
    assert.equal(Object.prototype.hasOwnProperty.call(controls, 'rows'), true);
    assert.equal(controls.rows, undefined);
    assert.deepEqual(project(controls, contract), { reference: 'b' });
  });
});


describe('server reference reset presence', () => {
  it('compares undefined control resets as absent references and targets while retaining explicit null', () => {
    assert.deepEqual(project({ reference: undefined, rows: undefined, group: { title: undefined, local: 'answer' } }, contract),
      { group: { local: 'answer' } });
    assert.deepEqual(project({ reference: null, rows: null }, contract), { reference: null, rows: null });
  });
});


describe('separate reference activation and submitted values', () => {
  it('protects targets using raw references without adding raw unrelated or disabled values', () => {
    const value = { group: { title: 'source', local: 'answer' } };
    const raw = { reference: 'a', group: { title: 'source', local: 'answer' }, notes: 'disabled' };
    assert.deepEqual(project(value, contract, raw), { group: { local: 'answer' } });
    assert.deepEqual(value, { group: { title: 'source', local: 'answer' } });
  });
});
