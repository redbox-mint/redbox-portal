import { AppConfig } from './AppConfig.interface';

export type FigshareBindingKind = 'path' | 'handlebars' | 'jsonata';
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

export type ValueBinding = PathBinding | HandlebarsBinding | JsonataBinding;

export interface LicenseBinding {
  source: ValueBinding;
  matchBy: 'urlContains' | 'nameExact' | 'valueExact';
  required: boolean;
}

export interface CategoryBinding {
  source: ValueBinding;
  mappingStrategy: 'for2020Mapping';
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
  accessRights: ValueBinding;
  fullEmbargoUntil?: ValueBinding;
  fileEmbargoUntil?: ValueBinding;
  reason?: ValueBinding;
}

export interface WorkflowTransitionRule {
  when: 'published' | 'republished' | 'embargoUpdated' | 'awaitingUploadCompletion';
  targetWorkflowStageName: string;
  targetWorkflowStageLabel?: string;
  targetForm?: string;
  ifArticleField?: string;
  equals?: string | number | boolean;
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

export interface FigshareLegacyMappingConfig {
  figshareCurationStatus?: string;
  figshareCurationStatusTargetValue?: string;
  figshareDisableUpdateByCurationStatus?: boolean;
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

export interface FigsharePublishingConfigData {
  enabled: boolean;
  connection: FigshareConnectionConfig;
  legacyMapping?: FigshareLegacyMappingConfig;
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
    articleUrlPaths: string[];
    dataLocationsPath: string;
    statusPath: string;
    errorPath: string;
    syncStatePath: string;
  };
  selection: {
    attachmentMode: 'selectedOnly' | 'all';
    urlMode: 'selectedOnly' | 'all';
    selectedFlagPath: string;
  };
  authors: {
    source: 'defaultRedboxContributors';
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
    strategy: 'for2020Mapping';
    mappingTable: Array<{ sourceCode: string; figshareCategoryId: number }>;
    allowUnmapped: boolean;
  };
  assets: {
    enableHostedFiles: boolean;
    enableLinkFiles: boolean;
    dedupeStrategy: 'sourceId' | 'nameAndMd5' | 'url';
    staging: {
      tempDir?: string;
      cleanupPolicy: 'deleteAfterSuccess' | 'retainForRetry';
      diskSpaceThresholdBytes: number;
    };
  };
  embargo: {
    mode: 'none' | 'recordDriven';
    forceSync: boolean;
    accessRights: EmbargoBinding;
  };
  workflow: {
    transitionRules: WorkflowTransitionRule[];
  };
  testing: {
    mode: 'live' | 'fixture';
    fixtures?: FigshareFixtureConfig;
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
    defaultValue
  };
}

export class FigsharePublishing extends AppConfig implements FigsharePublishingConfigData {
  enabled = false;

  connection: FigshareConnectionConfig = {
    baseUrl: '',
    frontEndUrl: '',
    token: '',
    timeoutMs: 30000,
    operationTimeouts: {
      metadataMs: 30000,
      uploadInitMs: 30000,
      uploadPartMs: 120000,
      publishMs: 60000
    },
    retry: {
      maxAttempts: 3,
      baseDelayMs: 500,
      maxDelayMs: 4000,
      retryOnStatusCodes: [408, 429, 500, 502, 503, 504],
      retryOnMethods: ['get', 'put', 'delete']
    }
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
      targetValue: 'public'
    }
  };

  record = {
    articleIdPath: 'metadata.figshare_article_id',
    articleUrlPaths: ['metadata.figshare_article_location'],
    dataLocationsPath: 'metadata.dataLocations',
    statusPath: 'metadata.figshareStatus',
    errorPath: 'metadata.figshareError',
    syncStatePath: 'metadata.figshareSyncState'
  };

  selection = {
    attachmentMode: 'selectedOnly' as 'selectedOnly' | 'all',
    urlMode: 'selectedOnly' as 'selectedOnly' | 'all',
    selectedFlagPath: 'selected'
  };

  authors = {
    source: 'defaultRedboxContributors' as const,
    contributorPaths: [
      'metadata.contributor_ci',
      'metadata.contributor_data_manager',
      'metadata.dataOwner',
      'metadata.chiefInvestigator',
      'metadata.contributors'
    ],
    uniqueBy: 'email' as 'email' | 'orcid' | 'username' | 'none',
    externalNameField: 'text_full_name',
    maxInlineAuthors: 50,
    emailTransform: {
      prefix: '',
      domainOverride: ''
    },
    lookup: [
      {
        matchBy: 'email' as const,
        value: createDefaultBinding('email')
      }
    ]
  };

  metadata = {
    title: createDefaultBinding('metadata.title', ''),
    description: createDefaultBinding('metadata.description', ''),
    keywords: createDefaultBinding('metadata.finalKeywords', []),
    funding: createDefaultBinding('metadata.funder', ''),
    license: {
      source: createDefaultBinding('metadata.license'),
      matchBy: 'urlContains' as 'urlContains' | 'nameExact' | 'valueExact',
      required: true
    },
    categories: {
      source: createDefaultBinding('metadata.forCodes', []),
      mappingStrategy: 'for2020Mapping' as const
    },
    relatedResource: {
      title: createDefaultBinding('metadata.title', ''),
      doi: createDefaultBinding('metadata.doi', '')
    },
    customFields: []
  };

  categories = {
    strategy: 'for2020Mapping' as const,
    mappingTable: [] as Array<{ sourceCode: string; figshareCategoryId: number }>,
    allowUnmapped: false
  };

  assets = {
    enableHostedFiles: true,
    enableLinkFiles: true,
    dedupeStrategy: 'sourceId' as 'sourceId' | 'nameAndMd5' | 'url',
    staging: {
      tempDir: '',
      cleanupPolicy: 'deleteAfterSuccess' as 'deleteAfterSuccess' | 'retainForRetry',
      diskSpaceThresholdBytes: 1073741824
    }
  };

  embargo = {
    mode: 'recordDriven' as 'none' | 'recordDriven',
    forceSync: false,
    accessRights: {
      accessRights: createDefaultBinding('metadata.accessRights', ''),
      fullEmbargoUntil: createDefaultBinding('metadata.embargoUntil'),
      fileEmbargoUntil: createDefaultBinding('metadata.embargoUntil'),
      reason: createDefaultBinding('metadata.embargoReason')
    }
  };

  workflow = {
    transitionRules: [] as WorkflowTransitionRule[]
  };

  testing = {
    mode: 'live' as 'live' | 'fixture',
    fixtures: undefined as FigshareFixtureConfig | undefined
  };

  writeBack = {
    articleId: 'metadata.figshare_article_id',
    articleUrls: ['metadata.figshare_article_location'],
    extraFields: [] as WriteBackBinding[]
  };

  public static getFieldOrder(): string[] {
    return [
      'enabled',
      'connection',
      'article',
      'record',
      'selection',
      'authors',
      'metadata',
      'categories',
      'assets',
      'embargo',
      'workflow',
      'testing',
      'writeBack'
    ];
  }
}

const VALUE_BINDING_EDITOR_WIDGET = {
  widget: {
    formlyConfig: {
      type: 'figshare-binding-editor'
    }
  }
};

const CATEGORY_MAPPING_EDITOR_WIDGET = {
  widget: {
    formlyConfig: {
      type: 'figshare-category-mapping-editor'
    }
  }
};

const VALUE_BINDING_SCHEMA = {
  type: 'object',
  title: 'Binding',
  properties: {
    kind: {
      type: 'string',
      title: 'Binding Type',
      enum: ['path', 'handlebars', 'jsonata'],
      default: 'path'
    },
    path: {
      type: 'string',
      title: 'Record Path'
    },
    template: {
      type: 'string',
      title: 'Handlebars Template'
    },
    expression: {
      type: 'string',
      title: 'JSONata Expression'
    },
    defaultValue: {
      title: 'Default Value'
    }
  },
  required: ['kind'],
  ...VALUE_BINDING_EDITOR_WIDGET
};

export const FIGSHARE_PUBLISHING_SCHEMA = {
  type: 'object',
  properties: {
    enabled: {
      type: 'boolean',
      title: 'Enabled',
      default: false
    },
    connection: {
      type: 'object',
      title: 'Connection',
      properties: {
        baseUrl: { type: 'string', title: 'Base URL' },
        frontEndUrl: { type: 'string', title: 'Front End URL' },
        token: {
          type: 'string',
          title: 'API Token',
          description: 'Do not commit raw API tokens. Prefer an environment variable reference such as $FIGSHARE_TOKEN or the deployment secret manager.'
        },
        timeoutMs: { type: 'integer', title: 'Request Timeout (ms)', default: 30000 },
        operationTimeouts: {
          type: 'object',
          title: 'Operation Timeouts',
          properties: {
            metadataMs: { type: 'integer', title: 'Metadata Timeout (ms)', default: 30000 },
            uploadInitMs: { type: 'integer', title: 'Upload Init Timeout (ms)', default: 30000 },
            uploadPartMs: { type: 'integer', title: 'Upload Part Timeout (ms)', default: 120000 },
            publishMs: { type: 'integer', title: 'Publish Timeout (ms)', default: 60000 }
          }
        },
        retry: {
          type: 'object',
          title: 'Retry Policy',
          properties: {
            maxAttempts: { type: 'integer', title: 'Max Attempts', default: 3 },
            baseDelayMs: { type: 'integer', title: 'Base Delay (ms)', default: 500 },
            maxDelayMs: { type: 'integer', title: 'Max Delay (ms)', default: 4000 },
            retryOnStatusCodes: {
              type: 'array',
              title: 'Retry On Status Codes',
              items: { type: 'integer' },
              default: [408, 429, 500, 502, 503, 504]
            },
            retryOnMethods: {
              type: 'array',
              title: 'Retry On Methods',
              items: { type: 'string' },
              default: ['get', 'put', 'delete']
            }
          }
        }
      }
    },
    article: {
      type: 'object',
      title: 'Article',
      properties: {
        itemType: {
          type: 'string',
          title: 'Item Type',
          enum: ['dataset', 'fileset', 'figure', 'media', 'poster', 'paper', 'presentation', 'thesis', 'code', 'metadata'],
          default: 'dataset'
        },
        groupId: { type: 'integer', title: 'Group ID' },
        publishMode: {
          type: 'string',
          title: 'Publish Mode',
          enum: ['immediate', 'afterUploadsComplete', 'manual'],
          default: 'afterUploadsComplete'
        },
        republishOnMetadataChange: { type: 'boolean', title: 'Republish On Metadata Change', default: true },
        republishOnAssetChange: { type: 'boolean', title: 'Republish On Asset Change', default: true },
        curationLock: {
          type: 'object',
          title: 'Curation Lock',
          properties: {
            enabled: { type: 'boolean', title: 'Enabled', default: false },
            statusField: { type: 'string', title: 'Status Field', default: '' },
            targetValue: { type: 'string', title: 'Target Value', default: 'public' }
          }
        }
      }
    },
    record: {
      type: 'object',
      title: 'Record',
      properties: {
        articleIdPath: { type: 'string', title: 'Article ID Path', default: 'metadata.figshare_article_id' },
        articleUrlPaths: {
          type: 'array',
          title: 'Article URL Paths',
          items: { type: 'string' },
          default: ['metadata.figshare_article_location']
        },
        dataLocationsPath: { type: 'string', title: 'Data Locations Path', default: 'metadata.dataLocations' },
        statusPath: { type: 'string', title: 'Status Path', default: 'metadata.figshareStatus' },
        errorPath: { type: 'string', title: 'Error Path', default: 'metadata.figshareError' },
        syncStatePath: { type: 'string', title: 'Sync State Path', default: 'metadata.figshareSyncState' }
      }
    },
    selection: {
      type: 'object',
      title: 'Selection',
      properties: {
        attachmentMode: {
          type: 'string',
          title: 'Attachment Mode',
          enum: ['selectedOnly', 'all'],
          default: 'selectedOnly'
        },
        urlMode: {
          type: 'string',
          title: 'URL Mode',
          enum: ['selectedOnly', 'all'],
          default: 'selectedOnly'
        },
        selectedFlagPath: { type: 'string', title: 'Selected Flag Path', default: 'selected' }
      }
    },
    authors: {
      type: 'object',
      title: 'Authors',
      properties: {
        source: {
          type: 'string',
          title: 'Source Strategy',
          enum: ['defaultRedboxContributors'],
          default: 'defaultRedboxContributors'
        },
        uniqueBy: {
          type: 'string',
          title: 'Unique By',
          enum: ['email', 'orcid', 'username', 'none'],
          default: 'email'
        },
        externalNameField: { type: 'string', title: 'External Name Field', default: 'text_full_name' },
        maxInlineAuthors: { type: 'integer', title: 'Max Inline Authors', default: 50 },
        lookup: {
          type: 'array',
          title: 'Lookup Rules',
          items: {
            type: 'object',
            properties: {
              matchBy: {
                type: 'string',
                title: 'Match By',
                enum: ['email', 'orcid', 'username']
              },
              value: VALUE_BINDING_SCHEMA
            }
          }
        },
        contributorPaths: {
          type: 'array',
          title: 'Contributor Paths',
          items: { type: 'string' },
          default: [
            'metadata.contributor_ci',
            'metadata.contributor_data_manager',
            'metadata.dataOwner',
            'metadata.chiefInvestigator',
            'metadata.contributors'
          ]
        },
        emailTransform: {
          type: 'object',
          title: 'Email Transform',
          properties: {
            prefix: { type: 'string', title: 'Prefix', default: '' },
            domainOverride: { type: 'string', title: 'Domain Override', default: '' }
          }
        }
      }
    },
    metadata: {
      type: 'object',
      title: 'Metadata',
      properties: {
        title: VALUE_BINDING_SCHEMA,
        description: VALUE_BINDING_SCHEMA,
        keywords: VALUE_BINDING_SCHEMA,
        funding: VALUE_BINDING_SCHEMA,
        license: {
          type: 'object',
          title: 'License',
          properties: {
            source: VALUE_BINDING_SCHEMA,
            matchBy: {
              type: 'string',
              title: 'Match By',
              enum: ['urlContains', 'nameExact', 'valueExact'],
              default: 'urlContains'
            },
            required: { type: 'boolean', title: 'Required', default: true }
          }
        },
        categories: {
          type: 'object',
          title: 'Categories Binding',
          properties: {
            source: VALUE_BINDING_SCHEMA,
            mappingStrategy: {
              type: 'string',
              title: 'Mapping Strategy',
              enum: ['for2020Mapping'],
              default: 'for2020Mapping'
            }
          }
        },
        relatedResource: {
          type: 'object',
          title: 'Related Resource',
          properties: {
            title: VALUE_BINDING_SCHEMA,
            doi: VALUE_BINDING_SCHEMA
          }
        },
        customFields: {
          type: 'array',
          title: 'Custom Fields',
          items: {
            type: 'object',
            properties: {
              figshareField: { type: 'string', title: 'Figshare Field' },
              value: VALUE_BINDING_SCHEMA,
              validations: {
                type: 'array',
                title: 'Validations',
                items: {
                  type: 'object',
                  properties: {
                    type: {
                      type: 'string',
                      title: 'Type',
                      enum: ['maxLength', 'url', 'doi', 'required']
                    },
                    value: {
                      type: 'integer',
                      title: 'Value'
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    categories: {
      type: 'object',
      title: 'Categories',
      properties: {
        strategy: {
          type: 'string',
          title: 'Strategy',
          enum: ['for2020Mapping'],
          default: 'for2020Mapping'
        },
        mappingTable: {
          type: 'array',
          title: 'Mapping Table',
          items: {
            type: 'object',
            properties: {
              sourceCode: { type: 'string', title: 'Source Code' },
              figshareCategoryId: { type: 'integer', title: 'Figshare Category ID' }
            }
          },
          ...CATEGORY_MAPPING_EDITOR_WIDGET
        },
        allowUnmapped: { type: 'boolean', title: 'Allow Unmapped Categories', default: false }
      }
    },
    assets: {
      type: 'object',
      title: 'Assets',
      properties: {
        enableHostedFiles: { type: 'boolean', title: 'Enable Hosted Files', default: true },
        enableLinkFiles: { type: 'boolean', title: 'Enable Link Files', default: true },
        dedupeStrategy: {
          type: 'string',
          title: 'Dedupe Strategy',
          enum: ['sourceId', 'nameAndMd5', 'url'],
          default: 'sourceId'
        },
        staging: {
          type: 'object',
          title: 'Staging',
          properties: {
            tempDir: { type: 'string', title: 'Temp Directory' },
            cleanupPolicy: {
              type: 'string',
              title: 'Cleanup Policy',
              enum: ['deleteAfterSuccess', 'retainForRetry'],
              default: 'deleteAfterSuccess'
            },
            diskSpaceThresholdBytes: { type: 'integer', title: 'Disk Space Threshold Bytes', default: 1073741824 }
          }
        }
      }
    },
    embargo: {
      type: 'object',
      title: 'Embargo',
      properties: {
        mode: {
          type: 'string',
          title: 'Mode',
          enum: ['none', 'recordDriven'],
          default: 'recordDriven'
        },
        forceSync: { type: 'boolean', title: 'Force Sync', default: false },
        accessRights: {
          type: 'object',
          title: 'Access Rights Binding',
          properties: {
            accessRights: VALUE_BINDING_SCHEMA,
            fullEmbargoUntil: VALUE_BINDING_SCHEMA,
            fileEmbargoUntil: VALUE_BINDING_SCHEMA,
            reason: VALUE_BINDING_SCHEMA
          }
        }
      }
    },
    workflow: {
      type: 'object',
      title: 'Workflow',
      properties: {
        transitionRules: {
          type: 'array',
          title: 'Transition Rules',
          items: {
            type: 'object',
            properties: {
              when: {
                type: 'string',
                title: 'When',
                enum: ['published', 'republished', 'embargoUpdated', 'awaitingUploadCompletion']
              },
              targetWorkflowStageName: { type: 'string', title: 'Target Workflow Stage Name' },
              targetWorkflowStageLabel: { type: 'string', title: 'Target Workflow Stage Label' },
              targetForm: { type: 'string', title: 'Target Form' },
              ifArticleField: { type: 'string', title: 'Article Field' },
              equals: { title: 'Equals' }
            }
          }
        }
      }
    },
    testing: {
      type: 'object',
      title: 'Testing',
      properties: {
        mode: {
          type: 'string',
          title: 'Mode',
          enum: ['live', 'fixture'],
          default: 'live'
        },
        fixtures: {
          type: 'object',
          title: 'Fixtures',
          properties: {
            authors: { type: 'array', title: 'Authors', items: { type: 'object' } },
            licenses: { type: 'array', title: 'Licenses', items: { type: 'object' } },
            categories: { type: 'array', title: 'Categories', items: { type: 'object' } },
            article: { type: 'object', title: 'Article' },
            articleFiles: { type: 'array', title: 'Article Files', items: { type: 'object' } },
            publishResult: { type: 'object', title: 'Publish Result' }
          }
        }
      }
    },
    writeBack: {
      type: 'object',
      title: 'Write Back',
      properties: {
        articleId: { type: 'string', title: 'Article ID Target Path', default: 'metadata.figshare_article_id' },
        articleUrls: {
          type: 'array',
          title: 'Article URL Target Paths',
          items: { type: 'string' },
          default: ['metadata.figshare_article_location']
        },
        extraFields: {
          type: 'array',
          title: 'Extra Fields',
          items: {
            type: 'object',
            properties: {
              from: {
                type: 'string',
                title: 'From',
                enum: ['article', 'publishResult', 'assetSyncResult']
              },
              sourcePath: { type: 'string', title: 'Source Path' },
              targetPath: { type: 'string', title: 'Target Path' }
            }
          }
        }
      }
    }
  }
};
