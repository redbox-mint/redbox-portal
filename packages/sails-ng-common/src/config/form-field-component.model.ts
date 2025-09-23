import {KeyValueStringProperty, FieldDefinition, FieldDefinitionFrame} from "..";

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

/**
 * The common form field component config properties.
 */
export abstract class BaseFieldComponentConfig implements BaseFieldComponentConfigFrame {
    public readonly: boolean = false;
    public visible: boolean = true;
    public editMode: boolean = true;
    public label?: string;
    public defaultComponentCssClasses?: KeyValueStringProperty;
    public hostCssClasses?: KeyValueStringProperty;
    public wrapperCssClasses?: KeyValueStringProperty;
    public disabled: boolean = false;
    public autofocus: boolean = false;
    public tooltip?: string;

    protected constructor(data?: BaseFieldComponentConfigFrame) {
        Object.assign(this, data ?? {});
    }
}

export interface FieldComponentConfigFrame extends BaseFieldComponentConfigFrame {
}

export abstract class FieldComponentConfig extends BaseFieldComponentConfig implements FieldComponentConfigFrame {
}

/**
 * The form field component definition interface that provides typing for the object literal and schema.
 */
export interface BaseFieldComponentDefinitionFrame extends FieldDefinitionFrame {
    config?: BaseFieldComponentConfigFrame;
}


/**
 * The common form field component definition properties.
 */
export abstract class BaseFieldComponentDefinition extends FieldDefinition implements BaseFieldComponentDefinitionFrame {
    config?: BaseFieldComponentConfig;

    protected constructor(data: BaseFieldComponentDefinitionFrame) {
        super(data);
        // The config must be assigned in the subclasses.
        this.config = undefined;
    }
}

export interface FieldComponentDefinitionFrame extends BaseFieldComponentDefinitionFrame {
}

export abstract class FieldComponentDefinition extends BaseFieldComponentDefinition implements FieldComponentDefinitionFrame {
}