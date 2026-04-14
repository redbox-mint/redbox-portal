import {KeyValueStringProperty} from "./shared.outline";
import {FieldDefinitionFrame, FieldDefinitionOutline} from "./field.outline";

/**
 * Declares a source field for one-way additive sync.
 * This is declarative metadata only and is not read by expression templates at runtime.
 */
export interface SyncSourceEntry {
    /**
     * formData key to read the source data from.
     */
    fieldName: string;
    /**
     * Optional property on the source object to use as the dedupe/upsert key.
     * When omitted, consumers may fall back to component-specific defaults.
     */
    syncKey?: string;
    /**
     * Optional formData key whose value determines whether this source is active.
     */
    visibilityConditionField?: string;
    /**
     * Values of the condition field that make this source active.
     */
    visibilityConditionValues?: string[];
}

/**
 * The form field component config interface that provides typing for the object literal and schema.
 */
export interface BaseFieldComponentConfigFrame {
    /**
     * Whether the component is read-only or not.
     */
    readonly?: boolean;
    /**
     * Whether the component is visible or not.
     */
    visible?: boolean;
    /**
     * Whether the component is in edit mode or not.
     */
    editMode?: boolean;
    /**
     * The label text translation message id.
     */
    label?: string;
    /**
     * The form-supplied css classes
     */
    defaultComponentCssClasses?: KeyValueStringProperty;
    /**
     * The css classes to bind to host
     */
    hostCssClasses?: KeyValueStringProperty;
    /**
     * The wrapper css classes to bind to host
     */
    wrapperCssClasses?: KeyValueStringProperty;
    /**
     * Whether the component is disabled or not.
     */
    disabled?: boolean;
    /**
     * Whether the component has autofocus or not.
     */
    autofocus?: boolean;
    /**
     * The tooltip text translation message id.
     */
    tooltip?: string;
    /**
     * Whether to show a visual valid indicator (e.g. Bootstrap is-valid style) when the field has no errors.
     * Defaults to false.
     */
    showValidIndicator?: boolean;
    /**
     * Declares source fields for one-way additive sync.
     * Declarative metadata only and not interpreted by the component runtime.
     */
    syncSources?: SyncSourceEntry[];
}

export interface BaseFieldComponentConfigOutline extends BaseFieldComponentConfigFrame {

}

/**
 * The form field component definition interface that provides typing for the object literal and schema.
 */
export interface BaseFieldComponentDefinitionFrame extends FieldDefinitionFrame {
    config?: BaseFieldComponentConfigFrame;
}

export interface BaseFieldComponentDefinitionOutline extends BaseFieldComponentDefinitionFrame, FieldDefinitionOutline {
    config?: BaseFieldComponentConfigOutline;
}
