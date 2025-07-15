import {BaseFormFieldComponentConfig} from "./form-field-component.model";

/**
 * The common form field layout definition properties.
 */
export interface BaseFormFieldLayoutDefinition {
    /**
     * Optional name for the layout, used to reference the layout on the client-side.
     */
    name?: string;
}

/**
 * The common form field layout config properties.
 */
export class BaseFormFieldLayoutConfig extends BaseFormFieldComponentConfig {
    /**
     * The string to show when a value is required.
     */
    public labelRequiredStr?: string = '*';
    /**
     * The help text translation message id.
     */
    public helpText?: string = '';
    /**
     * The css classes to apply to the layout element.
     */
    public cssClassesMap?: Record<string, string> = {};
    /**
     * Whether the help text is visible on initialisation or not.
     */
    public helpTextVisibleOnInit?: boolean = false;
    /**
     * Whether the help text is currently visible or not.
     */
    public helpTextVisible?: boolean = false;
}
