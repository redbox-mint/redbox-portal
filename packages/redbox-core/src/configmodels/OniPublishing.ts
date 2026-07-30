import { AppConfig } from './AppConfig.interface';

export interface OniPublishingLicense {
  '@id': string;
  '@type': string;
  name: string;
  description?: string;
}

export interface OniRootCollectionConfig {
  targetRepoNamespace: string;
  rootCollectionId: string;
  targetRepoColId: string;
  targetRepoColName: string;
  targetRepoColDescription: string;
  dsType: string[];
  enableDatasetToUseDefaultLicense: boolean;
  defaultLicense: OniPublishingLicense;
}

export interface OniOrganizationConfig {
  '@id': string;
  '@type': string;
  identifier: string;
  name: string;
}

export interface OniDefaultIriPrefs {
  about: Record<string, string>;
  spatialCoverage: string;
  funder: string;
  license: string;
  citation: string;
  contact: string;
  location: string;
}

export type OniBindingKind = 'path' | 'handlebars' | 'jsonata';

export type OniValueBinding =
  | { kind: 'path'; path: string; defaultValue?: unknown }
  | { kind: 'handlebars'; template: string; defaultValue?: unknown }
  | { kind: 'jsonata'; expression: string; defaultValue?: unknown };

export interface OniDatasetFieldMapping {
  property: string;
  value: OniValueBinding;
  omitEmpty?: boolean;
  arrayMode?: 'preserve' | 'wrap' | 'first';
}

export interface OniGraphEntityMapping {
  id: OniValueBinding;
  type: OniValueBinding;
  sourcePath?: string;
  itemMode?: 'single' | 'array';
  fields: OniDatasetFieldMapping[];
  linkToDataset?: {
    property: string;
    mode?: 'append' | 'set';
  };
  omitIfEmpty?: boolean;
}

export interface OniDatasetMappingConfig {
  rootDataset: OniDatasetFieldMapping[];
  graphEntities: OniGraphEntityMapping[];
  context?: Record<string, unknown>;
  validation?: {
    requiredRootFields: string[];
  };
}

export interface OniMetadataConfig {
  jsonldFilename: string;
  organization: OniOrganizationConfig;
  defaultIriPrefs: OniDefaultIriPrefs;
}

export interface OniSelectionConfig {
  dataRecordOidPath: string;
  dataLocationsPath: string;
  metadataOnlyPath: string;
  selectedFlagPath: string;
  attachmentMode: 'selectedOnly' | 'all';
  logicalPathTemplate: string;
}

export interface OniWriteBackConfig {
  citationUrlPath: string;
  citationDoiPath: string;
  publicationErrorPath: string;
  doiUrlPlaceholder: string;
}

export interface OniFlydriveStorageConfig {
  driver: 'flydrive';
  diskName: string;
  prefix: string;
  rootPath: string;
  workspacePath: string;
  tempDir: string;
  keyEncoding?: 'flydrive' | 'raw';
}

export type OniSiteStorageConfig = OniFlydriveStorageConfig;

export interface OniPublishingSiteConfig {
  enabled: boolean;
  label: string;
  publicUrl: string;
  useCleanUrl: boolean;
  storage: OniSiteStorageConfig;
}

export interface OniPublishingConfigData {
  enabled: boolean;
  defaultSite: string;
  rootCollection: OniRootCollectionConfig;
  metadata: OniMetadataConfig;
  selection: OniSelectionConfig;
  writeBack: OniWriteBackConfig;
  sites: Record<string, OniPublishingSiteConfig>;
  mapping: OniDatasetMappingConfig;
}

export class OniPublishing extends AppConfig implements OniPublishingConfigData {
  enabled = true;
  defaultSite = 'public';
  rootCollection: OniRootCollectionConfig = {
    targetRepoNamespace: 'uts_public_data_repo',
    rootCollectionId: 'arcp://name,data_repo/root_collection',
    targetRepoColId: 'root_collection',
    targetRepoColName: '',
    targetRepoColDescription:
      'This is a sample data portal. For any questions, please get in touch with us at info@redboxresearchdata.com.au',
    dsType: ['Dataset', 'RepositoryCollection'],
    enableDatasetToUseDefaultLicense: true,
    defaultLicense: {
      '@id': 'http://creativecommons.org/licenses/by/4.0',
      '@type': 'OrganizationReuseLicense',
      name: 'Attribution 4.0 International (CC BY 4.0)',
      description:
        'You are free to share (copy and redistribute the material in any medium or format) and adapt (remix, transform and build upon the material for any purpose, even commercially).',
    },
  };
  metadata: OniMetadataConfig = {
    jsonldFilename: 'ro-crate-metadata.json',
    organization: {
      '@id': 'https://www.redboxresearchdata.com.au',
      '@type': 'Organization',
      identifier: 'https://www.redboxresearchdata.com.au',
      name: 'ReDBox Research Data',
    },
    defaultIriPrefs: {
      about: {
        'dc:subject_anzsrc:for': '_:FOR/',
        'dc:subject_anzsrc:seo': '_:SEO/',
      },
      spatialCoverage: '_:spatial/',
      funder: '_:funder/',
      license: '_:license/',
      citation: '_:citation/',
      contact: '_:contact/',
      location: '_:location/',
    },
  };
  selection: OniSelectionConfig = {
    dataRecordOidPath: 'metadata.dataRecord.oid',
    dataLocationsPath: 'metadata.dataLocations',
    metadataOnlyPath: 'metadata.accessRightsToggle',
    selectedFlagPath: 'selected',
    attachmentMode: 'selectedOnly',
    logicalPathTemplate: 'files/{{fileId}}/{{name}}',
  };
  writeBack: OniWriteBackConfig = {
    citationUrlPath: 'metadata.citation_url',
    citationDoiPath: 'metadata.citation_doi',
    publicationErrorPath: 'metadata.publication_error',
    doiUrlPlaceholder: '{ID_WILL_BE_HERE}',
  };
  sites: Record<string, OniPublishingSiteConfig> = {
    staging: {
      enabled: true,
      label: 'Staging OCFL',
      publicUrl: 'http://localhost:11000',
      useCleanUrl: false,
      storage: {
        driver: 'flydrive',
        diskName: 'primary',
        prefix: 'ocfl/staged',
        rootPath: '/ocfl/staged',
        workspacePath: '/ocfl-work/staged',
        tempDir: '/tmp/oni/staged',
        keyEncoding: 'flydrive',
      },
    },
    public: {
      enabled: true,
      label: 'Public OCFL',
      publicUrl: 'http://localhost:11000/publication',
      useCleanUrl: false,
      storage: {
        driver: 'flydrive',
        diskName: 'primary',
        prefix: 'ocfl/public',
        rootPath: '/ocfl/public',
        workspacePath: '/ocfl-work/public',
        tempDir: '/tmp/oni/public',
        keyEncoding: 'flydrive',
      },
    },
  };
  mapping: OniDatasetMappingConfig = {
    rootDataset: [
      { property: 'name', value: { kind: 'path', path: 'metadata.title' } },
      { property: 'description', value: { kind: 'path', path: 'metadata.description' } },
      { property: 'dateCreated', value: { kind: 'path', path: 'metaMetadata.createdOn' } },
      { property: 'keywords', value: { kind: 'path', path: 'metadata.finalKeywords' } },
      { property: 'publisher', value: { kind: 'path', path: 'organization' } },
      { property: 'license', value: { kind: 'path', path: 'license' } },
      { property: 'temporalCoverage', value: { kind: 'path', path: 'temporalCoverage' } },
      { property: 'spatialCoverage', value: { kind: 'path', path: 'spatialCoverage' } },
    ],
    graphEntities: [
      {
        sourcePath: 'metadata.creators',
        itemMode: 'array',
        id: { kind: 'jsonata', expression: 'item.orcid ? item.orcid : item.email ? item.email : item.text_full_name' },
        type: { kind: 'path', path: 'context.personType', defaultValue: 'Person' },
        fields: [
          { property: 'name', value: { kind: 'path', path: 'item.text_full_name' } },
          { property: 'givenName', value: { kind: 'path', path: 'item.givenName' } },
          { property: 'familyName', value: { kind: 'path', path: 'item.familyName' } },
          { property: 'email', value: { kind: 'path', path: 'item.email' } },
          { property: 'affiliation', value: { kind: 'path', path: 'organization' } },
        ],
        linkToDataset: { property: 'author' },
      },
      {
        sourcePath: 'metadata.related_publications',
        itemMode: 'array',
        id: { kind: 'path', path: 'item.related_url' },
        type: { kind: 'path', path: 'context.relatedPublicationType', defaultValue: 'ScholarlyArticle' },
        fields: [
          { property: 'name', value: { kind: 'path', path: 'item.related_title' } },
          { property: 'identifier', value: { kind: 'path', path: 'item.related_url' } },
          { property: 'description', value: { kind: 'path', path: 'item.related_notes' } },
        ],
        linkToDataset: { property: 'publications' },
      },
      {
        sourcePath: 'metadata.related_websites',
        itemMode: 'array',
        id: { kind: 'path', path: 'item.related_url' },
        type: { kind: 'path', path: 'context.relatedWebsiteType', defaultValue: 'WebSite' },
        fields: [
          { property: 'name', value: { kind: 'path', path: 'item.related_title' } },
          { property: 'identifier', value: { kind: 'path', path: 'item.related_url' } },
          { property: 'description', value: { kind: 'path', path: 'item.related_notes' } },
        ],
        linkToDataset: { property: 'websites' },
      },
      {
        sourcePath: 'metadata.related_metadata',
        itemMode: 'array',
        id: { kind: 'path', path: 'item.related_url' },
        type: { kind: 'path', path: 'context.relatedMetadataType', defaultValue: 'CreativeWork' },
        fields: [
          { property: 'name', value: { kind: 'path', path: 'item.related_title' } },
          { property: 'identifier', value: { kind: 'path', path: 'item.related_url' } },
          { property: 'description', value: { kind: 'path', path: 'item.related_notes' } },
        ],
        linkToDataset: { property: 'metadata' },
      },
      {
        sourcePath: 'metadata.related_data',
        itemMode: 'array',
        id: { kind: 'path', path: 'item.related_url' },
        type: { kind: 'path', path: 'context.relatedDataType', defaultValue: 'Dataset' },
        fields: [
          { property: 'name', value: { kind: 'path', path: 'item.related_title' } },
          { property: 'identifier', value: { kind: 'path', path: 'item.related_url' } },
          { property: 'description', value: { kind: 'path', path: 'item.related_notes' } },
        ],
        linkToDataset: { property: 'data' },
      },
      {
        sourcePath: 'metadata.related_services',
        itemMode: 'array',
        id: { kind: 'path', path: 'item.related_url' },
        type: { kind: 'path', path: 'context.relatedServiceType', defaultValue: 'CreativeWork' },
        fields: [
          { property: 'name', value: { kind: 'path', path: 'item.related_title' } },
          { property: 'identifier', value: { kind: 'path', path: 'item.related_url' } },
          { property: 'description', value: { kind: 'path', path: 'item.related_notes' } },
        ],
        linkToDataset: { property: 'services' },
      },
      {
        sourcePath: 'metadata.foaf:fundedBy_foaf:Agent',
        itemMode: 'array',
        id: {
          kind: 'jsonata',
          expression: '($id := $trim($string(item.dc_identifier[0])); $id ? context.funderIriPrefix & $id : "")',
        },
        type: { kind: 'path', path: 'context.organizationType', defaultValue: 'Organization' },
        fields: [
          { property: 'name', value: { kind: 'path', path: 'item.dc_title' } },
          {
            property: 'identifier',
            value: { kind: 'handlebars', template: '{{context.funderIriPrefix}}{{item.dc_identifier.[0]}}' },
          },
        ],
        linkToDataset: { property: 'funder' },
      },
      {
        sourcePath: 'metadata.foaf:fundedBy_vivo:Grant',
        itemMode: 'array',
        id: {
          kind: 'jsonata',
          expression: '($id := $trim($string(item.dc_identifier[0])); $id ? context.funderIriPrefix & $id : "")',
        },
        type: { kind: 'path', path: 'context.organizationType', defaultValue: 'Organization' },
        fields: [
          { property: 'name', value: { kind: 'path', path: 'item.dc_title' } },
          {
            property: 'identifier',
            value: { kind: 'handlebars', template: '{{context.funderIriPrefix}}{{item.dc_identifier.[0]}}' },
          },
        ],
        linkToDataset: { property: 'funder' },
      },
      {
        sourcePath: 'metadata.dc:subject_anzsrc:for',
        itemMode: 'array',
        id: {
          kind: 'jsonata',
          expression:
            '($notation := $trim($string(item.notation)); $notation ? context.aboutForIriPrefix & $notation : "")',
        },
        type: { kind: 'path', path: 'context.structuredValueType', defaultValue: 'StructuredValue' },
        fields: [
          {
            property: 'url',
            value: { kind: 'handlebars', template: '{{context.aboutForIriPrefix}}{{item.notation}}' },
          },
          {
            property: 'identifier',
            value: { kind: 'handlebars', template: '{{context.aboutForIriPrefix}}{{item.notation}}' },
          },
          { property: 'name', value: { kind: 'path', path: 'item.name' } },
        ],
        linkToDataset: { property: 'about' },
      },
      {
        sourcePath: 'metadata.dc:subject_anzsrc:seo',
        itemMode: 'array',
        id: {
          kind: 'jsonata',
          expression:
            '($notation := $trim($string(item.notation)); $notation ? context.aboutSeoIriPrefix & $notation : "")',
        },
        type: { kind: 'path', path: 'context.structuredValueType', defaultValue: 'StructuredValue' },
        fields: [
          {
            property: 'url',
            value: { kind: 'handlebars', template: '{{context.aboutSeoIriPrefix}}{{item.notation}}' },
          },
          {
            property: 'identifier',
            value: { kind: 'handlebars', template: '{{context.aboutSeoIriPrefix}}{{item.notation}}' },
          },
          { property: 'name', value: { kind: 'path', path: 'item.name' } },
        ],
        linkToDataset: { property: 'about' },
      },
    ],
  };

  public static getFieldOrder(): string[] {
    return ['enabled', 'defaultSite', 'sites', 'rootCollection', 'metadata', 'mapping', 'selection', 'writeBack'];
  }
}

export const ONI_PUBLISHING_SCHEMA = {
  type: 'object',
  title: 'Oni Publishing',
  properties: {
    enabled: { type: 'boolean', title: 'Enabled', default: true },
    defaultSite: { type: 'string', title: 'Default Site', default: 'public' },
    rootCollection: { type: 'object', title: 'Root Collection' },
    metadata: { type: 'object', title: 'RO-Crate Metadata Mapping' },
    mapping: { type: 'object', title: 'RO-Crate Dataset Mapping' },
    selection: { type: 'object', title: 'Attachment Selection' },
    writeBack: { type: 'object', title: 'Record Write-back' },
    sites: {
      type: 'object',
      title: 'Publishing Sites',
      additionalProperties: {
        type: 'object',
        properties: {
          enabled: { type: 'boolean', title: 'Enabled' },
          label: { type: 'string', title: 'Label' },
          publicUrl: { type: 'string', title: 'Public URL' },
          useCleanUrl: { type: 'boolean', title: 'Use Clean URL' },
          storage: { type: 'object', title: 'Storage' },
        },
      },
    },
  },
  required: ['enabled', 'defaultSite', 'rootCollection', 'metadata', 'mapping', 'selection', 'writeBack', 'sites'],
};
