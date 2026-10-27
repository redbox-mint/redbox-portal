export interface VocabularyField {
  type: 'string' | 'number' | 'boolean' | 'json' | 'id';
  required?: boolean;
  nullable?: boolean;
  default?: unknown;
}
export const vocabularyFields: Record<string, Record<string, VocabularyField>> = {
  vocabulary: {
    name: {
      type: 'string',
      required: true,
    },
    description: {
      type: 'string',
    },
    type: {
      type: 'string',
      default: 'flat',
    },
    source: {
      type: 'string',
      default: 'local',
    },
    sourceId: {
      type: 'string',
    },
    sourceVersionId: {
      type: 'string',
    },
    lastSyncedAt: {
      type: 'string',
    },
    slug: {
      type: 'string',
      default: '__AUTO__',
    },
    owner: {
      type: 'string',
    },
    branding: {
      type: 'id',
      required: true,
    },
    rvaSourceKey: {
      type: 'string',
    },
    figshareSourceKey: {
      type: 'string',
    },
  },
  vocabularyentry: {
    vocabulary: {
      type: 'id',
      required: true,
    },
    label: {
      type: 'string',
      required: true,
    },
    labelLower: {
      type: 'string',
    },
    value: {
      type: 'string',
    },
    valueLower: {
      type: 'string',
    },
    parent: {
      type: 'id',
    },
    identifier: {
      type: 'string',
    },
    order: {
      type: 'number',
      default: 0,
    },
    historical: {
      type: 'boolean',
      default: false,
    },
  },
  figsharevocabularysource: {
    branding: {
      type: 'id',
      required: true,
    },
    vocabulary: {
      type: 'id',
      required: true,
    },
    scope: {
      type: 'string',
      required: true,
    },
    taxonomyId: {
      type: 'string',
      required: true,
    },
    connectionKey: {
      type: 'string',
    },
    displayName: {
      type: 'string',
      required: true,
    },
    remoteHash: {
      type: 'string',
    },
    lastSyncedAt: {
      type: 'string',
    },
    lastSyncRun: {
      type: 'string',
    },
    archived: {
      type: 'boolean',
      default: false,
    },
    createdBy: {
      type: 'string',
      required: true,
    },
    updatedBy: {
      type: 'string',
      required: true,
    },
  },
  figsharevocabularycategory: {
    source: {
      type: 'id',
      required: true,
    },
    entry: {
      type: 'id',
      required: true,
    },
    sourceId: {
      type: 'string',
      required: true,
    },
    categoryId: {
      type: 'number',
      required: true,
    },
    taxonomyId: {
      type: 'string',
      required: true,
    },
    parentSourceId: {
      type: 'string',
    },
    path: {
      type: 'json',
    },
    selectable: {
      type: 'boolean',
      default: true,
    },
    historical: {
      type: 'boolean',
      default: false,
    },
    firstSeenAt: {
      type: 'string',
      required: true,
    },
    lastSeenAt: {
      type: 'string',
      required: true,
    },
    contentHash: {
      type: 'string',
      required: true,
    },
  },
  figsharevocabularycrosswalk: {
    branding: {
      type: 'id',
      required: true,
    },
    name: {
      type: 'string',
      required: true,
    },
    localVocabulary: {
      type: 'id',
      required: true,
    },
    figshareSource: {
      type: 'id',
      required: true,
    },
    status: {
      type: 'string',
      default: 'draft',
    },
    workingRevision: {
      type: 'number',
      default: 1,
    },
    approvedRevision: {
      type: 'number',
      nullable: true,
    },
    approvedAt: {
      type: 'string',
    },
    approvedBy: {
      type: 'string',
    },
    updatedBy: {
      type: 'string',
      required: true,
    },
  },
  figsharevocabularycrosswalkmapping: {
    crosswalk: {
      type: 'id',
      required: true,
    },
    revision: {
      type: 'number',
      required: true,
    },
    localEntry: {
      type: 'id',
      required: true,
    },
    figshareCategory: {
      type: 'id',
      required: true,
    },
    status: {
      type: 'string',
      default: 'proposed',
    },
    matchType: {
      type: 'string',
      required: true,
    },
    evidence: {
      type: 'json',
    },
    approvedAt: {
      type: 'string',
    },
    approvedBy: {
      type: 'string',
    },
  },
  figsharevocabularysyncrun: {
    branding: {
      type: 'id',
      required: true,
    },
    source: {
      type: 'string',
      nullable: true,
    },
    scope: {
      type: 'string',
      required: true,
    },
    taxonomyId: {
      type: 'string',
      required: true,
    },
    localVocabulary: {
      type: 'string',
      nullable: true,
    },
    crosswalk: {
      type: 'string',
      nullable: true,
    },
    createLocalClone: {
      type: 'boolean',
      default: false,
    },
    localCloneName: {
      type: 'string',
    },
    localCloneSlug: {
      type: 'string',
    },
    normalizerVersion: {
      type: 'string',
      required: true,
    },
    state: {
      type: 'string',
      default: 'fetching',
    },
    baseHash: {
      type: 'string',
    },
    remoteHash: {
      type: 'string',
    },
    normalizedSnapshot: {
      type: 'json',
    },
    diff: {
      type: 'json',
    },
    proposals: {
      type: 'json',
    },
    summary: {
      type: 'json',
    },
    warnings: {
      type: 'json',
    },
    result: {
      type: 'json',
    },
    expiresAt: {
      type: 'string',
      required: true,
    },
    requestedBy: {
      type: 'string',
      required: true,
    },
    appliedBy: {
      type: 'string',
    },
    appliedAt: {
      type: 'string',
    },
    errorCode: {
      type: 'string',
    },
    errorDetail: {
      type: 'string',
    },
  },
};
