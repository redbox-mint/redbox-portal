import {FormValidatorConfig} from "../validation";
import {BaseFormFieldDefinition} from "./shared.model";

/**
 * The common form field model definition properties.
 */
export interface BaseFormFieldModelDefinition<ValueType> extends BaseFormFieldDefinition{
    config?: BaseFormFieldModelConfig<ValueType>;
}

/**
 * The common form field model config properties.
 */
export class BaseFormFieldModelConfig<ValueType> {
    /**
     * TODO: What is this for? And rename to `bindingDisabled` or `disabledBinding`.
     */
    public disableFormBinding?: boolean = false;
    /**
     * The current value of this model.
     *
     * TODO: The value is only settable and gettable from the client, not the form config.
     *       Maybe use getter/setter methods instead?
     */
    public value?: ValueType;
    /**
     * The default value for this model.
     */
    public defaultValue?: ValueType;
    /**
     * The validators that are configured at the field level that look at only this model.
     */
    validators?: FormValidatorConfig[];
    /**
     * The optional css classes to be applied to the wrapper element.
     */
    wrapperCssClasses?: string;
    /**
     * The optional css classes to be applied to the form dom node in edit mode.
     */
    editCssClasses?: string;
}
