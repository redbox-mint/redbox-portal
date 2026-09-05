import { strict as assert } from 'node:assert';
import { describe, it } from 'mocha';
import { Services as VocabularyServices } from '../../src/services/VocabularyService';

describe('vocabulary operation inventory', function () {
  it('exposes brand-authorized operations alongside documented internal storage primitives', function () {
    const exported = new VocabularyServices.VocabularyService().exports() as Record<string, unknown>;
    for (const method of [
      'listAuthorized',
      'getAuthorizedByIdOrSlug',
      'createAuthorized',
      'updateAuthorized',
      'reorderEntriesAuthorized',
      'deleteAuthorized',
      'getAuthorizedTree',
      'requireAuthorizedBrandOperation',
    ]) {
      assert.equal(method in exported, true, method);
    }
    // Raw ID-only primitives remain exported as internal storage helpers for
    // the authorized wrappers; controllers must not call them with
    // request-supplied IDs. Import/sync/export have no dedicated Authorized
    // methods and run through the authorized vocabulary plus Figshare service
    // brand contracts.
    for (const method of ['list', 'getById', 'getByIdOrSlug', 'upsertEntries']) {
      assert.equal(method in exported, true, method);
    }
    assert.equal('importAuthorized' in exported, false);
    assert.equal('syncAuthorized' in exported, false);
    assert.equal('exportAuthorized' in exported, false);
  });

  it('pins the exact exported operation set so additions and omissions fail review', function () {
    const exported = new VocabularyServices.VocabularyService().exports() as Record<string, unknown>;
    // Entry/tree read primitives documented in
    // Authorization-Resource-Gate-Inventory.md: they accept an explicit brand
    // or parent vocabulary ID and must only run after the parent vocabulary
    // passes its authorized wrapper.
    const expected = [
      'assertMutableVocabulary',
      'bootstrapData',
      // Inherited Core.Service utility, not a vocabulary operation.
      'convertToType',
      'create',
      'createAuthorized',
      'delete',
      'deleteAuthorized',
      'expandPaths',
      'getAncestorChain',
      'getAuthorizedByIdOrSlug',
      'getAuthorizedTree',
      'getById',
      'getByIdOrSlug',
      'getChildren',
      'getEntries',
      'getEntryByNotation',
      'getTree',
      'list',
      'listAuthorized',
      'normalizeEntry',
      'reorderEntries',
      'reorderEntriesAuthorized',
      'requireAuthorizedBrandOperation',
      'update',
      'updateAuthorized',
      'upsertEntries',
      'validateParent',
    ];
    assert.deepEqual(Object.keys(exported).sort(), expected);
  });
});
