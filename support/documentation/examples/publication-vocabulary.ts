import {
  targetIdentity,
  type PublicationSourceImport,
  type PublicationVocabularyResolveInput,
} from '@researchdatabox/redbox-core';

// This reviewed snapshot contains no credentials or provider connection settings.
export const subjectImport: PublicationSourceImport = {
  provider: 'institutional-subjects',
  scope: 'public',
  catalogueId: 'research-subjects',
  namespace: 'https://example.test/subjects',
  displayName: 'Research subjects',
  importId: 'reviewed-snapshot-2026-10',
  terms: [
    {
      id: targetIdentity('https://example.test/subjects', 'https://example.test/subjects/Math'),
      namespace: 'https://example.test/subjects',
      value: 'https://example.test/subjects/Math',
      sourceId: 'Math',
      label: 'Mathematics',
      selectable: true,
    },
  ],
};

// Replace these IDs with the actual approved brand-local crosswalk/vocabulary IDs.
// Keep the explicit revision when reproducing an existing publication approval.
export const pinnedSubjects: PublicationVocabularyResolveInput = {
  brandId: 'EXAMPLE_BRAND',
  crosswalkId: 'EXAMPLE_APPROVED_CROSSWALK',
  sourceVocabularyId: 'EXAMPLE_LOCAL_VOCABULARY',
  codes: ['CaseSensitive'],
  outputs: 'value',
  revision: 1,
};
