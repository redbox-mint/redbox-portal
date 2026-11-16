import { createFeatureSelector, createSelector } from '@ngrx/store';
import { GENERATION_FEATURE_KEY, GenerationState } from './generation.state';

export const selectGenerationState = createFeatureSelector<GenerationState>(GENERATION_FEATURE_KEY);
export const selectGenerationActions = createSelector(selectGenerationState, (state) => state.actions);
export const selectGenerationSession = createSelector(selectGenerationState, (state) => state.session);
export const selectGenerationPanelOpen = createSelector(selectGenerationState, (state) => state.panelOpen);
export const selectGenerationBusy = createSelector(selectGenerationState, (state) => state.busy);
export const selectGenerationCandidate = createSelector(selectGenerationState, (state) => state.candidate);
export const selectGenerationError = createSelector(selectGenerationState, (state) => state.error);
