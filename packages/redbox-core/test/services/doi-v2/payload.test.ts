import { buildDoiPayload } from '../../../src/services/doi-v2/payload';
import { createDefaultBinding, type DoiProfile } from '../../../src/configmodels/DoiPublishing';

let expect!: Chai.ExpectStatic;

describe('doi-v2 payload', function () {
  before(async function () {
    ({ expect } = await import('chai'));
  });

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

  it('keeps top-level and related-item titles when another binding is empty', async function () {
    const titleMapping = {
      subject: createDefaultBinding('record.metadata.missing'),
      title: createDefaultBinding('record.metadata.title')
    };
    const mappedProfile: DoiProfile = {
      ...profile,
      metadata: {
        ...profile.metadata,
        titles: [titleMapping],
        relatedItems: [{
          relationType: createDefaultBinding('', 'IsSupplementTo'),
          relatedItemType: createDefaultBinding('', 'Dataset'),
          titles: [titleMapping]
        }]
      }
    };

    const payload = (await buildDoiPayload(record as never, 'oid-1', mappedProfile, 'update', undefined)) as {
      data: { attributes: Record<string, unknown> };
    };

    expect(payload.data.attributes.titles).to.deep.equal([{ title: 'Example title' }]);
    expect(payload.data.attributes.relatedItems).to.deep.equal([{
      relationType: 'IsSupplementTo',
      relatedItemType: 'Dataset',
      titles: [{ title: 'Example title' }]
    }]);
  });

  it('expands record arrays into separate subjects and descriptions', async function () {
    const mappedProfile: DoiProfile = {
      ...profile,
      metadata: {
        ...profile.metadata,
        subjects: [
          { sourcePath: 'metadata.keywords', subject: createDefaultBinding('item.value') },
          {
            sourcePath: 'metadata.forCodes',
            subject: createDefaultBinding('item.label'),
            classificationCode: createDefaultBinding('item.notation')
          }
        ],
        descriptions: [
          { sourcePath: 'metadata.notes', description: createDefaultBinding('item.text'), descriptionType: createDefaultBinding('', 'Other') }
        ]
      }
    };
    const mappedRecord = {
      metadata: {
        ...record.metadata,
        keywords: ['frogs', '', 'rainforest'],
        forCodes: [{ notation: '310308', label: 'Terrestrial ecology' }],
        notes: [{ text: 'Collection methods' }, { text: '' }]
      }
    };

    const payload = (await buildDoiPayload(mappedRecord as never, 'oid-1', mappedProfile, 'update', undefined)) as {
      data: { attributes: Record<string, unknown> };
    };

    expect(payload.data.attributes).to.not.have.property('event');
    expect(payload.data.attributes.subjects).to.deep.equal([
      { subject: 'frogs' },
      { subject: 'rainforest' },
      { subject: 'Terrestrial ecology', classificationCode: '310308' }
    ]);
    expect(payload.data.attributes.descriptions).to.deep.equal([{ description: 'Collection methods', descriptionType: 'Other' }]);
  });

  it('omits entries missing any field DataCite requires for the collection', async function () {
    const mappedProfile: DoiProfile = {
      ...profile,
      metadata: {
        ...profile.metadata,
        dates: [{ sourcePath: 'metadata.events', date: createDefaultBinding('item.on'), dateType: createDefaultBinding('item.type') }],
        relatedIdentifiers: [{
          sourcePath: 'metadata.links',
          relatedIdentifier: createDefaultBinding('item.url'),
          relatedIdentifierType: createDefaultBinding('', 'URL'),
          relationType: createDefaultBinding('item.relation')
        }],
        rightsList: [{
          sourcePath: 'metadata.licences',
          rightsUri: createDefaultBinding('item.url'),
          schemeUri: createDefaultBinding('', 'https://spdx.org/licenses/')
        }]
      }
    };
    const mappedRecord = {
      metadata: {
        ...record.metadata,
        events: [{ on: '2024-01-01', type: 'Collected' }, { on: '2024-02-01' }],
        links: [{ url: 'https://example.org/a', relation: 'References' }, { url: 'https://example.org/b' }],
        licences: [{ url: 'https://creativecommons.org/licenses/by/4.0/' }, { label: 'unknown' }]
      }
    };

    const payload = (await buildDoiPayload(mappedRecord as never, 'oid-1', mappedProfile, 'update', undefined)) as {
      data: { attributes: Record<string, unknown> };
    };

    expect(payload.data.attributes.dates).to.deep.equal([{ date: '2024-01-01', dateType: 'Collected' }]);
    expect(payload.data.attributes.relatedIdentifiers).to.deep.equal([
      { relatedIdentifier: 'https://example.org/a', relatedIdentifierType: 'URL', relationType: 'References' }
    ]);
    expect(payload.data.attributes.rightsList).to.deep.equal([
      { rightsUri: 'https://creativecommons.org/licenses/by/4.0/', schemeUri: 'https://spdx.org/licenses/' }
    ]);
  });

  it('maps a single source value as one item and exposes non-object items as item.value', async function () {
    const mappedProfile: DoiProfile = {
      ...profile,
      metadata: {
        ...profile.metadata,
        creators: [{ ...profile.metadata.creators[0], name: createDefaultBinding('item.value') }],
        subjects: [{ sourcePath: 'metadata.keyword', subject: createDefaultBinding('item.value') }],
        dates: [{
          sourcePath: 'metadata.collected',
          date: { kind: 'handlebars', template: '{{formatDate item.value "yyyy-MM-dd"}}' },
          dateType: createDefaultBinding('', 'Collected')
        }]
      }
    };
    const mappedRecord = {
      metadata: {
        ...record.metadata,
        creators: ['Example Group', null],
        keyword: 'frogs',
        collected: [new Date('2024-03-04T12:00:00.000Z')]
      }
    };

    const payload = (await buildDoiPayload(mappedRecord as never, 'oid-1', mappedProfile, 'update', undefined)) as {
      data: { attributes: Record<string, unknown> };
    };

    expect(payload.data.attributes.creators).to.deep.equal([{ name: 'Example Group' }]);
    expect(payload.data.attributes.subjects).to.deep.equal([{ subject: 'frogs' }]);
    expect(payload.data.attributes.dates).to.deep.equal([{ date: '2024-03-04', dateType: 'Collected' }]);
  });

  it('omits the event from validation error summaries when none is sent', async function () {
    const invalidRecord = { metadata: { ...record.metadata, url: 'not a url' } };

    try {
      await buildDoiPayload(invalidRecord as never, 'oid-1', profile, 'update', undefined);
      expect.fail('expected a validation error');
    } catch (error) {
      const validationError = error as { requestSummary?: Record<string, unknown>; displayErrors?: Array<{ meta?: Record<string, unknown> }> };
      expect(validationError.requestSummary).to.include({ action: 'update' });
      expect(validationError.requestSummary).to.not.have.property('event');
      expect(validationError.displayErrors?.[0].meta).to.not.have.property('event');
    }
  });
});
