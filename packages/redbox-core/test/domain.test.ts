import assert from 'node:assert/strict';

import {
  RECORD_WORKFLOW_VALIDATION_LIMITS,
  type PublishedWorkflowRevision,
  type RecordWorkflow,
  type WorkflowIdentity,
  validateCreation,
  validateNextRevision,
  validateTransition,
  validateWorkflow,
} from '../src/record-workflow-administration/domain';

interface Definition {
  readonly title: string;
}

interface NestedDefinition {
  metadata: {
    labels: string[];
  };
}

const identity: WorkflowIdentity = {
  brandId: 'research',
  key: 'data-management-plan',
};

const revisionOne: PublishedWorkflowRevision<Definition> = {
  number: 1,
  content: { title: 'First' },
  origin: { kind: 'publication' },
};

const published: RecordWorkflow<Definition> = {
  identity,
  draft: { content: { title: 'Shared draft' } },
  revisions: [revisionOne],
  state: 'published',
  activeRevision: 1,
};

const contentEquals = (left: Definition, right: Definition): boolean => left.title === right.title;

function draftWorkflow(content: object): object {
  return {
    identity,
    draft: { content },
    revisions: [],
    state: 'draft',
    activeRevision: null,
  };
}

function nestedObjectAtDepth(depth: number): object {
  let value: object = {};
  for (let currentDepth = 1; currentDepth < depth; currentDepth += 1) {
    value = { nested: value };
  }
  return value;
}

describe('record workflow administration domain', function () {
  it('accepts one shared draft and monotonically numbered revisions', function () {
    assert.deepEqual(validateWorkflow(published), { ok: true, value: published });
  });

  it('accepts valid draft and retired lifecycle variants', function () {
    const draft: RecordWorkflow<Definition> = {
      identity,
      draft: { content: { title: 'Incomplete draft' } },
      revisions: [],
      state: 'draft',
      activeRevision: null,
    };
    const retiredDraft: RecordWorkflow<Definition> = {
      ...draft,
      state: 'retired',
    };
    const retiredPublished: RecordWorkflow<Definition> = {
      ...published,
      state: 'retired',
    };

    assert.deepEqual(validateWorkflow(draft), { ok: true, value: draft });
    assert.deepEqual(validateWorkflow(retiredDraft), { ok: true, value: retiredDraft });
    assert.deepEqual(validateWorkflow(retiredPublished), { ok: true, value: retiredPublished });
  });

  it('rejects malformed non-JSON content values', function () {
    interface CyclicContent {
      self?: CyclicContent;
    }

    const cyclicContent: CyclicContent = {};
    cyclicContent.self = cyclicContent;
    const sparseContent: string[] = [];
    sparseContent.length = 1;
    const malformedValues = [
      { name: 'undefined', value: undefined },
      { name: 'NaN', value: Number.NaN },
      { name: 'infinity', value: Number.POSITIVE_INFINITY },
      { name: 'bigint', value: 1n },
      { name: 'symbol', value: Symbol('not-json') },
      { name: 'function', value: (): string => 'not-json' },
      { name: 'date', value: new Date('2026-01-01T00:00:00Z') },
      { name: 'sparse array', value: sparseContent },
      { name: 'cycle', value: cyclicContent },
      { name: 'nested undefined', value: { metadata: { label: undefined } } },
      { name: 'nested infinity', value: { values: [1, Number.POSITIVE_INFINITY] } },
    ];

    for (const malformed of malformedValues) {
      const malformedWorkflow: object = {
        ...published,
        draft: { content: malformed.value },
      };

      assert.equal(validateWorkflow(malformedWorkflow).ok, false, malformed.name);
    }
  });

  it('rejects 12,000-level and getter-backed content without overflowing or invoking accessors', function () {
    const deeplyNested = nestedObjectAtDepth(12_000);
    let getterReads = 0;
    const getterBackedContent: object = {};
    Object.defineProperty(getterBackedContent, 'title', {
      enumerable: false,
      get: () => {
        getterReads += 1;
        return 'must-not-run';
      },
    });

    const deepResult = validateWorkflow(draftWorkflow(deeplyNested));
    const getterResult = validateWorkflow(draftWorkflow(getterBackedContent));

    assert.equal(deepResult.ok, false);
    assert.equal(getterResult.ok, false);
    assert.equal(getterReads, 0);
    if (!deepResult.ok) {
      assert.equal(deepResult.errors.length, 1);
      assert.equal(deepResult.errors[0]?.code, 'invalid-workflow-shape');
    }
  });

  it('accepts exact depth, array, byte, and revision limits and rejects boundary plus one', function () {
    const contentDepth = RECORD_WORKFLOW_VALIDATION_LIMITS.maxDepth - 2;
    assert.equal(validateWorkflow(draftWorkflow(nestedObjectAtDepth(contentDepth))).ok, true);
    assert.equal(validateWorkflow(draftWorkflow(nestedObjectAtDepth(contentDepth + 1))).ok, false);

    const boundaryItems = Array.from({ length: RECORD_WORKFLOW_VALIDATION_LIMITS.maxArrayItems }, (_, index) => index);
    assert.equal(validateWorkflow(draftWorkflow({ items: boundaryItems })).ok, true);
    assert.equal(
      validateWorkflow(draftWorkflow({ items: [...boundaryItems, RECORD_WORKFLOW_VALIDATION_LIMITS.maxArrayItems] }))
        .ok,
      false
    );

    const chunks: string[] = [];
    const boundaryByteWorkflow = draftWorkflow({ chunks });
    while (
      Buffer.byteLength(JSON.stringify(boundaryByteWorkflow), 'utf8') <
      RECORD_WORKFLOW_VALIDATION_LIMITS.maxAggregateBytes
    ) {
      const currentBytes = Buffer.byteLength(JSON.stringify(boundaryByteWorkflow), 'utf8');
      const remaining = RECORD_WORKFLOW_VALIDATION_LIMITS.maxAggregateBytes - currentBytes;
      const itemOverhead = chunks.length === 0 ? 2 : 3;
      chunks.push('x'.repeat(Math.min(RECORD_WORKFLOW_VALIDATION_LIMITS.maxStringLength, remaining - itemOverhead)));
    }
    assert.equal(
      Buffer.byteLength(JSON.stringify(boundaryByteWorkflow), 'utf8'),
      RECORD_WORKFLOW_VALIDATION_LIMITS.maxAggregateBytes
    );
    assert.equal(validateWorkflow(boundaryByteWorkflow).ok, true);
    const oversizedChunks = [...chunks];
    const lastChunk = oversizedChunks.pop();
    if (lastChunk === undefined) {
      assert.fail('Expected at least one aggregate byte-limit chunk.');
    }
    oversizedChunks.push(`${lastChunk}x`);
    assert.equal(validateWorkflow(draftWorkflow({ chunks: oversizedChunks })).ok, false);

    const revisions: PublishedWorkflowRevision<Definition>[] = Array.from(
      { length: RECORD_WORKFLOW_VALIDATION_LIMITS.maxRevisions },
      (_, index) => ({
        number: index + 1,
        content: { title: `Revision ${index + 1}` },
        origin: { kind: 'publication' },
      })
    );
    const boundaryRevisionWorkflow: RecordWorkflow<Definition> = {
      identity,
      draft: { content: { title: 'Draft' } },
      revisions,
      state: 'published',
      activeRevision: RECORD_WORKFLOW_VALIDATION_LIMITS.maxRevisions,
    };
    assert.equal(validateWorkflow(boundaryRevisionWorkflow).ok, true);
    assert.equal(
      validateWorkflow({
        ...boundaryRevisionWorkflow,
        revisions: [
          ...revisions,
          {
            number: RECORD_WORKFLOW_VALIDATION_LIMITS.maxRevisions + 1,
            content: { title: 'Too many' },
            origin: { kind: 'publication' },
          },
        ],
        activeRevision: RECORD_WORKFLOW_VALIDATION_LIMITS.maxRevisions + 1,
      }).ok,
      false
    );
  });

  it('caps workflow diagnostics across bounded revision history', function () {
    const revisions: PublishedWorkflowRevision<Definition>[] = Array.from(
      { length: RECORD_WORKFLOW_VALIDATION_LIMITS.maxRevisions },
      (_, index) => ({
        number: index + 1_000,
        content: { title: `Revision ${index + 1}` },
        origin: { kind: 'publication' },
      })
    );
    const result = validateWorkflow({
      identity,
      draft: { content: { title: 'Draft' } },
      revisions,
      state: 'published',
      activeRevision: 1_000,
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.errors.length, RECORD_WORKFLOW_VALIDATION_LIMITS.maxValidationErrors);
    }
  });

  it('applies aggregate limits across multi-input workflow validation', function () {
    interface ChunkedDefinition {
      chunks: string[];
    }

    const chunks = Array.from({ length: 6 }, () => 'x'.repeat(24_000));
    const previous: RecordWorkflow<ChunkedDefinition> = {
      identity,
      draft: { content: { chunks } },
      revisions: [],
      state: 'draft',
      activeRevision: null,
    };
    const next: RecordWorkflow<ChunkedDefinition> = {
      ...previous,
      draft: { content: { chunks: [...chunks] } },
    };

    assert.equal(validateWorkflow(previous).ok, true);
    assert.equal(validateWorkflow(next).ok, true);
    const result = validateTransition(previous, next, (left, right) => left.chunks.length === right.chunks.length);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.errors.length, 1);
      assert.equal(result.errors[0]?.code, 'invalid-workflow-shape');
    }
  });

  it('defensively clones and recursively freezes validated workflows', function () {
    const mutableIdentity = {
      brandId: 'research',
      key: 'nested-definition',
    };
    const draftContent: NestedDefinition = {
      metadata: { labels: ['Draft'] },
    };
    const revisionContent: NestedDefinition = {
      metadata: { labels: ['Published'] },
    };
    const source: RecordWorkflow<NestedDefinition> = {
      identity: mutableIdentity,
      draft: { content: draftContent },
      revisions: [
        {
          number: 1,
          content: revisionContent,
          origin: { kind: 'publication' },
        },
      ],
      state: 'published',
      activeRevision: 1,
    };

    const result = validateWorkflow(source);
    if (!result.ok) {
      assert.fail('Expected the workflow to be valid');
    }

    const validated = result.value;
    const validatedRevision = validated.revisions[0];
    if (validatedRevision === undefined) {
      assert.fail('Expected the validated revision to exist');
    }

    assert.notEqual(validated, source);
    assert.notEqual(validated.identity, mutableIdentity);
    assert.notEqual(validated.draft.content, draftContent);
    assert.notEqual(validatedRevision.content, revisionContent);

    mutableIdentity.brandId = 'changed';
    draftContent.metadata.labels[0] = 'Changed draft';
    revisionContent.metadata.labels[0] = 'Changed publication';

    assert.equal(validated.identity.brandId, 'research');
    assert.deepEqual(validated.draft.content.metadata.labels, ['Draft']);
    assert.deepEqual(validatedRevision.content.metadata.labels, ['Published']);

    assert.equal(Object.isFrozen(result), true);
    assert.equal(Object.isFrozen(validated), true);
    assert.equal(Object.isFrozen(validated.identity), true);
    assert.equal(Object.isFrozen(validated.draft), true);
    assert.equal(Object.isFrozen(validated.draft.content), true);
    assert.equal(Object.isFrozen(validated.draft.content.metadata), true);
    assert.equal(Object.isFrozen(validated.draft.content.metadata.labels), true);
    assert.equal(Object.isFrozen(validated.revisions), true);
    assert.equal(Object.isFrozen(validatedRevision), true);
    assert.equal(Object.isFrozen(validatedRevision.content), true);
    assert.equal(Object.isFrozen(validatedRevision.content.metadata), true);
    assert.equal(Object.isFrozen(validatedRevision.content.metadata.labels), true);
    assert.equal(Object.isFrozen(validatedRevision.origin), true);
  });

  it('rejects extra identity keys', function () {
    const invalid = {
      ...published,
      identity: { ...published.identity, unexpected: true },
    };

    assert.equal(validateWorkflow(invalid).ok, false);
  });

  it('rejects extra draft keys', function () {
    const invalid = {
      ...published,
      draft: { ...published.draft, unexpected: true },
    };

    assert.equal(validateWorkflow(invalid).ok, false);
  });

  it('rejects extra revision keys', function () {
    const invalid = {
      ...published,
      revisions: [{ ...revisionOne, unexpected: true }],
    };

    assert.equal(validateWorkflow(invalid).ok, false);
  });

  it('rejects extra origin keys', function () {
    const invalid = {
      ...published,
      revisions: [
        {
          ...revisionOne,
          origin: { ...revisionOne.origin, unexpected: true },
        },
      ],
    };

    assert.equal(validateWorkflow(invalid).ok, false);
  });

  it('requires the active pointer to reference a published revision', function () {
    const invalid: RecordWorkflow<Definition> = { ...published, activeRevision: 2 };

    assert.deepEqual(validateWorkflow(invalid), {
      ok: false,
      errors: [{ code: 'active-revision-not-published', activeRevision: 2 }],
    });
  });

  it('rejects gaps in published revision numbers', function () {
    const invalid: RecordWorkflow<Definition> = {
      ...published,
      revisions: [revisionOne, { number: 3, content: { title: 'Third' }, origin: { kind: 'publication' } }],
    };

    assert.deepEqual(validateWorkflow(invalid), {
      ok: false,
      errors: [{ code: 'revision-number-out-of-sequence', index: 1, expected: 2, actual: 3 }],
    });
  });

  it('requires rollback to append a new revision referencing history', function () {
    const rollback: PublishedWorkflowRevision<Definition> = {
      number: 2,
      content: { title: 'First' },
      origin: { kind: 'rollback', fromRevision: 1 },
    };

    assert.deepEqual(validateNextRevision(published, rollback), { ok: true, value: rollback });

    const pointerOnlyRollback: RecordWorkflow<Definition> = {
      ...published,
      revisions: [revisionOne, { number: 2, content: { title: 'Second' }, origin: { kind: 'publication' } }],
      activeRevision: 2,
    };
    const movedBack: RecordWorkflow<Definition> = { ...pointerOnlyRollback, activeRevision: 1 };

    assert.deepEqual(validateTransition(pointerOnlyRollback, movedBack, contentEquals), {
      ok: false,
      errors: [{ code: 'rollback-must-append-revision', requestedRevision: 1 }],
    });
  });

  it('rejects rollback targets that were not previously published', function () {
    const rollback: PublishedWorkflowRevision<Definition> = {
      number: 2,
      content: { title: 'Unavailable' },
      origin: { kind: 'rollback', fromRevision: 2 },
    };

    assert.deepEqual(validateNextRevision(published, rollback), {
      ok: false,
      errors: [{ code: 'rollback-target-not-published', revision: 2, targetRevision: 2 }],
    });
  });

  it('rejects rollback content that does not match its provenance', function () {
    const rollback: PublishedWorkflowRevision<Definition> = {
      number: 2,
      content: { title: 'Different content' },
      origin: { kind: 'rollback', fromRevision: 1 },
    };

    assert.deepEqual(validateNextRevision(published, rollback), {
      ok: false,
      errors: [{ code: 'rollback-content-mismatch', revision: 2, targetRevision: 1 }],
    });
  });

  it('keeps published revision provenance immutable', function () {
    const revisionTwo: PublishedWorkflowRevision<Definition> = {
      number: 2,
      content: { title: 'First' },
      origin: { kind: 'publication' },
    };
    const previous: RecordWorkflow<Definition> = {
      ...published,
      revisions: [revisionOne, revisionTwo],
      activeRevision: 2,
    };
    const next: RecordWorkflow<Definition> = {
      ...previous,
      revisions: [revisionOne, { ...revisionTwo, origin: { kind: 'rollback', fromRevision: 1 } }],
    };

    assert.deepEqual(validateTransition(previous, next, contentEquals), {
      ok: false,
      errors: [{ code: 'published-revision-changed', revision: 2 }],
    });
  });

  it('rejects published-to-retired active revision repointing', function () {
    const revisionTwo: PublishedWorkflowRevision<Definition> = {
      number: 2,
      content: { title: 'Second' },
      origin: { kind: 'publication' },
    };
    const previous: RecordWorkflow<Definition> = {
      ...published,
      revisions: [revisionOne, revisionTwo],
      activeRevision: 2,
    };
    const next: RecordWorkflow<Definition> = {
      ...previous,
      state: 'retired',
      activeRevision: 1,
    };

    assert.deepEqual(validateTransition(previous, next, contentEquals), {
      ok: false,
      errors: [{ code: 'rollback-must-append-revision', requestedRevision: 1 }],
    });
  });

  it('rejects retired-to-retired active revision repointing', function () {
    const revisionTwo: PublishedWorkflowRevision<Definition> = {
      number: 2,
      content: { title: 'Second' },
      origin: { kind: 'publication' },
    };
    const previous: RecordWorkflow<Definition> = {
      ...published,
      revisions: [revisionOne, revisionTwo],
      state: 'retired',
      activeRevision: 2,
    };
    const next: RecordWorkflow<Definition> = { ...previous, activeRevision: 1 };

    assert.deepEqual(validateTransition(previous, next, contentEquals), {
      ok: false,
      errors: [{ code: 'rollback-must-append-revision', requestedRevision: 1 }],
    });
  });

  it('allows same-pointer retirement and unretirement', function () {
    const retired: RecordWorkflow<Definition> = {
      ...published,
      state: 'retired',
    };

    assert.deepEqual(validateTransition(published, retired, contentEquals), {
      ok: true,
      value: retired,
    });
    assert.deepEqual(validateTransition(retired, published, contentEquals), {
      ok: true,
      value: published,
    });
  });

  it('rejects retirement that appends a published revision', function () {
    const revisionTwo: PublishedWorkflowRevision<Definition> = {
      number: 2,
      content: { title: 'Second' },
      origin: { kind: 'publication' },
    };
    const retired: RecordWorkflow<Definition> = {
      ...published,
      revisions: [revisionOne, revisionTwo],
      state: 'retired',
      activeRevision: 2,
    };

    assert.deepEqual(validateTransition(published, retired, contentEquals), {
      ok: false,
      errors: [{ code: 'retired-workflow-cannot-publish' }],
    });
  });

  it('rejects unretirement that appends a revision without changing the active pointer', function () {
    const retired: RecordWorkflow<Definition> = {
      ...published,
      state: 'retired',
    };
    const revisionTwo: PublishedWorkflowRevision<Definition> = {
      number: 2,
      content: { title: 'Second' },
      origin: { kind: 'publication' },
    };
    const republished: RecordWorkflow<Definition> = {
      ...retired,
      revisions: [revisionOne, revisionTwo],
      state: 'published',
      activeRevision: 1,
    };

    assert.deepEqual(validateTransition(retired, republished, contentEquals), {
      ok: false,
      errors: [{ code: 'retired-workflow-cannot-change-lifecycle' }, { code: 'retired-workflow-cannot-publish' }],
    });
  });

  it('rejects unretirement that changes the active pointer without appending history', function () {
    const revisionTwo: PublishedWorkflowRevision<Definition> = {
      number: 2,
      content: { title: 'Second' },
      origin: { kind: 'publication' },
    };
    const retired: RecordWorkflow<Definition> = {
      ...published,
      revisions: [revisionOne, revisionTwo],
      state: 'retired',
      activeRevision: 2,
    };
    const repointed: RecordWorkflow<Definition> = {
      ...retired,
      state: 'published',
      activeRevision: 1,
    };

    assert.deepEqual(validateTransition(retired, repointed, contentEquals), {
      ok: false,
      errors: [
        { code: 'retired-workflow-cannot-change-lifecycle' },
        { code: 'rollback-must-append-revision', requestedRevision: 1 },
      ],
    });
  });

  it('keeps identity and published history immutable across transitions', function () {
    const changed: RecordWorkflow<Definition> = {
      ...published,
      identity: { brandId: 'other-brand', key: identity.key },
      revisions: [],
      state: 'draft',
      activeRevision: null,
    };

    assert.deepEqual(validateTransition(published, changed, contentEquals), {
      ok: false,
      errors: [
        {
          code: 'identity-changed',
          previous: identity,
          next: { brandId: 'other-brand', key: identity.key },
        },
        { code: 'published-history-truncated', previousLength: 1, nextLength: 0 },
      ],
    });
  });

  it('preserves retired history while blocking recreation and publication', function () {
    const retired: RecordWorkflow<Definition> = { ...published, state: 'retired' };
    const proposedRevision: PublishedWorkflowRevision<Definition> = {
      number: 2,
      content: { title: 'New publication' },
      origin: { kind: 'publication' },
    };

    assert.deepEqual(retired.revisions, [revisionOne]);
    assert.deepEqual(validateCreation(identity, [retired]), {
      ok: false,
      errors: [{ code: 'retired-identity-cannot-be-recreated', identity }],
    });
    assert.deepEqual(validateNextRevision(retired, proposedRevision), {
      ok: false,
      errors: [{ code: 'retired-workflow-cannot-publish' }],
    });
  });
});
