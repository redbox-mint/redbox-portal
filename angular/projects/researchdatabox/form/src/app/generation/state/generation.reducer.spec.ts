import { GenerationCandidatePatch } from '@researchdatabox/sails-ng-common';
import * as GenerationActions from './generation.actions';
import { generationReducer } from './generation.reducer';
import { generationInitialState } from './generation.state';

const candidate: GenerationCandidatePatch = {
  runId: 'run-1', candidateDigest: 'digest', baseTargetDigest: 'base', items: [],
};

describe('generationReducer', () => {
  it('configures runtime actions and auto-opens an injected session', () => {
    const action = {
      id: 'generate', bindingKey: 'binding', kind: 'generation.launch' as const, labelKey: 'generate', order: 1,
    };
    const state = generationReducer(generationInitialState, GenerationActions.configure({
      actions: [action], session: { runId: 'run-1', bindingKey: 'binding', autoOpen: true, initialValues: [] },
    }));

    expect(state.actions).toEqual([action]);
    expect(state.panelOpen).toBeTrue();
    expect(state.session?.runId).toBe('run-1');
  });

  it('tracks the async lifecycle, candidate conflicts, and unique reviews', () => {
    let state = generationReducer(generationInitialState, GenerationActions.launchStarted());
    expect(state.busy).toBeTrue();
    state = generationReducer(state, GenerationActions.lifecycleChanged({ status: 'running', phase: 'provider' }));
    expect(state.busy).toBeTrue();
    state = generationReducer(state, GenerationActions.patchApplied({ candidate, conflictFieldIds: ['sharing'] }));
    expect(state.busy).toBeFalse();
    expect(state.conflictFieldIds).toEqual(['sharing']);
    state = generationReducer(state, GenerationActions.fieldReviewed({ fieldId: 'sharing' }));
    state = generationReducer(state, GenerationActions.fieldReviewed({ fieldId: 'sharing' }));
    expect(state.reviewedFieldIds).toEqual(['sharing']);
  });

  it('resets all transient state after a commit lifecycle', () => {
    let state = generationReducer(generationInitialState, GenerationActions.commitStarted());
    expect(state.commitPending).toBeTrue();
    state = generationReducer(state, GenerationActions.commitFinished());
    expect(state).toEqual(jasmine.objectContaining({ commitPending: false, status: 'committed' }));
    expect(generationReducer(state, GenerationActions.reset())).toEqual(generationInitialState);
  });
});
