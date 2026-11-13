import { AppConfig } from './AppConfig.interface';

export type FigshareBindingKind = 'path' | 'handlebars' | 'jsonata' | 'crosswalk';
export type FigshareArticleItemType =
  | 'dataset'
  | 'fileset'
  | 'figure'
  | 'media'
  | 'poster'
  | 'paper'
  | 'presentation'
  | 'thesis'
  | 'code'
  | 'metadata';

export interface PathBinding {
  kind: 'path';
  path: string;
  defaultValue?: unknown;
}

export interface HandlebarsBinding {
  kind: 'handlebars';
  template: string;
  defaultValue?: unknown;
}

export interface JsonataBinding {
  kind: 'jsonata';
  expression: string;
  defaultValue?: unknown;
}

/** The binding kinds that read a value straight out of the evaluation target. */
export type SimpleValueBinding = PathBinding | HandlebarsBinding | JsonataBinding;

/** What a crosswalk binding emits for each resolved mapping. */
export type FigshareCrosswalkOutput = 'categoryId' | 'label' | 'sourceId';

/**
 * Resolves the codes produced by `source` through the approved revision of a
 * Figshare crosswalk. `source` is deliberately a simple binding: a crosswalk
 * never nests another crosswalk.
 */
export interface CrosswalkBinding {
  kind: 'crosswalk';
  source: SimpleValueBinding;
  sourceVocabularyId: string;
  crosswalkId: string;
  outputs: FigshareCrosswalkOutput;
  defaultValue?: unknown;
}

export type ValueBinding = SimpleValueBinding | CrosswalkBinding;

export interface LicenseBinding {
  source: ValueBinding;
  matchBy: 'urlContains' | 'nameExact' | 'valueExact';
  required: boolean;
}

export interface CategoryBinding {
  source: ValueBinding;
}

export interface RelatedResourceBinding {
  title: ValueBinding;
  doi: ValueBinding;
}

export interface CustomFieldValidation {
  type: 'maxLength' | 'url' | 'doi' | 'required';
  value?: number;
}

export interface CustomFieldBinding {
  figshareField: string;
  value: ValueBinding;
  validations?: CustomFieldValidation[];
}

export interface AuthorLookupRule {
  matchBy: 'email' | 'orcid' | 'username';
  value: ValueBinding;
}

export interface EmbargoBinding {
  /** A non-empty/truthy result means the record has an active embargo. */
  accessRights: ValueBinding;
  /** Figshare v2 embargo scope. Must evaluate to `article` or `file`. */
  embargoType: ValueBinding;
  fullEmbargoUntil?: ValueBinding;
  reason?: ValueBinding;
}

export interface FigshareFixtureConfig {
  authors?: Array<Record<string, unknown>>;
  licenses?: Array<Record<string, unknown>>;
  categories?: Array<Record<string, unknown>>;
  article?: Record<string, unknown>;
  articleFiles?: Array<Record<string, unknown>>;
  publishResult?: Record<string, unknown>;
}

export interface WriteBackBinding {
  from: 'article' | 'publishResult' | 'assetSyncResult';
  sourcePath: string;
  targetPath: string;
}

export interface FigshareConnectionConfig {
  baseUrl: string;
  frontEndUrl: string;
  /**
   * Do not commit raw API tokens. Prefer an environment-variable reference such as
   * `$FIGSHARE_TOKEN` or the deployment secret manager used by this environment.
   */
  token: string;
  timeoutMs: number;
  operationTimeouts: {
    metadataMs: number;
    uploadInitMs: number;
    uploadPartMs: number;
    publishMs: number;
  };
  retry: {
    maxAttempts: number;
    baseDelayMs: number;
    maxDelayMs: number;
    retryOnStatusCodes: number[];
    retryOnMethods: string[];
  };
}

export function resolveFigshareConnectionToken(token: string, options: { allowEmpty?: boolean } = {}): string {
  const value = typeof token === 'string' ? token.trim() : '';
  if (value.startsWith('$')) {
    const envVarName = value.slice(1);
    const resolved = process.env[envVarName]?.trim() ?? '';
    if (!resolved && !options.allowEmpty) {
      throw new Error(`Figshare connection token environment variable '${envVarName}' is not set or is empty`);
    }
    return resolved;
  }
  if (!value && !options.allowEmpty) {
    throw new Error('Figshare connection token must not be empty');
  }
  return value;
}

export type FigshareActor = 'token' | 'owner';
export type FigshareOperation = 'create' | 'recovery' | 'metadata' | 'assets' | 'embargo' | 'publish' | 'read';
export interface FigshareImpersonationConfig {
  enabled: boolean;
  institutionalIdPath: string;
  emailPath: string;
  allowEmailFallback: boolean;
  operations: Record<FigshareOperation, FigshareActor>;
}
export interface FigshareProcessingConfig {
  enabled: boolean;
  coalesceMs: number;
  leaseMs: number;
  heartbeatMs: number;
  maxAttempts: number;
  retryBaseMs: number;
  observationMs: number;
  cleanupMs: number;
  serviceUsername: string;
  serviceUserType: string;
}
export const DEFAULT_FIGSHARE_PROCESSING: FigshareProcessingConfig = {
  enabled: false, coalesceMs: 5000, leaseMs: 120000, heartbeatMs: 20000,
  maxAttempts: 5, retryBaseMs: 60000, observationMs: 120000, cleanupMs: 300000,
  serviceUsername: '', serviceUserType: ''
};
export const DEFAULT_FIGSHARE_IMPERSONATION: FigshareImpersonationConfig = {
  enabled: false, institutionalIdPath: 'metadata.contributor_ci.dc_identifier',
  emailPath: 'metadata.contributor_ci.email', allowEmailFallback: false,
  operations: { create: 'owner', recovery: 'owner', metadata: 'token', assets: 'token', embargo: 'token', publish: 'token', read: 'token' }
};

export interface FigsharePublishingConfigData {
  processing?: FigshareProcessingConfig;
  impersonation?: FigshareImpersonationConfig;
  enabled: boolean;
  connection: FigshareConnectionConfig;
  article: {
    itemType: FigshareArticleItemType;
    groupId?: number;
    publishMode: 'immediate' | 'afterUploadsComplete' | 'manual';
    republishOnMetadataChange: boolean;
    republishOnAssetChange: boolean;
    curationLock?: {
      enabled: boolean;
      statusField: string;
      targetValue: string;
    };
  };
  record: {
    articleIdPath: string;
    dataLocationsPath: string;
    statusPath: string;
    errorPath: string;
    syncStatePath: string;
    allFilesUploadedPath?: string;
  };
  selection: {
    attachmentMode: 'selectedOnly' | 'all';
    urlMode: 'selectedOnly' | 'all';
    selectedFlagPath: string;
  };
  authors: {
    contributorPaths: string[];
    uniqueBy: 'email' | 'orcid' | 'username' | 'none';
    externalNameField: string;
    maxInlineAuthors: number;
    emailTransform: {
      prefix?: string;
      domainOverride?: string;
    };
    lookup: AuthorLookupRule[];
  };
  metadata: {
    title: ValueBinding;
    description: ValueBinding;
    keywords: ValueBinding;
    funding?: ValueBinding;
    license: LicenseBinding;
    categories: CategoryBinding;
    relatedResource?: RelatedResourceBinding;
    customFields: CustomFieldBinding[];
  };
  categories: {
    /** Consulted only when the categories binding is not a crosswalk binding. */
    mappingTable: Array<{ sourceCode: string; figshareCategoryId: number }>;
    allowUnmapped: boolean;
  };
  assets: {
    enableHostedFiles: boolean;
    enableLinkFiles: boolean;
    staging: {
      /**
       * StorageManager disk name used to stage attachments before upload.
       * Resolved via StorageManagerService.disk(name). Defaults to 'figshare-staging'.
       */
      disk?: string;
      /** Key prefix for staged objects on the disk. Default: 'figshare/'. */
      keyPrefix?: string;
      cleanupPolicy: 'deleteAfterSuccess' | 'retainForRetry';
    };
  };
  embargo: {
    mode: 'none' | 'recordDriven';
    forceSync: boolean;
    accessRights: EmbargoBinding;
  };
  queue: {
    publishAfterUploadDelay: string;
    uploadedFilesCleanupDelay: string;
  };
  workflow: {
    transitionJob: {
      enabled: boolean;
      namedQuery: string;
      targetStep: string;
      paramMap: Record<string, unknown>;
      figshareTargetFieldKey: string;
      figshareTargetFieldValue: string;
      username: string;
      userType: string;
    };
  };
  writeBack: {
    articleId: string;
    articleUrls: string[];
    extraFields: WriteBackBinding[];
  };
}

function createDefaultBinding(path: string, defaultValue?: unknown): ValueBinding {
  return {
    kind: 'path',
    path,
    defaultValue,
  };
}

export class FigsharePublishing extends AppConfig implements FigsharePublishingConfigData {
  enabled = false;
  processing = { ...DEFAULT_FIGSHARE_PROCESSING };
  impersonation = { ...DEFAULT_FIGSHARE_IMPERSONATION, operations: { ...DEFAULT_FIGSHARE_IMPERSONATION.operations } };

  connection: FigshareConnectionConfig = {
    baseUrl: '',
    frontEndUrl: '',
    token: '',
    timeoutMs: 30000,
    operationTimeouts: {
      metadataMs: 30000,
      uploadInitMs: 30000,
      uploadPartMs: 120000,
      publishMs: 60000,
    },
    retry: {
      maxAttempts: 3,
      baseDelayMs: 500,
      maxDelayMs: 4000,
      retryOnStatusCodes: [408, 429, 500, 502, 503, 504],
      retryOnMethods: ['get', 'put', 'delete'],
    },
  };

  article = {
    itemType: 'dataset' as FigshareArticleItemType,
    groupId: undefined as number | undefined,
    publishMode: 'afterUploadsComplete' as 'immediate' | 'afterUploadsComplete' | 'manual',
    republishOnMetadataChange: true,
    republishOnAssetChange: true,
    curationLock: {
      enabled: false,
      statusField: '',
      targetValue: 'public',
    },
  };

  record = {
    articleIdPath: 'metadata.figshare_article_id',
    dataLocationsPath: 'metadata.dataLocations',
    statusPath: 'metadata.figshareStatus',
    errorPath: 'metadata.figshareError',
    syncStatePath: 'metadata.figshareSyncState',
    allFilesUploadedPath: '',
  };

  selection = {
    attachmentMode: 'selectedOnly' as 'selectedOnly' | 'all',
    urlMode: 'selectedOnly' as 'selectedOnly' | 'all',
    selectedFlagPath: 'selected',
  };

  authors = {
    contributorPaths: [
      'metadata.contributor_ci',
      'metadata.contributor_data_manager',
      'metadata.dataOwner',
      'metadata.chiefInvestigator',
      'metadata.contributors',
    ],
    uniqueBy: 'email' as 'email' | 'orcid' | 'username' | 'none',
    externalNameField: 'text_full_name',
    maxInlineAuthors: 50,
    emailTransform: {
      prefix: '',
      domainOverride: '',
    },
    lookup: [
      {
        matchBy: 'email' as const,
        value: createDefaultBinding('email'),
      },
    ],
  };

  metadata = {
    title: createDefaultBinding('metadata.title', ''),
    description: createDefaultBinding('metadata.description', ''),
    keywords: createDefaultBinding('metadata.finalKeywords', []),
    funding: createDefaultBinding('metadata.funder', ''),
    license: {
      source: createDefaultBinding('metadata.license'),
      matchBy: 'urlContains' as 'urlContains' | 'nameExact' | 'valueExact',
      required: true,
    },
    categories: {
      source: createDefaultBinding('metadata.forCodes', []),
    },
    relatedResource: {
      title: createDefaultBinding('metadata.title', ''),
      doi: createDefaultBinding('metadata.doi', ''),
    },
    customFields: [],
  };

  categories = {
    mappingTable: [] as Array<{ sourceCode: string; figshareCategoryId: number }>,
    allowUnmapped: false,
  };

  assets = {
    enableHostedFiles: true,
    enableLinkFiles: true,
    staging: {
      disk: 'figshare-staging',
      keyPrefix: 'figshare/',
      cleanupPolicy: 'deleteAfterSuccess' as 'deleteAfterSuccess' | 'retainForRetry',
    },
  };

  embargo = {
    mode: 'recordDriven' as 'none' | 'recordDriven',
    forceSync: false,
    accessRights: {
      accessRights: createDefaultBinding('metadata.accessRights', ''),
      embargoType: createDefaultBinding('metadata.embargoType', 'article'),
      fullEmbargoUntil: createDefaultBinding('metadata.embargoUntil'),
      reason: createDefaultBinding('metadata.embargoReason'),
    },
  };

  queue = {
    publishAfterUploadDelay: 'in 2 minutes',
    uploadedFilesCleanupDelay: 'in 5 minutes',
  };

  workflow = {
    transitionJob: {
      enabled: false,
      namedQuery: '',
      targetStep: '',
      paramMap: {} as Record<string, unknown>,
      figshareTargetFieldKey: '',
      figshareTargetFieldValue: '',
      username: '',
      userType: '',
    },
  };

  writeBack = {
    articleId: 'metadata.figshare_article_id',
    articleUrls: ['metadata.figshare_article_location'],
    extraFields: [] as WriteBackBinding[],
  };

  public static getFieldOrder(): string[] {
    return [
      'enabled',
      'processing',
      'impersonation',
      'connection',
      'article',
      'record',
      'selection',
      'authors',
      'metadata',
      'categories',
      'assets',
      'embargo',
      'queue',
      'workflow',
      'writeBack',
    ];
  }
}

const CATEGORY_MAPPING_EDITOR_WIDGET = {
  widget: {
    formlyConfig: {
      type: 'figshare-category-mapping-editor',
    },
  },
};

const SIMPLE_BINDING_PROPERTIES = {
  kind: {
    type: 'string',
    title: 'admin-config-label-binding-type',
    enum: ['path', 'handlebars', 'jsonata'],
    default: 'path',
  },
  path: {
    type: 'string',
    title: 'admin-config-label-record-path',
  },
  template: {
    type: 'string',
    title: 'admin-config-label-handlebars-template',
  },
  expression: {
    type: 'string',
    title: 'admin-config-label-jsonata-expression',
  },
  defaultValue: {
    title: 'admin-config-label-default-value',
  },
};

/**
 * The inner source of a crosswalk binding. Deliberately excludes the `crosswalk`
 * kind so a crosswalk can never nest another crosswalk, and carries no widget of
 * its own: the parent value-binding-editor renders it inline.
 */
const SIMPLE_VALUE_BINDING_SCHEMA = {
  type: 'object',
  title: 'admin-config-label-source-binding',
  properties: SIMPLE_BINDING_PROPERTIES,
  required: ['kind'],
};

const VALUE_BINDING_SCHEMA = {
  type: 'object',
  title: 'admin-config-label-binding',
  properties: {
    ...SIMPLE_BINDING_PROPERTIES,
    kind: {
      ...SIMPLE_BINDING_PROPERTIES.kind,
      enum: ['path', 'handlebars', 'jsonata', 'crosswalk'],
    },
    source: SIMPLE_VALUE_BINDING_SCHEMA,
    sourceVocabularyId: {
      type: 'string',
      title: 'admin-config-label-source-vocabulary',
      description: 'Crosswalk kind only. Record codes are resolved against entries of exactly this vocabulary.',
    },
    crosswalkId: {
      type: 'string',
      title: 'admin-config-label-approved-figshare-crosswalk',
      description: 'Crosswalk kind only. Publishing always reads the approved revision.',
    },
    outputs: {
      type: 'string',
      title: 'admin-config-label-output',
      description:
        'What each resolved mapping emits. The Categories binding must use categoryId; label and sourceId produce strings for fields such as keywords or custom fields.',
      enum: ['categoryId', 'label', 'sourceId'],
      default: 'categoryId',
    },
  },
  required: ['kind'],
  // `allowCrosswalk` gates the crosswalk kind in the shared editor. DOI publishing
  // has its own copy of this schema without the flag, so it never offers the kind.
  widget: {
    formlyConfig: {
      type: 'value-binding-editor',
      props: { allowCrosswalk: true },
    },
  },
};

export const FIGSHARE_PUBLISHING_SCHEMA = {
  type: 'object',
  properties: {
    enabled: {
      type: 'boolean',
      title: 'admin-config-label-enabled',
      default: false,
    },
    processing: {
      type: 'object', title: 'admin-config-label-background-processing',
      description: 'Enable only after migration, indexes and worker cutover. Local attachment bytes are retained.',
      properties: {
        enabled: { type: 'boolean', default: false },
        ...Object.fromEntries((['coalesceMs', 'leaseMs', 'heartbeatMs', 'maxAttempts', 'retryBaseMs', 'observationMs', 'cleanupMs'] as const).map(key => [key, { type: 'integer', minimum: 1, default: DEFAULT_FIGSHARE_PROCESSING[key] }])),
        serviceUsername: { type: 'string', title: 'admin-config-label-local-service-username' },
        serviceUserType: { type: 'string', title: 'admin-config-label-local-service-user-type' }
      }
    },
    impersonation: {
      type: 'object', title: 'admin-config-label-figshare-ownership',
      properties: {
        enabled: { type: 'boolean', default: false },
        institutionalIdPath: { type: 'string', default: DEFAULT_FIGSHARE_IMPERSONATION.institutionalIdPath },
        emailPath: { type: 'string', default: DEFAULT_FIGSHARE_IMPERSONATION.emailPath },
        allowEmailFallback: { type: 'boolean', default: false },
        operations: { type: 'object', properties: Object.fromEntries(Object.entries(DEFAULT_FIGSHARE_IMPERSONATION.operations).map(([key, value]) => [key, { type: 'string', enum: ['token', 'owner'], default: value }])) }
      }
    },
    connection: {
      type: 'object',
      title: 'admin-config-label-connection',
      properties: {
        baseUrl: { type: 'string', title: 'admin-config-label-base-url' },
        frontEndUrl: { type: 'string', title: 'admin-config-label-front-end-url' },
        token: {
          type: 'string',
          title: 'admin-config-label-api-token',
          description:
            'Do not commit raw API tokens. Prefer an environment variable reference such as $FIGSHARE_TOKEN or the deployment secret manager.',
        },
        timeoutMs: { type: 'integer', title: 'admin-config-label-request-timeout-ms', default: 30000 },
        operationTimeouts: {
          type: 'object',
          title: 'admin-config-label-operation-timeouts',
          properties: {
            metadataMs: { type: 'integer', title: 'admin-config-label-metadata-timeout-ms', default: 30000 },
            uploadInitMs: { type: 'integer', title: 'admin-config-label-upload-init-timeout-ms', default: 30000 },
            uploadPartMs: { type: 'integer', title: 'admin-config-label-upload-part-timeout-ms', default: 120000 },
            publishMs: { type: 'integer', title: 'admin-config-label-publish-timeout-ms', default: 60000 },
          },
        },
        retry: {
          type: 'object',
          title: 'admin-config-label-retry-policy',
          properties: {
            maxAttempts: { type: 'integer', title: 'admin-config-label-max-attempts', default: 3 },
            baseDelayMs: { type: 'integer', title: 'admin-config-label-base-delay-ms', default: 500 },
            maxDelayMs: { type: 'integer', title: 'admin-config-label-max-delay-ms', default: 4000 },
            retryOnStatusCodes: {
              type: 'array',
              title: 'admin-config-label-retry-on-status-codes',
              items: { type: 'integer' },
              default: [408, 429, 500, 502, 503, 504],
            },
            retryOnMethods: {
              type: 'array',
              title: 'admin-config-label-retry-on-methods',
              items: { type: 'string' },
              default: ['get', 'put', 'delete'],
            },
          },
        },
      },
    },
    article: {
      type: 'object',
      title: 'admin-config-label-article',
      properties: {
        itemType: {
          type: 'string',
          title: 'admin-config-label-item-type',
          enum: [
            'dataset',
            'fileset',
            'figure',
            'media',
            'poster',
            'paper',
            'presentation',
            'thesis',
            'code',
            'metadata',
          ],
          default: 'dataset',
        },
        groupId: { type: 'integer', title: 'admin-config-label-group-id' },
        publishMode: {
          type: 'string',
          title: 'admin-config-label-publish-mode',
          enum: ['immediate', 'afterUploadsComplete', 'manual'],
          default: 'afterUploadsComplete',
        },
        republishOnMetadataChange: { type: 'boolean', title: 'admin-config-label-republish-on-metadata-change', default: true },
        republishOnAssetChange: { type: 'boolean', title: 'admin-config-label-republish-on-asset-change', default: true },
        curationLock: {
          type: 'object',
          title: 'admin-config-label-curation-lock',
          properties: {
            enabled: { type: 'boolean', title: 'admin-config-label-enabled', default: false },
            statusField: { type: 'string', title: 'admin-config-label-status-field', default: '' },
            targetValue: { type: 'string', title: 'admin-config-label-target-value', default: 'public' },
          },
        },
      },
    },
    record: {
      type: 'object',
      title: 'admin-config-label-record',
      properties: {
        articleIdPath: { type: 'string', title: 'admin-config-label-article-id-path', default: 'metadata.figshare_article_id' },
        dataLocationsPath: { type: 'string', title: 'admin-config-label-data-locations-path', default: 'metadata.dataLocations' },
        statusPath: { type: 'string', title: 'admin-config-label-status-path', default: 'metadata.figshareStatus' },
        errorPath: { type: 'string', title: 'admin-config-label-error-path', default: 'metadata.figshareError' },
        syncStatePath: { type: 'string', title: 'admin-config-label-sync-state-path', default: 'metadata.figshareSyncState' },
        allFilesUploadedPath: { type: 'string', title: 'admin-config-label-all-files-uploaded-path', default: '' },
      },
    },
    selection: {
      type: 'object',
      title: 'admin-config-label-selection',
      properties: {
        attachmentMode: {
          type: 'string',
          title: 'admin-config-label-attachment-mode',
          enum: ['selectedOnly', 'all'],
          default: 'selectedOnly',
        },
        urlMode: {
          type: 'string',
          title: 'admin-config-label-url-mode',
          enum: ['selectedOnly', 'all'],
          default: 'selectedOnly',
        },
        selectedFlagPath: { type: 'string', title: 'admin-config-label-selected-flag-path', default: 'selected' },
      },
    },
    authors: {
      type: 'object',
      title: 'admin-config-label-authors',
      properties: {
        uniqueBy: {
          type: 'string',
          title: 'admin-config-label-unique-by',
          enum: ['email', 'orcid', 'username', 'none'],
          default: 'email',
        },
        externalNameField: { type: 'string', title: 'admin-config-label-external-name-field', default: 'text_full_name' },
        maxInlineAuthors: { type: 'integer', title: 'admin-config-label-max-inline-authors', default: 50 },
        lookup: {
          type: 'array',
          title: 'admin-config-label-lookup-rules',
          items: {
            type: 'object',
            properties: {
              matchBy: {
                type: 'string',
                title: 'admin-config-label-match-by',
                enum: ['email', 'orcid', 'username'],
              },
              value: VALUE_BINDING_SCHEMA,
            },
          },
        },
        contributorPaths: {
          type: 'array',
          title: 'admin-config-label-contributor-paths',
          items: { type: 'string' },
          default: [
            'metadata.contributor_ci',
            'metadata.contributor_data_manager',
            'metadata.dataOwner',
            'metadata.chiefInvestigator',
            'metadata.contributors',
          ],
        },
        emailTransform: {
          type: 'object',
          title: 'admin-config-label-email-transform',
          properties: {
            prefix: { type: 'string', title: 'admin-config-label-prefix', default: '' },
            domainOverride: { type: 'string', title: 'admin-config-label-domain-override', default: '' },
          },
        },
      },
    },
    metadata: {
      type: 'object',
      title: 'admin-config-label-metadata',
      properties: {
        title: VALUE_BINDING_SCHEMA,
        description: VALUE_BINDING_SCHEMA,
        keywords: VALUE_BINDING_SCHEMA,
        funding: VALUE_BINDING_SCHEMA,
        license: {
          type: 'object',
          title: 'admin-config-label-license',
          properties: {
            source: VALUE_BINDING_SCHEMA,
            matchBy: {
              type: 'string',
              title: 'admin-config-label-match-by',
              enum: ['urlContains', 'nameExact', 'valueExact'],
              default: 'urlContains',
            },
            required: { type: 'boolean', title: 'admin-config-label-required', default: true },
          },
        },
        categories: {
          type: 'object',
          title: 'admin-config-label-categories-binding',
          properties: {
            source: VALUE_BINDING_SCHEMA,
          },
        },
        relatedResource: {
          type: 'object',
          title: 'admin-config-label-related-resource',
          properties: {
            title: VALUE_BINDING_SCHEMA,
            doi: VALUE_BINDING_SCHEMA,
          },
        },
        customFields: {
          type: 'array',
          title: 'admin-config-label-custom-fields',
          items: {
            type: 'object',
            properties: {
              figshareField: { type: 'string', title: 'admin-config-label-figshare-field' },
              value: VALUE_BINDING_SCHEMA,
              validations: {
                type: 'array',
                title: 'admin-config-label-validations',
                items: {
                  type: 'object',
                  properties: {
                    type: {
                      type: 'string',
                      title: 'admin-config-label-type',
                      enum: ['maxLength', 'url', 'doi', 'required'],
                    },
                    value: {
                      type: 'integer',
                      title: 'admin-config-label-value',
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    categories: {
      type: 'object',
      title: 'admin-config-label-categories',
      properties: {
        mappingTable: {
          type: 'array',
          title: 'admin-config-label-mapping-table',
          description:
            'Used only when the Categories binding is not a crosswalk binding. Each row maps a record category code to a Figshare category ID.',
          items: {
            type: 'object',
            properties: {
              sourceCode: { type: 'string', title: 'admin-config-label-source-code' },
              figshareCategoryId: { type: 'integer', title: 'admin-config-label-figshare-category-id' },
            },
          },
          ...CATEGORY_MAPPING_EDITOR_WIDGET,
        },
        allowUnmapped: { type: 'boolean', title: 'admin-config-label-allow-unmapped-categories', default: false },
      },
    },
    assets: {
      type: 'object',
      title: 'admin-config-label-assets',
      properties: {
        enableHostedFiles: { type: 'boolean', title: 'admin-config-label-enable-hosted-files', default: true },
        enableLinkFiles: { type: 'boolean', title: 'admin-config-label-enable-link-files', default: true },
        staging: {
          type: 'object',
          title: 'admin-config-label-staging',
          properties: {
            disk: { type: 'string', title: 'admin-config-label-storage-disk', default: 'figshare-staging' },
            keyPrefix: { type: 'string', title: 'admin-config-label-storage-key-prefix', default: 'figshare/' },
            cleanupPolicy: {
              type: 'string',
              title: 'admin-config-label-cleanup-policy',
              enum: ['deleteAfterSuccess', 'retainForRetry'],
              default: 'deleteAfterSuccess',
            },
          },
        },
      },
    },
    embargo: {
      type: 'object',
      title: 'admin-config-label-embargo',
      properties: {
        mode: {
          type: 'string',
          title: 'admin-config-label-mode',
          enum: ['none', 'recordDriven'],
          default: 'recordDriven',
        },
        forceSync: { type: 'boolean', title: 'admin-config-label-force-sync', default: false },
        accessRights: {
          type: 'object',
          title: 'admin-config-label-embargo-bindings',
          properties: {
            accessRights: VALUE_BINDING_SCHEMA,
            embargoType: VALUE_BINDING_SCHEMA,
            fullEmbargoUntil: VALUE_BINDING_SCHEMA,
            reason: VALUE_BINDING_SCHEMA,
          },
        },
      },
    },
    queue: {
      type: 'object',
      title: 'admin-config-label-queue',
      properties: {
        publishAfterUploadDelay: { type: 'string', title: 'admin-config-label-publish-after-upload-delay', default: 'in 2 minutes' },
        uploadedFilesCleanupDelay: { type: 'string', title: 'admin-config-label-uploaded-files-cleanup-delay', default: 'in 5 minutes' },
      },
    },
    workflow: {
      type: 'object',
      title: 'admin-config-label-workflow',
      properties: {
        transitionJob: {
          type: 'object',
          title: 'admin-config-label-transition-job',
          properties: {
            enabled: { type: 'boolean', title: 'admin-config-label-enabled', default: false },
            namedQuery: { type: 'string', title: 'admin-config-label-named-query', default: '' },
            targetStep: { type: 'string', title: 'admin-config-label-target-step', default: '' },
            paramMap: { type: 'object', title: 'admin-config-label-parameter-map', default: {} },
            figshareTargetFieldKey: { type: 'string', title: 'admin-config-label-figshare-target-field-key', default: '' },
            figshareTargetFieldValue: { type: 'string', title: 'admin-config-label-figshare-target-field-value', default: '' },
            username: { type: 'string', title: 'admin-config-label-username', default: '' },
            userType: { type: 'string', title: 'admin-config-label-user-type', default: '' },
          },
        },
      },
    },
    writeBack: {
      type: 'object',
      title: 'admin-config-label-write-back',
      properties: {
        articleId: { type: 'string', title: 'admin-config-label-article-id-target-path', default: 'metadata.figshare_article_id' },
        articleUrls: {
          type: 'array',
          title: 'admin-config-label-article-url-target-paths',
          items: { type: 'string' },
          default: ['metadata.figshare_article_location'],
        },
        extraFields: {
          type: 'array',
          title: 'admin-config-label-extra-fields',
          items: {
            type: 'object',
            properties: {
              from: {
                type: 'string',
                title: 'admin-config-label-from',
                enum: ['article', 'publishResult', 'assetSyncResult'],
              },
              sourcePath: { type: 'string', title: 'admin-config-label-source-path' },
              targetPath: { type: 'string', title: 'admin-config-label-target-path' },
            },
          },
        },
      },
    },
  },
};
