import {KeyValueStringProperty} from "./shared.outline";
import {FieldDefinitionFrame, FieldDefinitionOutline} from "./field.outline";

/**
 * Declares a source field for one-way additive sync.
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
     * Optional list of item fields to inspect when deciding whether an existing
     * repeatable row is still a blank placeholder.
     */
    blankCheckFields?: string[];
    /**
     * Optional object merged into synced rows before insertion/update.
     * This allows sync behavior to stay generic while individual configs
     * provide domain-specific defaults such as roles.
     */
    defaultTemplate?: Record<string, unknown>;
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
