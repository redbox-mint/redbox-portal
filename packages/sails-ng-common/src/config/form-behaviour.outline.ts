import { ExpressionsConditionKindType, FormExpressionsTargetType } from './form-component.outline';

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
 * Scope:
 * - built-in processors only: `jsonataTransform`, `fetchMetadata`
 * - built-in actions only: `setValue`, `setValues`, `emitEvent`, `runTemplate`,
 *   `setUIProperty`, `setUIProperties`
 * - event emission is intentionally limited to `field.value.changed`
 * - UI-property actions reuse the expressions target vocabulary
 *   (`model.*`, `layout.*`, `component.*`, `field.visible`, `field.disabled`,
 *   `form.enabledValidationGroups`)
 *
 * Out of scope:
 * - hook-registered/custom processors and actions
 * - UI feedback actions such as notifications or highlighting
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
  SetValues: 'setValues',
  EmitEvent: 'emitEvent',
  RunTemplate: 'runTemplate',
  SetUIProperty: 'setUIProperty',
  SetUIProperties: 'setUIProperties',
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

/**
 * `setValues` applies several `setValue`-style assignments from one action.
 *
 * Each entry mirrors `FormBehaviourSetValueActionConfig` exactly, including
 * `fieldPathKind` resolution modes and per-entry `valueTemplate`. Entries that
 * fail to resolve are warn-and-skipped individually; the remaining entries
 * still run.
 */
export interface FormBehaviourSetValuesActionConfig {
  values: FormBehaviourSetValueActionConfig[];
}

/**
 * `runTemplate` evaluates a JSONata template against the full behaviour
 * pipeline context (`value`, `event`, `formData`, `requestParams`,
 * `runtimeContext`, `querySource`, plus any context keys stored by earlier
 * `runTemplate` actions in the same list execution).
 *
 * Result handling (both optional, may be combined):
 * - `resultKey`: store the result in the pipeline context under this key so
 *   later actions and their value templates can read it. The key must match
 *   `[A-Za-z_][A-Za-z0-9_]*` and must not be one of the reserved context keys
 *   (`value`, `event`, `formData`, `requestParams`, `runtimeContext`,
 *   `querySource`); omitting `resultKey` is the explicit way to replace the
 *   pipeline `value`.
 * - `applyResults`: treat the result as
 *   `FormBehaviourFieldAssignmentInstruction[]` (a single object is wrapped)
 *   and apply each instruction. Invalid instructions are warn-and-skipped.
 *
 * When neither is configured the result replaces the pipeline `value`. When
 * `applyResults` is true and no `resultKey` is set, the pipeline `value` is
 * left untouched because the result is consumed by instruction application.
 */
export interface FormBehaviourRunTemplateActionConfig {
  /** Raw JSONata source; compiled server-side and stripped by the client visitor. */
  template?: string;
  /** Client-side marker set after the raw template has been stripped. */
  hasTemplate?: boolean;
  resultKey?: string;
  applyResults?: boolean;
}

/**
 * One assignment produced by a `runTemplate` `applyResults` evaluation.
 *
 * `fieldPath` is a literal `angularComponentsJsonPointer` only — the JSONata
 * template itself is the place to compute pointers. `target` defaults to
 * `model.value`; `fieldPath` may be omitted only for the
 * `form.enabledValidationGroups` target, which is form-scoped.
 */
export interface FormBehaviourFieldAssignmentInstruction {
  fieldPath?: string;
  target?: FormExpressionsTargetType;
  value: unknown;
}

/**
 * Shared shape for `setUIProperty` config and `setUIProperties` entries.
 *
 * Value resolution precedence: `valueTemplate` (via `hasValueTemplate`) wins
 * over a literal `value` (when the key is present), which wins over the
 * pipeline `value`.
 *
 * In `setUIProperties` entries the fieldPath pair is all-or-nothing: an entry
 * that provides `fieldPath` (or `hasFieldPathTemplate`) supplies its own
 * `fieldPathKind` too; otherwise both fall back to the action-level defaults.
 */
export interface FormBehaviourSetUIPropertyEntry {
  /**
   * Target field. Required except when `target` is
   * `form.enabledValidationGroups`.
   */
  fieldPath?: string;
  fieldPathKind?: FieldPathKindType;
  hasFieldPathTemplate?: boolean;
  target: FormExpressionsTargetType;
  /** Literal value used when no `valueTemplate` is configured. */
  value?: unknown;
  valueTemplate?: string;
  hasValueTemplate?: boolean;
}

export interface FormBehaviourSetUIPropertyActionConfig extends FormBehaviourSetUIPropertyEntry {}

/**
 * `setUIProperties` applies several UI-property assignments from one action.
 * The action-level `fieldPath`/`fieldPathKind` act as defaults for entries
 * that do not provide their own.
 */
export interface FormBehaviourSetUIPropertiesActionConfig {
  fieldPath?: string;
  fieldPathKind?: FieldPathKindType;
  hasFieldPathTemplate?: boolean;
  properties: FormBehaviourSetUIPropertyEntry[];
}

export interface FormBehaviourActionConfigFrame<
  TConfig =
    | FormBehaviourSetValueActionConfig
    | FormBehaviourSetValuesActionConfig
    | FormBehaviourEmitEventActionConfig
    | FormBehaviourRunTemplateActionConfig
    | FormBehaviourSetUIPropertyActionConfig
    | FormBehaviourSetUIPropertiesActionConfig,
> {
  type: FormBehaviourActionTypeValue;
  config: TConfig;
}

export type FormBehaviourSetValueAction = FormBehaviourActionConfigFrame<FormBehaviourSetValueActionConfig> & {
  type: typeof FormBehaviourActionType.SetValue;
};

export type FormBehaviourSetValuesAction = FormBehaviourActionConfigFrame<FormBehaviourSetValuesActionConfig> & {
  type: typeof FormBehaviourActionType.SetValues;
};

export type FormBehaviourEmitEventAction = FormBehaviourActionConfigFrame<FormBehaviourEmitEventActionConfig> & {
  type: typeof FormBehaviourActionType.EmitEvent;
};

export type FormBehaviourRunTemplateAction = FormBehaviourActionConfigFrame<FormBehaviourRunTemplateActionConfig> & {
  type: typeof FormBehaviourActionType.RunTemplate;
};

export type FormBehaviourSetUIPropertyAction = FormBehaviourActionConfigFrame<FormBehaviourSetUIPropertyActionConfig> & {
  type: typeof FormBehaviourActionType.SetUIProperty;
};

export type FormBehaviourSetUIPropertiesAction =
  FormBehaviourActionConfigFrame<FormBehaviourSetUIPropertiesActionConfig> & {
    type: typeof FormBehaviourActionType.SetUIProperties;
  };

export type FormBehaviourActionConfig =
  | FormBehaviourSetValueAction
  | FormBehaviourSetValuesAction
  | FormBehaviourEmitEventAction
  | FormBehaviourRunTemplateAction
  | FormBehaviourSetUIPropertyAction
  | FormBehaviourSetUIPropertiesAction
  ;

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
