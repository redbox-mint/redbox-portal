import type { PersistenceIndex } from '../indexes';
export const vocabularyIndexes: readonly PersistenceIndex[] = [
  {
    datastore: 'mongodb',
    collection: 'vocabulary',
    name: 'branding_1_slug_1',
    keys: {
      branding: 1,
      slug: 1,
    },
    unique: false,
  },
  {
    datastore: 'mongodb',
    collection: 'vocabulary',
    name: 'rvaSourceKey_1',
    keys: {
      rvaSourceKey: 1,
    },
    unique: false,
  },
  {
    datastore: 'mongodb',
    collection: 'vocabulary',
    name: 'figshareSourceKey_1',
    keys: {
      figshareSourceKey: 1,
    },
    unique: false,
  },
  {
    datastore: 'mongodb',
    collection: 'vocabularyentry',
    name: 'vocabulary_1_labelLower_1',
    keys: {
      vocabulary: 1,
      labelLower: 1,
    },
    unique: false,
  },
  {
    datastore: 'mongodb',
    collection: 'vocabularyentry',
    name: 'vocabulary_1_valueLower_1',
    keys: {
      vocabulary: 1,
      valueLower: 1,
    },
    unique: false,
  },
  {
    datastore: 'mongodb',
    collection: 'vocabularyentry',
    name: 'vocabulary_1_identifier_1',
    keys: {
      vocabulary: 1,
      identifier: 1,
    },
    unique: false,
  },
  {
    datastore: 'mongodb',
    collection: 'figsharevocabularysource',
    name: 'branding_1_scope_1_taxonomyId_1',
    keys: {
      branding: 1,
      scope: 1,
      taxonomyId: 1,
    },
    unique: false,
  },
  {
    datastore: 'mongodb',
    collection: 'figsharevocabularysource',
    name: 'vocabulary_1',
    keys: {
      vocabulary: 1,
    },
    unique: false,
  },
  {
    datastore: 'mongodb',
    collection: 'figsharevocabularysource',
    name: 'branding_1_lastSyncedAt_1',
    keys: {
      branding: 1,
      lastSyncedAt: 1,
    },
  },
  {
    datastore: 'mongodb',
    collection: 'figsharevocabularycategory',
    name: 'source_1_sourceId_1',
    keys: {
      source: 1,
      sourceId: 1,
    },
    unique: false,
  },
  {
    datastore: 'mongodb',
    collection: 'figsharevocabularycategory',
    name: 'source_1_categoryId_1',
    keys: {
      source: 1,
      categoryId: 1,
    },
    unique: false,
  },
  {
    datastore: 'mongodb',
    collection: 'figsharevocabularycategory',
    name: 'entry_1',
    keys: {
      entry: 1,
    },
    unique: false,
  },
  {
    datastore: 'mongodb',
    collection: 'figsharevocabularycategory',
    name: 'source_1_historical_1_selectable_1',
    keys: {
      source: 1,
      historical: 1,
      selectable: 1,
    },
  },
  {
    datastore: 'mongodb',
    collection: 'figsharevocabularycrosswalk',
    name: 'branding_1_name_1',
    keys: {
      branding: 1,
      name: 1,
    },
    unique: false,
  },
  {
    datastore: 'mongodb',
    collection: 'figsharevocabularycrosswalk',
    name: 'localVocabulary_1_figshareSource_1_status_1',
    keys: {
      localVocabulary: 1,
      figshareSource: 1,
      status: 1,
    },
  },
  {
    datastore: 'mongodb',
    collection: 'figsharevocabularycrosswalkmapping',
    name: 'crosswalk_1_revision_1_localEntry_1_figshareCategory_1',
    keys: {
      crosswalk: 1,
      revision: 1,
      localEntry: 1,
      figshareCategory: 1,
    },
    unique: false,
  },
  {
    datastore: 'mongodb',
    collection: 'figsharevocabularycrosswalkmapping',
    name: 'crosswalk_1_revision_1_status_1_localEntry_1',
    keys: {
      crosswalk: 1,
      revision: 1,
      status: 1,
      localEntry: 1,
    },
  },
  {
    datastore: 'mongodb',
    collection: 'figsharevocabularycrosswalkmapping',
    name: 'figshareCategory_1',
    keys: {
      figshareCategory: 1,
    },
  },
  {
    datastore: 'mongodb',
    collection: 'figsharevocabularysyncrun',
    name: 'source_1_createdAt_-1',
    keys: {
      source: 1,
      createdAt: -1,
    },
  },
  {
    datastore: 'mongodb',
    collection: 'figsharevocabularysyncrun',
    name: 'state_1_expiresAt_1',
    keys: {
      state: 1,
      expiresAt: 1,
    },
  },
  {
    datastore: 'mongodb',
    collection: 'figsharevocabularysyncrun',
    name: 'branding_1_createdAt_-1',
    keys: {
      branding: 1,
      createdAt: -1,
    },
  },
];
