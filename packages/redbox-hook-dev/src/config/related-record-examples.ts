import type { DoiProfile, NamedQueryConfig, RecordHookDefinition } from '@researchdatabox/redbox-core';
import type { RelatedMetadataRequest } from '@researchdatabox/sails-ng-common';

export const relatedPlanRequest: RelatedMetadataRequest = {
  relations: [{ relationId: 'primaryActivity' }, { relationId: 'activities' }],
};

// Deliberately false even if the installation has enabled outbound email.
// Tests may clone these options, override the condition and mock delivery.
export const relatedPlanEmail: RecordHookDefinition = {
  function: 'sails.services.emailservice.sendRecordNotification',
  options: {
    triggerCondition: '<%= false %>',
    relatedMetadata: relatedPlanRequest,
    to: 'related-plan@example.invalid',
    subject: 'Plan: {{record.metadata.title}} — {{record.relatedMetadata.primaryActivity.records.0.metadata.title}}',
    template: 'relatedPlanExample',
  },
};
export const relatedPlanDoi: RecordHookDefinition = {
  function: 'sails.services.doiservice.publishDoiTrigger',
  options: {
    triggerCondition: '<%= false %>',
    profile: 'related-plan',
    event: 'draft',
    relatedMetadata: relatedPlanRequest,
  },
};
export const relatedPlanDoiProfile: DoiProfile = {
  enabled: false,
  label: 'Related plan example (mock DataCite only)',
  metadata: {
    url: { kind: 'handlebars', template: 'https://example.invalid/plans/{{oid}}' },
    publisher: { kind: 'handlebars', template: 'Generic example publisher' },
    publicationYear: {
      kind: 'jsonata',
      expression: '$substring(record.relatedMetadata.primaryActivity.records[0].metadata.startDate, 0, 4)',
    },
    creators: [],
    titles: [
      { title: { kind: 'path', path: 'record.metadata.title' } },
      { sourcePath: 'relatedMetadata.activities.records', title: { kind: 'path', path: 'item.metadata.title' } },
    ],
    dates: [
      {
        sourcePath: 'relatedMetadata.activities.records',
        date: { kind: 'path', path: 'item.metadata.startDate' },
        dateType: { kind: 'handlebars', template: 'Other' },
      },
    ],
    types: { resourceTypeGeneral: { kind: 'handlebars', template: 'Other' } },
  },
  writeBack: { citationUrlPath: 'metadata.citationUrl', citationDoiPath: 'metadata.doi' },
  validation: {
    requireUrl: true,
    requirePublisher: true,
    requirePublicationYear: true,
    requireCreators: false,
    requireTitles: true,
  },
};

// Pass as options to PDFService.createPDF(oid, plan, options, user).
// Operation-scoped: a global wait would break unchanged forms without a marker.
export const relatedPlanPdf = {
  waitForRelatedData: true,
  readinessTimeout: 60000,
  readinessStrategy: 'networkIdle' as const,
};

export const namedQuery: Partial<NamedQueryConfig> = {
  queries: {
    relatedPlansByActivityDate: {
      collectionName: 'record',
      brandIdFieldPath: 'metaMetadata.brandId',
      mongoQuery: { 'metaMetadata.type': 'related-plan' },
      resultObjectMapping: { oid: 'redboxOid', title: 'metadata.title' },
      sort: [{ 'metadata.title': 'ASC' }],
      relatedRecordFilters: [
        {
          rootRecordType: 'related-plan',
          relationId: 'activities',
          // ISO yyyy-mm-dd source strings match the activity date input format.
          mongoQuery: { 'metadata.startDate': null },
        },
      ],
      queryParams: {
        fromDate: {
          type: 'string',
          path: 'metadata.startDate',
          queryType: '>=',
          whenUndefined: 'defaultValue',
          defaultValue: '2026-01-01',
        },
      },
    },
  },
};
