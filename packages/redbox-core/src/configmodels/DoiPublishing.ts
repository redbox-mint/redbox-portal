import _ from 'lodash';
import { AppConfig } from './AppConfig.interface';

export type DoiBindingKind = 'path' | 'handlebars' | 'jsonata';

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

export interface DoiTitleMapping {
  title: ValueBinding;
  titleType?: ValueBinding;
  lang?: ValueBinding;
}

export interface DoiSubjectMapping {
  subject: ValueBinding;
  subjectScheme?: ValueBinding;
  schemeUri?: ValueBinding;
  valueUri?: ValueBinding;
  classificationCode?: ValueBinding;
  lang?: ValueBinding;
}

export interface DoiDateMapping {
  date: ValueBinding;
  dateType: ValueBinding;
  dateInformation?: ValueBinding;
}

export interface DoiIdentifierMapping {
  identifier: ValueBinding;
  identifierType: ValueBinding;
}

export interface DoiRelatedIdentifierMapping {
  relatedIdentifier: ValueBinding;
  relatedIdentifierType: ValueBinding;
  relationType: ValueBinding;
  relatedMetadataScheme?: ValueBinding;
  schemeUri?: ValueBinding;
  schemeType?: ValueBinding;
  resourceTypeGeneral?: ValueBinding;
}

export interface DoiRightsMapping {
  rights?: ValueBinding;
  rightsUri?: ValueBinding;
  rightsIdentifier?: ValueBinding;
  rightsIdentifierScheme?: ValueBinding;
  schemeUri?: ValueBinding;
  lang?: ValueBinding;
}

export interface DoiDescriptionMapping {
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

export interface DoiFundingReferenceMapping {
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

export function resolveDoiConnectionPassword(password: string, options: { allowEmpty?: boolean } = {}): string {
  const value = typeof password === 'string' ? password.trim() : '';
  if (value.startsWith('$')) {
    const envVarName = value.slice(1);
    const resolved = process.env[envVarName]?.trim() ?? '';
    if (!resolved && !options.allowEmpty) {
      throw new Error(`DOI connection password environment variable '${envVarName}' is not set or is empty`);
    }
    return resolved;
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
    delete entry.name;
    mappedProfiles[name] = entry as unknown as DoiProfile;
  });

  cloned.profiles = mappedProfiles;
  return cloned as unknown as DoiPublishingConfigData;
}

const VALUE_BINDING_EDITOR_WIDGET = {
  widget: {
    formlyConfig: {
      type: 'figshare-binding-editor'
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

const NAME_IDENTIFIER_SCHEMA = {
  type: 'object',
  title: 'Name Identifier',
  properties: {
    nameIdentifier: VALUE_BINDING_SCHEMA,
    nameIdentifierScheme: VALUE_BINDING_SCHEMA,
    schemeUri: VALUE_BINDING_SCHEMA
  }
};

const AFFILIATION_SCHEMA = {
  type: 'object',
  title: 'Affiliation',
  properties: {
    name: VALUE_BINDING_SCHEMA,
    affiliationIdentifier: VALUE_BINDING_SCHEMA,
    affiliationIdentifierScheme: VALUE_BINDING_SCHEMA,
    schemeUri: VALUE_BINDING_SCHEMA
  }
};

const CREATOR_SCHEMA = {
  type: 'object',
  title: 'Creator',
  properties: {
    sourcePath: { type: 'string', title: 'Source Path' },
    itemMode: {
      type: 'string',
      title: 'Item Mode',
      enum: ['array'],
      default: 'array'
    },
    name: VALUE_BINDING_SCHEMA,
    nameType: VALUE_BINDING_SCHEMA,
    givenName: VALUE_BINDING_SCHEMA,
    familyName: VALUE_BINDING_SCHEMA,
    affiliations: {
      type: 'array',
      title: 'Affiliations',
      items: AFFILIATION_SCHEMA,
      default: []
    },
    nameIdentifiers: {
      type: 'array',
      title: 'Name Identifiers',
      items: NAME_IDENTIFIER_SCHEMA,
      default: []
    }
  },
  required: ['sourcePath', 'itemMode', 'name']
};

const CONTRIBUTOR_SCHEMA = {
  type: 'object',
  title: 'Contributor',
  properties: {
    sourcePath: { type: 'string', title: 'Source Path' },
    itemMode: {
      type: 'string',
      title: 'Item Mode',
      enum: ['array'],
      default: 'array'
    },
    name: VALUE_BINDING_SCHEMA,
    nameType: VALUE_BINDING_SCHEMA,
    givenName: VALUE_BINDING_SCHEMA,
    familyName: VALUE_BINDING_SCHEMA,
    affiliations: {
      type: 'array',
      title: 'Affiliations',
      items: AFFILIATION_SCHEMA,
      default: []
    },
    nameIdentifiers: {
      type: 'array',
      title: 'Name Identifiers',
      items: NAME_IDENTIFIER_SCHEMA,
      default: []
    },
    contributorType: VALUE_BINDING_SCHEMA
  },
  required: ['sourcePath', 'itemMode', 'name', 'contributorType']
};

const TITLE_SCHEMA = {
  type: 'object',
  title: 'Title',
  properties: {
    title: VALUE_BINDING_SCHEMA,
    titleType: VALUE_BINDING_SCHEMA,
    lang: VALUE_BINDING_SCHEMA
  },
  required: ['title']
};

const SUBJECT_SCHEMA = {
  type: 'object',
  title: 'Subject',
  properties: {
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
  title: 'Date',
  properties: {
    date: VALUE_BINDING_SCHEMA,
    dateType: VALUE_BINDING_SCHEMA,
    dateInformation: VALUE_BINDING_SCHEMA
  },
  required: ['date', 'dateType']
};

const IDENTIFIER_SCHEMA = {
  type: 'object',
  title: 'Alternate Identifier',
  properties: {
    identifier: VALUE_BINDING_SCHEMA,
    identifierType: VALUE_BINDING_SCHEMA
  },
  required: ['identifier', 'identifierType']
};

const RELATED_IDENTIFIER_SCHEMA = {
  type: 'object',
  title: 'Related Identifier',
  properties: {
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
  title: 'Rights',
  properties: {
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
  title: 'Description',
  properties: {
    description: VALUE_BINDING_SCHEMA,
    descriptionType: VALUE_BINDING_SCHEMA,
    lang: VALUE_BINDING_SCHEMA
  },
  required: ['description', 'descriptionType']
};

const GEOLOCATION_POINT_SCHEMA = {
  type: 'object',
  title: 'Geo Location Point',
  properties: {
    pointLongitude: VALUE_BINDING_SCHEMA,
    pointLatitude: VALUE_BINDING_SCHEMA
  },
  required: ['pointLongitude', 'pointLatitude']
};

const GEOLOCATION_BOX_SCHEMA = {
  type: 'object',
  title: 'Geo Location Box',
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
  title: 'Geo Location Place',
  properties: {
    geoLocationPlace: VALUE_BINDING_SCHEMA
  },
  required: ['geoLocationPlace']
};

const GEOLOCATION_SCHEMA = {
  type: 'object',
  title: 'Geo Location',
  properties: {
    geoLocationPoint: GEOLOCATION_POINT_SCHEMA,
    geoLocationBox: GEOLOCATION_BOX_SCHEMA,
    geoLocationPlace: GEOLOCATION_PLACE_SCHEMA
  }
};

const FUNDING_REFERENCE_SCHEMA = {
  type: 'object',
  title: 'Funding Reference',
  properties: {
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
  title: 'Related Item',
  properties: {
    relationType: VALUE_BINDING_SCHEMA,
    relatedItemType: VALUE_BINDING_SCHEMA,
    titles: {
      type: 'array',
      title: 'Titles',
      items: TITLE_SCHEMA,
      default: []
    },
    creators: {
      type: 'array',
      title: 'Creators',
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
      title: 'Contributors',
      items: CONTRIBUTOR_SCHEMA,
      default: []
    }
  },
  required: ['relationType', 'relatedItemType']
};

const TYPE_SCHEMA = {
  type: 'object',
  title: 'Types',
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
  title: 'Write Back',
  properties: {
    citationUrlPath: { type: 'string', title: 'Citation URL Path' },
    citationDoiPath: { type: 'string', title: 'Citation DOI Path' },
    generatedCitationPath: { type: 'string', title: 'Generated Citation Path' },
    citationString: VALUE_BINDING_SCHEMA,
    extraFields: {
      type: 'array',
      title: 'Extra Fields',
      items: {
        type: 'object',
        properties: {
          sourcePath: { type: 'string', title: 'Source Path' },
          targetPath: { type: 'string', title: 'Target Path' }
        },
        required: ['sourcePath', 'targetPath']
      },
      default: []
    }
  }
};

const VALIDATION_SCHEMA = {
  type: 'object',
  title: 'Validation',
  widget: {
    formlyConfig: {
      hide: true
    }
  },
  properties: {
    requireUrl: { type: 'boolean', title: 'Require Url', default: true },
    requirePublisher: { type: 'boolean', title: 'Require Publisher', default: true },
    requirePublicationYear: { type: 'boolean', title: 'Require Publication Year', default: true },
    requireCreators: { type: 'boolean', title: 'Require Creators', default: true },
    requireTitles: { type: 'boolean', title: 'Require Titles', default: true }
  }
};

const PROFILE_SCHEMA = {
  type: 'object',
  title: 'Profile',
  properties: {
    name: { type: 'string', title: 'Profile Name' },
    enabled: { type: 'boolean', title: 'Enabled', default: true },
    label: { type: 'string', title: 'Label' },
    metadata: {
      type: 'object',
      title: 'Metadata',
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
          title: 'Creators',
          items: CREATOR_SCHEMA,
          default: []
        },
        titles: {
          type: 'array',
          title: 'Titles',
          items: TITLE_SCHEMA,
          default: []
        },
        subjects: {
          type: 'array',
          title: 'Subjects',
          items: SUBJECT_SCHEMA,
          default: []
        },
        contributors: {
          type: 'array',
          title: 'Contributors',
          items: CONTRIBUTOR_SCHEMA,
          default: []
        },
        dates: {
          type: 'array',
          title: 'Dates',
          items: DATE_SCHEMA,
          default: []
        },
        alternateIdentifiers: {
          type: 'array',
          title: 'Alternate Identifiers',
          items: IDENTIFIER_SCHEMA,
          default: []
        },
        relatedIdentifiers: {
          type: 'array',
          title: 'Related Identifiers',
          items: RELATED_IDENTIFIER_SCHEMA,
          default: []
        },
        rightsList: {
          type: 'array',
          title: 'Rights List',
          items: RIGHTS_SCHEMA,
          default: []
        },
        descriptions: {
          type: 'array',
          title: 'Descriptions',
          items: DESCRIPTION_SCHEMA,
          default: []
        },
        geoLocations: {
          type: 'array',
          title: 'Geo Locations',
          items: GEOLOCATION_SCHEMA,
          default: []
        },
        fundingReferences: {
          type: 'array',
          title: 'Funding References',
          items: FUNDING_REFERENCE_SCHEMA,
          default: []
        },
        relatedItems: {
          type: 'array',
          title: 'Related Items',
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
  title: 'Profiles',
  items: PROFILE_SCHEMA,
  default: []
};

const CONNECTION_RETRY_SCHEMA = {
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
      default: ['get', 'put', 'patch', 'delete']
    }
  }
};

const OPERATIONS_SCHEMA = {
  type: 'object',
  title: 'Operations',
  properties: {
    createEvent: {
      type: 'string',
      title: 'Create Event',
      enum: ['draft', 'register', 'publish'],
      default: 'publish'
    },
    updateEvent: {
      type: 'string',
      title: 'Update Event',
      enum: ['draft', 'register', 'publish', 'hide'],
      default: 'publish'
    },
    allowDeleteDraft: {
      type: 'boolean',
      title: 'Allow Delete Draft',
      default: true
    },
    allowStateChange: {
      type: 'boolean',
      title: 'Allow State Change',
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
    enabled: { type: 'boolean', title: 'Enabled', default: false },
    defaultProfile: { type: 'string', title: 'Default Profile', default: '' },
    connection: {
      type: 'object',
      title: 'Connection',
      properties: {
        baseUrl: { type: 'string', title: 'Base URL' },
        username: { type: 'string', title: 'Username' },
        password: { type: 'string', title: 'Password' },
        timeoutMs: { type: 'number', title: 'Timeout (ms)' },
        retry: CONNECTION_RETRY_SCHEMA
      }
    },
    operations: OPERATIONS_SCHEMA,
    profiles: PROFILES_SCHEMA
  }
};
