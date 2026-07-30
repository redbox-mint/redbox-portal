import {
  FIGSHARE_NORMALIZER_VERSION,
  FIGSHARE_SNAPSHOT_LIMITS,
  assertSnapshotWithinLimits,
  buildIdentityProposals,
  buildProposals,
  classifyChanges,
  filterByTaxonomy,
  groupTaxonomies,
  hashSnapshot,
  normalizeCategoryCode,
  normalizeFigshareCategories,
  normalizeLabel,
  toSourceCodeCandidates,
  type ExistingMirrorCategory,
  type LocalEntryCandidate,
  type NormalizedFigshareCategory,
} from '../../src/services/figshare-v2/categories';
import { CatalogueInvalidError, SnapshotTooLargeError } from '../../src/services/figshare-v2/vocabulary-errors';

let expect: Chai.ExpectStatic;

function rawCategory(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 1,
    title: 'Biological Sciences',
    source_id: '31',
    taxonomy_id: 5,
    parent_id: null,
    is_selectable: true,
    has_children: false,
    ...overrides,
  };
}

function normalizedRow(overrides: Partial<NormalizedFigshareCategory> = {}): NormalizedFigshareCategory {
  return {
    sourceId: '31',
    categoryId: 1,
    taxonomyId: '5',
    title: 'Biological Sciences',
    parentSourceId: null,
    path: ['31'],
    selectable: true,
    hasChildren: false,
    contentHash: 'sha256:aaa',
    ...overrides,
  };
}

function localEntry(overrides: Partial<LocalEntryCandidate> = {}): LocalEntryCandidate {
  const label = overrides.label ?? 'Biological Sciences';
  const value = overrides.value ?? '31';
  return {
    id: 'e1',
    label,
    labelLower: label.toLowerCase(),
    value,
    valueLower: value.toLowerCase(),
    ...overrides,
  };
}

describe('figshare-v2 categories', () => {
  before(async () => {
    const chai = await import('chai');
    expect = chai.expect;
  });

  describe('normalizeCategoryCode', () => {
    it('returns an empty string for blank input', () => {
      expect(normalizeCategoryCode(null)).to.equal('');
      expect(normalizeCategoryCode(undefined)).to.equal('');
      expect(normalizeCategoryCode('   ')).to.equal('');
    });

    it('keeps the last path segment of a purl and lowercases it', () => {
      expect(normalizeCategoryCode('http://purl.org/au-research/vocabulary/anzsrc-for/2020/300101')).to.equal('300101');
    });

    it('drops the query string before extracting the segment', () => {
      expect(normalizeCategoryCode('https://example.org/vocab/AB12?version=2')).to.equal('ab12');
    });

    it('keeps the fragment when it is the last delimiter', () => {
      expect(normalizeCategoryCode('https://example.org/vocab#Term-9')).to.equal('term-9');
    });

    it('returns bare codes unchanged apart from case and whitespace', () => {
      expect(normalizeCategoryCode('  300101 ')).to.equal('300101');
      expect(normalizeCategoryCode(300101)).to.equal('300101');
    });
  });

  describe('toSourceCodeCandidates', () => {
    it('returns an empty list for null and empty input', () => {
      expect(toSourceCodeCandidates(null)).to.deep.equal([]);
      expect(toSourceCodeCandidates(undefined)).to.deep.equal([]);
      expect(toSourceCodeCandidates('')).to.deep.equal([]);
      expect(toSourceCodeCandidates([])).to.deep.equal([]);
    });

    it('wraps a scalar value in a single-entry list', () => {
      expect(toSourceCodeCandidates('300101')).to.deep.equal(['300101']);
    });

    it('reads notation then code from object entries', () => {
      expect(toSourceCodeCandidates([{ notation: '31' }, { code: '32' }])).to.deep.equal(['31', '32']);
    });

    it('drops falsy entries and entries that trim to nothing', () => {
      expect(toSourceCodeCandidates(['31', '', null, '  ', { other: 'x' }, ' 32 '])).to.deep.equal(['31', '32']);
    });
  });

  describe('normalizeLabel', () => {
    it('collapses whitespace and trims', () => {
      expect(normalizeLabel('  Biological   Sciences \n')).to.equal('Biological Sciences');
    });

    it('coerces nullish input to an empty string', () => {
      expect(normalizeLabel(null)).to.equal('');
      expect(normalizeLabel(undefined)).to.equal('');
    });

    it('normalises unicode so composed and decomposed forms compare equal', () => {
      expect(normalizeLabel('Más')).to.equal(normalizeLabel('Más'));
    });
  });

  describe('normalizeFigshareCategories', () => {
    it('rejects a catalogue that is not an array', () => {
      expect(() => normalizeFigshareCategories({ items: [] })).to.throw(CatalogueInvalidError, /not an array/);
    });

    it('rejects a catalogue with more categories than the supported maximum', () => {
      const raw = new Array(FIGSHARE_SNAPSHOT_LIMITS.maxCategories + 1).fill(rawCategory());
      expect(() => normalizeFigshareCategories(raw)).to.throw(SnapshotTooLargeError, /exceeds the supported maximum/);
    });

    it('rejects non-object entries', () => {
      expect(() => normalizeFigshareCategories(['nope'])).to.throw(CatalogueInvalidError, /non-object entry/);
      expect(() => normalizeFigshareCategories([null])).to.throw(CatalogueInvalidError, /non-object entry/);
      expect(() => normalizeFigshareCategories([[]])).to.throw(CatalogueInvalidError, /non-object entry/);
    });

    it('rejects entries without a positive numeric id', () => {
      expect(() => normalizeFigshareCategories([rawCategory({ id: 0 })])).to.throw(
        CatalogueInvalidError,
        /positive numeric id/
      );
      expect(() => normalizeFigshareCategories([rawCategory({ id: 'abc' })])).to.throw(
        CatalogueInvalidError,
        /positive numeric id/
      );
      expect(() => normalizeFigshareCategories([rawCategory({ id: 1.5 })])).to.throw(
        CatalogueInvalidError,
        /positive numeric id/
      );
    });

    it('rejects entries with a blank title', () => {
      expect(() => normalizeFigshareCategories([rawCategory({ title: '   ' })])).to.throw(
        CatalogueInvalidError,
        /missing a title/
      );
    });

    it('rejects duplicate source ids', () => {
      const raw = [rawCategory({ id: 1, source_id: '31' }), rawCategory({ id: 2, source_id: '31' })];
      expect(() => normalizeFigshareCategories(raw)).to.throw(CatalogueInvalidError, /duplicate source_id/);
    });

    it('rejects duplicate numeric ids', () => {
      const raw = [rawCategory({ id: 1, source_id: '31' }), rawCategory({ id: 1, source_id: '32' })];
      expect(() => normalizeFigshareCategories(raw)).to.throw(CatalogueInvalidError, /duplicate id/);
    });

    it('falls back to the numeric id when source_id is absent', () => {
      const { rows } = normalizeFigshareCategories([rawCategory({ id: 7, source_id: '  ' })]);
      expect(rows[0].sourceId).to.equal('7');
    });

    it('defaults selectable to true and hasChildren to false', () => {
      const { rows } = normalizeFigshareCategories([
        rawCategory({ is_selectable: undefined, has_children: undefined }),
      ]);
      expect(rows[0].selectable).to.be.true;
      expect(rows[0].hasChildren).to.be.false;
    });

    it('honours explicit selectable and hasChildren flags', () => {
      const { rows } = normalizeFigshareCategories([rawCategory({ is_selectable: false, has_children: true })]);
      expect(rows[0].selectable).to.be.false;
      expect(rows[0].hasChildren).to.be.true;
    });

    it('builds ancestor paths and sorts rows by source id', () => {
      const raw = [
        rawCategory({ id: 3, source_id: '3101', title: 'Biochemistry', parent_id: 1 }),
        rawCategory({ id: 1, source_id: '31', title: 'Biological Sciences', parent_id: null, has_children: true }),
      ];
      const { rows, warnings } = normalizeFigshareCategories(raw);

      expect(warnings).to.deep.equal([]);
      expect(rows.map(row => row.sourceId)).to.deep.equal(['31', '3101']);
      expect(rows[1].parentSourceId).to.equal('31');
      expect(rows[1].path).to.deep.equal(['31', '3101']);
    });

    it('promotes orphans to roots and records a missing-parent warning', () => {
      const { rows, warnings } = normalizeFigshareCategories([
        rawCategory({ id: 3, source_id: '3101', title: 'Biochemistry', parent_id: 99 }),
      ]);

      expect(rows[0].parentSourceId).to.equal(null);
      expect(rows[0].path).to.deep.equal(['3101']);
      expect(warnings).to.have.length(1);
      expect(warnings[0].code).to.equal('missing-parent');
      expect(warnings[0].sourceId).to.equal('3101');
    });

    it('breaks ancestor cycles and records a cycle-detected warning', () => {
      const raw = [
        rawCategory({ id: 1, source_id: 'a', title: 'A', parent_id: 2 }),
        rawCategory({ id: 2, source_id: 'b', title: 'B', parent_id: 1 }),
      ];
      const { rows, warnings } = normalizeFigshareCategories(raw);

      expect(warnings.some(warning => warning.code === 'cycle-detected')).to.be.true;
      expect(rows.every(row => row.path.length <= 2)).to.be.true;
    });

    it('inherits the taxonomy id from the root ancestor when a child omits it', () => {
      const raw = [
        rawCategory({ id: 1, source_id: '31', title: 'Biological Sciences', taxonomy_id: 5, parent_id: null }),
        rawCategory({ id: 2, source_id: '3101', title: 'Biochemistry', taxonomy_id: null, parent_id: 1 }),
      ];
      const { rows, warnings } = normalizeFigshareCategories(raw);

      expect(rows.find(row => row.sourceId === '3101')?.taxonomyId).to.equal('5');
      expect(warnings.some(warning => warning.code === 'missing-taxonomy')).to.be.false;
    });

    it('groups under a synthetic root taxonomy when nothing supplies taxonomy_id', () => {
      const { rows, warnings } = normalizeFigshareCategories([
        rawCategory({ id: 1, source_id: '31', taxonomy_id: undefined, parent_id: null }),
      ]);

      expect(rows[0].taxonomyId).to.equal('root:31');
      expect(warnings.some(warning => warning.code === 'missing-taxonomy')).to.be.true;
    });

    it('produces a stable content hash for identical input', () => {
      const first = normalizeFigshareCategories([rawCategory()]);
      const second = normalizeFigshareCategories([rawCategory()]);
      expect(first.rows[0].contentHash).to.equal(second.rows[0].contentHash);
      expect(first.rows[0].contentHash).to.match(/^sha256:[0-9a-f]{64}$/);
    });

    it('changes the content hash when the title changes', () => {
      const first = normalizeFigshareCategories([rawCategory()]);
      const second = normalizeFigshareCategories([rawCategory({ title: 'Biological Science' })]);
      expect(first.rows[0].contentHash).to.not.equal(second.rows[0].contentHash);
    });
  });

  describe('groupTaxonomies', () => {
    it('counts categories, selectable terms and missing parents per taxonomy', () => {
      const result = {
        rows: [
          normalizedRow({ sourceId: '31', taxonomyId: '5' }),
          normalizedRow({ sourceId: '3101', taxonomyId: '5', selectable: false }),
          normalizedRow({ sourceId: '40', taxonomyId: '6' }),
        ],
        warnings: [{ code: 'missing-parent' as const, sourceId: '3101', detail: 'orphan' }],
      };

      const summaries = groupTaxonomies(result);

      expect(summaries.map(summary => summary.taxonomyId)).to.deep.equal(['5', '6']);
      expect(summaries[0]).to.deep.equal({
        taxonomyId: '5',
        title: 'Taxonomy 5',
        categoryCount: 2,
        selectableCount: 1,
        missingParentCount: 1,
      });
      expect(summaries[1].categoryCount).to.equal(1);
    });

    it('returns an empty list for an empty catalogue', () => {
      expect(groupTaxonomies({ rows: [], warnings: [] })).to.deep.equal([]);
    });
  });

  describe('filterByTaxonomy', () => {
    it('keeps only the rows and warnings for the selected taxonomy', () => {
      const result = {
        rows: [normalizedRow({ sourceId: '31', taxonomyId: '5' }), normalizedRow({ sourceId: '40', taxonomyId: '6' })],
        warnings: [
          { code: 'missing-parent' as const, sourceId: '31', detail: 'orphan' },
          { code: 'missing-parent' as const, sourceId: '40', detail: 'orphan' },
        ],
      };

      const filtered = filterByTaxonomy(result, ' 5 ');

      expect(filtered.rows.map(row => row.sourceId)).to.deep.equal(['31']);
      expect(filtered.warnings.map(warning => warning.sourceId)).to.deep.equal(['31']);
    });

    it('returns nothing when the taxonomy is unknown', () => {
      const filtered = filterByTaxonomy({ rows: [normalizedRow()], warnings: [] }, 'missing');
      expect(filtered.rows).to.deep.equal([]);
    });
  });

  describe('hashSnapshot', () => {
    it('is independent of the input order', () => {
      const a = normalizedRow({ sourceId: '31', contentHash: 'sha256:a' });
      const b = normalizedRow({ sourceId: '40', contentHash: 'sha256:b' });
      expect(hashSnapshot([a, b])).to.equal(hashSnapshot([b, a]));
    });

    it('changes when a row content hash changes', () => {
      const a = normalizedRow({ sourceId: '31', contentHash: 'sha256:a' });
      const changed = normalizedRow({ sourceId: '31', contentHash: 'sha256:z' });
      expect(hashSnapshot([a])).to.not.equal(hashSnapshot([changed]));
    });
  });

  describe('assertSnapshotWithinLimits', () => {
    it('accepts a small snapshot', () => {
      expect(() => assertSnapshotWithinLimits([normalizedRow()])).to.not.throw();
    });

    it('rejects a snapshot with too many rows', () => {
      const rows = new Array(FIGSHARE_SNAPSHOT_LIMITS.maxCategories + 1).fill(normalizedRow());
      expect(() => assertSnapshotWithinLimits(rows)).to.throw(SnapshotTooLargeError, /categories which exceeds/);
    });

    it('rejects a snapshot that serialises beyond the byte limit', () => {
      const rows = [normalizedRow({ title: 'x'.repeat(FIGSHARE_SNAPSHOT_LIMITS.maxSnapshotBytes + 1) })];
      expect(() => assertSnapshotWithinLimits(rows)).to.throw(SnapshotTooLargeError, /bytes which exceeds/);
    });
  });

  describe('classifyChanges', () => {
    it('marks remote-only terms as added', () => {
      const result = classifyChanges([], [normalizedRow({ sourceId: '31' })]);

      expect(result.summary).to.deep.equal({ added: 1, changed: 0, removed: 0, reappeared: 0, unchanged: 0 });
      expect(result.rows[0]).to.deep.equal({
        changeClass: 'added',
        sourceId: '31',
        title: 'Biological Sciences',
        categoryId: 1,
      });
    });

    it('marks a returning historical term as reappeared', () => {
      const existing: ExistingMirrorCategory[] = [
        { sourceId: '31', categoryId: 9, title: 'Old title', contentHash: 'sha256:aaa', historical: true },
      ];

      const result = classifyChanges(existing, [normalizedRow({ sourceId: '31' })]);

      expect(result.summary.reappeared).to.equal(1);
      expect(result.rows[0]).to.deep.include({
        changeClass: 'reappeared',
        previousCategoryId: 9,
        previousTitle: 'Old title',
      });
    });

    it('marks a differing content hash as changed', () => {
      const existing: ExistingMirrorCategory[] = [
        { sourceId: '31', categoryId: 1, title: 'Old title', contentHash: 'sha256:different', historical: false },
      ];

      const result = classifyChanges(existing, [normalizedRow({ sourceId: '31' })]);

      expect(result.summary.changed).to.equal(1);
      expect(result.rows[0].previousTitle).to.equal('Old title');
    });

    it('marks an identical content hash as unchanged', () => {
      const existing: ExistingMirrorCategory[] = [
        { sourceId: '31', categoryId: 1, title: 'Biological Sciences', contentHash: 'sha256:aaa', historical: false },
      ];

      const result = classifyChanges(existing, [normalizedRow({ sourceId: '31' })]);

      expect(result.summary.unchanged).to.equal(1);
      expect(result.rows[0].changeClass).to.equal('unchanged');
    });

    it('marks local-only live terms as removed and ignores local-only historical terms', () => {
      const existing: ExistingMirrorCategory[] = [
        { sourceId: '31', categoryId: 1, title: 'Gone', contentHash: 'sha256:aaa', historical: false },
        { sourceId: '32', categoryId: 2, title: 'Already historical', contentHash: 'sha256:bbb', historical: true },
      ];

      const result = classifyChanges(existing, []);

      expect(result.summary.removed).to.equal(1);
      expect(result.rows).to.have.length(1);
      expect(result.rows[0]).to.deep.equal({
        changeClass: 'removed',
        sourceId: '31',
        title: 'Gone',
        previousCategoryId: 1,
        previousTitle: 'Gone',
      });
    });

    it('sorts the diff rows by source id', () => {
      const result = classifyChanges([], [normalizedRow({ sourceId: '40' }), normalizedRow({ sourceId: '31' })]);

      expect(result.rows.map(row => row.sourceId)).to.deep.equal(['31', '40']);
    });
  });

  describe('buildProposals', () => {
    const snapshot = [
      normalizedRow({ sourceId: '31', categoryId: 1, title: 'Biological Sciences' }),
      normalizedRow({ sourceId: '3101', categoryId: 2, title: 'Biochemistry' }),
    ];

    it('preselects an exact code match', () => {
      const result = buildProposals([localEntry({ id: 'e1', value: '31' })], snapshot);

      expect(result.unresolvedLocalEntryIds).to.deep.equal([]);
      expect(result.proposals).to.have.length(1);
      expect(result.proposals[0]).to.deep.include({
        proposalId: 'e1:31',
        matchType: 'exact-code',
        preselected: true,
        targetCategoryId: 1,
        historical: false,
      });
      expect(result.proposals[0].evidence).to.deep.equal({
        rule: 'exact-code',
        normalizedValue: '31',
        normalizerVersion: FIGSHARE_NORMALIZER_VERSION,
      });
    });

    it('matches an exact code hidden inside a purl value', () => {
      const entry = localEntry({ id: 'e1', value: 'http://purl.org/anzsrc-for/2020/3101' });
      const result = buildProposals([entry], snapshot);

      expect(result.proposals[0].targetSourceId).to.equal('3101');
    });

    it('falls back to the identifier for an identity match', () => {
      const entry = localEntry({ id: 'e1', label: 'Unrelated', value: 'no-match', identifier: '3101' });
      const result = buildProposals([entry], snapshot);

      expect(result.proposals[0]).to.deep.include({ matchType: 'identity', preselected: true });
      expect(result.proposals[0].evidence).to.deep.include({ rule: 'identity', normalizedIdentifier: '3101' });
    });

    it('offers a unique exact label match without preselecting it', () => {
      const entry = localEntry({ id: 'e1', label: '  biochemistry ', value: 'no-match' });
      const result = buildProposals([entry], snapshot);

      expect(result.proposals[0]).to.deep.include({
        matchType: 'label-suggestion',
        preselected: false,
        targetSourceId: '3101',
      });
      expect(result.proposals[0].evidence).to.deep.include({ rule: 'exact-label' });
    });

    it('leaves an ambiguous label unresolved', () => {
      const ambiguous = [
        normalizedRow({ sourceId: 'a', categoryId: 1, title: 'Chemistry' }),
        normalizedRow({ sourceId: 'b', categoryId: 2, title: 'Chemistry' }),
      ];
      const result = buildProposals([localEntry({ id: 'e1', label: 'Chemistry', value: 'no-match' })], ambiguous);

      expect(result.proposals).to.deep.equal([]);
      expect(result.unresolvedLocalEntryIds).to.deep.equal(['e1']);
    });

    it('leaves an entry with no match at all unresolved', () => {
      const result = buildProposals([localEntry({ id: 'e1', label: 'Nothing', value: 'nope' })], snapshot);

      expect(result.unresolvedLocalEntryIds).to.deep.equal(['e1']);
    });

    it('treats blank values and identifiers as no match', () => {
      const entry = localEntry({ id: 'e1', label: 'Nothing', value: '   ', identifier: '  ' });
      const result = buildProposals([entry], snapshot);

      expect(result.unresolvedLocalEntryIds).to.deep.equal(['e1']);
    });

    it('flags targets that are known to be historical', () => {
      const result = buildProposals([localEntry({ id: 'e1', value: '31' })], snapshot, {
        historicalSourceIds: new Set(['31']),
      });

      expect(result.proposals[0].historical).to.be.true;
    });

    it('proposes every target when a code resolves to more than one category', () => {
      const duplicated = [
        normalizedRow({ sourceId: 'vocab/31', categoryId: 1, title: 'One' }),
        normalizedRow({ sourceId: 'other/31', categoryId: 2, title: 'Two' }),
      ];
      const result = buildProposals([localEntry({ id: 'e1', value: '31' })], duplicated);

      expect(result.proposals.map(proposal => proposal.targetCategoryId)).to.deep.equal([1, 2]);
    });

    it('ignores snapshot rows whose source id normalises to nothing', () => {
      const result = buildProposals(
        [localEntry({ id: 'e1', label: 'Unrelated', value: '31' })],
        [normalizedRow({ sourceId: '' })]
      );

      expect(result.unresolvedLocalEntryIds).to.deep.equal(['e1']);
    });
  });

  describe('buildIdentityProposals', () => {
    const snapshot = [normalizedRow({ sourceId: '31', categoryId: 1, title: 'Biological Sciences' })];

    it('maps each cloned entry to its own source term', () => {
      const entries = [{ ...localEntry({ id: 'e1' }), sourceId: '31' }];

      const result = buildIdentityProposals(entries, snapshot);

      expect(result.unresolvedLocalEntryIds).to.deep.equal([]);
      expect(result.proposals[0]).to.deep.include({
        proposalId: 'e1:31',
        matchType: 'identity',
        preselected: true,
        historical: false,
        targetCategoryId: 1,
      });
      expect(result.proposals[0].evidence).to.deep.equal({
        rule: 'clone-identity',
        normalizerVersion: FIGSHARE_NORMALIZER_VERSION,
      });
    });

    it('reports cloned entries that are no longer in the snapshot as unresolved', () => {
      const entries = [{ ...localEntry({ id: 'e2' }), sourceId: 'gone' }];

      const result = buildIdentityProposals(entries, snapshot);

      expect(result.proposals).to.deep.equal([]);
      expect(result.unresolvedLocalEntryIds).to.deep.equal(['e2']);
    });
  });
});
