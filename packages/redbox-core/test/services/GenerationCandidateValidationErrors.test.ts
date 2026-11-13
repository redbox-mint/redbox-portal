import { expect } from 'chai';
import { generation } from '../../src/config/generation.config';
import { GenerationError, type GenerationProfileDefinitionV1 } from '../../src/model/generation';
import { Services as SchemaServices } from '../../src/services/GenerationSchemaService';

// Validate malformed provider JSON through the public schema boundary before alias expansion.
describe('Generation candidate validation errors', () => {
  let originalSails: unknown;
  const definition: GenerationProfileDefinitionV1 = {
    purpose: 'Summary', systemInstructions: 'Use reviewed context',
    sourceSlots: [{ id: 'source', recordType: 'activity', allowedPaths: ['/summary'], maxBytes: 1024 }],
    questions: [], targetFields: [{ id: 'summary', metadataPointer: '/summary', expectedComponentClasses: ['TextAreaComponent'],
      output: { kind: 'string', maxLength: 1000 }, operation: 'fill', grounding: 'inferenceAllowed' }],
    knowledgeCollectionVersionIds: [], modelDeploymentId: 'deployment-1',
    contextLimits: { totalBytes: 4096, maxKnowledgeChunks: 0, maxChunkBytes: 1024 },
  };
  beforeEach(() => {
    originalSails = Reflect.get(globalThis, 'sails');
    const logger = Object.fromEntries(['debug', 'info', 'warn', 'error', 'trace', 'fatal', 'verbose', 'silly', 'log'].map(name => [name, () => undefined]));
    Reflect.set(globalThis, 'sails', { config: { generation: structuredClone(generation),
      log: { createNamespaceLogger: () => logger, customLogger: logger } }, log: logger, services: {} });
  });
  afterEach(() => Reflect.set(globalThis, 'sails', originalSails));
  function validate(value: unknown) {
    return new SchemaServices.GenerationSchemaService().validateCandidate({
      runId: 'run-1', definition, evidence: [{ id: 'source-1', kind: 'source', label: 'Reviewed source', content: 'Safe context', contentHash: 'hash' }],
      evidenceAliases: [{ alias: 'E1', evidenceId: 'source-1' }], baseTargetDigest: 'base', rawContent: JSON.stringify(value),
    });
  }
  function expectSchemaFailure(value: unknown): void {
    let failure: unknown;
    try { validate(value); } catch (error) { failure = error; }
    expect(failure).to.be.instanceOf(GenerationError);
    if (!(failure instanceof GenerationError)) throw new Error('Expected a safe generation schema failure');
    expect(failure.code).to.equal('GENERATION_OUTPUT_SCHEMA_INVALID');
    expect(failure.status).to.equal(502);
  }
  for (const envelope of [null, [], 'text', 42]) {
    it(`classifies a malformed JSON envelope ${JSON.stringify(envelope)} as a schema error`, () => expectSchemaFailure(envelope));
  }
  for (const evidenceIds of [undefined, null, 'E1', {}, [42]]) {
    it(`validates evidence IDs before alias expansion ${JSON.stringify(evidenceIds)}`, () => {
      expectSchemaFailure({ answers: { summary: { value: 'Draft', evidenceIds, rationale: 'Reviewed source' } } });
    });
  }
  it('preserves valid evidence alias expansion', () => {
    const candidate = validate({ answers: { summary: { value: 'Draft', evidenceIds: ['E1'], rationale: 'Reviewed source' } } });
    expect(candidate.items[0].evidence).to.deep.equal([{ id: 'source-1', label: 'Reviewed source', kind: 'source' }]);
  });
});
