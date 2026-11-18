import type { GenerationProfileDefinition, ProfileOverview, ProfileVersion } from '@researchdatabox/sails-ng-common/runtime';
export const definition: GenerationProfileDefinition = { purpose: 'Draft a plan', systemInstructions: 'Use source facts',
  sourceSlots: [{ id: 'source', recordType: 'activity', allowedPaths: ['/title'], maxBytes: 16000 }],
  questions: [{ id: 'question', label: 'What will you collect?', helpText: 'Use synthetic text', type: 'text', required: false }],
  targetForm: { recordType: 'plan', formName: 'plan-form' }, targetFields: [{ id: 'summary', label: 'Summary', metadataPointer: '/summary', expectedComponentClasses: ['TextAreaComponent'], output: { kind: 'string', maxLength: 200 }, operation: 'fill', grounding: 'sourceRequired' }],
  knowledgeCollectionVersionIds: [], modelDeploymentId: 'model', contextLimits: { totalBytes: 256000, maxKnowledgeChunks: 40, maxChunkBytes: 8000 }, fixtureTests: [{ name: 'Synthetic example', source: { '/title': 'Synthetic title' }, answers: { question: 'Synthetic data' } }] };
export const version: ProfileVersion = { id: 'v1', version: 1, status: 'draft', definition, contentHash: 'original-hash', createdBy: 'Admin', problems: [] };
export const overview: ProfileOverview = { enabled: true, profiles: [{ id: 'p', key: 'profile', name: 'Research plan', versions: [version], uses: [], hasPublished: false, runCount: 0 }],
  models: [{ id: 'model', key: 'demo', name: 'Demo model', provider: 'Demo provider', version: 1, available: true }], guidance: [],
  recordTypes: [{ name: 'activity', label: 'Research Activity', formName: 'activity-form' }, { name: 'plan', label: 'Plan', formName: 'plan-form' }],
  forms: [{ name: 'activity-form', recordType: 'activity', label: 'Research Activity', fields: [{ pointer: '/title', label: 'Activity title', group: 'Activity', component: 'SimpleInputComponent', output: { kind: 'string' } }] },
    { name: 'plan-form', recordType: 'plan', label: 'Plan', fields: [{ pointer: '/summary', label: 'Summary', group: 'Plan', component: 'TextAreaComponent', output: { kind: 'string', maxLength: 200 } }] }],
  limits: { context: { maxTotalBytes: 256000, maxFieldBytes: 16000, maxKnowledgeChunks: 40, maxChunkBytes: 8000 }, documents: { formats: ['pdf','docx','txt'], maxFiles: 5, maxFileBytes: 5000000, maxTextBytes: 64000 }, cooldownMs: 5000 } };
