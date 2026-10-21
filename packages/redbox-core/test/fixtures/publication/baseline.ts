import { FigsharePublishing, type FigsharePublishingConfigData } from '../../../src/configmodels/FigsharePublishing';
import { OniPublishing } from '../../../src/configmodels/OniPublishing';
import type { RecordModel } from '../../../src/model/storage/RecordModel';

/** Deliberately distinct creator and approver; no real institution data. */
export function baselineRecord(): RecordModel {
  const access = { view: [], edit: [], viewRoles: [], editRoles: [], viewPending: [], editPending: [] };
  return {
    redboxOid: 'publication-baseline',
    id: 'publication-baseline',
    harvestId: '',
    dateCreated: '2026-01-02T03:04:05.000Z',
    lastSaveDate: '2026-01-02T03:04:05.000Z',
    metaMetadata: {
      brandId: 'default',
      createdBy: 'creator',
      createdOn: '2026-01-02T03:04:05.000Z',
      type: 'dataPublication',
      searchCore: 'default',
      form: '',
      attachmentFields: [],
    },
    workflow: { stage: 'queued', stageLabel: 'Queued' },
    authorization: { ...access, stored: { ...access } },
    metadata: {
      title: 'Coastal observations',
      description: 'Hourly measurements & methods',
      keywords: ['coast', 'ocean'],
      finalKeywords: ['coast', 'ocean'],
      license: 1,
      forCodes: ['0101'],
      dataRecord: { oid: 'data-baseline' },
      creators: [
        {
          email: 'creator@example.test',
          given_name: 'Ada',
          family_name: 'Lovelace',
          orcid: 'https://orcid.org/0000-0002-1825-0097',
        },
      ],
      contributor_data_manager: { email: 'manager@example.test', text_full_name: 'Data Manager' },
      dataLocations: [
        { type: 'attachment', selected: true, fileId: 'file-1', name: 'observations.csv' },
        { type: 'attachment', selected: false, fileId: 'file-2', name: 'private.csv' },
      ],
      citation_doi: 'https://doi.org/10.1234/{ID_WILL_BE_HERE}',
    },
  };
}
export function baselineFigshare() {
  const config: FigsharePublishingConfigData = new FigsharePublishing();
  config.metadata.title = { kind: 'path', path: 'metadata.title' };
  config.metadata.description = { kind: 'handlebars', template: '{{metadata.description}}' };
  config.metadata.keywords = { kind: 'jsonata', expression: 'metadata.keywords' };
  config.metadata.license.source = { kind: 'path', path: 'metadata.license' };
  config.metadata.categories.source = { kind: 'path', path: 'metadata.forCodes' };
  config.metadata.customFields = [
    { figshareField: 'Empty preserved', value: { kind: 'path', path: 'metadata.absent', defaultValue: '' } },
  ];
  config.categories.mappingTable = [{ sourceCode: '0101', figshareCategoryId: 10 }];
  return config;
}
export function baselineOni() {
  const config = new OniPublishing();
  config.sites.public.publicUrl = 'https://repository.example.test';
  config.sites.public.useCleanUrl = true;
  return config;
}
