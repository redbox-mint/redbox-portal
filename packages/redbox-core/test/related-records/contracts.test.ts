import { strict as assert } from 'node:assert';
import { normalizeRecordRelation, RecordRelation } from '../../src/config/recordtype.config';
import { relatedMetadataSchema } from '../../src/api-routes/groups/related-records';
import { RelatedTo } from '../../src/model/storage/RecordTypeModel';
import { createRelatedRecordsFixtures } from '../fixtures/related-records.fixtures';

describe('related metadata issue contracts', () => {
  const entry = (issue: Record<string, unknown>) => ({ activities: {
    status: 'resolved',
    records: [{ redboxOid: 'activity', metaMetadata: { type: 'activity', brandId: 'brand' }, metadata: {} }],
    issues: [issue],
  } });
  it('preserves returned-record and original-reference indexes in the public response schema', () => {
    for (const issue of [
      { code: 'field-absent', recordIndex: 0, fieldPointer: '/endDate' },
      { code: 'unavailable', referenceIndex: 2 },
      { code: 'invalid-reference', referenceIndex: 0 },
      { code: 'limit-exceeded' },
    ]) assert.deepEqual(relatedMetadataSchema.parse(entry(issue)), entry(issue));
  });
  it('requires nonnegative integer indexes when present', () => {
    for (const key of ['recordIndex', 'referenceIndex']) {
      for (const value of [-1, 0.5, '0', null]) {
        assert.equal(relatedMetadataSchema.safeParse(entry({ code: 'field-absent', [key]: value })).success, false);
      }
    }
  });
});

describe('related-record relation contracts', () => {
  it('preserves legacy normalization defaults without enabling resolution', () => {
    const relation = normalizeRecordRelation('related-plan', { recordType: 'related-activity', foreignField: 'redboxOid' });
    assert.equal(relation.localField, 'redboxOid');
    assert.equal(relation.cardinality, 'many');
    assert.equal(relation.direction, 'outbound');
    assert.equal(relation.oidProperty, undefined);
    assert.equal(relation.resolution, undefined);
    assert.equal(new RelatedTo().resolution, undefined);
  });

  it('preserves separate fixture relation IDs and explicit pointer projections', () => {
    const fixtures = createRelatedRecordsFixtures();
    const relations = fixtures.relations.map(relation => normalizeRecordRelation('related-plan', {
      ...relation,
      cardinality: relation.cardinality as RecordRelation['cardinality'],
      direction: relation.direction as RecordRelation['direction'],
      oidProperty: 'oid',
      resolution: { metadataFields: ['/title', '/literal.key', '/slash~1key', '/tilde~0key', '/namespace:title'] },
    }));
    assert.deepEqual(relations.map(relation => relation.id), ['primary-activity', 'supporting-activities']);
    for (const relation of relations) {
      assert.equal(relation.oidProperty, 'oid');
      assert.deepEqual(relation.resolution?.metadataFields, ['/title', '/literal.key', '/slash~1key', '/tilde~0key', '/namespace:title']);
    }
    assert.equal(relations[0].recordType, relations[1].recordType);
  });
});
