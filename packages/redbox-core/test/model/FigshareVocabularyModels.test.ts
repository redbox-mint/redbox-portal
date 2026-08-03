import { FigshareVocabularyCategoryWLDef } from '../../src/waterline-models/FigshareVocabularyCategory';
import { FigshareVocabularyCrosswalkWLDef } from '../../src/waterline-models/FigshareVocabularyCrosswalk';
import { FigshareVocabularyCrosswalkMappingWLDef } from '../../src/waterline-models/FigshareVocabularyCrosswalkMapping';
import { FigshareVocabularySourceWLDef } from '../../src/waterline-models/FigshareVocabularySource';
import {
  FigshareVocabularySyncRunWLDef,
  isAllowedSyncRunTransition,
} from '../../src/waterline-models/FigshareVocabularySyncRun';

let expect: Chai.ExpectStatic;

type WaterlineDef = {
  beforeCreate?: (record: Record<string, unknown>, cb: (err?: Error) => void) => void;
  beforeUpdate?: (record: Record<string, unknown>, cb: (err?: Error) => void) => void;
};

/** Run a lifecycle hook synchronously and return the record plus any error it raised. */
function runHook(
  def: WaterlineDef,
  hook: 'beforeCreate' | 'beforeUpdate',
  record: Record<string, unknown>
): { record: Record<string, unknown>; error?: Error } {
  let error: Error | undefined;
  let called = false;
  def[hook]!(record, err => {
    called = true;
    error = err;
  });
  if (!called) {
    throw new Error(`${hook} did not invoke its callback`);
  }
  return { record, error };
}

function expectOk(result: { error?: Error }): void {
  expect(result.error, result.error?.message).to.be.undefined;
}

describe('Figshare vocabulary waterline models', () => {
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
      const result = runHook(FigshareVocabularySourceWLDef, 'beforeCreate', valid());

      expectOk(result);
      expect(result.record).to.deep.include({
        taxonomyId: '5',
        displayName: 'ANZSRC FoR',
        createdBy: 'admin',
        updatedBy: 'admin',
      });
    });

    it('lowercases and trims the scope', () => {
      const result = runHook(FigshareVocabularySourceWLDef, 'beforeCreate', { ...valid(), scope: ' ACCOUNT ' });

      expectOk(result);
      expect(result.record.scope).to.equal('account');
    });

    it('rejects an unsupported scope', () => {
      const result = runHook(FigshareVocabularySourceWLDef, 'beforeCreate', { ...valid(), scope: 'private' });

      expect(result.error?.message).to.match(/scope must be one of: public, account/);
    });

    it('rejects a create that omits a required field', () => {
      const record = valid() as Record<string, unknown>;
      delete record.displayName;

      const result = runHook(FigshareVocabularySourceWLDef, 'beforeCreate', record);

      expect(result.error?.message).to.match(/displayName is required/);
      expect((result.error as any)?.code).to.equal('E_INVALID_NEW_RECORD');
    });

    it('rejects a create that omits the scope', () => {
      const record = valid() as Record<string, unknown>;
      delete record.scope;

      const result = runHook(FigshareVocabularySourceWLDef, 'beforeCreate', record);

      expect(result.error?.message).to.match(/scope is required/);
    });

    it('rejects a create with a blank required field', () => {
      const result = runHook(FigshareVocabularySourceWLDef, 'beforeCreate', { ...valid(), displayName: '   ' });

      expect((result.error as any)?.code).to.equal('E_INVALID_NEW_RECORD');
    });

    it('allows a partial update that omits every field', () => {
      const result = runHook(FigshareVocabularySourceWLDef, 'beforeUpdate', { archived: true });

      expectOk(result);
    });

    it('rejects an update that blanks a required field', () => {
      const result = runHook(FigshareVocabularySourceWLDef, 'beforeUpdate', { displayName: '  ' });

      expect(result.error?.message).to.match(/displayName is required/);
      expect((result.error as any)?.code).to.equal('E_INVALID_VALUES_TO_SET');
    });

    it('normalises the scope on update', () => {
      const result = runHook(FigshareVocabularySourceWLDef, 'beforeUpdate', { scope: 'PUBLIC' });

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
      const result = runHook(FigshareVocabularyCategoryWLDef, 'beforeCreate', valid());

      expectOk(result);
      expect(result.record).to.deep.include({ sourceId: '3101', taxonomyId: '5', categoryId: 42 });
    });

    it('trims a supplied parent source id and leaves an explicit null alone', () => {
      const withParent = runHook(FigshareVocabularyCategoryWLDef, 'beforeCreate', {
        ...valid(),
        parentSourceId: ' 31 ',
      });
      expectOk(withParent);
      expect(withParent.record.parentSourceId).to.equal('31');

      const rootTerm = runHook(FigshareVocabularyCategoryWLDef, 'beforeCreate', {
        ...valid(),
        parentSourceId: null,
      });
      expectOk(rootTerm);
      expect(rootTerm.record.parentSourceId).to.equal(null);
    });

    it('rejects a non-positive or non-integer category id', () => {
      expect(
        runHook(FigshareVocabularyCategoryWLDef, 'beforeCreate', { ...valid(), categoryId: 0 }).error?.message
      ).to.match(/categoryId must be a positive integer/);
      expect(
        runHook(FigshareVocabularyCategoryWLDef, 'beforeCreate', { ...valid(), categoryId: 1.5 }).error?.message
      ).to.match(/categoryId must be a positive integer/);
    });

    it('rejects a create that omits the category id', () => {
      const record = valid() as Record<string, unknown>;
      delete record.categoryId;

      const result = runHook(FigshareVocabularyCategoryWLDef, 'beforeCreate', record);

      expect(result.error?.message).to.match(/categoryId is required/);
    });

    it('allows an update that omits the category id', () => {
      const result = runHook(FigshareVocabularyCategoryWLDef, 'beforeUpdate', { lastSeenAt: '2026-02-01T00:00:00Z' });

      expectOk(result);
    });

    it('rejects a path that is not an array', () => {
      const result = runHook(FigshareVocabularyCategoryWLDef, 'beforeCreate', { ...valid(), path: '31/3101' });

      expect(result.error?.message).to.match(/path must be an array of sourceIds/);
    });

    it('accepts an array path', () => {
      const result = runHook(FigshareVocabularyCategoryWLDef, 'beforeCreate', { ...valid(), path: ['31', '3101'] });

      expectOk(result);
      expect(result.record.path).to.deep.equal(['31', '3101']);
    });

    it('coerces the selectable and historical flags to booleans', () => {
      const result = runHook(FigshareVocabularyCategoryWLDef, 'beforeCreate', {
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

      const result = runHook(FigshareVocabularyCategoryWLDef, 'beforeCreate', record);

      expect(result.error?.message).to.match(/firstSeenAt is required/);
    });

    it('rejects an update that blanks a required field', () => {
      const result = runHook(FigshareVocabularyCategoryWLDef, 'beforeUpdate', { contentHash: '  ' });

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
      const result = runHook(FigshareVocabularyCrosswalkWLDef, 'beforeCreate', valid());

      expectOk(result);
      expect(result.record).to.deep.include({ name: 'ANZSRC map', updatedBy: 'admin', status: 'draft' });
    });

    it('lowercases a supplied status', () => {
      const result = runHook(FigshareVocabularyCrosswalkWLDef, 'beforeCreate', { ...valid(), status: 'ARCHIVED' });

      expectOk(result);
      expect(result.record.status).to.equal('archived');
    });

    it('rejects an unsupported status', () => {
      const result = runHook(FigshareVocabularyCrosswalkWLDef, 'beforeCreate', { ...valid(), status: 'pending' });

      expect(result.error?.message).to.match(/status must be one of: draft, approved, archived/);
    });

    it('rejects a create without a name or updatedBy', () => {
      const withoutName = valid() as Record<string, unknown>;
      delete withoutName.name;
      expect(runHook(FigshareVocabularyCrosswalkWLDef, 'beforeCreate', withoutName).error?.message).to.match(
        /name is required/
      );

      const withoutUpdatedBy = valid() as Record<string, unknown>;
      delete withoutUpdatedBy.updatedBy;
      expect(runHook(FigshareVocabularyCrosswalkWLDef, 'beforeCreate', withoutUpdatedBy).error?.message).to.match(
        /updatedBy is required/
      );
    });

    it('rejects blank name and updatedBy values', () => {
      expect(
        runHook(FigshareVocabularyCrosswalkWLDef, 'beforeCreate', { ...valid(), name: '  ' }).error?.message
      ).to.match(/name is required/);
      expect(runHook(FigshareVocabularyCrosswalkWLDef, 'beforeUpdate', { updatedBy: '  ' }).error?.message).to.match(
        /updatedBy is required/
      );
      expect(runHook(FigshareVocabularyCrosswalkWLDef, 'beforeUpdate', { name: '  ' }).error?.message).to.match(
        /name is required/
      );
    });

    it('leaves the status untouched on a partial update', () => {
      const result = runHook(FigshareVocabularyCrosswalkWLDef, 'beforeUpdate', { approvedAt: 'now' });

      expectOk(result);
      expect(result.record.status).to.be.undefined;
    });

    it('coerces the revision fields to numbers and ignores nulls', () => {
      const result = runHook(FigshareVocabularyCrosswalkWLDef, 'beforeCreate', {
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
        runHook(FigshareVocabularyCrosswalkWLDef, 'beforeCreate', { ...valid(), workingRevision: 0 }).error?.message
      ).to.match(/workingRevision must be a positive integer/);
      expect(
        runHook(FigshareVocabularyCrosswalkWLDef, 'beforeCreate', { ...valid(), approvedRevision: 'x' }).error?.message
      ).to.match(/approvedRevision must be a positive integer/);
    });

    it('rejects an approved revision ahead of the working revision', () => {
      const result = runHook(FigshareVocabularyCrosswalkWLDef, 'beforeCreate', {
        ...valid(),
        workingRevision: 2,
        approvedRevision: 3,
      });

      expect(result.error?.message).to.match(/approvedRevision must be less than or equal to workingRevision/);
    });

    it('accepts an approved revision equal to the working revision', () => {
      const result = runHook(FigshareVocabularyCrosswalkWLDef, 'beforeCreate', {
        ...valid(),
        status: 'approved',
        approvedBy: 'admin',
        workingRevision: 2,
        approvedRevision: 2,
      });

      expectOk(result);
    });

    it('requires approvedBy once the status is approved', () => {
      const result = runHook(FigshareVocabularyCrosswalkWLDef, 'beforeCreate', { ...valid(), status: 'approved' });

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
      const result = runHook(FigshareVocabularyCrosswalkMappingWLDef, 'beforeCreate', valid());

      expectOk(result);
      expect(result.record).to.deep.include({ revision: 2, status: 'proposed', matchType: 'exact-code' });
    });

    it('rejects a create without a revision or match type', () => {
      const withoutRevision = valid() as Record<string, unknown>;
      delete withoutRevision.revision;
      expect(runHook(FigshareVocabularyCrosswalkMappingWLDef, 'beforeCreate', withoutRevision).error?.message).to.match(
        /revision is required/
      );

      const withoutMatchType = valid() as Record<string, unknown>;
      delete withoutMatchType.matchType;
      expect(
        runHook(FigshareVocabularyCrosswalkMappingWLDef, 'beforeCreate', withoutMatchType).error?.message
      ).to.match(/matchType is required/);
    });

    it('rejects a non-positive revision', () => {
      const result = runHook(FigshareVocabularyCrosswalkMappingWLDef, 'beforeCreate', { ...valid(), revision: -1 });

      expect(result.error?.message).to.match(/revision must be a positive integer/);
    });

    it('rejects an unsupported status or match type', () => {
      expect(
        runHook(FigshareVocabularyCrosswalkMappingWLDef, 'beforeCreate', { ...valid(), status: 'maybe' }).error?.message
      ).to.match(/status must be one of: proposed, approved, rejected/);
      expect(
        runHook(FigshareVocabularyCrosswalkMappingWLDef, 'beforeCreate', { ...valid(), matchType: 'fuzzy' }).error
          ?.message
      ).to.match(/matchType must be one of/);
    });

    it('requires approvedBy once the status is approved', () => {
      const result = runHook(FigshareVocabularyCrosswalkMappingWLDef, 'beforeCreate', {
        ...valid(),
        status: 'approved',
      });

      expect(result.error?.message).to.match(/approvedBy is required when status = approved/);
    });

    it('accepts an approved mapping with an approver', () => {
      const result = runHook(FigshareVocabularyCrosswalkMappingWLDef, 'beforeCreate', {
        ...valid(),
        status: 'approved',
        approvedBy: 'admin',
      });

      expectOk(result);
    });

    it('leaves an update that only touches evidence alone', () => {
      const result = runHook(FigshareVocabularyCrosswalkMappingWLDef, 'beforeUpdate', { evidence: { rule: 'manual' } });

      expectOk(result);
      expect(result.record.status).to.be.undefined;
      expect(result.record.matchType).to.be.undefined;
    });

    it('rejects an update that sets an unsupported match type', () => {
      const result = runHook(FigshareVocabularyCrosswalkMappingWLDef, 'beforeUpdate', { matchType: 'fuzzy' });

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
      const result = runHook(FigshareVocabularySyncRunWLDef, 'beforeCreate', valid());

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
      const result = runHook(FigshareVocabularySyncRunWLDef, 'beforeCreate', { ...valid(), state: 'PREVIEWED' });

      expectOk(result);
      expect(result.record.state).to.equal('previewed');
    });

    it('rejects an unsupported state', () => {
      const result = runHook(FigshareVocabularySyncRunWLDef, 'beforeCreate', { ...valid(), state: 'paused' });

      expect(result.error?.message).to.match(/state must be one of/);
    });

    it('rejects an unsupported scope', () => {
      const result = runHook(FigshareVocabularySyncRunWLDef, 'beforeCreate', { ...valid(), scope: 'private' });

      expect(result.error?.message).to.match(/scope must be one of: public, account/);
    });

    it('rejects a create without a scope', () => {
      const record = valid() as Record<string, unknown>;
      delete record.scope;

      const result = runHook(FigshareVocabularySyncRunWLDef, 'beforeCreate', record);

      expect(result.error?.message).to.match(/scope is required/);
    });

    it('rejects a create that omits a required field', () => {
      const record = valid() as Record<string, unknown>;
      delete record.expiresAt;

      const result = runHook(FigshareVocabularySyncRunWLDef, 'beforeCreate', record);

      expect(result.error?.message).to.match(/expiresAt is required/);
    });

    it('rejects an update that blanks a required field', () => {
      const result = runHook(FigshareVocabularySyncRunWLDef, 'beforeUpdate', { requestedBy: '   ' });

      expect(result.error?.message).to.match(/requestedBy is required/);
    });

    it('allows a partial update that only sets the state', () => {
      const result = runHook(FigshareVocabularySyncRunWLDef, 'beforeUpdate', { state: 'applied' });

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
