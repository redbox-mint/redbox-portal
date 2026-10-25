'use strict';
const assert = require('node:assert/strict');
const { method, baseline } = require('./identity-baseline.cjs');
(async () => {
  const results = [];
  for (const [ref, file] of [
    [baseline, 'packages/redbox-core/src/services/VocabularyService.ts'],
    [null, 'packages/redbox-core/src/vocabulary/Vocabulary.ts'],
  ]) {
    const where = [];
    const repository = {
      countVocabularies: async value => {
        where.push(value);
        return 2;
      },
      listVocabularies: async value => {
        where.push(value);
        return [
          { id: 'local', branding: 'brand-1' },
          { id: 'foreign', branding: 'brand-2' },
        ];
      },
    };
    const fn = method(
      file,
      'list',
      {
        VALID_TYPES: new Set(['flat', 'tree']),
        VALID_SOURCES: new Set(['local', 'rva', 'external']),
        getVocabularyRepositories: () => repository,
      },
      ref
    );
    const result = await fn.call({ input: { repository } }, { branding: 'brand-1' });
    assert.equal(result.data.length, 2);
    assert(where.every(value => !('branding' in value)));
    results.push({ ref: ref ?? 'current-source', file, requestedBrand: 'brand-1', where, result });
  }
  console.log(
    JSON.stringify(
      {
        evidenceKind: 'actual-baseline-and-current-service-methods; deterministic repository ports; not HTTP',
        results,
      },
      null,
      2
    )
  );
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
