import { text, flag, number, list, object, dictionary } from './IntegrationSchemas';
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

// Keep name normalization in the configurable default bindings. Meaningful full
// names win; each name part prefers camelCase and falls back to snake_case.
function defaultCreatorNameBinding(value: string): OniValueBinding {
  return {
    kind: 'jsonata',
    expression: `(
      $clean := function($value) {
        $type($value) = "string" ? (
          $trimmed := $trim($value);
          $contains($trimmed, /\\b(undefined|null)\\b/i) ? "" : $trimmed
        ) : ""
      };
      $givenName := $clean(item.givenName) ? $clean(item.givenName) : $clean(item.given_name);
      $familyName := $clean(item.familyName) ? $clean(item.familyName) : $clean(item.family_name);
      $fullName := $clean(item.text_full_name);
      $name := $fullName ? $fullName : $trim($givenName & " " & $familyName);
      ${value}
    )`,
  };
}

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

export interface OniIngestionConfig {
  enabled: boolean;
  apiUrl: string;
  adminToken: string;
  forceReindex: boolean;
  pollIntervalMs: number;
  timeoutMs: number;
}

export interface OniPublishingSiteConfig {
  enabled: boolean;
  label: string;
  publicUrl: string;
  useCleanUrl: boolean;
  storage: OniSiteStorageConfig;
  ingestion?: OniIngestionConfig;
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
      ingestion: {
        enabled: false,
        apiUrl: 'http://localhost:8080',
        adminToken: '',
        // Enable only when Oni requires a complete structural and search index rebuild.
        forceReindex: false,
        pollIntervalMs: 500,
        timeoutMs: 120_000,
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
      ingestion: {
        enabled: false,
        apiUrl: 'http://localhost:8080',
        adminToken: '',
        // Enable only when Oni requires a complete structural and search index rebuild.
        forceReindex: false,
        pollIntervalMs: 500,
        timeoutMs: 120_000,
      },
    },
  };
  mapping: OniDatasetMappingConfig = {
    rootDataset: [
      {
        property: 'conformsTo',
        value: {
          kind: 'path',
          path: 'context.repositoryObjectProfile',
          defaultValue: { '@id': 'https://w3id.org/ldac/profile#Object' },
        },
      },
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
        // Retain existing full-name identifiers; derive one only for the newly
        // supported name-only shapes, after the established ORCID/email priority.
        id: defaultCreatorNameBinding(
          'item.orcid ? item.orcid : item.email ? item.email : $fullName ? item.text_full_name : $name'
        ),
        type: { kind: 'path', path: 'context.personType', defaultValue: 'Person' },
        fields: [
          { property: 'name', value: defaultCreatorNameBinding('$name') },
          { property: 'givenName', value: defaultCreatorNameBinding('$givenName') },
          { property: 'familyName', value: defaultCreatorNameBinding('$familyName') },
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

// Bindings retain their union fields and arbitrary defaults. No new defaults are injected by the editor.
const oniBindingSchema = object('value-binding', {
  kind: text('binding-kind', ['path', 'handlebars', 'jsonata']),
  path: text('path'), template: text('template'), expression: text('expression'), defaultValue: {},
}, ['kind']);
const oniFieldSchema = object('dataset-field', {
  property: text('property'), value: oniBindingSchema, omitEmpty: flag('omit-empty'),
  arrayMode: text('array-mode', ['preserve', 'wrap', 'first']),
}, ['property', 'value']);

export const ONI_PUBLISHING_SCHEMA = object('oni-publishing', {
  enabled: flag('enabled'), defaultSite: text('default-site'),
  rootCollection: object('root-collection', {
    targetRepoNamespace: text('target-repo-namespace'), rootCollectionId: text('root-collection-id'),
    targetRepoColId: text('target-repo-collection-id'), targetRepoColName: text('target-repo-collection-name'),
    targetRepoColDescription: text('target-repo-collection-description'), dsType: list('dataset-types', text('type')),
    enableDatasetToUseDefaultLicense: flag('use-default-license'),
    defaultLicense: object('default-license', {
      '@id': text('id'), '@type': text('type'), name: text('name'), description: text('description'),
    }),
  }),
  metadata: object('ro-crate-metadata-mapping', {
    jsonldFilename: text('jsonld-filename'),
    organization: object('organization', {
      '@id': text('id'), '@type': text('type'), identifier: text('identifier'), name: text('name'),
    }),
    defaultIriPrefs: object('default-iri-prefixes', {
      about: dictionary('about', text('iri-prefix')),
      spatialCoverage: text('spatial-coverage'), funder: text('funder'), license: text('license'),
      citation: text('citation'), contact: text('contact'), location: text('location'),
    }),
  }),
  mapping: object('ro-crate-dataset-mapping', {
    rootDataset: list('root-dataset', oniFieldSchema),
    graphEntities: list('graph-entities', object('graph-entity', {
      id: { ...oniBindingSchema, title: 'admin-config-label-id' }, type: { ...oniBindingSchema, title: 'admin-config-label-type' }, sourcePath: text('source-path'),
      itemMode: text('item-mode', ['single', 'array']), fields: list('fields', oniFieldSchema),
      linkToDataset: object('link-to-dataset', { property: text('property'), mode: text('mode', ['append', 'set']) }),
      omitIfEmpty: flag('omit-if-empty'),
    }, ['id', 'type', 'fields'])),
    context: dictionary('context', {}),
    validation: object('validation', { requiredRootFields: list('required-root-fields', text('field')) }),
  }),
  selection: object('attachment-selection', {
    dataRecordOidPath: text('data-record-oid-path'), dataLocationsPath: text('data-locations-path'),
    metadataOnlyPath: text('metadata-only-path'), selectedFlagPath: text('selected-flag-path'),
    attachmentMode: text('attachment-mode', ['selectedOnly', 'all']), logicalPathTemplate: text('logical-path-template'),
  }),
  writeBack: object('record-write-back', {
    citationUrlPath: text('citation-url-path'), citationDoiPath: text('citation-doi-path'),
    publicationErrorPath: text('publication-error-path'), doiUrlPlaceholder: text('doi-url-placeholder'),
  }),
  sites: dictionary('publishing-sites', object('publishing-site', {
    enabled: flag('enabled'), label: text('label'), publicUrl: text('public-url'), useCleanUrl: flag('use-clean-url'),
    storage: object('storage', {
      driver: text('driver', ['flydrive']), diskName: text('disk-name'), prefix: text('prefix'),
      rootPath: text('root-path'), workspacePath: text('workspace-path'), tempDir: text('temp-dir'),
      keyEncoding: text('key-encoding', ['flydrive', 'raw']),
    }),
    ingestion: object('ingestion', {
      enabled: flag('enabled'), apiUrl: text('api-url'), adminToken: text('admin-token'),
      forceReindex: flag('force-reindex'), pollIntervalMs: number('poll-interval-ms'), timeoutMs: number('timeout-ms'),
    }),
  })),
}, ['enabled', 'defaultSite', 'rootCollection', 'metadata', 'mapping', 'selection', 'writeBack', 'sites']);
