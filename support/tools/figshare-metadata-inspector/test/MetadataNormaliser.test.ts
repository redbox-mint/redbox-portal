import assert from 'node:assert/strict';
import { MetadataDiscoveryService } from '../src/discovery/MetadataDiscoveryService';
import { FigshareV2Client } from '../src/figshare/FigshareV2Client';
import { MetadataNormaliser } from '../src/normalisation/MetadataNormaliser';
import { fixture } from './support/fixtures';

async function discoveryFixture() {
  const v2 = {
    getInstitutionCustomFields: async () =>
      fixture<Record<string, unknown>[]>('institution-custom-fields.json').map(raw => ({ ...raw, raw })) as never,
    getGroupItemMetadata: async () =>
      fixture<Record<string, unknown>[]>('group-item-metadata.json').map(raw => ({ ...raw, raw })) as never,
    getLicenses: async () =>
      fixture<Record<string, unknown>[]>('licenses.json').map(raw => ({
        ...raw,
        id: raw.id ?? raw.value,
        raw,
      })) as never,
    getCategories: async () =>
      fixture<Record<string, unknown>[]>('categories.json').map(raw => ({ ...raw, title: raw.title, raw })) as never,
  } as unknown as FigshareV2Client;
  return new MetadataDiscoveryService(v2, { groupId: 32014 }).discover();
}

describe('MetadataNormaliser', () => {
  it('normalises the fixed dataset contract and effective CQU custom fields', async () => {
    const model = await new MetadataNormaliser(
      'https://api.figsh.com',
      () => new Date('2026-01-02T03:04:05.000Z')
    ).normalise(await discoveryFixture());
    const fields = new Map(model.itemTypes[0].fields.map(field => [String(field.id), field]));

    assert.equal(fields.get('title')?.required, true);
    assert.equal(fields.get('title')?.valueSource, 'none');
    assert.equal(fields.get('authors')?.valueSource, 'dynamic');
    assert.equal(fields.get('funding')?.valueSource, 'none');
    assert.equal(fields.get('defined_type')?.valueSource, 'inline');
    assert.deepEqual(
      fields.get('defined_type')?.values?.map(value => value.value),
      ['dataset']
    );

    assert.equal(fields.get('101')?.source, 'institution-custom');
    assert.equal(fields.get('101')?.valueSource, 'inline');
    assert.deepEqual(
      fields.get('101')?.values?.map(value => value.value),
      ['Yes', 'No']
    );
    assert.equal(fields.get('group:32014:Terms of agreement')?.source, 'group-custom');

    assert.equal(fields.get('license')?.valueSource, 'license');
    assert.equal(fields.get('license')?.values?.[0].id, 1);
    assert.equal(fields.get('categories')?.valueSource, 'category');
    assert.equal(fields.get('categories')?.values?.[2].value, 'Biological sciences → Genetics → Human genetics');

    assert.deepEqual(model.source, {
      baseUrl: 'https://api.figsh.com',
      apiVersions: ['v2'],
      discoveryMode: 'cqu-v2-dataset',
      groupId: 32014,
    });
    assert.equal(model.itemTypes[0].id, 'dataset');
    assert.equal(model.itemTypes[0].groupId, 32014);
    assert.equal(model.generatedAt, '2026-01-02T03:04:05.000Z');
    assert.equal(model.referencedEntities.categories[2].parentId, 11);
  });
});
