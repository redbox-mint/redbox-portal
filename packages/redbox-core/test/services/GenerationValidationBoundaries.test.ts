import { expect } from 'chai';
import { generation } from '../../src/config/generation.config';
import { GenerationError, type GenerationProfileDefinitionV1 } from '../../src/model/generation';
import { Services as ContextServices } from '../../src/services/GenerationContextService';
import { Services as BindingServices } from '../../src/services/GenerationBindingService';
import { Services as ProfileServices } from '../../src/services/GenerationProfileService';
import { Services as SchemaServices } from '../../src/services/GenerationSchemaService';

function profile(): GenerationProfileDefinitionV1 {
  return {
    purpose: 'Summary', systemInstructions: 'Use reviewed context',
    sourceSlots: [{ id: 'source', recordType: 'activity', allowedPaths: ['/summary'], maxBytes: 1024 }],
    questions: [], targetFields: [{ id: 'summary', metadataPointer: '/summary', expectedComponentClasses: ['TextAreaComponent'],
      output: { kind: 'string', maxLength: 1000 }, operation: 'fill', grounding: 'inferenceAllowed' }],
    knowledgeCollectionVersionIds: [], modelDeploymentId: 'deployment-1',
    contextLimits: { totalBytes: 4096, maxKnowledgeChunks: 0, maxChunkBytes: 1024 },
  };
}

describe('Generation service validation boundaries', () => {
  const marker = '__redboxGenerationBoundaryMarker';
  let originalSails: unknown;
  let originalMarker: PropertyDescriptor | undefined;
  beforeEach(() => {
    originalSails = Reflect.get(globalThis, 'sails');
    originalMarker = Object.getOwnPropertyDescriptor(Object.prototype, marker);
    const logger = Object.fromEntries(['debug', 'info', 'warn', 'error', 'trace', 'fatal', 'verbose', 'silly', 'log'].map(name => [name, () => undefined]));
    Reflect.set(globalThis, 'sails', { config: { generation: structuredClone(generation),
      log: { createNamespaceLogger: () => logger, customLogger: logger } }, log: logger, services: {} });
  });
  afterEach(() => {
    Reflect.set(globalThis, 'sails', originalSails);
    if (originalMarker) Object.defineProperty(Object.prototype, marker, originalMarker);
    else Reflect.deleteProperty(Object.prototype, marker);
  });

  for (const segment of ['__proto__', 'constructor', 'prototype']) {
    it(`rejects ${segment} context projection before prototype mutation`, () => {
      const source = JSON.parse(`{"${segment}":{"${marker}":"private source"}}`);
      expect(() => new ContextServices.GenerationContextService().projectAllowedPaths(source, [`/${segment}/${marker}`], 1024))
        .to.throw(GenerationError);
      expect(Object.getOwnPropertyDescriptor(Object.prototype, marker)).to.deep.equal(originalMarker);
    });
    it(`rejects ${segment} profile source paths`, () => {
      const definition = profile(); definition.sourceSlots[0].allowedPaths = [`/${segment}/secret`];
      expect(() => new ProfileServices.GenerationProfileService().validateDefinition(definition)).to.throw(GenerationError);
    });
    it(`rejects ${segment} profile target paths`, () => {
      const definition = profile(); definition.targetFields[0].metadataPointer = `/${segment}/secret`;
      expect(() => new ProfileServices.GenerationProfileService().validateDefinition(definition)).to.throw(GenerationError);
    });
  }
  it('rejects reserved question default paths even when runtime receives an unvalidated definition', () => {
    const definition = profile(); definition.questions = [{ id: 'question', type: 'text', labelKey: 'Question',
      required: false, sourceDefaultExpression: '/__proto__/toString' }];
    expect(() => new ContextServices.GenerationContextService().buildQuestionDefaults(definition, {})).to.throw(GenerationError);
  });
  it('rejects reserved completion source mappings', () => {
    const binding = { sourceValueMappings: [{ sourceMetadataPointer: '/__proto__/toString', targetMetadataPointer: '/summary' }] };
    expect(() => new BindingServices.GenerationBindingService().buildCompletionValues(binding as any, {})).to.throw(GenerationError);
  });
  it('rejects reserved completion target mappings', () => {
    const binding = { sourceValueMappings: [{ sourceMetadataPointer: '/summary', targetMetadataPointer: '/__proto__/polluted' }] };
    expect(() => new BindingServices.GenerationBindingService().buildCompletionValues(binding as any, { summary: 'text' })).to.throw(GenerationError);
  });
  it('rejects reserved initial relationship mappings', () => {
    const binding = { sourceRelationship: { metadataPointer: '/__proto__/polluted' } };
    expect(() => new BindingServices.GenerationBindingService().buildInitialValues(binding as any, 'source-1')).to.throw(GenerationError);
  });
  it('preserves escaped ordinary source projection and profile paths', () => {
    const definition = profile(); definition.sourceSlots[0].allowedPaths = ['/project~1name/title~0text'];
    expect(new ProfileServices.GenerationProfileService().validateDefinition(definition)).to.equal(definition);
    const source = { 'project/name': { 'title~text': 'Reviewed text' } };
    expect(new ContextServices.GenerationContextService().projectAllowedPaths(source, definition.sourceSlots[0].allowedPaths, 1024)).to.deep.equal(source);
  });

  function validate(value: unknown, definition = profile()) {
    return new SchemaServices.GenerationSchemaService().validateCandidate({ runId: 'run-1', definition,
      evidence: [], baseTargetDigest: 'base', rawContent: JSON.stringify({ answers: { summary: { value, evidenceIds: [], rationale: 'Reviewed context' } } }) });
  }
  it('rejects an undeclared own toString property in provider objects', () => {
    const definition = profile(); definition.targetFields[0].output = { kind: 'object', properties: { declared: { kind: 'string' } } };
    expect(() => validate(JSON.parse('{"declared":"allowed","toString":"undeclared"}'), definition)).to.throw(GenerationError);
  });
  it('requires an own provider property even when an inherited property satisfies its contract', () => {
    Object.defineProperty(Object.prototype, marker, { configurable: true, value: 'inherited text' });
    const definition = profile(); definition.targetFields[0].output = { kind: 'object', properties: { [marker]: { kind: 'string' } } };
    expect(() => validate({}, definition)).to.throw(GenerationError);
  });
  it('retains ordinary own object properties', () => {
    const definition = profile(); definition.targetFields[0].output = { kind: 'object', properties: { declared: { kind: 'string' } } };
    expect(validate({ declared: 'allowed' }, definition).items[0].value).to.deep.equal({ declared: 'allowed' });
  });
  for (const kind of ['string', 'richText'] as const) {
    it(`accepts ordinary prose containing online = yes as ${kind}`, () => {
      const definition = profile(); definition.targetFields[0].output = { kind };
      expect(validate('Access guidance: online = yes; onsite = no.', definition).items[0].value)
        .to.equal('Access guidance: online = yes; onsite = no.');
    });
    it(`accepts quoted ordinary text attributes as ${kind}`, () => {
      const definition = profile(); definition.targetFields[0].output = { kind };
      const value = '<p title="online = yes">Research text</p>';
      expect(validate(value, definition).items[0].value).to.equal(value);
    });
    for (const value of ['<script>alert(1)</script>', '<img src=x onerror=alert(1)>', '<svg/onload=alert(1)>', '<img title=">" onerror=alert(1)>', '<a href="javascript:alert(1)">link</a>']) {
      it(`rejects unsafe ${kind} content ${value}`, () => {
        const definition = profile(); definition.targetFields[0].output = { kind };
        expect(() => validate(value, definition)).to.throw(GenerationError);
      });
    }
  }
});
