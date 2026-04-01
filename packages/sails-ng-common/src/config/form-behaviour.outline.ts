import { ExpressionsConditionKindType } from './form-component.outline';

/**
 * Form behaviours are the v1 form-level automation primitive described in
 * `support/specs/form-behaviour/implementation_plan.md`.
 *
 * Intent:
 * - allow async, event-driven pipelines at the form level instead of only
 *   component-scoped synchronous expressions
 * - keep the configuration serialisable so it can pass through the existing
 *   Construct -> Template -> Client visitor pipeline
 *
 * Scope in v1:
 * - built-in processors only: `jsonataTransform`, `fetchMetadata`
 * - built-in actions only: `setValue`, `emitEvent`
 * - event emission is intentionally limited to `field.value.changed`
 *
 * Out of scope in v1:
 * - hook-registered/custom processors and actions
 * - UI-specific actions such as notifications or highlighting
 * - processor-level debounce controls
 *
 * These types are intentionally lightweight outlines rather than runtime
 * classes because the behaviour feature currently relies on plain config data.
 */
export const FormBehaviourProcessorType = {
  JSONataTransform: 'jsonataTransform',
  FetchMetadata: 'fetchMetadata',
} as const;

export type FormBehaviourProcessorTypeValue =
  (typeof FormBehaviourProcessorType)[keyof typeof FormBehaviourProcessorType];

export const FormBehaviourActionType = {
  SetValue: 'setValue',
  EmitEvent: 'emitEvent',
} as const;

export type FormBehaviourActionTypeValue = (typeof FormBehaviourActionType)[keyof typeof FormBehaviourActionType];

export const FieldPathKind = {
  ComponentJsonPointer: 'componentJsonPointer',
  JSONata: 'jsonata',
  Logical: 'logical',
} as const;

export type FieldPathKindType = (typeof FieldPathKind)[keyof typeof FieldPathKind];

/**
 * Configuration for the v1 JSONata processor.
 *
 * The server keeps `template` long enough to compile it, while the client uses
 * `hasTemplate` after the raw source has been stripped by the client visitor.
 */
export interface FormBehaviourJsonataTransformConfig {
  template?: string;
  hasTemplate?: boolean;
}

export interface FormBehaviourProcessorConfigFrame<
  TConfig = Record<string, never> | FormBehaviourJsonataTransformConfig,
> {
  type: FormBehaviourProcessorTypeValue;
  config?: TConfig;
}

export type FormBehaviourJsonataTransformProcessorConfig =
  FormBehaviourProcessorConfigFrame<FormBehaviourJsonataTransformConfig> & {
    type: typeof FormBehaviourProcessorType.JSONataTransform;
  };

export type FormBehaviourFetchMetadataProcessorConfig = FormBehaviourProcessorConfigFrame<Record<string, never>> & {
  type: typeof FormBehaviourProcessorType.FetchMetadata;
};

export type FormBehaviourProcessorConfig =
  | FormBehaviourJsonataTransformProcessorConfig
  | FormBehaviourFetchMetadataProcessorConfig;

/**
 * `fieldPath` points at an `angularComponentsJsonPointer`.
 *
 * Resolution modes intentionally mirror the implementation plan:
 * - `componentJsonPointer`: literal pointer resolved at execution time
 * - `jsonata`: compiled template resolved against the current pipeline context
 * - `logical`: repeatable-only identity lock that survives row reindexing
 *
 * Note that `logical` is validated by the runtime and is intentionally not
 * allowed on `onError` actions in v1.
 */
export interface FormBehaviourSetValueActionConfig {
  fieldPath: string;
  fieldPathKind?: FieldPathKindType;
  hasFieldPathTemplate?: boolean;
  valueTemplate?: string;
  hasValueTemplate?: boolean;
}

/**
 * v1 keeps emitted events deliberately narrow to avoid inventing another event
 * contract before behaviour usage patterns settle.
 */
export interface FormBehaviourEmitEventActionConfig {
  eventType: 'field.value.changed';
  fieldId: string;
  sourceId: string;
  valueTemplate?: string;
  hasValueTemplate?: boolean;
}

export interface FormBehaviourActionConfigFrame<
  TConfig = FormBehaviourSetValueActionConfig | FormBehaviourEmitEventActionConfig,
> {
  type: FormBehaviourActionTypeValue;
  config: TConfig;
}

export type FormBehaviourSetValueAction = FormBehaviourActionConfigFrame<FormBehaviourSetValueActionConfig> & {
  type: typeof FormBehaviourActionType.SetValue;
};

export type FormBehaviourEmitEventAction = FormBehaviourActionConfigFrame<FormBehaviourEmitEventActionConfig> & {
  type: typeof FormBehaviourActionType.EmitEvent;
};

export type FormBehaviourActionConfig = FormBehaviourSetValueAction | FormBehaviourEmitEventAction;

/**
 * Top-level behaviour definition stored on `FormConfigFrame.behaviours`.
 *
 * Design notes:
 * - `condition` / `conditionKind` intentionally reuse expression semantics
 * - `debounceMs` applies at subscription level, not per processor
 * - `hasCondition` is a client-side marker added after template stripping
 * - `enabled` exists so a behaviour can remain in config without binding
 *
 * Future work anticipated by the plan:
 * - more processors/actions
 * - hook extensibility
 * - richer UI-facing actions
 */
export interface FormBehaviourConfigFrame {
  name: string;
  description?: string;
  condition: string;
  conditionKind?: ExpressionsConditionKindType;
  debounceMs?: number;
  processors?: FormBehaviourProcessorConfig[];
  actions: FormBehaviourActionConfig[];
  onError?: FormBehaviourActionConfig[];
  runOnFormReady?: boolean;
  enabled?: boolean;
  hasCondition?: boolean;
}
