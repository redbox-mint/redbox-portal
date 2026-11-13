import { expect } from 'chai';
import {
  GENERATION_RUN_PHASES,
  GENERATION_RUN_STATUSES,
  GENERATION_TERMINAL_STATUSES,
  isGenerationRunPhase,
  isGenerationRunStatus,
} from '../../src/generation';
import type { FormRuntimeMeta, GenerationCandidatePatch, GenerationRunView } from '../../src/generation';

describe('generation shared contracts', () => {
  it('exposes exhaustive, unique run states and phases', () => {
    expect(new Set(GENERATION_RUN_STATUSES).size).to.equal(GENERATION_RUN_STATUSES.length);
    expect(new Set(GENERATION_RUN_PHASES).size).to.equal(GENERATION_RUN_PHASES.length);
    expect(GENERATION_TERMINAL_STATUSES.every((status) => GENERATION_RUN_STATUSES.includes(status))).to.equal(true);
  });

  it('rejects unknown run states and phases', () => {
    expect(isGenerationRunStatus('completed')).to.equal(true);
    expect(isGenerationRunStatus('streaming')).to.equal(false);
    expect(isGenerationRunPhase('population')).to.equal(true);
    expect(isGenerationRunPhase('toolCall')).to.equal(false);
  });

  it('keeps runtime metadata optional and separate from the form definition', () => {
    const ordinaryResponse: FormRuntimeMeta = {};
    const generationResponse: FormRuntimeMeta = {
      runtimeActions: [{
        id: 'create-plan', bindingKey: 'binding', kind: 'generation.launch', labelKey: 'create-plan', order: 1,
      }],
      generationSession: { runId: 'run-12345678', bindingKey: 'binding', autoOpen: true, initialValues: [] },
    };
    expect(ordinaryResponse).to.deep.equal({});
    expect(generationResponse.runtimeActions?.[0].kind).to.equal('generation.launch');
  });

  it('accepts the representative client-safe result fixture', () => {
    const candidate: GenerationCandidatePatch = {
      runId: 'run-12345678', candidateDigest: 'digest', baseTargetDigest: 'base',
      items: [{
        fieldId: 'summary', metadataPointer: '/summary', value: 'Draft', operation: 'fill', valueHash: 'hash',
        groundingState: 'sourceBacked', reviewRequired: false, rationale: 'Based on the activity.', evidence: [],
      }],
    };
    const run: GenerationRunView = {
      runId: candidate.runId, status: 'completed', phase: 'population', attemptCount: 1,
      retryable: false, questions: [], result: candidate,
    };
    expect(run.result?.items[0].metadataPointer).to.equal('/summary');
    expect(JSON.stringify(run)).not.to.contain('rawResponse');
  });
});
