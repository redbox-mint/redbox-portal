/**
 * Form Component Event Types
 *
 * Discriminated union of typed events for intra-form coordination.
 * Per R15.1–R15.17, naming convention: namespace.domain.action
 */

import { FormGroupStatus } from "../../form.component";

/**
 * Base event interface with common properties
 */
export interface FormComponentEventBase {
  readonly type: string;
  readonly timestamp: number;
  readonly sourceId?: string;
  readonly fieldId?: string;
}

interface FieldScopedEventBase extends FormComponentEventBase {
  readonly fieldId: string;
}

/**
 * Field value changed event
 * Published when a field's value changes
 */
export interface FieldValueChangedEvent extends FieldScopedEventBase {
  readonly type: 'field.value.changed';
  readonly value: any;
  readonly previousValue?: any;
}

/**
 * Form definition change request event
 * Published when a component requests a change to the form definition
 */
export interface FormDefinitionChangeRequestEvent extends FormComponentEventBase {
  readonly type: 'form.definition.change.request';
}

/**
 * Form definition changed event - a specialized event for notifying changes to the form definition (e.g. repeatable elements, etc. ). It is primarily used to rebuild the query source.
 */
export interface FormDefinitionChangedEvent extends FormComponentEventBase {
  readonly type: 'form.definition.changed';
}

/**
 * Form definition ready event - published when the form definition has been fully loaded and initialized.
 */
export interface FormDefinitionReadyEvent extends FormComponentEventBase {
  readonly type: 'form.definition.ready';
}

/**
 * Field metadata changed event
 * Published when field metadata (visibility, enabled state, etc.) changes
 */
export interface FieldMetaChangedEvent extends FieldScopedEventBase {
  readonly type: 'field.meta.changed';
  readonly meta: Record<string, any>;
}

/**
 * Field dependency trigger event
 * Published when a field change should trigger dependent field updates
 */
export interface FieldDependencyTriggerEvent extends FieldScopedEventBase {
  readonly type: 'field.dependency.trigger';
  readonly dependentFields: string[];
  readonly reason: string;
}

/**
 * Field focus request event
 * Published to request focus on a specific field
 */
export interface FieldFocusRequestEvent extends FieldScopedEventBase {
  readonly type: 'field.request.focus';
  readonly targetElementId?: string;
  readonly lineagePath?: Array<string | number>;
  readonly requestId?: string;
  readonly source?: string;
}

/**
 * Form validation broadcast event
 * Published when form-wide validation occurs
 */
export interface FormValidationBroadcastEvent extends FormComponentEventBase {
  readonly type: 'form.validation.broadcast';
  readonly isValid: boolean;
  readonly errors?: Record<string, string[]>;
  readonly status?: FormGroupStatus;
}

/**
 * Form save requested event
 * Published by UI (e.g., SaveButton) to request a save
 */
export interface FormSaveRequestedEvent extends FormComponentEventBase {
  readonly type: 'form.save.requested';
  readonly force?: boolean;
  readonly enabledValidationGroups?: string[];
  readonly targetStep?: string;
}

/**
 * Form save execute command event
 * Published by effects to instruct the component to execute saveForm
 */
export interface FormSaveExecuteEvent extends FormComponentEventBase {
  readonly type: 'form.save.execute';
  readonly force?: boolean;
  readonly enabledValidationGroups?: string[];
  readonly targetStep?: string;
}

/**
 * Form save success event
 * Published when a save operation completed successfully
 */
export interface FormSaveSuccessEvent extends FormComponentEventBase {
  readonly type: 'form.save.success';
  readonly savedData?: any;
  readonly oid?: string;
  readonly response?: any;
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
  | FormSaveFailureEvent
  | FormDefinitionChangeRequestEvent
  | FormDefinitionChangedEvent
  | FormDefinitionReadyEvent;

/**
 * Event type literals for type-safe subscriptions (R15.17)
 */
export const FormComponentEventType = {
  FIELD_VALUE_CHANGED: 'field.value.changed' as const,
  FIELD_META_CHANGED: 'field.meta.changed' as const,
  FORM_DEFINITION_CHANGE_REQUEST: 'form.definition.change.request' as const,
  FORM_DEFINITION_CHANGED: 'form.definition.changed' as const,
  FORM_DEFINITION_READY: 'form.definition.ready' as const,
  FIELD_DEPENDENCY_TRIGGER: 'field.dependency.trigger' as const,
  FIELD_FOCUS_REQUEST: 'field.request.focus' as const,
  FORM_VALIDATION_BROADCAST: 'form.validation.broadcast' as const,
  FORM_SAVE_REQUESTED: 'form.save.requested' as const,
  FORM_SAVE_EXECUTE: 'form.save.execute' as const,
  FORM_SAVE_SUCCESS: 'form.save.success' as const,
  FORM_SAVE_FAILURE: 'form.save.failure' as const
} as const;

export type FormComponentEventTypeValue = typeof FormComponentEventType[keyof typeof FormComponentEventType];

/**
 * Event type map for type-safe select operations
 * 
 * TODO: Could the readonly type and FormComponentEventMap keys be replaced by FormComponentEventType.[key] for strings or typeof FormComponentEventType.[key] for types?
This would ensure that only known names can be used and enforce this at compile time.
 */
export interface FormComponentEventMap {
  'field.value.changed': FieldValueChangedEvent;
  'field.meta.changed': FieldMetaChangedEvent;
  'form.definition.change.request': FormDefinitionChangeRequestEvent;
  'form.definition.changed': FormDefinitionChangedEvent;
  'form.definition.ready': FormDefinitionReadyEvent;
  'field.dependency.trigger': FieldDependencyTriggerEvent;
  'field.request.focus': FieldFocusRequestEvent;
  'form.validation.broadcast': FormValidationBroadcastEvent;
  'form.save.requested': FormSaveRequestedEvent;
  'form.save.execute': FormSaveExecuteEvent;
  'form.save.success': FormSaveSuccessEvent;
  'form.save.failure': FormSaveFailureEvent;
}

/** Shared options bag for event helper factories */
export type FormComponentEventOptions<TEvent extends FormComponentEventBase> = Omit<TEvent, 'timestamp' | 'type'>;

/** Typed helper return excluding runtime timestamp */
export type FormComponentEventResult<TEvent extends FormComponentEventBase> = Omit<TEvent, 'timestamp'>;

/** Internal helper to compose typed event objects */
function createEventResult<TEvent extends FormComponentEventBase>(
  type: TEvent['type'],
  options: FormComponentEventOptions<TEvent>
): FormComponentEventResult<TEvent> {
  return {
    type,
    ...options
  } as FormComponentEventResult<TEvent>;
}

/**
 * Helper factory for creating field value changed events (R15.15)
 */
export function createFieldValueChangedEvent(
  options: FormComponentEventOptions<FieldValueChangedEvent>
): FormComponentEventResult<FieldValueChangedEvent> {
  return createEventResult<FieldValueChangedEvent>(
    FormComponentEventType.FIELD_VALUE_CHANGED,
    options
  );
}

/**
 * Helper factory for creating field meta changed events (R15.15)
 */
export function createFieldMetaChangedEvent(
  options: FormComponentEventOptions<FieldMetaChangedEvent>
): FormComponentEventResult<FieldMetaChangedEvent> {
  return createEventResult<FieldMetaChangedEvent>(
    FormComponentEventType.FIELD_META_CHANGED,
    options
  );
}

/**
 * Helper factory for creating form definition change request events
 */
export function createFormDefinitionChangeRequestEvent(
  options: FormComponentEventOptions<FormDefinitionChangeRequestEvent>
): FormComponentEventResult<FormDefinitionChangeRequestEvent> {
  return createEventResult<FormDefinitionChangeRequestEvent>(
    FormComponentEventType.FORM_DEFINITION_CHANGE_REQUEST,
    options
  );
}

/**
 * Helper factory for creating form definition change
 * Helper factory for creating form definition changed events
 */
export function createFormDefinitionChangedEvent(
  options: FormComponentEventOptions<FormDefinitionChangedEvent>
): FormComponentEventResult<FormDefinitionChangedEvent> {
  return createEventResult<FormDefinitionChangedEvent>(
    FormComponentEventType.FORM_DEFINITION_CHANGED,
    options
  );
}

/**
 * Helper factory for creating form definition ready events
 */
export function createFormDefinitionReadyEvent(
  options: FormComponentEventOptions<FormDefinitionReadyEvent>
): FormComponentEventResult<FormDefinitionReadyEvent> {
  return createEventResult<FormDefinitionReadyEvent>(
    FormComponentEventType.FORM_DEFINITION_READY,
    options
  );
}

/**
 * Helper factory for creating field dependency trigger events (R15.15)
 */
export function createFieldDependencyTriggerEvent(
  options: FormComponentEventOptions<FieldDependencyTriggerEvent>
): FormComponentEventResult<FieldDependencyTriggerEvent> {
  return createEventResult<FieldDependencyTriggerEvent>(
    FormComponentEventType.FIELD_DEPENDENCY_TRIGGER,
    options
  );
}

/**
 * Helper factory for creating field focus request events (R15.15)
 */
export function createFieldFocusRequestEvent(
  options: FormComponentEventOptions<FieldFocusRequestEvent>
): FormComponentEventResult<FieldFocusRequestEvent> {
  return createEventResult<FieldFocusRequestEvent>(
    FormComponentEventType.FIELD_FOCUS_REQUEST,
    options
  );
}

/**
 * Helper factory for focus requests that require lineage-based reveal/navigation.
 * `lineagePath` is mandatory for these requests.
 */
export function createLineageFieldFocusRequestEvent(
  options: Omit<FormComponentEventOptions<FieldFocusRequestEvent>, 'lineagePath'> & {
    lineagePath: Array<string | number>;
  }
): FormComponentEventResult<FieldFocusRequestEvent> {
  if (!options.lineagePath || options.lineagePath.length === 0) {
    throw new Error('Lineage focus requests require lineagePath.');
  }
  return createFieldFocusRequestEvent(options);
}

/**
 * Helper factory for creating save requested events (R15.15)
 */
export function createFormSaveRequestedEvent(
  options: FormComponentEventOptions<FormSaveRequestedEvent> = {}
): FormComponentEventResult<FormSaveRequestedEvent> {
  return createEventResult<FormSaveRequestedEvent>(
    FormComponentEventType.FORM_SAVE_REQUESTED,
    options
  );
}

/**
 * Helper factory for creating save execute command events (R15.15)
 */
export function createFormSaveExecuteEvent(
  options: FormComponentEventOptions<FormSaveExecuteEvent> = {}
): FormComponentEventResult<FormSaveExecuteEvent> {
  return createEventResult<FormSaveExecuteEvent>(
    FormComponentEventType.FORM_SAVE_EXECUTE,
    options
  );
}

/**
 * Helper factory for creating save success events (R15.15)
 */
export function createFormSaveSuccessEvent(
  options: FormComponentEventOptions<FormSaveSuccessEvent> = {}
): FormComponentEventResult<FormSaveSuccessEvent> {
  return createEventResult<FormSaveSuccessEvent>(
    FormComponentEventType.FORM_SAVE_SUCCESS,
    options
  );
}

/**
 * Helper factory for creating save failure events (R15.15)
 */
export function createFormSaveFailureEvent(
  options: FormComponentEventOptions<FormSaveFailureEvent> = {}
): FormComponentEventResult<FormSaveFailureEvent> {
  return createEventResult<FormSaveFailureEvent>(
    FormComponentEventType.FORM_SAVE_FAILURE,
    options
  );
}

/** Helper factory for creating validation broadcast events */
export function createFormValidationBroadcastEvent(
  options: FormComponentEventOptions<FormValidationBroadcastEvent>
): FormComponentEventResult<FormValidationBroadcastEvent> {
  return createEventResult<FormValidationBroadcastEvent>(
    FormComponentEventType.FORM_VALIDATION_BROADCAST,
    options
  );
}
