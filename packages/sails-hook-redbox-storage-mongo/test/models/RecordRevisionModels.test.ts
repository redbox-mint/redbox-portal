const { expect } = require('chai');

import {
  INITIAL_RECORD_REVISION,
  isDeletedRecordLifecycleOperation,
  nextRecordRevision,
} from '@researchdatabox/redbox-core';
import { RecordWLDef } from '../../src/models/Record';
import { DeletedRecordWLDef } from '../../src/models/DeletedRecord';

type HookName = 'beforeCreate' | 'beforeUpdate';

function runHook(definition: any, hook: HookName, values: Record<string, unknown>): Record<string, unknown> {
  let completed = false;
  let failure: Error | undefined;
  definition[hook](values, (error?: Error) => {
    completed = true;
    failure = error;
  });
  expect(completed).to.equal(true);
  expect(failure).to.equal(undefined);
  return values;
}

describe('record revision Waterline models', function () {
  it('declares a constrained server-owned active revision', function () {
    expect(RecordWLDef.attributes.revision).to.include({
      type: 'number',
      defaultsTo: INITIAL_RECORD_REVISION,
    });
    expect((RecordWLDef.attributes.revision.custom as (value: unknown) => boolean)(0)).to.equal(true);
    expect((RecordWLDef.attributes.revision.custom as (value: unknown) => boolean)(-1)).to.equal(false);

    expect(runHook(RecordWLDef, 'beforeCreate', { revision: 999 }).revision).to.equal(INITIAL_RECORD_REVISION);
    expect(runHook(RecordWLDef, 'beforeUpdate', { revision: 999, metadata: {} })).to.deep.equal({ metadata: {} });
  });

  it('declares wrapper-authoritative tombstone revision and lifecycle fields', function () {
    expect(DeletedRecordWLDef.attributes.revision.defaultsTo).to.equal(INITIAL_RECORD_REVISION);
    expect(DeletedRecordWLDef.attributes.lifecycleState.defaultsTo).to.equal('deleted');
    expect(DeletedRecordWLDef.attributes.lifecycleOperation.type).to.equal('json');

    expect(
      runHook(DeletedRecordWLDef, 'beforeCreate', {
        revision: 12,
        deletedRecordMetadata: { redboxOid: 'oid-1', revision: 11 },
      })
    ).to.deep.include({
      revision: INITIAL_RECORD_REVISION,
      lifecycleState: 'deleted',
      deletedRecordMetadata: { redboxOid: 'oid-1' },
    });
    expect(
      runHook(DeletedRecordWLDef, 'beforeUpdate', {
        revision: 12,
        lifecycleState: 'restore-pending',
        deletedRecordMetadata: { redboxOid: 'oid-1', revision: 11 },
      })
    ).to.deep.equal({
      lifecycleState: 'restore-pending',
      deletedRecordMetadata: { redboxOid: 'oid-1' },
    });
  });

  it('accepts only bounded request-linked monotonic lifecycle operations', function () {
    const operation = {
      requestId: '123e4567-e89b-42d3-a456-426614174000',
      sourceRevision: 4,
      targetRevision: 5,
      startedAt: '2026-08-23T00:00:00.000Z',
      updatedAt: '2026-08-23T00:00:01.000Z',
      attempts: 1,
      errorCode: 'restore-retry',
    };
    expect(isDeletedRecordLifecycleOperation(operation)).to.equal(true);
    expect(isDeletedRecordLifecycleOperation({ ...operation, requestId: 'raw-client-id' })).to.equal(false);
    expect(isDeletedRecordLifecycleOperation({ ...operation, targetRevision: 4 })).to.equal(false);
  });

  it('keeps delete and restore lineage strictly monotonic', function () {
    const activeRevision = 7;
    const tombstoneRevision = nextRecordRevision(activeRevision);
    const restoredRevision = nextRecordRevision(tombstoneRevision);
    expect(tombstoneRevision).to.equal(8);
    expect(restoredRevision).to.equal(9);
    expect(restoredRevision).to.not.equal(activeRevision);
  });
});
