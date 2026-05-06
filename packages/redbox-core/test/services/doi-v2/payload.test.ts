import { expect } from 'chai';
import { buildDoiPayload } from '../../../src/services/doi-v2/payload';
import { createDefaultBinding, type DoiProfile } from '../../../src/configmodels/DoiPublishing';

describe('doi-v2 payload', function () {
  const profile: DoiProfile = {
    enabled: true,
    label: 'Test DOI profile',
    metadata: {
      prefix: createDefaultBinding('', '10.1234'),
      url: createDefaultBinding('record.metadata.url'),
      publicationYear: createDefaultBinding('record.metadata.year'),
      publisher: createDefaultBinding('record.metadata.publisher'),
      creators: [
        {
          sourcePath: 'metadata.creators',
          itemMode: 'array',
          name: createDefaultBinding('item.family'),
          givenName: createDefaultBinding('item.given'),
          familyName: createDefaultBinding('item.family')
        }
      ],
      titles: [
        {
          title: createDefaultBinding('record.metadata.title')
        }
      ],
      types: {
        resourceTypeGeneral: createDefaultBinding('', 'Dataset'),
        ris: createDefaultBinding('', 'DATA'),
        bibtex: createDefaultBinding('', 'misc'),
        citeproc: createDefaultBinding('', 'dataset'),
        schemaOrg: createDefaultBinding('', 'Dataset')
      }
    },
    writeBack: {
      citationUrlPath: 'metadata.citation_url',
      citationDoiPath: 'metadata.citation_doi'
    },
    validation: {
      requireUrl: true,
      requirePublisher: true,
      requirePublicationYear: true,
      requireCreators: true,
      requireTitles: true
    }
  };

  const record = {
    metadata: {
      title: 'Example title',
      publisher: 'Example publisher',
      year: '2024',
      url: 'https://example.org/records/oid-1',
      creators: [{ given: 'Alice', family: 'Example' }]
    }
  } as const;

  it('includes prefix on create and omits it on update', async function () {
    const createPayload = (await buildDoiPayload(record as never, 'oid-1', profile, 'create', 'publish')) as {
      data: { attributes: Record<string, unknown> };
    };
    const updatePayload = (await buildDoiPayload(record as never, 'oid-1', profile, 'update', 'publish')) as {
      data: { attributes: Record<string, unknown> };
    };

    expect(createPayload.data.attributes.prefix).to.equal('10.1234');
    expect(updatePayload.data.attributes).to.not.have.property('prefix');
    expect(createPayload.data.attributes.titles).to.deep.equal([{ title: 'Example title' }]);
    expect(createPayload.data.attributes.creators).to.have.length(1);
  });
});
