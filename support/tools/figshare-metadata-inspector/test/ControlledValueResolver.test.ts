import assert from 'node:assert/strict';
import { ControlledValueResolver } from '../src/discovery/ControlledValueResolver';
import { NormalisedField } from '../src/normalisation/types';

function field(overrides: Partial<NormalisedField>): NormalisedField {
  return {
    id: 'field',
    name: 'Field',
    type: 'dropdown',
    required: false,
    source: 'institution-custom',
    valueSource: 'unknown',
    rawConfiguration: {},
    ...overrides,
  };
}

describe('ControlledValueResolver', () => {
  const resolver = new ControlledValueResolver(
    [{ id: 1, name: 'CC BY 4.0', raw: {} }],
    [{ id: 10, title: 'Science', raw: {} }],
    new Map([['10', 'Science']])
  );

  it('does not classify partial token matches or free-text notes as controlled values', async () => {
    const authorisation = await resolver.resolve(
      field({ name: 'Authorisation', settings: { options: ['Granted', 'Denied'] } })
    );
    assert.equal(authorisation.kind, 'inline');

    const authority = await resolver.resolve(field({ name: 'Authority' }));
    assert.equal(authority.kind, 'unknown');

    const licenceNotes = await resolver.resolve(field({ name: 'Licence notes', type: 'text' }));
    assert.equal(licenceNotes.kind, 'none');
  });

  it('retains exact and compound controlled-value classifications', async () => {
    const license = await resolver.resolve(field({ name: 'figshare_license' }));
    assert.equal(license.kind, 'api-reference');
    if (license.kind === 'api-reference') assert.equal(license.entity, 'license');

    const categories = await resolver.resolve(field({ name: 'subject-categories' }));
    assert.equal(categories.kind, 'api-reference');
    if (categories.kind === 'api-reference') assert.equal(categories.entity, 'category');

    const authors = await resolver.resolve(field({ name: 'authors' }));
    assert.equal(authors.kind, 'dynamic');

    const largeList = await resolver.resolve(field({ name: 'Department', type: 'dropdown_large_list' }));
    assert.equal(largeList.kind, 'dynamic');
  });
});
