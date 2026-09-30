import { expect } from 'chai';
import { OniPublishing } from '../../../src/configmodels/OniPublishing';
import type { AnyRecord } from '../../../src/services/oni-v2/types';
import {
  applyCitationWriteBack,
  applyPublicationError,
  buildDatasetUrl,
  buildOniRoCrate,
  generateArcpId,
  getDataRecordOid,
  getLicense,
  getPerson,
  getSelectedAttachments,
} from '../../../src/services/oni-v2/crate';

describe('Oni default creator mapping', () => {
  async function buildCreators(creators: AnyRecord[], publishing = new OniPublishing()) {
    const result = await buildOniRoCrate({
      config: publishing,
      site: publishing.sites.public,
      siteName: 'public',
      oid: 'creator-mapping-publication',
      record: {
        metadata: { title: 'Creator mapping regression', dataRecord: { oid: 'data-1' }, creators },
      },
      creator: {},
      approver: {},
    });
    // Inspect the serialized artifact that is written to OCFL, including omitted values.
    const graph: AnyRecord[] = JSON.parse(JSON.stringify(result.crateJson))['@graph'];
    return {
      graph,
      root: graph.find(entity => entity['@id'] === result.rootId)!,
      people: graph.filter(entity => entity['@type'] === 'Person'),
    };
  }

  it('writes publication snake_case names alongside the existing ORCID identity and affiliation', async () => {
    const publishing = new OniPublishing();
    const { root, people } = await buildCreators(
      [
        {
          given_name: ' Amelia ',
          family_name: ' Hartwell ',
          orcid: 'https://orcid.org/0000-0002-1825-0097',
          email: 'amelia@example.test',
        },
      ],
      publishing
    );

    expect(people).to.have.length(1);
    expect(people[0]).to.deep.include({
      '@id': 'https://orcid.org/0000-0002-1825-0097',
      '@type': 'Person',
      name: 'Amelia Hartwell',
      givenName: 'Amelia',
      familyName: 'Hartwell',
      email: 'amelia@example.test',
      affiliation: publishing.metadata.organization,
    });
    expect(root.author).to.deep.equal([{ '@id': 'https://orcid.org/0000-0002-1825-0097' }]);
  });

  const nameCases: Array<{ label: string; input: AnyRecord; expected: AnyRecord }> = [
    {
      label: 'explicit full name before given and family names',
      input: { text_full_name: '  Dr. Ada   Lovelace ', name: 'Other Name', givenName: 'Augusta', familyName: 'King' },
      expected: { name: 'Dr. Ada Lovelace', givenName: 'Augusta', familyName: 'King' },
    },
    {
      label: 'camelCase names before snake_case names',
      input: { givenName: ' Ada ', familyName: ' Lovelace ', given_name: 'Other', family_name: 'Person' },
      expected: { name: 'Ada Lovelace', givenName: 'Ada', familyName: 'Lovelace' },
    },
    {
      label: 'blank full and camelCase names falling back to snake_case',
      input: {
        text_full_name: ' ',
        givenName: ' ',
        familyName: null,
        given_name: ' Amelia ',
        family_name: ' Hartwell ',
      },
      expected: { name: 'Amelia Hartwell', givenName: 'Amelia', familyName: 'Hartwell' },
    },
    {
      label: 'given name alone',
      input: { given_name: ' Amelia ', family_name: null },
      expected: { name: 'Amelia', givenName: 'Amelia' },
    },
    {
      label: 'family name alone',
      input: { givenName: undefined, familyName: ' Hartwell ' },
      expected: { name: 'Hartwell', familyName: 'Hartwell' },
    },
    {
      label: 'null and undefined text placeholders',
      input: { text_full_name: ' null ', givenName: 'undefined', familyName: ' NULL ', given_name: ' Amelia ' },
      expected: { name: 'Amelia', givenName: 'Amelia' },
    },
    {
      label: 'an explicit full name containing an undefined placeholder',
      input: { text_full_name: 'Amelia undefined', given_name: 'Amelia', family_name: 'Hartwell' },
      expected: { name: 'Amelia Hartwell', givenName: 'Amelia', familyName: 'Hartwell' },
    },
    {
      label: 'an explicit full name containing mixed-case null placeholders',
      input: { text_full_name: 'uNdEfInEd\tNULL', givenName: 'Amelia', familyName: 'Hartwell' },
      expected: { name: 'Amelia Hartwell', givenName: 'Amelia', familyName: 'Hartwell' },
    },
    {
      label: 'placeholder substrings within meaningful names',
      input: { text_full_name: 'Ann Nullman', givenName: 'Ann', familyName: 'Nullman' },
      expected: { name: 'Ann Nullman', givenName: 'Ann', familyName: 'Nullman' },
    },
    {
      label: 'blank names without losing an identified contributor',
      input: { text_full_name: null, given_name: ' ', family_name: undefined },
      expected: {},
    },
  ];

  for (const { label, input, expected } of nameCases) {
    it(`handles ${label}`, async () => {
      const { people } = await buildCreators([{ ...input, email: 'creator@example.test' }]);
      expect(people).to.have.length(1);
      expect(people[0]['@id']).to.equal('creator@example.test');
      for (const property of ['name', 'givenName', 'familyName']) {
        if (property in expected) {
          expect(people[0][property], property).to.equal(expected[property]);
        } else {
          expect(people[0], property).not.to.have.property(property);
        }
      }
    });
  }

  it('preserves creator order and uses names as stable identifiers only without ORCID or email', async () => {
    const creators = [
      {
        orcid: 'https://orcid.org/0000-0002-1825-0097',
        email: 'amelia@example.test',
        given_name: 'Amelia',
        family_name: 'Hartwell',
      },
      { email: 'ada@example.test', givenName: 'Ada', familyName: 'Lovelace' },
      { text_full_name: 'Grace Hopper' },
      { given_name: 'Katherine', family_name: 'Johnson' },
      { family_name: 'Noether' },
      { text_full_name: ' ', given_name: null },
    ];
    const expectedIds = [
      'https://orcid.org/0000-0002-1825-0097',
      'ada@example.test',
      'Grace Hopper',
      'Katherine Johnson',
      'Noether',
    ];
    const first = await buildCreators(creators);
    const second = await buildCreators(creators);
    expect(first.people.map(person => person['@id'])).to.deep.equal(expectedIds);
    expect(first.root.author).to.deep.equal(expectedIds.map(id => ({ '@id': id })));
    expect(second.root.author).to.deep.equal(first.root.author);
  });

  it('continues to honor custom creator identity and name bindings', async () => {
    const publishing = new OniPublishing();
    const mapping = publishing.mapping.graphEntities.find(entry => entry.sourcePath === 'metadata.creators')!;
    mapping.id = { kind: 'path', path: 'item.customId' };
    mapping.fields.find(field => field.property === 'name')!.value = { kind: 'path', path: 'item.customName' };
    const { root, people } = await buildCreators(
      [
        {
          customId: 'custom:author-1',
          customName: 'Institutional Author',
          given_name: 'Amelia',
          family_name: 'Hartwell',
        },
      ],
      publishing
    );
    expect(people[0]).to.deep.include({ '@id': 'custom:author-1', name: 'Institutional Author' });
    expect(root.author).to.deep.equal([{ '@id': 'custom:author-1' }]);
  });

  it('preserves legacy full-name identifiers while cleaning their display names', async () => {
    const { root, people } = await buildCreators([{ text_full_name: '  Grace   Hopper  ' }]);
    expect(people[0]).to.deep.include({ '@id': '  Grace   Hopper  ', name: 'Grace Hopper' });
    expect(root.author).to.deep.equal([{ '@id': '  Grace   Hopper  ' }]);
  });
});

const config: any = {
  rootCollection: {
    targetRepoNamespace: 'repo.example',
    enableDatasetToUseDefaultLicense: true,
    defaultLicense: { '@id': 'https://license.example/default', '@type': 'CreativeWork' },
  },
  writeBack: {
    citationUrlPath: 'metadata.citation.url',
    citationDoiPath: 'metadata.citation.doi',
    publicationErrorPath: 'metaMetadata.publication.error',
    doiUrlPlaceholder: '{{datasetUrl}}',
  },
  selection: {
    dataRecordOidPath: 'metadata.dataRecordOid',
    metadataOnlyPath: 'metadata.metadataOnly',
    dataLocationsPath: 'metadata.dataLocations',
    attachmentMode: 'selected',
    selectedFlagPath: 'selected',
    logicalPathTemplate: 'files/{{fileId}}/{{name}}',
  },
  metadata: { defaultIriPrefs: { license: 'https://license.example/' } },
};

describe('Oni crate helpers', () => {
  it('builds clean and ARCP dataset URLs', () => {
    expect(generateArcpId('repo.example', 'oid 1')).to.equal('arcp://name,repo.example/oid 1');
    expect(buildDatasetUrl(config, 'https://site.example/', true, 'oid 1')).to.equal(
      'https://site.example/oid%201'
    );
    const legacy = buildDatasetUrl(config, 'https://site.example/', false, 'oid 1');
    expect(legacy).to.include('/object?id=arcp%3A%2F%2Fname%2Crepo.example%2Foid%201');
    expect(legacy).to.include('_crateId=');
  });

  it('writes citation data and publication failures', () => {
    const record: any = {
      metadata: { citation: { doi: 'doi:{{datasetUrl}}' }, dataRecordOid: ' data-1 ' },
      metaMetadata: { publication: { error: 'old' } },
    };
    applyCitationWriteBack(record, config, 'https://site.example/data-1');
    expect(record.metadata.citation).to.deep.equal({
      url: 'https://site.example/data-1',
      doi: 'doi:https://site.example/data-1',
    });
    expect(record.metaMetadata.publication).not.to.have.property('error');
    expect(getDataRecordOid(record, config)).to.equal('data-1');

    applyPublicationError(record, config, new TypeError('broken'));
    expect(record.metaMetadata.publication.error).to.equal(
      'Data publication failed with error: TypeError broken'
    );
  });

  it('selects valid attachments and honors metadata-only mode', () => {
    const record: any = {
      metadata: {
        dataLocations: [
          { type: 'attachment', selected: 'yes', fileId: 'file-1', name: 'report.pdf' },
          { type: 'attachment', selected: false, fileId: 'file-2', name: 'skip.txt' },
          { type: 'url', selected: true, location: 'https://example.test' },
        ],
      },
    };
    const attachments = getSelectedAttachments(record, config);
    expect(attachments).to.have.length(1);
    expect(attachments[0]).to.deep.include({
      fileId: 'file-1',
      name: 'report.pdf',
      logicalPath: 'files/file-1/report.pdf',
      source: record.metadata.dataLocations[0],
      encodingFormat: 'application/pdf',
    });
    record.metadata.metadataOnly = 1;
    expect(getSelectedAttachments(record, config)).to.deep.equal([]);
  });

  it('maps people and license variants', () => {
    expect(getPerson({ orcid: '0000-0001', text_full_name: 'Ada Lovelace', email: 'ada@example.test' }, 'Person'))
      .to.deep.include({ '@id': '0000-0001', '@type': 'Person', name: 'Ada Lovelace' });
    expect(getPerson({}, 'Person')).to.equal(undefined);

    expect(getLicense({
      license_other_url: 'https://license.example/custom',
      license_notes: 'Custom',
      license_identifier: 'https://license.example/id',
      accessRights_url: 'https://rights.example',
    }, config)).to.have.length(3);
    expect(getLicense({}, config)).to.deep.equal([config.rootCollection.defaultLicense]);
  });
});
