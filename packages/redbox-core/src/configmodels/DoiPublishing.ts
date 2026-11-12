import _ from 'lodash';
import { AppConfig } from './AppConfig.interface';


/** Bindings may read record.relatedMetadata when operation options opt in to related resolution. */
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
export type DoiBindingKind = ValueBinding['kind'];

export interface DoiArraySourceMapping {
  /** Record path to repeatable values; when set, one entry is mapped per value, exposed to bindings as `item` and `index`. */
  sourcePath?: string;
}

export interface DoiNameIdentifierMapping {
  nameIdentifier: ValueBinding;
  nameIdentifierScheme?: ValueBinding;
  schemeUri?: ValueBinding;
}

export interface DoiAffiliationMapping {
  name?: ValueBinding;
  affiliationIdentifier?: ValueBinding;
  affiliationIdentifierScheme?: ValueBinding;
  schemeUri?: ValueBinding;
}

export interface DoiCreatorMapping {
  sourcePath: string;
  itemMode: 'array';
  name: ValueBinding;
  nameType?: ValueBinding;
  givenName?: ValueBinding;
  familyName?: ValueBinding;
  affiliations?: DoiAffiliationMapping[];
  nameIdentifiers?: DoiNameIdentifierMapping[];
}

export interface DoiContributorMapping extends DoiCreatorMapping {
  contributorType: ValueBinding;
}

export interface DoiTitleMapping extends DoiArraySourceMapping {
  title: ValueBinding;
  titleType?: ValueBinding;
  lang?: ValueBinding;
}

export interface DoiSubjectMapping extends DoiArraySourceMapping {
  subject: ValueBinding;
  subjectScheme?: ValueBinding;
  schemeUri?: ValueBinding;
  valueUri?: ValueBinding;
  classificationCode?: ValueBinding;
  lang?: ValueBinding;
}

export interface DoiDateMapping extends DoiArraySourceMapping {
  date: ValueBinding;
  dateType: ValueBinding;
  dateInformation?: ValueBinding;
}

export interface DoiIdentifierMapping extends DoiArraySourceMapping {
  identifier: ValueBinding;
  identifierType: ValueBinding;
}

export interface DoiRelatedIdentifierMapping extends DoiArraySourceMapping {
  relatedIdentifier: ValueBinding;
  relatedIdentifierType: ValueBinding;
  relationType: ValueBinding;
  relatedMetadataScheme?: ValueBinding;
  schemeUri?: ValueBinding;
  schemeType?: ValueBinding;
  resourceTypeGeneral?: ValueBinding;
}

export interface DoiRightsMapping extends DoiArraySourceMapping {
  rights?: ValueBinding;
  rightsUri?: ValueBinding;
  rightsIdentifier?: ValueBinding;
  rightsIdentifierScheme?: ValueBinding;
  schemeUri?: ValueBinding;
  lang?: ValueBinding;
}

export interface DoiDescriptionMapping extends DoiArraySourceMapping {
  description: ValueBinding;
  descriptionType: ValueBinding;
  lang?: ValueBinding;
}

export interface DoiGeoLocationPointMapping {
  pointLongitude: ValueBinding;
  pointLatitude: ValueBinding;
}

export interface DoiGeoLocationBoxMapping {
  westBoundLongitude: ValueBinding;
  eastBoundLongitude: ValueBinding;
  southBoundLatitude: ValueBinding;
  northBoundLatitude: ValueBinding;
}

export interface DoiGeoLocationPlaceMapping {
  geoLocationPlace: ValueBinding;
}

export interface DoiGeoLocationMapping {
  geoLocationPoint?: DoiGeoLocationPointMapping;
  geoLocationBox?: DoiGeoLocationBoxMapping;
  geoLocationPlace?: DoiGeoLocationPlaceMapping;
}

export interface DoiFundingReferenceMapping extends DoiArraySourceMapping {
  funderName: ValueBinding;
  funderIdentifier?: ValueBinding;
  funderIdentifierType?: ValueBinding;
  awardNumber?: ValueBinding;
  awardUri?: ValueBinding;
  awardTitle?: ValueBinding;
}

export interface DoiRelatedItemMapping {
  relationType: ValueBinding;
  relatedItemType: ValueBinding;
  titles?: DoiTitleMapping[];
  creators?: DoiCreatorMapping[];
  publicationYear?: ValueBinding;
  volume?: ValueBinding;
  issue?: ValueBinding;
  number?: ValueBinding;
  firstPage?: ValueBinding;
  lastPage?: ValueBinding;
  publisher?: ValueBinding;
  edition?: ValueBinding;
  contributors?: DoiContributorMapping[];
}

export interface DoiProfile {
  enabled: boolean;
  label: string;
  metadata: {
    doi?: ValueBinding;
    prefix?: ValueBinding;
    url: ValueBinding;
    contentUrl?: ValueBinding;
    publicationYear: ValueBinding;
    language?: ValueBinding;
    publisher: ValueBinding;
    version?: ValueBinding;
    formats?: ValueBinding;
    sizes?: ValueBinding;
    creators: DoiCreatorMapping[];
    titles: DoiTitleMapping[];
    subjects?: DoiSubjectMapping[];
    contributors?: DoiContributorMapping[];
    dates?: DoiDateMapping[];
    alternateIdentifiers?: DoiIdentifierMapping[];
    relatedIdentifiers?: DoiRelatedIdentifierMapping[];
    rightsList?: DoiRightsMapping[];
    descriptions?: DoiDescriptionMapping[];
    geoLocations?: DoiGeoLocationMapping[];
    fundingReferences?: DoiFundingReferenceMapping[];
    relatedItems?: DoiRelatedItemMapping[];
    types: {
      resourceTypeGeneral: ValueBinding;
      resourceType?: ValueBinding;
      ris?: ValueBinding;
      bibtex?: ValueBinding;
      citeproc?: ValueBinding;
      schemaOrg?: ValueBinding;
    };
  };
  writeBack: {
    citationUrlPath: string;
    citationDoiPath: string;
    generatedCitationPath?: string;
    citationString?: ValueBinding;
    extraFields?: Array<{
      sourcePath: string;
      targetPath: string;
    }>;
  };
  validation: {
    requireUrl: boolean;
    requirePublisher: boolean;
    requirePublicationYear: boolean;
    requireCreators: boolean;
    requireTitles: boolean;
  };
}

export interface DoiProfileFormEntry extends DoiProfile {
  name: string;
}

export interface DoiPublishingConfigData {
  enabled: boolean;
  defaultProfile?: string;
  connection: {
    baseUrl: string;
    username: string;
    password: string;
    timeoutMs: number;
    retry: {
      maxAttempts: number;
      baseDelayMs: number;
      maxDelayMs: number;
      retryOnStatusCodes: number[];
      retryOnMethods: string[];
    };
  };
  operations: {
    createEvent: 'draft' | 'register' | 'publish';
    updateEvent: 'draft' | 'register' | 'publish' | 'hide';
    allowDeleteDraft: boolean;
    allowStateChange: boolean;
  };
  profiles: Record<string, DoiProfile>;
}

export interface DoiPublishingFormData extends Omit<DoiPublishingConfigData, 'profiles'> {
  profiles: DoiProfileFormEntry[];
}

export function createDefaultBinding(path: string, defaultValue?: unknown): ValueBinding {
  return {
    kind: 'path',
    path,
    defaultValue
  };
}

export function resolveDoiConnectionPassword(
  password: string,
  options: { allowEmpty?: boolean; fallbackEnvVarNames?: string[] } = {}
): string {
  const value = typeof password === 'string' ? password.trim() : '';
  if (value.startsWith('$')) {
    const envVarName = value.slice(1);
    const resolved = process.env[envVarName]?.trim() ?? '';
    if (!resolved && !options.allowEmpty) {
      throw new Error(`DOI connection password environment variable '${envVarName}' is not set or is empty`);
    }
    return resolved;
  }
  if (!value) {
    for (const envVarName of options.fallbackEnvVarNames ?? []) {
      const resolved = process.env[envVarName]?.trim() ?? '';
      if (resolved) {
        return resolved;
      }
    }
  }
  if (!value && !options.allowEmpty) {
    throw new Error('DOI connection password must not be empty');
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function normaliseProfileName(name: unknown, fallback: string): string {
  const trimmed = String(name ?? '').trim();
  return trimmed !== '' ? trimmed : fallback;
}

function cloneProfileAsFormEntry(name: string, profile: unknown): DoiProfileFormEntry {
  const entry = isRecord(profile) ? _.cloneDeep(profile) as Record<string, unknown> : {};
  return {
    ...(entry as Record<string, unknown>),
    name
  } as unknown as DoiProfileFormEntry;
}

export function toDoiPublishingFormModel(model: unknown): DoiPublishingFormData {
  const cloned = _.cloneDeep(model ?? {}) as Record<string, unknown>;
  const profiles = cloned.profiles;

  if (Array.isArray(profiles)) {
    cloned.profiles = profiles.map((profile, index) => {
      if (!isRecord(profile)) {
        return { name: `profile-${index + 1}` } as unknown as DoiProfileFormEntry;
      }
      const entry = _.cloneDeep(profile) as Record<string, unknown>;
      entry.name = normaliseProfileName(entry.name, `profile-${index + 1}`);
      return entry as unknown as DoiProfileFormEntry;
    });
    return cloned as unknown as DoiPublishingFormData;
  }

  if (isRecord(profiles)) {
    cloned.profiles = Object.entries(profiles).map(([name, profile], index) => {
      const entryName = normaliseProfileName(name, `profile-${index + 1}`);
      return cloneProfileAsFormEntry(entryName, profile);
    });
    return cloned as unknown as DoiPublishingFormData;
  }

  cloned.profiles = [];
  return cloned as unknown as DoiPublishingFormData;
}

export function fromDoiPublishingFormModel(model: unknown): DoiPublishingConfigData {
  const cloned = _.cloneDeep(model ?? {}) as Record<string, unknown>;
  const profiles = cloned.profiles;

  if (!Array.isArray(profiles)) {
    return cloned as unknown as DoiPublishingConfigData;
  }

  const mappedProfiles: Record<string, DoiProfile> = {};
  profiles.forEach((profile, index) => {
    if (!isRecord(profile)) {
      return;
    }
    const entry = _.cloneDeep(profile) as Record<string, unknown>;
    const name = normaliseProfileName(entry.name, `profile-${index + 1}`);
    if (mappedProfiles[name] != null) {
      throw new Error(
        `Duplicate DOI profile name '${name}' resolved from profile entry at index ${index} (original name: '${String(entry.name ?? '')}').`
      );
    }
    delete entry.name;
    mappedProfiles[name] = entry as unknown as DoiProfile;
  });

  cloned.profiles = mappedProfiles;
  return cloned as unknown as DoiPublishingConfigData;
}

const VALUE_BINDING_EDITOR_WIDGET = {
  widget: {
    formlyConfig: {
      type: 'value-binding-editor'
    }
  }
};

const VALUE_BINDING_SCHEMA = {
  type: 'object',
  title: 'admin-config-label-binding',
  properties: {
    kind: {
      type: 'string',
      title: 'admin-config-label-binding-type',
      enum: ['path', 'handlebars', 'jsonata'],
      default: 'path'
    },
    path: {
      type: 'string',
      title: 'admin-config-label-record-path'
    },
    template: {
      type: 'string',
      title: 'admin-config-label-handlebars-template'
    },
    expression: {
      type: 'string',
      title: 'admin-config-label-jsonata-expression'
    },
    defaultValue: {
      title: 'admin-config-label-default-value'
    }
  },
  required: ['kind'],
  ...VALUE_BINDING_EDITOR_WIDGET
};

const NAME_IDENTIFIER_SCHEMA = {
  type: 'object',
  title: 'admin-config-label-name-identifier',
  properties: {
    nameIdentifier: VALUE_BINDING_SCHEMA,
    nameIdentifierScheme: VALUE_BINDING_SCHEMA,
    schemeUri: VALUE_BINDING_SCHEMA
  }
};

const AFFILIATION_SCHEMA = {
  type: 'object',
  title: 'admin-config-label-affiliation',
  properties: {
    name: VALUE_BINDING_SCHEMA,
    affiliationIdentifier: VALUE_BINDING_SCHEMA,
    affiliationIdentifierScheme: VALUE_BINDING_SCHEMA,
    schemeUri: VALUE_BINDING_SCHEMA
  }
};

const CREATOR_SCHEMA = {
  type: 'object',
  title: 'admin-config-label-creator',
  properties: {
    sourcePath: { type: 'string', title: 'admin-config-label-source-path' },
    itemMode: {
      type: 'string',
      title: 'admin-config-label-item-mode',
      enum: ['array'],
      default: 'array'
    },
    name: VALUE_BINDING_SCHEMA,
    nameType: VALUE_BINDING_SCHEMA,
    givenName: VALUE_BINDING_SCHEMA,
    familyName: VALUE_BINDING_SCHEMA,
    affiliations: {
      type: 'array',
      title: 'admin-config-label-affiliations',
      items: AFFILIATION_SCHEMA,
      default: []
    },
    nameIdentifiers: {
      type: 'array',
      title: 'admin-config-label-name-identifiers',
      items: NAME_IDENTIFIER_SCHEMA,
      default: []
    }
  },
  required: ['sourcePath', 'itemMode', 'name']
};

const CONTRIBUTOR_SCHEMA = {
  type: 'object',
  title: 'admin-config-label-contributor',
  properties: {
    sourcePath: { type: 'string', title: 'admin-config-label-source-path' },
    itemMode: {
      type: 'string',
      title: 'admin-config-label-item-mode',
      enum: ['array'],
      default: 'array'
    },
    name: VALUE_BINDING_SCHEMA,
    nameType: VALUE_BINDING_SCHEMA,
    givenName: VALUE_BINDING_SCHEMA,
    familyName: VALUE_BINDING_SCHEMA,
    affiliations: {
      type: 'array',
      title: 'admin-config-label-affiliations',
      items: AFFILIATION_SCHEMA,
      default: []
    },
    nameIdentifiers: {
      type: 'array',
      title: 'admin-config-label-name-identifiers',
      items: NAME_IDENTIFIER_SCHEMA,
      default: []
    },
    contributorType: VALUE_BINDING_SCHEMA
  },
  required: ['sourcePath', 'itemMode', 'name', 'contributorType']
};

const OPTIONAL_ARRAY_SOURCE_PROPERTIES = {
  sourcePath: { type: 'string', title: 'admin-config-label-source-path' }
};

const TITLE_SCHEMA = {
  type: 'object',
  title: 'admin-config-label-title',
  properties: {
    ...OPTIONAL_ARRAY_SOURCE_PROPERTIES,
    title: VALUE_BINDING_SCHEMA,
    titleType: VALUE_BINDING_SCHEMA,
    lang: VALUE_BINDING_SCHEMA
  },
  required: ['title']
};

const SUBJECT_SCHEMA = {
  type: 'object',
  title: 'admin-config-label-subject',
  properties: {
    ...OPTIONAL_ARRAY_SOURCE_PROPERTIES,
    subject: VALUE_BINDING_SCHEMA,
    subjectScheme: VALUE_BINDING_SCHEMA,
    schemeUri: VALUE_BINDING_SCHEMA,
    valueUri: VALUE_BINDING_SCHEMA,
    classificationCode: VALUE_BINDING_SCHEMA,
    lang: VALUE_BINDING_SCHEMA
  },
  required: ['subject']
};

const DATE_SCHEMA = {
  type: 'object',
  title: 'admin-config-label-date',
  properties: {
    ...OPTIONAL_ARRAY_SOURCE_PROPERTIES,
    date: VALUE_BINDING_SCHEMA,
    dateType: VALUE_BINDING_SCHEMA,
    dateInformation: VALUE_BINDING_SCHEMA
  },
  required: ['date', 'dateType']
};

const IDENTIFIER_SCHEMA = {
  type: 'object',
  title: 'admin-config-label-alternate-identifier',
  properties: {
    ...OPTIONAL_ARRAY_SOURCE_PROPERTIES,
    identifier: VALUE_BINDING_SCHEMA,
    identifierType: VALUE_BINDING_SCHEMA
  },
  required: ['identifier', 'identifierType']
};

const RELATED_IDENTIFIER_SCHEMA = {
  type: 'object',
  title: 'admin-config-label-related-identifier',
  properties: {
    ...OPTIONAL_ARRAY_SOURCE_PROPERTIES,
    relatedIdentifier: VALUE_BINDING_SCHEMA,
    relatedIdentifierType: VALUE_BINDING_SCHEMA,
    relationType: VALUE_BINDING_SCHEMA,
    relatedMetadataScheme: VALUE_BINDING_SCHEMA,
    schemeUri: VALUE_BINDING_SCHEMA,
    schemeType: VALUE_BINDING_SCHEMA,
    resourceTypeGeneral: VALUE_BINDING_SCHEMA
  },
  required: ['relatedIdentifier', 'relatedIdentifierType', 'relationType']
};

const RIGHTS_SCHEMA = {
  type: 'object',
  title: 'admin-config-label-rights',
  properties: {
    ...OPTIONAL_ARRAY_SOURCE_PROPERTIES,
    rights: VALUE_BINDING_SCHEMA,
    rightsUri: VALUE_BINDING_SCHEMA,
    rightsIdentifier: VALUE_BINDING_SCHEMA,
    rightsIdentifierScheme: VALUE_BINDING_SCHEMA,
    schemeUri: VALUE_BINDING_SCHEMA,
    lang: VALUE_BINDING_SCHEMA
  }
};

const DESCRIPTION_SCHEMA = {
  type: 'object',
  title: 'admin-config-label-description',
  properties: {
    ...OPTIONAL_ARRAY_SOURCE_PROPERTIES,
    description: VALUE_BINDING_SCHEMA,
    descriptionType: VALUE_BINDING_SCHEMA,
    lang: VALUE_BINDING_SCHEMA
  },
  required: ['description', 'descriptionType']
};

const GEOLOCATION_POINT_SCHEMA = {
  type: 'object',
  title: 'admin-config-label-geo-location-point',
  properties: {
    pointLongitude: VALUE_BINDING_SCHEMA,
    pointLatitude: VALUE_BINDING_SCHEMA
  },
  required: ['pointLongitude', 'pointLatitude']
};

const GEOLOCATION_BOX_SCHEMA = {
  type: 'object',
  title: 'admin-config-label-geo-location-box',
  properties: {
    westBoundLongitude: VALUE_BINDING_SCHEMA,
    eastBoundLongitude: VALUE_BINDING_SCHEMA,
    southBoundLatitude: VALUE_BINDING_SCHEMA,
    northBoundLatitude: VALUE_BINDING_SCHEMA
  },
  required: ['westBoundLongitude', 'eastBoundLongitude', 'southBoundLatitude', 'northBoundLatitude']
};

const GEOLOCATION_PLACE_SCHEMA = {
  type: 'object',
  title: 'admin-config-label-geo-location-place',
  properties: {
    geoLocationPlace: VALUE_BINDING_SCHEMA
  },
  required: ['geoLocationPlace']
};

const GEOLOCATION_SCHEMA = {
  type: 'object',
  title: 'admin-config-label-geo-location',
  properties: {
    geoLocationPoint: GEOLOCATION_POINT_SCHEMA,
    geoLocationBox: GEOLOCATION_BOX_SCHEMA,
    geoLocationPlace: GEOLOCATION_PLACE_SCHEMA
  }
};

const FUNDING_REFERENCE_SCHEMA = {
  type: 'object',
  title: 'admin-config-label-funding-reference',
  properties: {
    ...OPTIONAL_ARRAY_SOURCE_PROPERTIES,
    funderName: VALUE_BINDING_SCHEMA,
    funderIdentifier: VALUE_BINDING_SCHEMA,
    funderIdentifierType: VALUE_BINDING_SCHEMA,
    awardNumber: VALUE_BINDING_SCHEMA,
    awardUri: VALUE_BINDING_SCHEMA,
    awardTitle: VALUE_BINDING_SCHEMA
  },
  required: ['funderName']
};

const RELATED_ITEM_SCHEMA = {
  type: 'object',
  title: 'admin-config-label-related-item',
  properties: {
    relationType: VALUE_BINDING_SCHEMA,
    relatedItemType: VALUE_BINDING_SCHEMA,
    titles: {
      type: 'array',
      title: 'admin-config-label-titles',
      items: TITLE_SCHEMA,
      default: []
    },
    creators: {
      type: 'array',
      title: 'admin-config-label-creators',
      items: CREATOR_SCHEMA,
      default: []
    },
    publicationYear: VALUE_BINDING_SCHEMA,
    volume: VALUE_BINDING_SCHEMA,
    issue: VALUE_BINDING_SCHEMA,
    number: VALUE_BINDING_SCHEMA,
    firstPage: VALUE_BINDING_SCHEMA,
    lastPage: VALUE_BINDING_SCHEMA,
    publisher: VALUE_BINDING_SCHEMA,
    edition: VALUE_BINDING_SCHEMA,
    contributors: {
      type: 'array',
      title: 'admin-config-label-contributors',
      items: CONTRIBUTOR_SCHEMA,
      default: []
    }
  },
  required: ['relationType', 'relatedItemType']
};

const TYPE_SCHEMA = {
  type: 'object',
  title: 'admin-config-label-types',
  properties: {
    resourceTypeGeneral: VALUE_BINDING_SCHEMA,
    resourceType: VALUE_BINDING_SCHEMA,
    ris: VALUE_BINDING_SCHEMA,
    bibtex: VALUE_BINDING_SCHEMA,
    citeproc: VALUE_BINDING_SCHEMA,
    schemaOrg: VALUE_BINDING_SCHEMA
  },
  required: ['resourceTypeGeneral']
};

const WRITE_BACK_SCHEMA = {
  type: 'object',
  title: 'admin-config-label-write-back',
  properties: {
    citationUrlPath: { type: 'string', title: 'admin-config-label-citation-url-path' },
    citationDoiPath: { type: 'string', title: 'admin-config-label-citation-doi-path' },
    generatedCitationPath: { type: 'string', title: 'admin-config-label-generated-citation-path' },
    citationString: VALUE_BINDING_SCHEMA,
    extraFields: {
      type: 'array',
      title: 'admin-config-label-extra-fields',
      items: {
        type: 'object',
        properties: {
          sourcePath: { type: 'string', title: 'admin-config-label-source-path' },
          targetPath: { type: 'string', title: 'admin-config-label-target-path' }
        },
        required: ['sourcePath', 'targetPath']
      },
      default: []
    }
  }
};

const VALIDATION_SCHEMA = {
  type: 'object',
  title: 'admin-config-label-validation',
  widget: {
    formlyConfig: {
      hide: true
    }
  },
  properties: {
    requireUrl: { type: 'boolean', title: 'admin-config-label-require-url', default: true },
    requirePublisher: { type: 'boolean', title: 'admin-config-label-require-publisher', default: true },
    requirePublicationYear: { type: 'boolean', title: 'admin-config-label-require-publication-year', default: true },
    requireCreators: { type: 'boolean', title: 'admin-config-label-require-creators', default: true },
    requireTitles: { type: 'boolean', title: 'admin-config-label-require-titles', default: true }
  }
};

const PROFILE_SCHEMA = {
  type: 'object',
  title: 'admin-config-label-profile',
  properties: {
    name: { type: 'string', title: 'admin-config-label-profile-name' },
    enabled: { type: 'boolean', title: 'admin-config-label-enabled', default: true },
    label: { type: 'string', title: 'admin-config-label-label' },
    metadata: {
      type: 'object',
      title: 'admin-config-label-metadata',
      properties: {
        doi: VALUE_BINDING_SCHEMA,
        prefix: VALUE_BINDING_SCHEMA,
        url: VALUE_BINDING_SCHEMA,
        contentUrl: VALUE_BINDING_SCHEMA,
        publicationYear: VALUE_BINDING_SCHEMA,
        language: VALUE_BINDING_SCHEMA,
        publisher: VALUE_BINDING_SCHEMA,
        version: VALUE_BINDING_SCHEMA,
        formats: VALUE_BINDING_SCHEMA,
        sizes: VALUE_BINDING_SCHEMA,
        creators: {
          type: 'array',
          title: 'admin-config-label-creators',
          items: CREATOR_SCHEMA,
          default: []
        },
        titles: {
          type: 'array',
          title: 'admin-config-label-titles',
          items: TITLE_SCHEMA,
          default: []
        },
        subjects: {
          type: 'array',
          title: 'admin-config-label-subjects',
          items: SUBJECT_SCHEMA,
          default: []
        },
        contributors: {
          type: 'array',
          title: 'admin-config-label-contributors',
          items: CONTRIBUTOR_SCHEMA,
          default: []
        },
        dates: {
          type: 'array',
          title: 'admin-config-label-dates',
          items: DATE_SCHEMA,
          default: []
        },
        alternateIdentifiers: {
          type: 'array',
          title: 'admin-config-label-alternate-identifiers',
          items: IDENTIFIER_SCHEMA,
          default: []
        },
        relatedIdentifiers: {
          type: 'array',
          title: 'admin-config-label-related-identifiers',
          items: RELATED_IDENTIFIER_SCHEMA,
          default: []
        },
        rightsList: {
          type: 'array',
          title: 'admin-config-label-rights-list',
          items: RIGHTS_SCHEMA,
          default: []
        },
        descriptions: {
          type: 'array',
          title: 'admin-config-label-descriptions',
          items: DESCRIPTION_SCHEMA,
          default: []
        },
        geoLocations: {
          type: 'array',
          title: 'admin-config-label-geo-locations',
          items: GEOLOCATION_SCHEMA,
          default: []
        },
        fundingReferences: {
          type: 'array',
          title: 'admin-config-label-funding-references',
          items: FUNDING_REFERENCE_SCHEMA,
          default: []
        },
        relatedItems: {
          type: 'array',
          title: 'admin-config-label-related-items',
          items: RELATED_ITEM_SCHEMA,
          default: []
        },
        types: TYPE_SCHEMA
      },
      required: ['url', 'publicationYear', 'publisher', 'creators', 'titles', 'types']
    },
    writeBack: WRITE_BACK_SCHEMA,
    validation: VALIDATION_SCHEMA
  },
  required: ['name', 'enabled', 'label', 'metadata', 'writeBack', 'validation']
};

const PROFILES_SCHEMA = {
  type: 'array',
  title: 'admin-config-label-profiles',
  items: PROFILE_SCHEMA,
  default: []
};

const CONNECTION_RETRY_SCHEMA = {
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
      default: [408, 429, 500, 502, 503, 504]
    },
    retryOnMethods: {
      type: 'array',
      title: 'admin-config-label-retry-on-methods',
      items: { type: 'string' },
      default: ['get', 'put', 'patch', 'delete']
    }
  }
};

const OPERATIONS_SCHEMA = {
  type: 'object',
  title: 'admin-config-label-operations',
  properties: {
    createEvent: {
      type: 'string',
      title: 'admin-config-label-create-event',
      enum: ['draft', 'register', 'publish'],
      default: 'publish'
    },
    updateEvent: {
      type: 'string',
      title: 'admin-config-label-update-event',
      enum: ['draft', 'register', 'publish', 'hide'],
      default: 'publish'
    },
    allowDeleteDraft: {
      type: 'boolean',
      title: 'admin-config-label-allow-delete-draft',
      default: true
    },
    allowStateChange: {
      type: 'boolean',
      title: 'admin-config-label-allow-state-change',
      default: true
    }
  }
};

export class DoiPublishing extends AppConfig implements DoiPublishingConfigData {
  enabled = false;
  defaultProfile = '';

  connection = {
    baseUrl: 'https://api.test.datacite.org',
    username: '',
    password: '',
    timeoutMs: 30000,
    retry: {
      maxAttempts: 3,
      baseDelayMs: 500,
      maxDelayMs: 4000,
      retryOnStatusCodes: [408, 429, 500, 502, 503, 504],
      retryOnMethods: ['get', 'put', 'patch', 'delete']
    }
  };

  operations = {
    createEvent: 'publish' as const,
    updateEvent: 'publish' as const,
    allowDeleteDraft: true,
    allowStateChange: true
  };

  profiles: Record<string, DoiProfile> = {};

  public static getFieldOrder(): string[] {
    return ['enabled', 'defaultProfile', 'connection', 'profiles'];
  }
}

export const DOI_PUBLISHING_SCHEMA = {
  type: 'object',
  properties: {
    enabled: { type: 'boolean', title: 'admin-config-label-enabled', default: false },
    defaultProfile: { type: 'string', title: 'admin-config-label-default-profile', default: '' },
    connection: {
      type: 'object',
      title: 'admin-config-label-connection',
      properties: {
        baseUrl: { type: 'string', title: 'admin-config-label-base-url' },
        username: { type: 'string', title: 'admin-config-label-username' },
        password: { type: 'string', title: 'admin-config-label-password' },
        timeoutMs: { type: 'number', title: 'admin-config-label-timeout-ms' },
        retry: CONNECTION_RETRY_SCHEMA
      }
    },
    operations: OPERATIONS_SCHEMA,
    profiles: PROFILES_SCHEMA
  }
};
