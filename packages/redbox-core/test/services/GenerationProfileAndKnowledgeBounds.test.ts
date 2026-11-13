import { expect } from 'chai';
import { generation } from '../../src/config/generation.config';
import { canonicalHash, GenerationError, type GenerationProfileDefinitionV1 } from '../../src/model/generation';
import { Services as ProfileServices } from '../../src/services/GenerationProfileService';
import { Services as ContextServices } from '../../src/services/GenerationContextService';
import { Services as KnowledgeServices } from '../../src/services/GenerationKnowledgeService';

function profile(): GenerationProfileDefinitionV1 {
  return {
    purpose: 'Summary', systemInstructions: 'Use reviewed context',
    sourceSlots: [{ id: 'source', recordType: 'activity', allowedPaths: ['/conditionsOfUse'], maxBytes: 1024 }],
    questions: [{ id: 'conditions', labelKey: 'Conditions', type: 'text', required: false, sourceDefaultExpression: '/conditionsOfUse' }],
    targetFields: [{ id: 'summary', metadataPointer: '/summary', expectedComponentClasses: ['TextAreaComponent'],
      output: { kind: 'string', maxLength: 200 }, operation: 'fill', grounding: 'inferenceAllowed' }],
    knowledgeCollectionVersionIds: [], modelDeploymentId: 'deployment-1',
    contextLimits: { totalBytes: 4096, maxKnowledgeChunks: 0, maxChunkBytes: 1024 },
  };
}

describe('Generation profile and knowledge bounds', () => {
  let originalSails: unknown;
  beforeEach(() => {
    originalSails = Reflect.get(globalThis, 'sails');
    const logger = Object.fromEntries(['debug', 'info', 'warn', 'error', 'trace', 'fatal', 'verbose', 'silly', 'log'].map(name => [name, () => undefined]));
    Reflect.set(globalThis, 'sails', { config: { generation: structuredClone(generation),
      log: { createNamespaceLogger: () => logger, customLogger: logger } }, log: logger, services: {} });
  });
  afterEach(() => Reflect.set(globalThis, 'sails', originalSails));

  it('publishes an allowlisted conditionsOfUse pointer and resolves its real question default', () => {
    const definition = profile();
    expect(new ProfileServices.GenerationProfileService().validateDefinition(definition)).to.equal(definition);
    expect(new ContextServices.GenerationContextService().buildQuestionDefaults(definition, { conditionsOfUse: 'Approved internal use' }))
      .to.deep.equal([{ id: 'conditions', value: 'Approved internal use' }]);
  });
  it('continues to reject a question default outside the source allowlist', () => {
    const definition = profile(); definition.questions[0].sourceDefaultExpression = '/unlisted';
    expect(() => new ProfileServices.GenerationProfileService().validateDefinition(definition)).to.throw(GenerationError);
  });
  const malformed: Array<[string, (definition: any) => unknown]> = [
    ['null', () => null], ['missing questions', definition => ({ ...definition, questions: undefined })],
    ['non-array questions', definition => ({ ...definition, questions: {} })],
    ['null target fields', definition => ({ ...definition, targetFields: null })],
    ['null source slot', definition => ({ ...definition, sourceSlots: [null] })],
    ['null question', definition => ({ ...definition, questions: [null] })],
    ['null target field', definition => ({ ...definition, targetFields: [null] })],
    ['non-string purpose', definition => ({ ...definition, purpose: 42 })],
    ['null context limits', definition => ({ ...definition, contextLimits: null })],
    ['null allowed paths', definition => { definition.sourceSlots[0].allowedPaths = null; return definition; }],
    ['malformed options', definition => { definition.questions[0] = { id: 'choice', labelKey: 'Choice', type: 'enum', required: false, options: { length: 1 } }; return definition; }],
    ['malformed enum output', definition => { definition.targetFields[0].output = { kind: 'enum', values: null }; return definition; }],
    ['malformed nested output', definition => { definition.targetFields[0].output = { kind: 'object', properties: { child: null } }; return definition; }],
  ];
  for (const [label, malformedDefinition] of malformed) {
    it(`reports a safe profile error for ${label}`, () => {
      // Remove the unrelated previously rejected valid pointer to isolate envelope behavior.
      const definition: any = profile(); definition.questions = [];
      let failure: unknown;
      try { new ProfileServices.GenerationProfileService().validateDefinition(malformedDefinition(definition) as GenerationProfileDefinitionV1); }
      catch (error) { failure = error; }
      expect(failure).to.be.instanceOf(GenerationError);
      if (!(failure instanceof GenerationError)) throw new Error('Expected a safe profile error');
      expect(failure.code).to.equal('GENERATION_PROFILE_INVALID');
    });
  }
  const document = (content: string) => ({ documentKey: 'guidance', title: 'Guidance', authority: 'institutionPolicy' as const,
    classification: 'public', content, tags: ['usage'] });
  it('preserves supplementary code points and their hashes across byte-bounded chunks', () => {
    const service = new KnowledgeServices.GenerationKnowledgeService();
    const chunks = service.chunkDocument(document('a🌊b'), 4);
    expect(chunks.map(chunk => chunk.content)).to.deep.equal(['a', '🌊', 'b']);
    expect(chunks.map(chunk => chunk.contentHash)).to.deep.equal(['a', '🌊', 'b'].map(canonicalHash));
    expect(chunks.every(chunk => Buffer.byteLength(chunk.content, 'utf8') <= 4)).to.equal(true);
    expect(Buffer.concat(chunks.map(chunk => Buffer.from(chunk.content, 'utf8'))).toString('utf8')).to.equal('a🌊b');
    expect(service.chunkDocument(document('a🌊b'), 4)).to.deep.equal(chunks);
  });
  for (const bound of [1, 2, 3]) {
    it(`rejects a ${bound}-byte budget that cannot hold a single supplementary code point`, () => {
      expect(() => new KnowledgeServices.GenerationKnowledgeService().chunkDocument(document('🌊'), bound)).to.throw(GenerationError);
    });
  }
  it('retains ordinary single-byte chunking at the smallest valid budget', () => {
    const chunks = new KnowledgeServices.GenerationKnowledgeService().chunkDocument(document('abc'), 1);
    expect(chunks.map(chunk => chunk.content)).to.deep.equal(['a', 'b', 'c']);
  });
});
