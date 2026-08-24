import { expect } from 'chai';
import {
  applyRecordValueChanges,
  canonicallyEqualRecordValues,
  compareThreeWayRecordValues,
  diffRecordValues,
  diffRecordValuesForConcurrency,
  normalizeConcurrencyPath,
  rebaseRecordValues,
  recordValuePathsOverlap,
} from '../../src/record-diff';

describe('record diff and concurrency rebase', () => {
  describe('compatible structural diff', () => {
    it('retains add, delete, change, nested, and array-index paths', () => {
      expect(
        diffRecordValues(
          { keep: true, changed: 1, removed: 'old', nested: { value: 'old' }, rows: ['a', 'b'] },
          { keep: true, changed: 2, added: 'new', nested: { value: 'new' }, rows: ['a', 'c', 'd'] },
          ['metadata']
        )
      ).to.deep.equal([
        { kind: 'change', path: ['metadata', 'changed'], original: 1, changed: 2 },
        { kind: 'delete', path: ['metadata', 'removed'], original: 'old', changed: undefined },
        { kind: 'change', path: ['metadata', 'nested', 'value'], original: 'old', changed: 'new' },
        { kind: 'change', path: ['metadata', 'rows', 1], original: 'b', changed: 'c' },
        { kind: 'add', path: ['metadata', 'rows', 2], original: undefined, changed: 'd' },
        { kind: 'add', path: ['metadata', 'added'], original: undefined, changed: 'new' },
      ]);
    });

    it('distinguishes a missing property from a present undefined property', () => {
      expect(diffRecordValues({}, { value: undefined })).to.deep.equal([
        { kind: 'add', path: ['value'], original: undefined, changed: undefined },
      ]);
      expect(diffRecordValues({ value: undefined }, {})).to.deep.equal([
        { kind: 'delete', path: ['value'], original: undefined, changed: undefined },
      ]);
    });
  });

  describe('path and equality semantics', () => {
    it('collapses descendants to their first array root', () => {
      expect(normalizeConcurrencyPath(['contributors', 1, 'name'])).to.deep.equal(['contributors']);
      expect(normalizeConcurrencyPath(['group', 'rows', 0, 'name'])).to.deep.equal(['group', 'rows']);
      expect(normalizeConcurrencyPath(['object', '0', 'name'])).to.deep.equal(['object', '0', 'name']);
      expect(normalizeConcurrencyPath([0, 'name'])).to.deep.equal([]);
    });

    it('detects equal and parent/child overlap without matching siblings', () => {
      expect(recordValuePathsOverlap(['group'], ['group'])).to.equal(true);
      expect(recordValuePathsOverlap(['group'], ['group', 'title'])).to.equal(true);
      expect(recordValuePathsOverlap(['group', 'title'], ['group'])).to.equal(true);
      expect(recordValuePathsOverlap(['group', 'title'], ['group', 'description'])).to.equal(false);
    });

    it('uses deterministic JSON-like deep equality independent of object key order', () => {
      expect(canonicallyEqualRecordValues({ b: [1, { d: 4 }], a: 2 }, { a: 2, b: [1, { d: 4 }] })).to.equal(true);
      expect(canonicallyEqualRecordValues({ value: undefined }, {})).to.equal(false);
      expect(canonicallyEqualRecordValues([1, 2], [2, 1])).to.equal(false);
    });
  });

  describe('three-way comparison and immutable rebase', () => {
    it('covers nested, parent/child, add/delete, equal-final, and array overlap matrices', () => {
      const cases: Array<{
        name: string;
        base: unknown;
        local: unknown;
        latest: unknown;
        unresolved: Array<Array<string | number>>;
        alreadyPresent?: boolean;
      }> = [
        {
          name: 'nested siblings do not overlap',
          base: { group: { local: 'base', remote: 'base' } },
          local: { group: { local: 'mine', remote: 'base' } },
          latest: { group: { local: 'base', remote: 'latest' } },
          unresolved: [],
        },
        {
          name: 'local parent delete overlaps a remote child change',
          base: { group: { title: 'base', retained: true } },
          local: {},
          latest: { group: { title: 'latest', retained: true } },
          unresolved: [['group']],
        },
        {
          name: 'local child add overlaps a remote parent replacement',
          base: { group: {} },
          local: { group: { title: 'mine' } },
          latest: { group: 'latest' },
          unresolved: [['group']],
        },
        {
          name: 'equal object additions are already resolved',
          base: {},
          local: { added: { a: 1, b: 2 } },
          latest: { added: { b: 2, a: 1 } },
          unresolved: [],
          alreadyPresent: true,
        },
        {
          name: 'divergent additions overlap',
          base: {},
          local: { added: 'mine' },
          latest: { added: 'latest' },
          unresolved: [['added']],
        },
        {
          name: 'equal deletions are already resolved',
          base: { removed: true },
          local: {},
          latest: {},
          unresolved: [],
          alreadyPresent: true,
        },
        {
          name: 'array descendants remain one atomic overlap',
          base: { rows: [{ value: 'base' }] },
          local: { rows: [{ value: 'mine' }] },
          latest: { rows: [{ value: 'latest' }] },
          unresolved: [['rows']],
        },
      ];

      for (const testCase of cases) {
        const result = compareThreeWayRecordValues(testCase.base, testCase.local, testCase.latest);
        expect(
          result.unresolvedOverlaps.map(overlap => overlap.path),
          testCase.name
        ).to.deep.equal(testCase.unresolved);
        if (testCase.alreadyPresent !== undefined) {
          expect(result.localChangesAlreadyPresent, testCase.name).to.equal(testCase.alreadyPresent);
        }
      }
    });

    it('treats arrays as one atomic conflict domain', () => {
      expect(
        diffRecordValuesForConcurrency(
          { rows: [{ name: 'one' }, { name: 'two' }] },
          { rows: [{ name: 'changed' }, { name: 'two' }] }
        )
      ).to.deep.equal([
        {
          kind: 'change',
          path: ['rows'],
          original: [{ name: 'one' }, { name: 'two' }],
          changed: [{ name: 'changed' }, { name: 'two' }],
        },
      ]);

      const comparison = compareThreeWayRecordValues(
        { rows: [{ name: 'one' }, { name: 'two' }] },
        { rows: [{ name: 'mine' }, { name: 'two' }] },
        { rows: [{ name: 'one' }, { name: 'latest' }] }
      );
      expect(comparison.unresolvedOverlaps.map(overlap => overlap.path)).to.deep.equal([['rows']]);
      expect(comparison.applicableLocalChanges).to.deep.equal([]);
    });

    it('treats a root array as one overlapping path and resolves equal final arrays', () => {
      const divergent = compareThreeWayRecordValues(['base'], ['mine'], ['latest']);
      expect(divergent.unresolvedOverlaps.map(overlap => overlap.path)).to.deep.equal([[]]);
      expect(divergent.applicableLocalChanges).to.deep.equal([]);

      const equal = rebaseRecordValues(['base'], ['same'], ['same']);
      expect(equal.unresolvedOverlaps).to.deep.equal([]);
      expect(equal.localChangesAlreadyPresent).to.equal(true);
      expect(equal.candidate).to.deep.equal(['same']);
    });

    it('detects divergent parent deletion versus child edit', () => {
      const comparison = compareThreeWayRecordValues(
        { group: { title: 'base', retained: true } },
        {},
        { group: { title: 'latest', retained: true } }
      );
      expect(comparison.unresolvedOverlaps).to.have.length(1);
      expect(comparison.unresolvedOverlaps[0].path).to.deep.equal(['group']);
    });

    it('resolves overlaps whose complete final values are canonically equal', () => {
      const latest = { group: { title: 'same', orderIndependent: { b: 2, a: 1 } }, remote: true };
      const comparison = compareThreeWayRecordValues(
        { group: { title: 'base', orderIndependent: {} }, remote: false },
        { group: { title: 'same', orderIndependent: { a: 1, b: 2 } }, remote: false },
        latest
      );
      expect(comparison.unresolvedOverlaps).to.deep.equal([]);
      expect(comparison.resolvedOverlaps).to.have.length(3);
      expect(comparison.localChangesAlreadyPresent).to.equal(true);
    });

    it('rebases only base-to-local changes and never round-tripped stale values', () => {
      const base = {
        title: 'base title',
        nested: { local: 'base local', remote: 'base remote' },
        staleRoundTrip: 'base server value',
      };
      const local = {
        title: 'mine',
        nested: { local: 'mine nested', remote: 'base remote' },
        staleRoundTrip: 'base server value',
      };
      const latest = {
        title: 'base title',
        nested: { local: 'base local', remote: 'latest nested' },
        staleRoundTrip: 'latest server value',
        latestOnly: true,
      };
      const frozenBase = structuredClone(base);
      const frozenLocal = structuredClone(local);
      const frozenLatest = structuredClone(latest);

      const result = rebaseRecordValues(base, local, latest);

      expect(result.unresolvedOverlaps).to.deep.equal([]);
      expect(result.candidate).to.deep.equal({
        title: 'mine',
        nested: { local: 'mine nested', remote: 'latest nested' },
        staleRoundTrip: 'latest server value',
        latestOnly: true,
      });
      expect(base).to.deep.equal(frozenBase);
      expect(local).to.deep.equal(frozenLocal);
      expect(latest).to.deep.equal(frozenLatest);
      expect(result.candidate).not.to.equal(latest);
      expect(result.candidate.nested).not.to.equal(latest.nested);
    });

    it('applies object adds/deletes without mutating latest or change values', () => {
      const added = { nested: true };
      const latest: Record<string, unknown> = { keep: true, remove: 'latest' };
      const result = applyRecordValueChanges(latest, [
        { kind: 'delete', path: ['remove'], original: 'base', changed: undefined },
        { kind: 'add', path: ['added'], original: undefined, changed: added },
      ]);
      (result['added'] as { nested: boolean }).nested = false;

      expect(result).to.deep.equal({ keep: true, added: { nested: false } });
      expect(latest).to.deep.equal({ keep: true, remove: 'latest' });
      expect(added).to.deep.equal({ nested: true });
    });
  });
});
