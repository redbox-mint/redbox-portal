export type UnknownRecord = Record<string, unknown>;

export interface SailsAgendaQueueConfig {
  collection?: string;
  options?: UnknownRecord;
  jobs?: UnknownRecord[];
}

export interface SailsApiConfig {
  additionalClientConfig?: UnknownRecord;
  max_requests?: number | string;
}

export interface SailsAppModeConfig {
  bootstrapAlways?: boolean;
  hidePlaceholderPages?: boolean;
  features?: UnknownRecord;
  flags?: UnknownRecord;
  [key: string]: unknown;
}

export interface SailsAuthConfig {
  defaultBrand?: string;
  defaultPortal?: string;
  hiddenRoles?: string[];
  hiddenUsers?: string[];
  loginPath?: string;
  postLogoutRedir?: string;
  roles?: Array<{ name?: string; [key: string]: unknown }>;
  rules?: UnknownRecord;
}

export interface SailsBrandingConfig {
  logoMaxBytes?: number;
  previewTtlSeconds?: number;
  variableAllowList?: string[];
}

export interface SailsBrandingAwareConfig {
  systemMessage?: {
    enabled?: boolean;
    title?: string;
    message?: string;
  };
  [key: string]: unknown;
}

export interface SailsCrontabConfig {
  enabled?: boolean;
  crons?: () => Array<UnknownRecord>;
  [key: string]: unknown;
}

export interface SailsDataciteConfig {
  baseUrl?: string;
  citationDoiProperty?: string;
  citationStringTemplate?: string;
  citationUrlProperty?: string;
  creatorsProperty?: string;
  doiPrefix?: string;
  generatedCitationStringProperty?: string;
  mappings?: UnknownRecord;
  password?: string;
  username?: string;
}

export interface SailsDatapubsConfig {
  metadata?: {
    DEFAULT_IRI_PREFS?: UnknownRecord;
    funders?: UnknownRecord;
    organization?: UnknownRecord;
    related_works?: UnknownRecord;
    subjects?: UnknownRecord;
  };
  rootCollection?: {
    defaultLicense?: string;
    enableDatasetToUseDefaultLicense?: boolean;
    targetRepoNamespace?: string;
  };
  sites?: UnknownRecord;
}

export interface SailsDatastoresConfig {
  mongodb?: {
    database?: string;
    host?: string;
    password?: string;
    port?: number | null;
    url?: string;
    user?: string;
  };
}

export interface SailsEmailNotificationConfig {
  defaults?: {
    subject?: string;
    from?: string;
    format?: string;
    cc?: string;
    bcc?: string;
    otherSendOptions?: UnknownRecord;
    [key: string]: unknown;
  };
  settings?: {
    enabled?: boolean;
    serverOptions?: UnknownRecord;
    templateDir?: string;
    [key: string]: unknown;
  };
  templates?: UnknownRecord;
}

export interface SailsFigshareRuntimeArtifactsConfig {
  getCategoryIDs?: { template?: string };
  getContributorsFromRecord?: { template?: string };
  isRecordEmbargoCleared?: { template?: string };
  isRecordEmbargoed?: { template?: string };
}

export interface SailsFigshareMappingConfig {
  artifacts?: UnknownRecord;
  customFields?: {
    create?: string[];
    update?: string[];
    path?: string;
  };
  figshareAuthorUserId?: string;
  figshareCurationStatus?: string;
  figshareCurationStatusTargetValue?: string;
  figshareDisableUpdateByCurationStatus?: boolean;
  figshareForceEmbargoUpdateAlways?: boolean;
  figshareItemGroupId?: string;
  figshareItemType?: string;
  figshareNeedsPublishAfterFileUpload?: boolean;
  figshareOnlyPublishSelectedAttachmentFiles?: boolean;
  figshareOnlyPublishSelectedLocationURLs?: boolean;
  figshareScheduledTransitionRecordWorkflowFromArticlePropertiesJob?: string;
  recordAllFilesUploaded?: string;
  recordAuthorExternalName?: string;
  recordAuthorUniqueBy?: string;
  recordDataLocations?: string;
  recordFigArticleId?: string;
  recordFigArticleURL?: string;
  response?: {
    article?: string[];
    entityId?: string;
    location?: string;
  };
  runtimeArtifacts?: SailsFigshareRuntimeArtifactsConfig;
  schedulePublishAfterUploadJob?: string;
  scheduleUploadedFilesCleanupJob?: string;
  standardFields?: {
    create?: string[];
    update?: string[];
    embargo?: string[];
  };
  targetState?: {
    draft?: string;
    publish?: string;
  };
  templates?: {
    customFields?: {
      create?: string[];
      update?: string[];
    };
    getAuthor?: string;
    impersonate?: string;
  };
  upload?: {
    attachments?: string;
    fileListPageSize?: number;
    override?: {
      template?: string;
    };
  };
}

export interface SailsFigshareApiConfig {
  APIToken?: string;
  attachmentsFigshareTempDir?: string;
  attachmentsTempDir?: string;
  baseURL?: string;
  diskSpaceThreshold?: number;
  extraVerboseLogging?: boolean;
  frontEndURL?: string;
  mapping?: SailsFigshareMappingConfig;
  testCategories?: UnknownRecord;
  testLicenses?: UnknownRecord;
  testMode?: boolean;
  testUsers?: UnknownRecord;
}

export interface SailsFormConfig {
  defaultForm?: string;
  forms?: UnknownRecord;
}

export interface SailsI18nConfig {
  next?: {
    init?: {
      fallbackLng?: string | string[];
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface SailsJsonLdConfig {
  addJsonLdContext?: boolean;
  contexts?: Record<string, string>;
  [key: string]: unknown;
}

export interface SailsLogConfig {
  level?: string;
  customLogger?: unknown;
  createNamespaceLogger?: (name: string, parentLogger?: unknown, prefix?: string, level?: string) => unknown;
  createPinoLogger?: (level?: string, destination?: unknown) => unknown;
  [key: string]: unknown;
}

export interface SailsMintConfig {
  api?: {
    search?: {
      url?: string;
    };
  };
  apiKey?: string;
  mintRootUri?: string;
}

export interface SailsQueueConfig {
  serviceName?: string;
}

export interface SailsRaidConfig {
  basePath?: string;
  oauth?: {
    client_id?: string;
    password?: string;
    url?: string;
    username?: string;
  };
  orcidBaseUrl?: string;
  password?: string;
  retryJobMaxAttempts?: number;
  retryJobName?: string;
  retryJobSchedule?: string;
  saveBodyInMeta?: boolean;
  token?: string;
  types?: {
    contributor?: {
      flags?: UnknownRecord;
      hiearchy?: { position?: string };
      position?: string;
      roles?: {
        schemaUri?: string;
        types?: UnknownRecord;
      };
    };
    subject?: UnknownRecord;
  };
  username?: string;
}

export interface SailsRecordConfig {
  api?: {
    info?: {
      method?: string;
      url?: string;
    };
    search?: {
      method?: string;
      url?: string;
    };
  };
  attachment?: {
    stageDir?: string;
  };
  attachments?: {
    path?: string;
    stageDir?: string;
  };
  auditing?: {
    enabled?: boolean | string;
    recordAuditJobName?: string;
  };
  baseUrl?: {
    mint?: string;
    redbox?: string;
  };
  checkTotalSizeOfFilesInRecordLogLevel?: string;
  createUpdateFigshareArticleLogLevel?: string;
  customFields?: UnknownRecord;
  datastreamService?: string;
  diskSpaceThreshold?: number;
  export?: {
    maxRecords?: number;
  };
  maxUploadSize?: number;
  mongodbDisk?: string;
  processRecordCountersLogLevel?: string;
  search?: {
    maxRecordsPerPage?: number;
    returnFields?: string[];
  };
  transfer?: {
    maxRecordsPerPage?: number;
  };
}

export interface SailsSearchConfig {
  serviceName?: string;
}

export interface SailsSolrConfig {
  clientSleepTimeMillis?: number;
  cores?: Record<string, { preIndex?: UnknownRecord }>;
  createOrUpdateJobName?: string;
  deleteJobName?: string;
  maxWaitTries?: number;
  waitTime?: number;
}

export interface SailsStaticAssetsConfig {
  imageType?: string;
  logoName?: string;
}

export interface SailsStorageConfig {
  serviceName?: string;
}

export interface SailsVocabConfig {
  bootStrapVocabs?: UnknownRecord;
  clientUri?: string;
  collection?: UnknownRecord;
  collectionUri?: string;
  conceptUri?: string;
  external?: UnknownRecord;
  nonAnds?: UnknownRecord;
  queries?: UnknownRecord;
  rootUrl?: string;
  userRootUri?: string;
}

export interface SailsConfig {
  action?: UnknownRecord;
  agendaQueue?: SailsAgendaQueueConfig;
  angularDev?: boolean;
  api?: SailsApiConfig;
  appPath?: string;
  appUrl?: string;
  appmode?: SailsAppModeConfig;
  auth?: SailsAuthConfig;
  blueprints?: { html?: unknown; [key: string]: unknown };
  bootstrap?: { html?: unknown; [key: string]: unknown };
  branding?: SailsBrandingConfig;
  brandingAware?: ((branding: string) => SailsBrandingAwareConfig) | SailsBrandingAwareConfig;
  brandingConfigurationDefaults?: UnknownRecord;
  configmodels?: UnknownRecord;
  controllers?: { moduleDefinitions?: UnknownRecord; [key: string]: unknown };
  cors?: { html?: unknown; [key: string]: unknown };
  crontab?: SailsCrontabConfig;
  csp?: UnknownRecord;
  csrf?: { html?: unknown; [key: string]: unknown };
  custom?: { cacheControl?: { noCache?: string[] }; [key: string]: unknown };
  custom_cache?: { cacheExpiry?: number; checkPeriod?: number; [key: string]: unknown };
  dashboardtype?: UnknownRecord;
  datacite?: SailsDataciteConfig;
  datapubs?: SailsDatapubsConfig;
  datastores?: SailsDatastoresConfig;
  dompurify?: UnknownRecord;
  dontBackupCoreLanguageFilesWhenMerging?: boolean;
  dynamicasset?: UnknownRecord;
  dynamicconfig?: UnknownRecord;
  emailnotification?: SailsEmailNotificationConfig;
  enableNewForm?: boolean;
  environment?: string;
  figshareAPI?: SailsFigshareApiConfig;
  figshareAPIEnv?: UnknownRecord;
  figshareReDBoxFORMapping?: { FORMapping?: UnknownRecord };
  form?: SailsFormConfig;
  globals?: UnknownRecord;
  hooks?: { views?: boolean; [key: string]: unknown };
  http?: { html?: unknown; rootContext?: string; [key: string]: unknown };
  i18n?: SailsI18nConfig;
  jsonld?: SailsJsonLdConfig;
  keepResponseErrors?: boolean;
  log?: SailsLogConfig;
  lognamespace?: Record<string, string>;
  mint?: SailsMintConfig;
  models?: UnknownRecord;
  namedQuery?: Record<string, unknown>;
  ng2?: { apps?: Record<string, unknown>; force_bundle?: boolean; use_bundled?: boolean; [key: string]: unknown };
  orcid?: { url?: string; [key: string]: unknown };
  orm?: UnknownRecord;
  passport?: any;
  peopleSearch?: Record<string, unknown>;
  policies?: { html?: unknown; [key: string]: unknown };
  queue?: SailsQueueConfig;
  raid?: SailsRaidConfig;
  record?: SailsRecordConfig;
  recordtype?: UnknownRecord;
  redbox?: { apiKey?: string; [key: string]: unknown };
  redboxSession?: UnknownRecord;
  redboxToCkan?: UnknownRecord;
  reports?: UnknownRecord;
  reusableFormDefinitions?: UnknownRecord;
  routes?: UnknownRecord;
  search?: SailsSearchConfig;
  security?: { csrf?: boolean | string; csp?: UnknownRecord; [key: string]: unknown };
  session?: { cookie?: { maxAge?: number }; html?: unknown; [key: string]: unknown };
  sockets?: { html?: unknown; [key: string]: unknown };
  solr?: SailsSolrConfig;
  startupMinute?: number;
  static_assets?: SailsStaticAssetsConfig;
  storage?: SailsStorageConfig;
  typescript?: UnknownRecord;
  validators?: { definitions?: UnknownRecord; [key: string]: unknown };
  views?: { noCache?: string[]; [key: string]: unknown };
  vocab?: SailsVocabConfig;
  webpack?: { config?: unknown; [key: string]: unknown };
  workflow?: Record<string, unknown>;
  workspacetype?: UnknownRecord;
  workspacetype_services?: UnknownRecord;
}
