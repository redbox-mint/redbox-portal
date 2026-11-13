import { expect } from 'chai';

import {
  compileRecordJsonSchemaArtifact,
  type CompiledRecordJsonSchemaArtifact,
} from '../../../src/record-contract/record-json-schema-artifact';
import {
  RecordSchemaValidatorCache,
  RecordSchemaValidatorCacheConfigurationError,
} from '../../../src/record-contract/record-schema-validator-cache';
import { renderRecordJsonSchema } from '../../../src/record-contract/json-schema-renderer';
import type { RecordContractPublicContext } from '../../../src/record-contract/types';

function artifact(form: string): CompiledRecordJsonSchemaArtifact {
  const context: RecordContractPublicContext = {
    brand: 'default',
    portal: 'main',
    kind: 'create',
    recordType: 'dataset',
    workflowStep: 'draft',
    form,
    operation: 'submit',
    unknownProperties: 'declared',
    enforcement: 'shadow',
  };
  const document = renderRecordJsonSchema({
    root: {
      kind: 'object',
      nullable: false,
      properties: { value: { kind: 'scalar', nullable: false, scalarType: 'string' } },
      unknownProperties: 'declared',
    },
    definitions: {},
    fieldOwners: {},
    validatorSummaries: [],
    diagnostics: [],
    completeness: 'complete',
    context,
  });
  return compileRecordJsonSchemaArtifact(document, {
    maxDocumentBytes: 1_000_000,
    maxValidationErrors: 10,
  });
}

describe('RecordSchemaValidatorCache', function () {
  it('uses deterministic least-recently-used eviction and exposes unlabeled counters', function () {
    const cache = new RecordSchemaValidatorCache(2);
    const first = artifact('first');
    const second = artifact('second');
    const third = artifact('third');

    cache.set(first);
    cache.set(second);
    expect(cache.get(first.digest)?.digest).to.equal(first.digest);
    cache.set(third);

    expect(cache.has(first.digest)).to.equal(true);
    expect(cache.has(second.digest)).to.equal(false);
    expect(cache.has(third.digest)).to.equal(true);
    expect(cache.get(second.digest)).to.be.undefined;
    expect(cache.statistics()).to.deep.equal({ hits: 1, misses: 1, evictions: 1, size: 2, maxEntries: 2 });
    expect(Object.isFrozen(cache.statistics())).to.equal(true);
  });

  it('treats replacement as most-recent use without an unnecessary eviction', function () {
    const cache = new RecordSchemaValidatorCache(2);
    const first = artifact('first');
    const second = artifact('second');
    const third = artifact('third');

    cache.set(first);
    cache.set(second);
    cache.set(first);
    cache.set(third);

    expect(cache.has(first.digest)).to.equal(true);
    expect(cache.has(second.digest)).to.equal(false);
    expect(cache.has(third.digest)).to.equal(true);
    expect(cache.statistics().evictions).to.equal(1);
  });

  it('snapshots immutable document/validator-only entries and drops caller authorization data', function () {
    const cache = new RecordSchemaValidatorCache(1);
    const compiled = artifact('immutable');
    const callerScoped = {
      ...compiled,
      authorization: { actor: 'private-user', roles: ['Admin'] },
      callerContext: { oid: 'private-oid' },
    };

    cache.set(callerScoped);
    const entry = cache.get(compiled.digest);
    if (!entry) {
      throw new Error('The validator cache did not return the inserted entry.');
    }

    expect(Object.keys(entry).sort()).to.deep.equal(['digest', 'document', 'validator']);
    expect(entry.document).not.to.equal(compiled.document);
    expect(entry.validator).not.to.equal(compiled.validator);
    expect(Object.isFrozen(entry)).to.equal(true);
    expect(Object.isFrozen(entry.document)).to.equal(true);
    expect(Object.isFrozen(entry.validator)).to.equal(true);
    expect(Reflect.set(entry.document, '$id', '/mutated')).to.equal(false);
    expect(JSON.stringify(entry)).not.to.include('private-user').and.not.to.include('private-oid');
    expect(entry.validator.validate({ value: 'valid' }).valid).to.equal(true);
  });

  it('rejects zero, disabled-like, non-integer, non-finite, and malformed entry configuration', function () {
    for (const maximum of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => new RecordSchemaValidatorCache(maximum)).to.throw(
        RecordSchemaValidatorCacheConfigurationError,
        'positive integer'
      );
    }

    const cache = new RecordSchemaValidatorCache(1);
    const compiled = artifact('valid');
    expect(() => cache.set({ ...compiled, digest: compiled.digest.toUpperCase() })).to.throw(
      RecordSchemaValidatorCacheConfigurationError,
      'lowercase SHA-256'
    );
  });

  it('rejects digest and protected identifier mismatches without poisoning the cache', function () {
    const cache = new RecordSchemaValidatorCache(2);
    const first = artifact('first');
    const second = artifact('second');

    expect(() => cache.set({ ...first, digest: second.digest })).to.throw(
      RecordSchemaValidatorCacheConfigurationError,
      'must match its document'
    );
    expect(() => cache.set({ ...first, document: { ...first.document, $id: second.document.$id } })).to.throw(
      RecordSchemaValidatorCacheConfigurationError,
      'must match its document'
    );
    expect(cache.statistics()).to.deep.equal({ hits: 0, misses: 0, evictions: 0, size: 0, maxEntries: 2 });
  });
});
