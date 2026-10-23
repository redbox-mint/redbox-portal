let expect: Chai.ExpectStatic;

import { normalizeSource, normalizeCategory, normalizeCrosswalk, normalizeMapping, normalizeSyncRun, isAllowedSyncRunTransition } from '../../src/persistence/vocabulary/normalization';
const normalize = { figsharevocabularysource: normalizeSource, figsharevocabularycategory: normalizeCategory, figsharevocabularycrosswalk: normalizeCrosswalk, figsharevocabularycrosswalkmapping: normalizeMapping, figsharevocabularysyncrun: normalizeSyncRun };
function runHook(collection: any, hook: string, record: Record<string, unknown>) {
  try { normalize[collection](record, hook === 'beforeCreate'); return { record, error: undefined }; }
  catch(error) { return { record, error: error as Error }; }
}
function expectOk(result: { error?: Error }): void {
  expect(result.error, result.error?.message).to.be.undefined;
}

describe('Figshare vocabulary normalization', () => {
  before(async () => {
    const chai = await import('chai');
    expect = chai.expect;
  });

  describe('FigshareVocabularySource', () => {
    const valid = () => ({
      branding: 'brand-1',
      vocabulary: 'vocab-1',
      scope: 'public',
      taxonomyId: ' 5 ',
      displayName: ' ANZSRC FoR ',
      createdBy: ' admin ',
      updatedBy: ' admin ',
    });

    it('trims the required string fields on create', () => {
      const result = runHook('figsharevocabularysource', 'beforeCreate', valid());

      expectOk(result);
      expect(result.record).to.deep.include({
        taxonomyId: '5',
        displayName: 'ANZSRC FoR',
        createdBy: 'admin',
        updatedBy: 'admin',
      });
    });

    it('lowercases and trims the scope', () => {
      const result = runHook('figsharevocabularysource', 'beforeCreate', { ...valid(), scope: ' ACCOUNT ' });

      expectOk(result);
      expect(result.record.scope).to.equal('account');
    });

    it('rejects an unsupported scope', () => {
      const result = runHook('figsharevocabularysource', 'beforeCreate', { ...valid(), scope: 'private' });

      expect(result.error?.message).to.match(/scope must be one of: public, account/);
    });

    it('rejects a create that omits a required field', () => {
      const record = valid() as Record<string, unknown>;
      delete record.displayName;

      const result = runHook('figsharevocabularysource', 'beforeCreate', record);

      expect(result.error?.message).to.match(/displayName is required/);
      expect((result.error as any)?.code).to.equal('E_INVALID_NEW_RECORD');
    });

    it('rejects a create that omits the scope', () => {
      const record = valid() as Record<string, unknown>;
      delete record.scope;

      const result = runHook('figsharevocabularysource', 'beforeCreate', record);

      expect(result.error?.message).to.match(/scope is required/);
    });

    it('rejects a create with a blank required field', () => {
      const result = runHook('figsharevocabularysource', 'beforeCreate', { ...valid(), displayName: '   ' });

      expect((result.error as any)?.code).to.equal('E_INVALID_NEW_RECORD');
    });

    it('allows a partial update that omits every field', () => {
      const result = runHook('figsharevocabularysource', 'beforeUpdate', { archived: true });

      expectOk(result);
    });

    it('rejects an update that blanks a required field', () => {
      const result = runHook('figsharevocabularysource', 'beforeUpdate', { displayName: '  ' });

      expect(result.error?.message).to.match(/displayName is required/);
      expect((result.error as any)?.code).to.equal('E_INVALID_VALUES_TO_SET');
    });

    it('normalises the scope on update', () => {
      const result = runHook('figsharevocabularysource', 'beforeUpdate', { scope: 'PUBLIC' });

      expectOk(result);
      expect(result.record.scope).to.equal('public');
    });
  });

  describe('FigshareVocabularyCategory', () => {
    const valid = () => ({
      source: 'src-1',
      entry: 'entry-1',
      sourceId: ' 3101 ',
      categoryId: '42',
      taxonomyId: ' 5 ',
      firstSeenAt: '2026-01-01T00:00:00Z',
      lastSeenAt: '2026-01-02T00:00:00Z',
      contentHash: 'sha256:abc',
    });

    it('trims strings and coerces the category id to a number', () => {
      const result = runHook('figsharevocabularycategory', 'beforeCreate', valid());

      expectOk(result);
      expect(result.record).to.deep.include({ sourceId: '3101', taxonomyId: '5', categoryId: 42 });
    });

    it('trims a supplied parent source id and leaves an explicit null alone', () => {
      const withParent = runHook('figsharevocabularycategory', 'beforeCreate', {
        ...valid(),
        parentSourceId: ' 31 ',
      });
      expectOk(withParent);
      expect(withParent.record.parentSourceId).to.equal('31');

      const rootTerm = runHook('figsharevocabularycategory', 'beforeCreate', {
        ...valid(),
        parentSourceId: null,
      });
      expectOk(rootTerm);
      expect(rootTerm.record.parentSourceId).to.equal(null);
    });

    it('rejects a non-positive or non-integer category id', () => {
      expect(
        runHook('figsharevocabularycategory', 'beforeCreate', { ...valid(), categoryId: 0 }).error?.message
      ).to.match(/categoryId must be a positive integer/);
      expect(
        runHook('figsharevocabularycategory', 'beforeCreate', { ...valid(), categoryId: 1.5 }).error?.message
      ).to.match(/categoryId must be a positive integer/);
    });

    it('rejects a create that omits the category id', () => {
      const record = valid() as Record<string, unknown>;
      delete record.categoryId;

      const result = runHook('figsharevocabularycategory', 'beforeCreate', record);

      expect(result.error?.message).to.match(/categoryId is required/);
    });

    it('allows an update that omits the category id', () => {
      const result = runHook('figsharevocabularycategory', 'beforeUpdate', { lastSeenAt: '2026-02-01T00:00:00Z' });

      expectOk(result);
    });

    it('rejects a path that is not an array', () => {
      const result = runHook('figsharevocabularycategory', 'beforeCreate', { ...valid(), path: '31/3101' });

      expect(result.error?.message).to.match(/path must be an array of sourceIds/);
    });

    it('accepts an array path', () => {
      const result = runHook('figsharevocabularycategory', 'beforeCreate', { ...valid(), path: ['31', '3101'] });

      expectOk(result);
      expect(result.record.path).to.deep.equal(['31', '3101']);
    });

    it('coerces the selectable and historical flags to booleans', () => {
      const result = runHook('figsharevocabularycategory', 'beforeCreate', {
        ...valid(),
        selectable: 'false',
        historical: 'true',
      });

      expectOk(result);
      expect(result.record.selectable).to.equal(false);
      expect(result.record.historical).to.equal(true);
    });

    it('rejects a create that omits a required timestamp', () => {
      const record = valid() as Record<string, unknown>;
      delete record.firstSeenAt;

      const result = runHook('figsharevocabularycategory', 'beforeCreate', record);

      expect(result.error?.message).to.match(/firstSeenAt is required/);
    });

    it('rejects an update that blanks a required field', () => {
      const result = runHook('figsharevocabularycategory', 'beforeUpdate', { contentHash: '  ' });

      expect((result.error as any)?.code).to.equal('E_INVALID_VALUES_TO_SET');
    });
  });

  describe('FigshareVocabularyCrosswalk', () => {
    const valid = () => ({
      branding: 'brand-1',
      name: ' ANZSRC map ',
      localVocabulary: 'vocab-1',
      figshareSource: 'src-1',
      updatedBy: ' admin ',
    });

    it('trims the name and updatedBy and defaults the status to draft', () => {
      const result = runHook('figsharevocabularycrosswalk', 'beforeCreate', valid());

      expectOk(result);
      expect(result.record).to.deep.include({ name: 'ANZSRC map', updatedBy: 'admin', status: 'draft' });
    });

    it('lowercases a supplied status', () => {
      const result = runHook('figsharevocabularycrosswalk', 'beforeCreate', { ...valid(), status: 'ARCHIVED' });

      expectOk(result);
      expect(result.record.status).to.equal('archived');
    });

    it('rejects an unsupported status', () => {
      const result = runHook('figsharevocabularycrosswalk', 'beforeCreate', { ...valid(), status: 'pending' });

      expect(result.error?.message).to.match(/status must be one of: draft, approved, archived/);
    });

    it('rejects a create without a name or updatedBy', () => {
      const withoutName = valid() as Record<string, unknown>;
      delete withoutName.name;
      expect(runHook('figsharevocabularycrosswalk', 'beforeCreate', withoutName).error?.message).to.match(
        /name is required/
      );

      const withoutUpdatedBy = valid() as Record<string, unknown>;
      delete withoutUpdatedBy.updatedBy;
      expect(runHook('figsharevocabularycrosswalk', 'beforeCreate', withoutUpdatedBy).error?.message).to.match(
        /updatedBy is required/
      );
    });

    it('rejects blank name and updatedBy values', () => {
      expect(
        runHook('figsharevocabularycrosswalk', 'beforeCreate', { ...valid(), name: '  ' }).error?.message
      ).to.match(/name is required/);
      expect(runHook('figsharevocabularycrosswalk', 'beforeUpdate', { updatedBy: '  ' }).error?.message).to.match(
        /updatedBy is required/
      );
      expect(runHook('figsharevocabularycrosswalk', 'beforeUpdate', { name: '  ' }).error?.message).to.match(
        /name is required/
      );
    });

    it('leaves the status untouched on a partial update', () => {
      const result = runHook('figsharevocabularycrosswalk', 'beforeUpdate', { approvedAt: 'now' });

      expectOk(result);
      expect(result.record.status).to.be.undefined;
    });

    it('coerces the revision fields to numbers and ignores nulls', () => {
      const result = runHook('figsharevocabularycrosswalk', 'beforeCreate', {
        ...valid(),
        workingRevision: '3',
        approvedRevision: null,
      });

      expectOk(result);
      expect(result.record.workingRevision).to.equal(3);
      expect(result.record.approvedRevision).to.equal(null);
    });

    it('rejects non-positive revisions', () => {
      expect(
        runHook('figsharevocabularycrosswalk', 'beforeCreate', { ...valid(), workingRevision: 0 }).error?.message
      ).to.match(/workingRevision must be a positive integer/);
      expect(
        runHook('figsharevocabularycrosswalk', 'beforeCreate', { ...valid(), approvedRevision: 'x' }).error?.message
      ).to.match(/approvedRevision must be a positive integer/);
    });

    it('rejects an approved revision ahead of the working revision', () => {
      const result = runHook('figsharevocabularycrosswalk', 'beforeCreate', {
        ...valid(),
        workingRevision: 2,
        approvedRevision: 3,
      });

      expect(result.error?.message).to.match(/approvedRevision must be less than or equal to workingRevision/);
    });

    it('accepts an approved revision equal to the working revision', () => {
      const result = runHook('figsharevocabularycrosswalk', 'beforeCreate', {
        ...valid(),
        status: 'approved',
        approvedBy: 'admin',
        workingRevision: 2,
        approvedRevision: 2,
      });

      expectOk(result);
    });

    it('requires approvedBy once the status is approved', () => {
      const result = runHook('figsharevocabularycrosswalk', 'beforeCreate', { ...valid(), status: 'approved' });

      expect(result.error?.message).to.match(/approvedBy is required when status = approved/);
    });
  });

  describe('FigshareVocabularyCrosswalkMapping', () => {
    const valid = () => ({
      crosswalk: 'cw-1',
      revision: '2',
      localEntry: 'entry-1',
      figshareCategory: 'cat-1',
      matchType: ' Exact-Code ',
    });

    it('coerces the revision, defaults the status and normalises the match type', () => {
      const result = runHook('figsharevocabularycrosswalkmapping', 'beforeCreate', valid());

      expectOk(result);
      expect(result.record).to.deep.include({ revision: 2, status: 'proposed', matchType: 'exact-code' });
    });

    it('rejects a create without a revision or match type', () => {
      const withoutRevision = valid() as Record<string, unknown>;
      delete withoutRevision.revision;
      expect(runHook('figsharevocabularycrosswalkmapping', 'beforeCreate', withoutRevision).error?.message).to.match(
        /revision is required/
      );

      const withoutMatchType = valid() as Record<string, unknown>;
      delete withoutMatchType.matchType;
      expect(
        runHook('figsharevocabularycrosswalkmapping', 'beforeCreate', withoutMatchType).error?.message
      ).to.match(/matchType is required/);
    });

    it('rejects a non-positive revision', () => {
      const result = runHook('figsharevocabularycrosswalkmapping', 'beforeCreate', { ...valid(), revision: -1 });

      expect(result.error?.message).to.match(/revision must be a positive integer/);
    });

    it('rejects an unsupported status or match type', () => {
      expect(
        runHook('figsharevocabularycrosswalkmapping', 'beforeCreate', { ...valid(), status: 'maybe' }).error?.message
      ).to.match(/status must be one of: proposed, approved, rejected/);
      expect(
        runHook('figsharevocabularycrosswalkmapping', 'beforeCreate', { ...valid(), matchType: 'fuzzy' }).error
          ?.message
      ).to.match(/matchType must be one of/);
    });

    it('requires approvedBy once the status is approved', () => {
      const result = runHook('figsharevocabularycrosswalkmapping', 'beforeCreate', {
        ...valid(),
        status: 'approved',
      });

      expect(result.error?.message).to.match(/approvedBy is required when status = approved/);
    });

    it('accepts an approved mapping with an approver', () => {
      const result = runHook('figsharevocabularycrosswalkmapping', 'beforeCreate', {
        ...valid(),
        status: 'approved',
        approvedBy: 'admin',
      });

      expectOk(result);
    });

    it('leaves an update that only touches evidence alone', () => {
      const result = runHook('figsharevocabularycrosswalkmapping', 'beforeUpdate', { evidence: { rule: 'manual' } });

      expectOk(result);
      expect(result.record.status).to.be.undefined;
      expect(result.record.matchType).to.be.undefined;
    });

    it('rejects an update that sets an unsupported match type', () => {
      const result = runHook('figsharevocabularycrosswalkmapping', 'beforeUpdate', { matchType: 'fuzzy' });

      expect(result.error?.message).to.match(/matchType must be one of/);
    });
  });

  describe('FigshareVocabularySyncRun', () => {
    const valid = () => ({
      branding: 'brand-1',
      scope: ' PUBLIC ',
      taxonomyId: ' 5 ',
      normalizerVersion: ' 1 ',
      expiresAt: ' 2026-01-02T00:00:00Z ',
      requestedBy: ' admin ',
    });

    it('defaults the state to fetching and normalises the scope and strings', () => {
      const result = runHook('figsharevocabularysyncrun', 'beforeCreate', valid());

      expectOk(result);
      expect(result.record).to.deep.include({
        state: 'fetching',
        scope: 'public',
        taxonomyId: '5',
        normalizerVersion: '1',
        expiresAt: '2026-01-02T00:00:00Z',
        requestedBy: 'admin',
      });
    });

    it('lowercases an explicit state', () => {
      const result = runHook('figsharevocabularysyncrun', 'beforeCreate', { ...valid(), state: 'PREVIEWED' });

      expectOk(result);
      expect(result.record.state).to.equal('previewed');
    });

    it('rejects an unsupported state', () => {
      const result = runHook('figsharevocabularysyncrun', 'beforeCreate', { ...valid(), state: 'paused' });

      expect(result.error?.message).to.match(/state must be one of/);
    });

    it('rejects an unsupported scope', () => {
      const result = runHook('figsharevocabularysyncrun', 'beforeCreate', { ...valid(), scope: 'private' });

      expect(result.error?.message).to.match(/scope must be one of: public, account/);
    });

    it('rejects a create without a scope', () => {
      const record = valid() as Record<string, unknown>;
      delete record.scope;

      const result = runHook('figsharevocabularysyncrun', 'beforeCreate', record);

      expect(result.error?.message).to.match(/scope is required/);
    });

    it('rejects a create that omits a required field', () => {
      const record = valid() as Record<string, unknown>;
      delete record.expiresAt;

      const result = runHook('figsharevocabularysyncrun', 'beforeCreate', record);

      expect(result.error?.message).to.match(/expiresAt is required/);
    });

    it('rejects an update that blanks a required field', () => {
      const result = runHook('figsharevocabularysyncrun', 'beforeUpdate', { requestedBy: '   ' });

      expect(result.error?.message).to.match(/requestedBy is required/);
    });

    it('allows a partial update that only sets the state', () => {
      const result = runHook('figsharevocabularysyncrun', 'beforeUpdate', { state: 'applied' });

      expectOk(result);
      expect(result.record.state).to.equal('applied');
    });

    describe('isAllowedSyncRunTransition', () => {
      it('always allows a no-op transition, including from a terminal state', () => {
        expect(isAllowedSyncRunTransition('applied', 'applied')).to.be.true;
        expect(isAllowedSyncRunTransition('fetching', 'fetching')).to.be.true;
      });

      it('allows the documented forward transitions', () => {
        expect(isAllowedSyncRunTransition('fetching', 'previewed')).to.be.true;
        expect(isAllowedSyncRunTransition('previewed', 'applying')).to.be.true;
        expect(isAllowedSyncRunTransition('applying', 'applied')).to.be.true;
        expect(isAllowedSyncRunTransition('previewed', 'expired')).to.be.true;
      });

      it('blocks transitions out of a terminal state', () => {
        expect(isAllowedSyncRunTransition('applied', 'previewed')).to.be.false;
        expect(isAllowedSyncRunTransition('failed', 'applying')).to.be.false;
        expect(isAllowedSyncRunTransition('expired', 'previewed')).to.be.false;
      });

      it('blocks skipping the applying latch and unknown states', () => {
        expect(isAllowedSyncRunTransition('previewed', 'applied')).to.be.false;
        expect(isAllowedSyncRunTransition('applying', 'expired')).to.be.false;
        expect(isAllowedSyncRunTransition('unknown', 'applied')).to.be.false;
      });
    });
  });
});
