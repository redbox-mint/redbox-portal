import {BaseFormFieldComponentConfig} from "./form-field-component.model";

/**
 *
 */
export interface BaseFormFieldLayoutDefinition {
    /**
     * Optional name for the layout, used to reference the layout on the client-side.
     */
    name?: string;
}

/**
 *
 */
export class BaseFormFieldLayoutConfig extends BaseFormFieldComponentConfig {
    public labelRequiredStr?: string = '*';
    public helpText?: string = '';
    public cssClassesMap?: Record<string, string> = {};
    public helpTextVisibleOnInit?: boolean = false;
    public helpTextVisible?: boolean = false;
}
