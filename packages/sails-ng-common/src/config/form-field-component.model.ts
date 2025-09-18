import {BaseFormFieldDefinition, KeyValueStringProperty} from "./shared.model";

/**
 * The common form field component definition properties.
 */
export interface BaseFormFieldComponentDefinition extends BaseFormFieldDefinition {
    config?: BaseFormFieldComponentConfig;
}

/**
 * The common form field component config properties.
 */
export class BaseFormFieldComponentConfig {
    /**
     * Whether the component is read-only or not.
     */
    public readonly?: boolean = false;
    /**
     * Whether the component is visible or not.
     */
    public visible?: boolean = true;
    /**
     * Whether the component is in edit mode or not.
     */
    public editMode?: boolean = true;
    /**
     * The label text translation message id.
     */
    public label?: string = '';
    /**
     * The form-supplied css classes
     */
    public defaultComponentCssClasses?: KeyValueStringProperty = null;
    /**
     * The css classes to bind to host
     */
    public hostCssClasses?: KeyValueStringProperty = null;
    /**
     * The wrapper css classes to bind to host
     */
    public wrapperCssClasses?: KeyValueStringProperty = null;
    /**
     * Whether the component is disabled or not.
     */
    public disabled?: boolean = false;
    /**
     * Whether the component has autofocus or not.
     */
    public autofocus?: boolean = false;
    /**
     * The tooltip text translation message id.
     */
    public tooltip?: string = '';
}
