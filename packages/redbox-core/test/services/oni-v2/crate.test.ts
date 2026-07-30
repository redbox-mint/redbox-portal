import { expect } from 'chai';
import {
  applyCitationWriteBack,
  applyPublicationError,
  buildDatasetUrl,
  generateArcpId,
  getDataRecordOid,
  getLicense,
  getPerson,
  getSelectedAttachments,
} from '../../../src/services/oni-v2/crate';

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
