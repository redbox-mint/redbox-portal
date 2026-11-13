import { expect } from 'chai';
import { cloneDeep } from 'lodash';
import { normalizeDisplayWrites, RelatedDisplayWriteError } from '../../src/related-records/normalize-display-writes';
import type { RelatedFormDescriptors } from '@researchdatabox/sails-ng-common';
import { createRelatedRecordsFixtures } from '../fixtures/related-records.fixtures';

const contract: RelatedFormDescriptors = {
  displayTargets: [
    { metadataPointer: '/retainedActivityTitle', relationId: 'activity' },
    { metadataPointer: '/group/activityTitle', relationId: 'activity' },
    { metadataPointer: '/rows', relationId: 'activity' },
    { metadataPointer: '/absent', relationId: 'activity' },
    { metadataPointer: '/null', relationId: 'activity' },
    { metadataPointer: '/literal.key', relationId: 'activity' },
    { metadataPointer: '/slash~1key/tilde~0key', relationId: 'activity' },
  ],
  relations: [{ relationId: 'activity', referenceTokens: ['primaryActivity'] }],
  sources: [],
};

describe('transient display write normalization', () => {
  function stored() {
    return { ...createRelatedRecordsFixtures().root.metadata, null: null };
  }
  for (const mode of ['replace', 'merge']) {
    it(`preserves stored scalar, group child, repeatable, null and absence under active ${mode}`, () => {
      const original = stored();
      const input = { primaryActivity: 'source', group: { localAnswer: 'new local' }, localNotes: 'new' };
      const metadata = mode === 'merge' ? { ...cloneDeep(original), ...cloneDeep(input) } : cloneDeep(input);
      normalizeDisplayWrites({ metadata, stored: original, input: cloneDeep(input), contract });
      expect(metadata).to.include({ retainedActivityTitle: original.retainedActivityTitle, null: null });
      expect(metadata).not.to.have.property('absent');
      expect(metadata.group).to.deep.equal({ localAnswer: 'new local', activityTitle: 'Old nested copy' });
      expect((metadata as any).rows).to.deep.equal(original.rows);
      expect(original).to.deep.equal(stored());
    });
    it(`clears omitted legacy copies on unlink under ${mode}`, () => {
      const original = stored();
      const input = { primaryActivity: null, group: { localAnswer: 'new local' } };
      const metadata = mode === 'merge' ? { ...cloneDeep(original), ...cloneDeep(input) } : cloneDeep(input);
      normalizeDisplayWrites({ metadata, stored: original, input, contract });
      expect(metadata).not.to.have.property('retainedActivityTitle');
      expect(metadata).not.to.have.property('null');
      expect(metadata).not.to.have.property('rows');
      expect(metadata.group).to.deep.equal({ localAnswer: 'new local' });
    });
  }
  it('discards harmless legacy echoes, including explicit null', () => {
    const original = stored(),
      input = cloneDeep(original),
      metadata = cloneDeep(original);
    normalizeDisplayWrites({ metadata, stored: original, input, contract });
    expect(input).not.to.have.property('retainedActivityTitle');
    expect(input).not.to.have.property('null');
    expect(metadata).to.deep.equal(original);
  });
  for (const value of ['changed', null, false, '', [], {}]) {
    it(`rejects changed transient data ${JSON.stringify(value)}`, () => {
      const original = stored();
      expect(() =>
        normalizeDisplayWrites({
          metadata: { primaryActivity: 'source' },
          stored: original,
          input: { retainedActivityTitle: value },
          contract,
        })
      ).to.throw('related-display-field-not-writable');
    });
  }
  it('rejects null against authoritative absence', () => {
    expect(() =>
      normalizeDisplayWrites({ metadata: { primaryActivity: 'source' }, input: { absent: null }, contract })
    ).to.throw(RelatedDisplayWriteError);
  });
  it('accepts deliberate local input on unlink, including null and equal old copies', () => {
    const original = stored();
    const input = {
      primaryActivity: null,
      retainedActivityTitle: original.retainedActivityTitle,
      rows: [],
      null: null,
    };
    const metadata = { ...cloneDeep(original), ...input };
    normalizeDisplayWrites({ metadata, stored: original, input: cloneDeep(input), contract });
    expect(metadata.retainedActivityTitle).to.equal(original.retainedActivityTitle);
    expect(metadata.rows).to.deep.equal([]);
    expect(metadata.null).to.equal(null);
    expect(metadata.group).not.to.have.property('activityTitle');
  });
  it('does not let a hook restore an omitted local target after unlink', () => {
    const original = stored(),
      metadata = { ...cloneDeep(original), primaryActivity: null };
    normalizeDisplayWrites({
      metadata,
      stored: original,
      input: cloneDeep(metadata),
      localInput: { primaryActivity: null },
      contract,
    });
    expect(metadata).not.to.have.property('retainedActivityTitle');
  });
  it('leaves ordinary unlinked fields and arrays untouched', () => {
    const metadata = { primaryActivity: null, rows: [{ answer: 1 }], null: false };
    const before = cloneDeep(metadata);
    normalizeDisplayWrites({ metadata, stored: { primaryActivity: null }, input: cloneDeep(metadata), contract });
    expect(metadata).to.deep.equal(before);
  });
  it('create with selected reference persists no target; submitted targets fail', () => {
    const metadata = { primaryActivity: 'source', localNotes: 'local' };
    normalizeDisplayWrites({ metadata, input: cloneDeep(metadata), contract });
    expect(metadata).to.deep.equal({ primaryActivity: 'source', localNotes: 'local' });
    expect(() => normalizeDisplayWrites({ metadata, input: { rows: [] }, contract })).to.throw(
      RelatedDisplayWriteError
    );
  });
  for (const invalid of [{ oid: 'source' }, 1, false, ['source', {}]]) {
    it(`rejects invalid nonempty references ${JSON.stringify(invalid)} before local rules`, () => {
      expect(() => normalizeDisplayWrites({ metadata: { primaryActivity: invalid }, input: {}, contract })).to.throw(
        'related-reference-invalid'
      );
    });
  }
  it('supports configured object-array references', () => {
    const objectContract = {
      ...contract,
      relations: [{ relationId: 'activity', referenceTokens: ['ref.with.dot'], oidTokens: ['id.with.dot'] }],
    };
    const metadata = { 'ref.with.dot': [{ 'id.with.dot': 'source' }] };
    expect(() => normalizeDisplayWrites({ metadata, input: { rows: [] }, contract: objectContract })).to.throw(
      'related-display-field-not-writable'
    );
  });
  it('uses compiled OID tokens without losing literal escapes', () => {
    const objectContract = {
      ...contract,
      relations: [{ relationId: 'activity', referenceTokens: ['ref'], oidTokens: ['line\n"key'] }],
    };
    expect(() =>
      normalizeDisplayWrites({
        metadata: { ref: { 'line\n"key': 'source' } },
        input: { rows: ['fetched'] },
        contract: objectContract,
      })
    ).to.throw('related-display-field-not-writable');
  });
  it('allows unlinking an invalid historical reference and clears omitted copies', () => {
    const metadata: Record<string, unknown> = { primaryActivity: null, rows: ['legacy'] };
    normalizeDisplayWrites({
      metadata,
      stored: { primaryActivity: { invalid: true }, rows: ['legacy'] },
      input: { primaryActivity: null },
      contract,
    });
    expect(metadata).not.to.have.property('rows');
  });
  it('uses literal pointer tokens and preserves escaped group values', () => {
    const original = { primaryActivity: 'source', 'literal.key': false, 'slash/key': { 'tilde~key': [] } };
    const metadata = { primaryActivity: 'source' };
    normalizeDisplayWrites({ metadata, stored: original, input: {}, contract });
    expect(metadata).to.deep.equal(original);
  });
  it('rejects incompatible active workflow contracts but permits unlinked transitions', () => {
    const targetContract = { ...contract, displayTargets: [] };
    expect(() =>
      normalizeDisplayWrites({
        metadata: { primaryActivity: 'source' },
        input: {},
        contract,
        targetContract,
        transitioning: true,
      })
    ).to.throw('related-display-contract-invalid');
    expect(() =>
      normalizeDisplayWrites({
        metadata: { primaryActivity: null },
        input: {},
        contract,
        targetContract,
        transitioning: true,
      })
    ).not.to.throw();
  });
  it('protects a newly active target relation when the source relation is inactive', () => {
    const targetContract = {
      ...contract,
      displayTargets: [{ metadataPointer: '/rows', relationId: 'other' }],
      relations: [{ relationId: 'other', referenceTokens: ['other'] }],
    };
    expect(() =>
      normalizeDisplayWrites({
        metadata: { primaryActivity: null, other: 'source' },
        input: { rows: ['fetched'] },
        contract,
        targetContract,
        transitioning: true,
      })
    ).to.throw('related-display-field-not-writable');
  });
  it('does no work without declarations', () => {
    const metadata = { rows: [1, 2], primaryActivity: {} },
      input = cloneDeep(metadata);
    normalizeDisplayWrites({ metadata, input });
    expect(metadata).to.deep.equal(input);
  });
});
