import {KeyValueStringProperty} from "./shared.outline";
import {FieldDefinitionFrame} from "./field.outline";

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
}

export interface BaseFieldComponentConfigOutline extends BaseFieldComponentConfigFrame {

}

/**
 * The form field component definition interface that provides typing for the object literal and schema.
 */
export interface BaseFieldComponentDefinitionFrame extends FieldDefinitionFrame {
    config?: BaseFieldComponentConfigFrame;
}

export interface BaseFieldComponentDefinitionOutline extends BaseFieldComponentDefinitionFrame {

}