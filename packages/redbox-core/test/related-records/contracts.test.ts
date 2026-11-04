import { strict as assert } from 'node:assert';
import { normalizeRecordRelation, RecordRelation } from '../../src/config/recordtype.config';
import { RelatedTo } from '../../src/model/storage/RecordTypeModel';
import { createRelatedRecordsFixtures } from '../fixtures/related-records.fixtures';

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
