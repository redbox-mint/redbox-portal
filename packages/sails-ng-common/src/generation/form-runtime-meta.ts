import { FormRuntimeAction } from './runtime-action';

export interface GenerationLaunchDefinition {
  bindingKey: string;
  sourcePointer: string;
}

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
  generationLaunches?: GenerationLaunchDefinition[];
  generationSession?: GenerationRuntimeSession;
}

export interface FormRuntimeRequestContext {
  generationRunId?: string;
}
