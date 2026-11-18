import { GENERATION_QUESTION_OPTION_LIMIT } from '@researchdatabox/sails-ng-common/runtime';
import type { GenerationProfileDefinition, ProfileOverview, ProfileProblem } from '@researchdatabox/sails-ng-common/runtime';
export const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
export const questionTypes = ['text', 'textarea', 'boolean', 'date', 'enum', 'multiEnum'] as const;
export const origins = ['sourceRequired', 'guidanceRequired', 'sourceOrGuidance', 'inferenceAllowed'] as const;
export function profileProblems(d: GenerationProfileDefinition, overview: ProfileOverview): ProfileProblem[] {
  const result: ProfileProblem[] = [];
  const add = (section: string, key: string, label?: string, row?: string) => result.push({ section, row, label, messageKey: 'ai-profiles-problem-' + key });
  if (!d.purpose?.trim()) add('about', 'purpose');
  if (!d.systemInstructions?.trim() || d.systemInstructions.length > 4000) add('about', 'instructions');
  if (!overview.models.some(m => m.id === d.modelDeploymentId && m.available)) add('model', 'model');
  const limits = overview.limits.context;
  if (!Number.isInteger(d.contextLimits.totalBytes) || d.contextLimits.totalBytes < 1 || d.contextLimits.totalBytes > limits.maxTotalBytes ||
    !Number.isInteger(d.contextLimits.maxKnowledgeChunks) || d.contextLimits.maxKnowledgeChunks < 0 || d.contextLimits.maxKnowledgeChunks > limits.maxKnowledgeChunks ||
    !Number.isInteger(d.contextLimits.maxChunkBytes) || d.contextLimits.maxChunkBytes < 1 || d.contextLimits.maxChunkBytes > limits.maxChunkBytes) add('model', 'model-limits');
  const source = d.sourceSlots[0];
  const sourceForm = overview.forms.find(f => f.name === overview.recordTypes.find(t => t.name === source?.recordType)?.formName);
  if (source ? !sourceForm || !source.allowedPaths.length : !d.documentSources) add('source', 'source');
  for (const path of source?.allowedPaths ?? []) if (!sourceForm?.fields.some(f => f.pointer === path)) add('source', 'source-field', undefined, path);
  if (source && (!Number.isInteger(source.maxBytes) || source.maxBytes < 1 || source.maxBytes > limits.maxFieldBytes)) add('source', 'source-size');
  for (const q of d.questions) {
    if (q.options && q.options.length > GENERATION_QUESTION_OPTION_LIMIT) add('questions', 'question-options', q.label, q.id);
    if (!(q.label?.trim() || q.labelKey) || !questionTypes.includes(q.type) || ['enum', 'multiEnum'].includes(q.type) && (!q.options?.length || new Set(q.options.map(o => o.value)).size !== q.options.length) ||
      q.maxLength !== undefined && (!Number.isInteger(q.maxLength) || q.maxLength <= 0) || q.sourceDefaultExpression && !source?.allowedPaths.includes(q.sourceDefaultExpression)) add('questions', 'question', q.label, q.id);
  }
  for (const id of d.knowledgeCollectionVersionIds) if (!overview.guidance.some(g => g.id === id)) add('guidance', 'guidance');
  const form = overview.forms.find(f => f.name === d.targetForm?.formName && f.recordType === d.targetForm.recordType);
  if (!form) add('fields', 'form');
  if (!d.targetFields.length) add('fields', 'fields');
  for (const field of d.targetFields) {
    const actual = form?.fields.find(f => f.pointer === field.metadataPointer);
    if (!actual) add('fields', 'target-field', field.label, field.id);
    else if (!actual.output) add('fields', 'field-uneditable', actual.label, field.id);
    else if (!field.expectedComponentClasses.includes(actual.component) || actual.output.kind !== field.output.kind ||
      'values' in actual.output && (!('values' in field.output) || JSON.stringify([...actual.output.values].sort()) !== JSON.stringify([...field.output.values].sort())) ||
      'maxLength' in actual.output && !!actual.output.maxLength && (field.maxLength ?? ('maxLength' in field.output ? field.output.maxLength ?? Infinity : Infinity)) > actual.output.maxLength) add('fields', 'field-changed', actual.label, field.id);
    if (field.maxLength !== undefined && (!Number.isInteger(field.maxLength) || field.maxLength < 1 || actual?.output && 'maxLength' in actual.output && actual.output.maxLength && field.maxLength > actual.output.maxLength)) add('fields', 'length', actual?.label || field.label, field.id);
  }
  const documents = d.documentSources;
  if (documents && (!documents.formats.length || !Number.isInteger(documents.maxFiles) || documents.maxFiles < 1 || documents.maxFiles > overview.limits.documents.maxFiles)) add('source', 'document-settings');
  return result;
}
