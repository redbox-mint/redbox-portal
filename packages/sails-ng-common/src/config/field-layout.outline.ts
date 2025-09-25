import {BaseFieldComponentConfigFrame, BaseFieldComponentDefinitionFrame} from "./base-field-component.outline";


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

export interface FieldLayoutConfigOutline extends FieldLayoutConfigFrame {

}

/**
 * The form field layout definition interface that provides typing for the object literal and schema.
 */
export interface FieldLayoutDefinitionFrame extends BaseFieldComponentDefinitionFrame {
    config?: FieldLayoutConfigFrame;
}

export interface FieldLayoutDefinitionOutline extends FieldLayoutDefinitionFrame {

}