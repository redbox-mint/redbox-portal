import {FormValidatorConfig} from "../validation";
import {FormFieldModelDataConfig} from "../config.model";

/**
 *
 */
export interface BaseFormFieldModelDefinition<ValueType> {

}

/**
 *
 */
export class BaseFormFieldModelConfig<ValueType> {
    // TODO: rename to `bindingDisabled` or `disabledBinding`
    public disableFormBinding?: boolean = false;
    // public value?: ValueType;
    // the default value
    // public defaultValue?: ValueType;
    // the data model describing this field's value
    public dataSchema?: FormFieldModelDataConfig | string;
    // the validators
    validators?: FormValidatorConfig[];
    wrapperCssClasses?: string;
    editCssClasses?: string;
}
