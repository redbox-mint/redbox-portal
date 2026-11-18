import { z } from 'zod';
import type { GenerationProfileDefinition, GenerationProfileOutput } from '@researchdatabox/sails-ng-common';
const text = z.string().max(16000);
const id = z.string().max(200);
const output: z.ZodType<GenerationProfileOutput> = z.lazy(() => z.union([
  z.object({ kind: z.enum(['string', 'richText']), maxLength: z.number().optional() }),
  z.object({ kind: z.enum(['boolean', 'date']) }),
  z.object({ kind: z.literal('enum'), values: z.array(text).max(500) }),
  z.object({ kind: z.literal('enumArray'), values: z.array(text).max(500), maxItems: z.number().optional() }),
  z.object({ kind: z.enum(['object', 'objectArray']), properties: z.record(text, output), maxItems: z.number().optional() }),
]));
export const profileTestCaseSchema = z.object({ name: text, source: z.record(text, z.unknown()), answers: z.record(id, z.unknown()) });
export const profileDefinitionSchema: z.ZodType<GenerationProfileDefinition> = z.object({
  purpose: text, systemInstructions: text,
  targetForm: z.object({ recordType: id, formName: id }).optional(),
  sourceSlots: z.array(z.object({ id, recordType: id, allowedPaths: z.array(text).max(500), maxBytes: z.number(), required: z.boolean().optional() })).max(1),
  documentSources: z.object({ formats: z.array(z.enum(['pdf', 'docx', 'txt'])), maxFiles: z.number(), maxFileBytes: z.number(), maxTextBytes: z.number() }).optional(),
  questions: z.array(z.object({ id, label: text.optional(), labelKey: text.optional(), helpText: text.optional(), helpTextKey: text.optional(),
    type: z.enum(['text', 'textarea', 'boolean', 'date', 'enum', 'multiEnum']), required: z.boolean(), maxLength: z.number().optional(),
    sourceDefaultExpression: text.optional(), options: z.array(z.object({ value: text, label: text.optional(), labelKey: text.optional() })).max(100).optional() })).max(50),
  targetFields: z.array(z.object({ id, label: text.optional(), metadataPointer: text, expectedComponentClasses: z.array(id).max(20), output,
    operation: z.literal('fill'), maxLength: z.number().optional(), knowledgeTags: z.array(id).max(100).optional(), reviewedAnswerIds: z.array(id).max(50).optional(),
    grounding: z.enum(['sourceRequired', 'guidanceRequired', 'sourceOrGuidance', 'inferenceAllowed']),
    fallback: z.object({ value: z.unknown(), reasonCode: id, reviewRequired: z.boolean() }).optional() })).max(100),
  knowledgeCollectionVersionIds: z.array(id).max(100), modelDeploymentId: id,
  contextLimits: z.object({ totalBytes: z.number(), maxKnowledgeChunks: z.number(), maxChunkBytes: z.number() }),
  fixtureTests: z.array(profileTestCaseSchema).max(5).optional(),
});
