import {
  createDefaultBinding,
  DOI_PUBLISHING_SCHEMA,
  DoiPublishing,
  fromDoiPublishingFormModel,
  toDoiPublishingFormModel
} from '../../src/configmodels/DoiPublishing';

let expect!: Chai.ExpectStatic;

describe('DoiPublishing configuration', function () {
  before(async function () {
    ({ expect } = await import('chai'));
  });

  it('exposes array source settings for every simple metadata collection', function () {
    const metadata = DOI_PUBLISHING_SCHEMA.properties.profiles.items.properties.metadata.properties;
    const collections = [
      'titles', 'subjects', 'dates', 'alternateIdentifiers', 'relatedIdentifiers',
      'rightsList', 'descriptions', 'fundingReferences'
    ] as const;

    for (const collection of collections) {
      const properties = metadata[collection].items.properties;
      expect(properties.sourcePath.type, collection).to.equal('string');
      expect(properties.itemMode.enum, collection).to.deep.equal(['array']);
    }

    const relatedTitles = metadata.relatedItems.items.properties.titles.items.properties;
    expect(relatedTitles.sourcePath.type).to.equal('string');
    expect(relatedTitles.itemMode.enum).to.deep.equal(['array']);
  });

  it('preserves array source settings through the admin form adapter', function () {
    const config = new DoiPublishing();
    config.profiles = {
      dataPublication: {
        enabled: true,
        label: 'Data publication',
        metadata: {
          url: createDefaultBinding('record.url'),
          publicationYear: createDefaultBinding('record.year'),
          publisher: createDefaultBinding('record.publisher'),
          creators: [],
          titles: [{ title: createDefaultBinding('record.title') }],
          subjects: [{
            sourcePath: 'metadata.keywords',
            itemMode: 'array',
            subject: createDefaultBinding('item.value')
          }],
          descriptions: [{
            sourcePath: 'metadata.notes',
            itemMode: 'array',
            description: createDefaultBinding('item.text'),
            descriptionType: createDefaultBinding('', 'Other')
          }],
          types: { resourceTypeGeneral: createDefaultBinding('', 'Dataset') }
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
      }
    };

    const form = toDoiPublishingFormModel(config);
    expect(form.profiles[0].metadata.subjects?.[0].sourcePath).to.equal('metadata.keywords');
    expect(form.profiles[0].metadata.descriptions?.[0].itemMode).to.equal('array');

    const saved = fromDoiPublishingFormModel(form);
    expect(saved.profiles.dataPublication).to.deep.equal(config.profiles.dataPublication);
  });
});
