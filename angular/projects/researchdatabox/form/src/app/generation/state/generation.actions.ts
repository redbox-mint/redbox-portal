import { createAction, props } from '@ngrx/store';
import {
  FormRuntimeAction,
  GenerationCandidatePatch,
  GenerationQuestion,
  GenerationRuntimeSession,
  GenerationRunPhase,
  GenerationRunStatus,
} from '@researchdatabox/sails-ng-common';

export const configure = createAction(
  '[Generation] Configure',
  props<{ actions: FormRuntimeAction[]; session: GenerationRuntimeSession | null }>(),
);
export const reset = createAction('[Generation] Reset');
export const openPanel = createAction('[Generation] Open Panel');
export const closePanel = createAction('[Generation] Close Panel');
export const launchStarted = createAction('[Generation] Launch Started');
export const launchFailed = createAction('[Generation] Launch Failed', props<{ error: string }>());
export const lifecycleChanged = createAction(
  '[Generation] Lifecycle Changed',
  props<{
    status?: GenerationRunStatus;
    phase?: GenerationRunPhase;
    questions?: GenerationQuestion[];
    candidate?: GenerationCandidatePatch | null;
    error?: string | null;
  }>(),
);
export const patchApplied = createAction(
  '[Generation] Patch Applied',
  props<{ candidate: GenerationCandidatePatch; conflictFieldIds: string[] }>(),
);
export const fieldReviewed = createAction('[Generation] Field Reviewed', props<{ fieldId: string }>());
export const commitStarted = createAction('[Generation] Commit Started');
export const commitFinished = createAction('[Generation] Commit Finished');
export const commitFailed = createAction('[Generation] Commit Failed', props<{ error: string }>());

