/**
 * Form Component Event Types
 * 
 * Discriminated union of typed events for intra-form coordination.
 * Per R15.1–R15.17, naming convention: namespace.domain.action
 */

/**
 * Base event interface with common properties
 */
export interface FormComponentEventBase {
  readonly type: string;
  readonly timestamp: number;
  readonly sourceId?: string;
}

/**
 * Field value changed event
 * Published when a field's value changes
 */
export interface FieldValueChangedEvent extends FormComponentEventBase {
  readonly type: 'field.value.changed';
  readonly fieldId: string;
  readonly value: any;
  readonly previousValue?: any;
}

/**
 * Field metadata changed event
 * Published when field metadata (visibility, enabled state, etc.) changes
 */
export interface FieldMetaChangedEvent extends FormComponentEventBase {
  readonly type: 'field.meta.changed';
  readonly fieldId: string;
  readonly meta: Record<string, any>;
}

/**
 * Field dependency trigger event
 * Published when a field change should trigger dependent field updates
 */
export interface FieldDependencyTriggerEvent extends FormComponentEventBase {
  readonly type: 'field.dependency.trigger';
  readonly fieldId: string;
  readonly dependentFields: string[];
  readonly reason: string;
}

/**
 * Field focus request event
 * Published to request focus on a specific field
 */
export interface FieldFocusRequestEvent extends FormComponentEventBase {
  readonly type: 'field.request.focus';
  readonly fieldId: string;
}

/**
 * Form validation broadcast event
 * Published when form-wide validation occurs
 */
export interface FormValidationBroadcastEvent extends FormComponentEventBase {
  readonly type: 'form.validation.broadcast';
  readonly isValid: boolean;
  readonly errors?: Record<string, string[]>;
}

/**
 * Form save requested event
 * Published by UI (e.g., SaveButton) to request a save
 */
export interface FormSaveRequestedEvent extends FormComponentEventBase {
  readonly type: 'form.save.requested';
  readonly force?: boolean;
  readonly skipValidation?: boolean;
  readonly targetStep?: string;
}

/**
 * Form save execute command event
 * Published by effects to instruct the component to execute saveForm
 */
export interface FormSaveExecuteEvent extends FormComponentEventBase {
  readonly type: 'form.save.execute';
  readonly force?: boolean;
  readonly skipValidation?: boolean;
  readonly targetStep?: string;
}

/**
 * Form save success event
 * Published when a save operation completed successfully
 */
export interface FormSaveSuccessEvent extends FormComponentEventBase {
  readonly type: 'form.save.success';
  readonly savedData?: any;
}

/**
 * Form save failure event
 * Published when a save operation failed
 */
export interface FormSaveFailureEvent extends FormComponentEventBase {
  readonly type: 'form.save.failure';
  readonly error?: string;
}

/**
 * Discriminated union of all form component events
 */
export type FormComponentEvent =
  | FieldValueChangedEvent
  | FieldMetaChangedEvent
  | FieldDependencyTriggerEvent
  | FieldFocusRequestEvent
  | FormValidationBroadcastEvent
  | FormSaveRequestedEvent
  | FormSaveExecuteEvent
  | FormSaveSuccessEvent
  | FormSaveFailureEvent;

/**
 * Event type literals for type-safe subscriptions (R15.17)
 */
export const FormComponentEventType = {
  FIELD_VALUE_CHANGED: 'field.value.changed' as const,
  FIELD_META_CHANGED: 'field.meta.changed' as const,
  FIELD_DEPENDENCY_TRIGGER: 'field.dependency.trigger' as const,
  FIELD_FOCUS_REQUEST: 'field.request.focus' as const,
  FORM_VALIDATION_BROADCAST: 'form.validation.broadcast' as const,
  FORM_SAVE_REQUESTED: 'form.save.requested' as const,
  FORM_SAVE_EXECUTE: 'form.save.execute' as const,
  FORM_SAVE_SUCCESS: 'form.save.success' as const,
  FORM_SAVE_FAILURE: 'form.save.failure' as const
} as const;

/**
 * Event type map for type-safe select operations
 */
export interface FormComponentEventMap {
  'field.value.changed': FieldValueChangedEvent;
  'field.meta.changed': FieldMetaChangedEvent;
  'field.dependency.trigger': FieldDependencyTriggerEvent;
  'field.request.focus': FieldFocusRequestEvent;
  'form.validation.broadcast': FormValidationBroadcastEvent;
  'form.save.requested': FormSaveRequestedEvent;
  'form.save.execute': FormSaveExecuteEvent;
  'form.save.success': FormSaveSuccessEvent;
  'form.save.failure': FormSaveFailureEvent;
}

/**
 * Helper factory for creating field value changed events (R15.15)
 */
export function createFieldValueChangedEvent(
  fieldId: string,
  value: any,
  previousValue?: any,
  sourceId?: string
): Omit<FieldValueChangedEvent, 'timestamp'> {
  return {
    type: FormComponentEventType.FIELD_VALUE_CHANGED,
    fieldId,
    value,
    previousValue,
    sourceId
  };
}

/**
 * Helper factory for creating field dependency trigger events (R15.15)
 */
export function createFieldDependencyTriggerEvent(
  fieldId: string,
  dependentFields: string[],
  reason: string,
  sourceId?: string
): Omit<FieldDependencyTriggerEvent, 'timestamp'> {
  return {
    type: FormComponentEventType.FIELD_DEPENDENCY_TRIGGER,
    fieldId,
    dependentFields,
    reason,
    sourceId
  };
}

/**
 * Helper factory for creating field focus request events (R15.15)
 */
export function createFieldFocusRequestEvent(
  fieldId: string,
  sourceId?: string
): Omit<FieldFocusRequestEvent, 'timestamp'> {
  return {
    type: FormComponentEventType.FIELD_FOCUS_REQUEST,
    fieldId,
    sourceId
  };
}

/**
 * Helper factory for creating save requested events (R15.15)
 */
export function createFormSaveRequestedEvent(
  options?: {
    force?: boolean;
    skipValidation?: boolean;
    targetStep?: string;
    sourceId?: string;
  }
): Omit<FormSaveRequestedEvent, 'timestamp'> {
  return {
    type: FormComponentEventType.FORM_SAVE_REQUESTED,
    force: options?.force,
    skipValidation: options?.skipValidation,
    targetStep: options?.targetStep,
    sourceId: options?.sourceId
  };
}

/**
 * Helper factory for creating save execute command events (R15.15)
 */
export function createFormSaveExecuteEvent(
  options?: {
    force?: boolean;
    skipValidation?: boolean;
    targetStep?: string;
    sourceId?: string;
  }
): Omit<FormSaveExecuteEvent, 'timestamp'> {
  return {
    type: FormComponentEventType.FORM_SAVE_EXECUTE,
    force: options?.force,
    skipValidation: options?.skipValidation,
    targetStep: options?.targetStep,
    sourceId: options?.sourceId
  };
}

/**
 * Helper factory for creating save success events (R15.15)
 */
export function createFormSaveSuccessEvent(
  options?: {
    savedData?: any;
    sourceId?: string;
  }
): Omit<FormSaveSuccessEvent, 'timestamp'> {
  return {
    type: FormComponentEventType.FORM_SAVE_SUCCESS,
    savedData: options?.savedData,
    sourceId: options?.sourceId
  };
}

/**
 * Helper factory for creating save failure events (R15.15)
 */
export function createFormSaveFailureEvent(
  options?: {
    error?: string;
    sourceId?: string;
  }
): Omit<FormSaveFailureEvent, 'timestamp'> {
  return {
    type: FormComponentEventType.FORM_SAVE_FAILURE,
    error: options?.error,
    sourceId: options?.sourceId
  };
}
