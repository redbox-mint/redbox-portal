import { expect } from 'chai';
import type { RelatedMetadata } from '@researchdatabox/sails-ng-common';
import { withoutRuntimeRecordProperties } from '../../src/related-records/runtime-record';
import { classifyRecordWrite } from '../../src/RecordWriteClassification';
import { createRelatedRecordsFixtures } from '../fixtures/related-records.fixtures';

describe('runtime record persistence view', () => {
  it('detaches the record and removes only root enrichment, preserving integration and local data', () => {
    const { root, activityA } = createRelatedRecordsFixtures();
    const relatedMetadata: RelatedMetadata = {
      activities: { status: 'resolved', records: [activityA], issues: [] },
    };
    const input = {
      ...root,
      metadata: { ...root.metadata, relatedMetadata: { answer: false } },
      integration: { relatedMetadata: 'integration-owned', doi: 'test-doi' },
      relatedMetadata,
    };
    const original = structuredClone(input);
    const snapshot = withoutRuntimeRecordProperties(input);
    expect(snapshot).not.to.have.property('relatedMetadata');
    expect(snapshot.metadata.relatedMetadata).to.deep.equal({ answer: false });
    expect(snapshot.integration).to.deep.equal(input.integration);
    (snapshot.metadata.group as { localAnswer: string }).localAnswer = 'changed snapshot';
    expect(input).to.deep.equal(original);
  });

  it('ignores added, removed and refreshed runtime results during classification', () => {
    const { root, activityA } = createRelatedRecordsFixtures();
    const enriched = {
      ...root,
      relatedMetadata: {
        activities: {
          status: 'resolved',
          records: [activityA],
          issues: [],
        },
      },
    };
    expect(classifyRecordWrite(root, enriched)).to.equal('no-change');
    expect(classifyRecordWrite(enriched, root)).to.equal('no-change');
    expect(classifyRecordWrite(enriched, { ...enriched, relatedMetadata: {} })).to.equal('no-change');
    expect(
      classifyRecordWrite(root, { ...enriched, metadata: { ...root.metadata, relatedMetadata: 'local' } })
    ).to.equal('record-metadata');
    expect(classifyRecordWrite(root, { ...enriched, integration: { doi: 'new' } })).to.equal(
      'non-form-system-metadata'
    );
  });
});
