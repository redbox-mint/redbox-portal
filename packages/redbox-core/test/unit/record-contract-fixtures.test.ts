import { expect } from 'chai';

import { createRecordContractFixture } from '../fixtures/record-contract.fixtures';

describe('record-contract shared fixtures', function () {
  it('builds detached deterministic fixtures with all phase-zero coverage categories', function () {
    const first = createRecordContractFixture();
    const second = createRecordContractFixture();

    expect(first).to.deep.equal(second);
    expect(first).not.to.equal(second);
    expect(first.form).not.to.equal(second.form);
    expect(first.expectedShapeByPointer).to.include({
      '/title': 'string',
      '/amount': 'number',
      '/count': 'integer',
      '/is_public': 'boolean',
      '/nullable_status': 'string|null',
      '/details': 'object',
      '/contributors': 'array',
      '/fixed_choice': 'enum',
      '/access_questions': 'conditional-object',
      '/geographic_coverage': 'geojson-object',
      '/attachments': 'attachment-array',
      '/static_typeahead': 'string',
      '/data_locations': 'data-location-array',
      '/custom_hook_value': 'custom',
      '/example:contract-extension': 'namespaced-extension',
    });

    first.form.name = 'mutated-by-test';
    expect(second.form.name).to.equal('record-contract-fixture-1.0-draft');
  });
});
