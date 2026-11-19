import type { GenerationQuestion } from '@researchdatabox/sails-ng-common';

// Shared contract: GenerationProfileAdmin.test saves/publishes these questions,
// launches a run and asserts its decrypted researcher response matches this data.
// The panel spec loads that response through its API to verify text and controls.
export const profileQuestionContract: GenerationQuestion[] = [
  { id: 'direct', label: 'What do you plan to collect?', helpText: 'Describe synthetic data only.', type: 'enum', required: false, options: [{ value: 'one', label: 'Interview transcripts', labelKey: 'old-option' }] },
  { id: 'several', label: 'Which methods?', type: 'multiEnum', required: true, options: [{ value: 'one', label: 'Interviews' }, { value: 'two', label: 'Surveys' }] },
  { id: 'yesno', label: 'Approved?', type: 'boolean', required: false },
  { id: 'legacy', labelKey: 'bootstrap-question', helpTextKey: 'bootstrap-help', type: 'text', required: false },
];

export const launchedQuestionContract: GenerationQuestion[] = profileQuestionContract.map(question => ({ ...question, defaultValue: null }));
