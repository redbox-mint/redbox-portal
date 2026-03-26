/**
 * Form Component Event Types
 *
 * Discriminated union of typed events for intra-form coordination.
 * Per R15.1–R15.17, naming convention: namespace.domain.action
 */

import { FormGroupStatus } from '../../form.component';

/**
 * Base event interface with common properties
 */
export interface FormComponentEventBase {
  readonly type: string;
  readonly timestamp: number;
  readonly sourceId?: string;
  readonly fieldId?: string;
}

export interface FieldScopedEventBase extends FormComponentEventBase {
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
 * Field UI attribute changed event
 * Published when field UI-bound properties (visibility, enabled state, etc.) change
 */
export interface FieldUIAttributeChangedEvent extends FieldScopedEventBase {
  readonly type: 'field.ui-attribute.changed';
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
 * Form validation groups change requested event.
 * Published when a component wants the enabled validation groups to be changed.
 */
export interface FormValidationGroupsChangeRequestEvent extends FormComponentEventBase {
  readonly type: 'form.validation.change.request';
  /**
   * Change step 1: The initial validation groups to enable.
   * - empty - enable no validation groups (note this is not the 'none' group, this is an empty array of validation groups)
   * - enabled - don't change the currently enabled validation groups
   *
   * Defaults to "enabled";
   */
  readonly initial?: "empty" | "enabled";
  /**
   * Change step 2: The validation groups to add or remove from the initial set of validation groups.
   * - enable - add all these validation groups that are not in enabledValidationGroups
   * - disable - remove all these validation groups that are in enabledValidationGroups
   *
   * No default, must be supplied.
   */
  readonly groups: {enable?: string[], disable?: string[]};
}

/**
 * Form dirty status request event
 * Published when a component requests the main form dirty/pristine state be updated
 */
export interface FormStatusDirtyRequestEvent extends FormComponentEventBase {
  readonly type: 'form.status.dirty.request';
  readonly fieldId?: string;
  readonly reason?: string;
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

export interface DeleteEventConfig {
  readonly closeOnDelete?: boolean;
  readonly redirectLocation?: string;
  readonly redirectDelaySeconds?: number;
}

export interface FormDeleteRequestedEvent extends FormComponentEventBase, DeleteEventConfig {
  readonly type: 'form.delete.requested';
}

export interface FormDeleteExecuteEvent extends FormComponentEventBase, DeleteEventConfig {
  readonly type: 'form.delete.execute';
}

export interface FormDeleteSuccessEvent extends FormComponentEventBase, DeleteEventConfig {
  readonly type: 'form.delete.success';
  readonly oid?: string;
  readonly response?: any;
}

export interface FormDeleteFailureEvent extends FormComponentEventBase {
  readonly type: 'form.delete.failure';
  readonly error?: string;
}

/**
 * Field item selected event
 * Published when a user selects (or clears) an item in a typeahead or similar component.
 */
export interface FieldItemSelectedEvent extends FieldScopedEventBase {
  readonly type: 'field.item.selected';
  readonly selectedItem: unknown | null;
}

/**
 * Discriminated union of all form component events
 */
export type FormComponentEvent =
  | FieldValueChangedEvent
  | FieldUIAttributeChangedEvent
  | FieldDependencyTriggerEvent
  | FieldFocusRequestEvent
  | FormValidationBroadcastEvent
  | FormValidationGroupsChangeRequestEvent
  | FormStatusDirtyRequestEvent
  | FormSaveRequestedEvent
  | FormSaveExecuteEvent
  | FormSaveSuccessEvent
  | FormSaveFailureEvent
  | FormDeleteRequestedEvent
  | FormDeleteExecuteEvent
  | FormDeleteSuccessEvent
  | FormDeleteFailureEvent
  | FormDefinitionChangeRequestEvent
  | FormDefinitionChangedEvent
  | FormDefinitionReadyEvent
  | FieldItemSelectedEvent;

/**
 * Event type literals for type-safe subscriptions (R15.17)
 */
export const FormComponentEventType = {
  FIELD_VALUE_CHANGED: 'field.value.changed' as const,
  FIELD_UI_ATTRIBUTE_CHANGED: 'field.ui-attribute.changed' as const,
  FORM_DEFINITION_CHANGE_REQUEST: 'form.definition.change.request' as const,
  FORM_DEFINITION_CHANGED: 'form.definition.changed' as const,
  FORM_DEFINITION_READY: 'form.definition.ready' as const,
  FIELD_DEPENDENCY_TRIGGER: 'field.dependency.trigger' as const,
  FIELD_FOCUS_REQUEST: 'field.request.focus' as const,
  FORM_VALIDATION_BROADCAST: 'form.validation.broadcast' as const,
  FORM_VALIDATION_CHANGE_REQUEST: 'form.validation.change.request' as const,
  FORM_STATUS_DIRTY_REQUEST: 'form.status.dirty.request' as const,
  FORM_SAVE_REQUESTED: 'form.save.requested' as const,
  FORM_SAVE_EXECUTE: 'form.save.execute' as const,
  FORM_SAVE_SUCCESS: 'form.save.success' as const,
  FORM_SAVE_FAILURE: 'form.save.failure' as const,
  FORM_DELETE_REQUESTED: 'form.delete.requested' as const,
  FORM_DELETE_EXECUTE: 'form.delete.execute' as const,
  FORM_DELETE_SUCCESS: 'form.delete.success' as const,
  FORM_DELETE_FAILURE: 'form.delete.failure' as const,
  FIELD_ITEM_SELECTED: 'field.item.selected' as const,
} as const;

export type FormComponentEventTypeValue = (typeof FormComponentEventType)[keyof typeof FormComponentEventType];

/**
 * Event type map for type-safe select operations
 *
 * TODO: Could the readonly type and FormComponentEventMap keys be replaced by FormComponentEventType.[key] for strings or typeof FormComponentEventType.[key] for types?
This would ensure that only known names can be used and enforce this at compile time.
 */
export interface FormComponentEventMap {
  'field.value.changed': FieldValueChangedEvent;
  'field.ui-attribute.changed': FieldUIAttributeChangedEvent;
  'form.definition.change.request': FormDefinitionChangeRequestEvent;
  'form.definition.changed': FormDefinitionChangedEvent;
  'form.definition.ready': FormDefinitionReadyEvent;
  'field.dependency.trigger': FieldDependencyTriggerEvent;
  'field.request.focus': FieldFocusRequestEvent;
  'form.validation.broadcast': FormValidationBroadcastEvent;
  'form.validation.change.request': FormValidationGroupsChangeRequestEvent;
  'form.status.dirty.request': FormStatusDirtyRequestEvent;
  'form.save.requested': FormSaveRequestedEvent;
  'form.save.execute': FormSaveExecuteEvent;
  'form.save.success': FormSaveSuccessEvent;
  'form.save.failure': FormSaveFailureEvent;
  'form.delete.requested': FormDeleteRequestedEvent;
  'form.delete.execute': FormDeleteExecuteEvent;
  'form.delete.success': FormDeleteSuccessEvent;
  'form.delete.failure': FormDeleteFailureEvent;
  'field.item.selected': FieldItemSelectedEvent;
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
    ...options,
  } as FormComponentEventResult<TEvent>;
}

/**
 * Helper factory for creating field value changed events (R15.15)
 */
export function createFieldValueChangedEvent(
  options: FormComponentEventOptions<FieldValueChangedEvent>
): FormComponentEventResult<FieldValueChangedEvent> {
  return createEventResult<FieldValueChangedEvent>(FormComponentEventType.FIELD_VALUE_CHANGED, options);
}

/**
 * Helper factory for creating field UI attribute changed events (R15.15)
 */
export function createFieldUIAttributeChangedEvent(
  options: FormComponentEventOptions<FieldUIAttributeChangedEvent>
): FormComponentEventResult<FieldUIAttributeChangedEvent> {
  return createEventResult<FieldUIAttributeChangedEvent>(FormComponentEventType.FIELD_UI_ATTRIBUTE_CHANGED, options);
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
  return createEventResult<FormDefinitionChangedEvent>(FormComponentEventType.FORM_DEFINITION_CHANGED, options);
}

/**
 * Helper factory for creating form definition ready events
 */
export function createFormDefinitionReadyEvent(
  options: FormComponentEventOptions<FormDefinitionReadyEvent>
): FormComponentEventResult<FormDefinitionReadyEvent> {
  return createEventResult<FormDefinitionReadyEvent>(FormComponentEventType.FORM_DEFINITION_READY, options);
}

/**
 * Helper factory for creating field dependency trigger events (R15.15)
 */
export function createFieldDependencyTriggerEvent(
  options: FormComponentEventOptions<FieldDependencyTriggerEvent>
): FormComponentEventResult<FieldDependencyTriggerEvent> {
  return createEventResult<FieldDependencyTriggerEvent>(FormComponentEventType.FIELD_DEPENDENCY_TRIGGER, options);
}

/**
 * Helper factory for creating field focus request events (R15.15)
 */
export function createFieldFocusRequestEvent(
  options: FormComponentEventOptions<FieldFocusRequestEvent>
): FormComponentEventResult<FieldFocusRequestEvent> {
  return createEventResult<FieldFocusRequestEvent>(FormComponentEventType.FIELD_FOCUS_REQUEST, options);
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
  return createEventResult<FormSaveRequestedEvent>(FormComponentEventType.FORM_SAVE_REQUESTED, options);
}

/**
 * Helper factory for creating save execute command events (R15.15)
 */
export function createFormSaveExecuteEvent(
  options: FormComponentEventOptions<FormSaveExecuteEvent> = {}
): FormComponentEventResult<FormSaveExecuteEvent> {
  return createEventResult<FormSaveExecuteEvent>(FormComponentEventType.FORM_SAVE_EXECUTE, options);
}

/**
 * Helper factory for creating save success events (R15.15)
 */
export function createFormSaveSuccessEvent(
  options: FormComponentEventOptions<FormSaveSuccessEvent> = {}
): FormComponentEventResult<FormSaveSuccessEvent> {
  return createEventResult<FormSaveSuccessEvent>(FormComponentEventType.FORM_SAVE_SUCCESS, options);
}

/**
 * Helper factory for creating save failure events (R15.15)
 */
export function createFormSaveFailureEvent(
  options: FormComponentEventOptions<FormSaveFailureEvent> = {}
): FormComponentEventResult<FormSaveFailureEvent> {
  return createEventResult<FormSaveFailureEvent>(FormComponentEventType.FORM_SAVE_FAILURE, options);
}

export function createFormDeleteRequestedEvent(
  options: FormComponentEventOptions<FormDeleteRequestedEvent> = {}
): FormComponentEventResult<FormDeleteRequestedEvent> {
  return createEventResult<FormDeleteRequestedEvent>(FormComponentEventType.FORM_DELETE_REQUESTED, options);
}

export function createFormDeleteExecuteEvent(
  options: FormComponentEventOptions<FormDeleteExecuteEvent> = {}
): FormComponentEventResult<FormDeleteExecuteEvent> {
  return createEventResult<FormDeleteExecuteEvent>(FormComponentEventType.FORM_DELETE_EXECUTE, options);
}

export function createFormDeleteSuccessEvent(
  options: FormComponentEventOptions<FormDeleteSuccessEvent> = {}
): FormComponentEventResult<FormDeleteSuccessEvent> {
  return createEventResult<FormDeleteSuccessEvent>(FormComponentEventType.FORM_DELETE_SUCCESS, options);
}

export function createFormDeleteFailureEvent(
  options: FormComponentEventOptions<FormDeleteFailureEvent> = {}
): FormComponentEventResult<FormDeleteFailureEvent> {
  return createEventResult<FormDeleteFailureEvent>(FormComponentEventType.FORM_DELETE_FAILURE, options);
}

/** Helper factory for creating validation broadcast events */
export function createFormValidationBroadcastEvent(
  options: FormComponentEventOptions<FormValidationBroadcastEvent>
): FormComponentEventResult<FormValidationBroadcastEvent> {
  return createEventResult<FormValidationBroadcastEvent>(FormComponentEventType.FORM_VALIDATION_BROADCAST, options);
}
/** Helper factory for creating validation change request events */
export function createFormValidationGroupsChangeRequestEvent(
  options: FormComponentEventOptions<FormValidationGroupsChangeRequestEvent>
): FormComponentEventResult<FormValidationGroupsChangeRequestEvent> {
  return createEventResult<FormValidationGroupsChangeRequestEvent>(FormComponentEventType.FORM_VALIDATION_CHANGE_REQUEST, options);
}

/** Helper factory for creating form dirty status request events */
export function createFormStatusDirtyRequestEvent(
  options: FormComponentEventOptions<FormStatusDirtyRequestEvent> = {}
): FormComponentEventResult<FormStatusDirtyRequestEvent> {
  return createEventResult<FormStatusDirtyRequestEvent>(FormComponentEventType.FORM_STATUS_DIRTY_REQUEST, options);
}

/**
 * Helper factory for creating field item selected events
 */
export function createFieldItemSelectedEvent(
  options: FormComponentEventOptions<FieldItemSelectedEvent>
): FormComponentEventResult<FieldItemSelectedEvent> {
  return createEventResult<FieldItemSelectedEvent>(FormComponentEventType.FIELD_ITEM_SELECTED, options);
}
