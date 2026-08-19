import {
  FormRuntimeAction,
  GenerationCandidatePatch,
  GenerationQuestion,
  GenerationRuntimeSession,
  GenerationRunPhase,
  GenerationRunStatus,
} from '@researchdatabox/sails-ng-common';

export const GENERATION_FEATURE_KEY = 'generation';

export interface GenerationState {
  actions: FormRuntimeAction[];
  session: GenerationRuntimeSession | null;
  panelOpen: boolean;
  busy: boolean;
  questions: GenerationQuestion[];
  status: GenerationRunStatus | null;
  phase: GenerationRunPhase | null;
  candidate: GenerationCandidatePatch | null;
  conflictFieldIds: string[];
  reviewedFieldIds: string[];
  error: string | null;
  commitPending: boolean;
}

export const generationInitialState: GenerationState = {
  actions: [],
  session: null,
  panelOpen: false,
  busy: false,
  questions: [],
  status: null,
  phase: null,
  candidate: null,
  conflictFieldIds: [],
  reviewedFieldIds: [],
  error: null,
  commitPending: false,
};

