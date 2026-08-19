export const FORM_RUNTIME_ACTION_KINDS = ['generation.launch'] as const;

export type FormRuntimeActionKind = (typeof FORM_RUNTIME_ACTION_KINDS)[number];

export interface FormRuntimeAction {
  id: string;
  kind: FormRuntimeActionKind;
  bindingKey: string;
  labelKey: string;
  helpTextKey?: string;
  icon?: string;
  placement?: string;
  order: number;
  sourceOid?: string;
}

export interface GenerationLaunchRequest {
  bindingKey: string;
  sourceOid: string;
}

export interface GenerationLaunchResult {
  runId: string;
  targetUrl: string;
}
