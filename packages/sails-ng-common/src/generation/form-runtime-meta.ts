import { FormRuntimeAction } from './runtime-action';

export interface GenerationRuntimeInitialValue {
  metadataPointer: string;
  value: unknown;
}

export interface GenerationRuntimeSession {
  runId: string;
  bindingKey: string;
  autoOpen: boolean;
  initialValues: GenerationRuntimeInitialValue[];
}

export interface FormRuntimeMeta extends Record<string, unknown> {
  runtimeActions?: FormRuntimeAction[];
  generationSession?: GenerationRuntimeSession;
}

export interface FormRuntimeRequestContext {
  generationRunId?: string;
}
