import { createReducer, on } from '@ngrx/store';
import * as GenerationActions from './generation.actions';
import { generationInitialState } from './generation.state';

export const generationReducer = createReducer(
  generationInitialState,
  on(GenerationActions.configure, (state, { actions, session }) => ({
    ...generationInitialState,
    actions,
    session,
    panelOpen: session?.autoOpen === true,
  })),
  on(GenerationActions.reset, () => generationInitialState),
  on(GenerationActions.openPanel, (state) => ({ ...state, panelOpen: true })),
  on(GenerationActions.closePanel, (state) => ({ ...state, panelOpen: false })),
  on(GenerationActions.launchStarted, (state) => ({ ...state, busy: true, error: null })),
  on(GenerationActions.launchFailed, (state, { error }) => ({ ...state, busy: false, error })),
  on(GenerationActions.lifecycleChanged, (state, change) => ({
    ...state,
    status: change.status ?? state.status,
    phase: change.phase ?? state.phase,
    questions: change.questions ?? state.questions,
    candidate: change.candidate === undefined ? state.candidate : change.candidate,
    error: change.error === undefined ? state.error : change.error,
    busy: change.status !== undefined && ['queued', 'running', 'validating'].includes(change.status),
  })),
  on(GenerationActions.patchApplied, (state, { candidate, conflictFieldIds }) => ({
    ...state,
    candidate,
    conflictFieldIds,
    busy: false,
  })),
  on(GenerationActions.fieldReviewed, (state, { fieldId }) => ({
    ...state,
    reviewedFieldIds: state.reviewedFieldIds.includes(fieldId)
      ? state.reviewedFieldIds
      : [...state.reviewedFieldIds, fieldId],
  })),
  on(GenerationActions.commitStarted, (state) => ({ ...state, commitPending: true })),
  on(GenerationActions.commitFinished, (state) => ({ ...state, commitPending: false, status: 'committed' as const })),
  on(GenerationActions.commitFailed, (state, { error }) => ({ ...state, commitPending: true, error })),
);
