import { strict as assert } from 'node:assert';
import { RelatedObjectDataFieldComponentConfig, RelatedObjectDataFormComponentDefinition, normalizeRelatedReferenceValues, readRelatedReference } from '../../src';

describe('related-record opt-in construction contracts', () => {
  it('keeps legacy components model-free with no related opt-ins by default', () => {
    const field = new RelatedObjectDataFormComponentDefinition();
    const config = new RelatedObjectDataFieldComponentConfig();
    assert.equal(field.model, undefined);
    assert.equal(field.relatedDisplay, undefined);
    assert.equal(config.relationId, undefined);
    assert.equal(config.required, undefined);
  });

  it('normalizes browser references with literal own-property tokens and stable invalid positions', () => {
    const reference = Object.assign(Object.create({ oid: 'inherited' }), { 'literal.key': ' a ' });
    assert.deepEqual(normalizeRelatedReferenceValues([reference, 'a', {}, null, 42, { 'literal.key': 'b' }],
      value => readRelatedReference(value, ['literal.key'])), { values: ['a', 'b'], invalidIndices: [2, 4], referenceIndices: [[0, 1], [5]] });
    assert.equal(readRelatedReference(reference, ['oid']), undefined);
    assert.deepEqual(normalizeRelatedReferenceValues(reference, value => readRelatedReference(value, ['oid'])),
      { values: [], invalidIndices: [0], referenceIndices: [] });
  });

  it('retains original positions through blanks, trimming, duplicates and scalar normalization', () => {
    assert.deepEqual(normalizeRelatedReferenceValues([null, ' a ', '', 'b', 'a', ' ', 'b']), {
      values: ['a', 'b'], invalidIndices: [], referenceIndices: [[1, 4], [3, 6]],
    });
    assert.deepEqual(normalizeRelatedReferenceValues(' a '), {
      values: ['a'], invalidIndices: [], referenceIndices: [[0]],
    });
    assert.deepEqual(normalizeRelatedReferenceValues(null), {
      values: [], invalidIndices: [], referenceIndices: [],
    });
  });

  it('retains relation selection and display declarations on runtime definitions', () => {
    const config = Object.assign(new RelatedObjectDataFieldComponentConfig(), { relationId: 'supporting-activities', required: false });
    const field = Object.assign(new RelatedObjectDataFormComponentDefinition(), {
      name: 'activityData', relatedDisplay: { relationId: 'supporting-activities' },
      component: { class: 'RelatedObjectDataComponent' as const, config },
    });
    assert.equal(field.component.config.relationId, 'supporting-activities');
    assert.equal(field.component.config.required, false);
    assert.deepEqual(field.relatedDisplay, { relationId: 'supporting-activities' });
    assert.equal(field.model, undefined);
  });
});
