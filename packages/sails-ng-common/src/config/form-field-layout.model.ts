import {BaseFormFieldComponentConfig} from "./form-field-component.model";

/**
 *
 */
export interface BaseFormFieldLayoutDefinition {

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
