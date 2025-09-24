import {
    BaseFieldComponentConfig,
    BaseFieldComponentConfigFrame, BaseFieldComponentDefinition,
    BaseFieldComponentDefinitionFrame
} from "./base-field-component.model";


/**
 * The form field layout config interface that provides typing for the object literal and schema.
 */
export interface FieldLayoutConfigFrame extends BaseFieldComponentConfigFrame {
    /**
     * The string to show when a value is required.
     */
    labelRequiredStr?: string;
    /**
     * The help text translation message id.
     */
    helpText?: string;
    /**
     * The css classes to apply to the layout element.
     */
    cssClassesMap?: Record<string, string>;
    /**
     * Whether the help text is visible on initialisation or not.
     */
    helpTextVisibleOnInit?: boolean;
    /**
     * Whether the help text is currently visible or not.
     */
    helpTextVisible?: boolean;
}

/**
 * The common form field layout config properties.
 */
export abstract class FieldLayoutConfig extends BaseFieldComponentConfig implements FieldLayoutConfigFrame {
    public labelRequiredStr?: string = '*';
    public helpText?: string;
    public cssClassesMap?: Record<string, string> = {};
    public helpTextVisibleOnInit?: boolean = false;
    public helpTextVisible?: boolean = false;
}

/**
 * The form field layout definition interface that provides typing for the object literal and schema.
 */
export interface FieldLayoutDefinitionFrame extends BaseFieldComponentDefinitionFrame {
    config?: FieldLayoutConfigFrame;
}

/**
 * The common form field layout definition properties.
 */
export abstract class FieldLayoutDefinition extends BaseFieldComponentDefinition implements FieldLayoutDefinitionFrame {
    abstract config?: FieldLayoutConfig;
    /**
     * Optional name for the layout, used to reference the layout on the client-side.
     */
    name?: string;
}
