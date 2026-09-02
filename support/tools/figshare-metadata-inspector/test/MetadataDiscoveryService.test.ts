import assert from 'node:assert/strict';
import { MetadataDiscoveryService } from '../src/discovery/MetadataDiscoveryService';
import { FigshareV2Client } from '../src/figshare/FigshareV2Client';
import { fixture } from './support/fixtures';

function v2FixtureClient(): FigshareV2Client {
  return {
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
}

describe('MetadataDiscoveryService', () => {
  it('combines the CQU dataset contract with effective v2 group metadata', async () => {
    const events: string[] = [];
    const result = await new MetadataDiscoveryService(v2FixtureClient(), {
      groupId: 32014,
      onEvent: event => events.push(event.kind),
    }).discover();

    assert.deepEqual(result.target, { itemType: 'dataset', groupId: 32014 });
    assert.equal(result.fields.length, 13);
    assert.equal(result.fields.find(field => field.id === 'title')?.source, 'core');

    const inherited = result.fields.find(field => field.name === 'Open Access');
    assert.equal(inherited?.id, 101);
    assert.equal(inherited?.source, 'institution-custom');
    assert.deepEqual(inherited?.settings, {
      options: ['Yes', 'No'],
      placeholder: 'Open Access',
      is_multiple: false,
    });

    const groupOnly = result.fields.find(field => field.name === 'Terms of agreement');
    assert.equal(groupOnly?.id, 'group:32014:Terms of agreement');
    assert.equal(groupOnly?.source, 'group-custom');
    assert.equal(groupOnly?.required, true);
    assert.deepEqual(result.raw.institutionCustomFields[0].raw.future_property, { retained: true });
    assert.deepEqual(events, ['core-fields', 'institution-fields', 'group-fields', 'licenses', 'categories']);
  });
});
