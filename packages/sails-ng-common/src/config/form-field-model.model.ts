import {FormValidatorConfig} from "../validation";
import {FormFieldDefinition, FormFieldDefinitionFrame} from ".";

/**
 * The form field model config interface that provides typing for the object literal and schema.
 */
export interface FormFieldModelConfigFrame<ValueType> {
    /**
     * TODO: What is this for? And rename to `bindingDisabled` or `disabledBinding`.
     */
    disableFormBinding?: boolean;
    /**
     * The current value of this model.
     *
     * TODO: The value is only settable and gettable from the client, not the form config.
     *       Maybe use getter/setter methods instead?
     */
    value?: ValueType;
    /**
     * The default value for this model.
     */
    defaultValue?: ValueType;
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

/**
 * The common form field model config properties.
 */
export abstract class FormFieldModelConfig<ValueType> implements FormFieldModelConfigFrame<ValueType> {
    defaultValue?: ValueType;
    disableFormBinding?: boolean;
    editCssClasses?: string;
    validators?: FormValidatorConfig[];
    value?: ValueType;
    wrapperCssClasses?: string;

    protected constructor(data?: FormFieldModelConfigFrame<ValueType>) {
        Object.assign(this, data ?? {});
    }
}

/**
 * The form field model definition interface that provides typing for the object literal and schema.
 */
export interface FormFieldModelDefinitionFrame<ValueType> extends FormFieldDefinitionFrame {
    config?: FormFieldModelConfig<ValueType>;
}

/**
 * The common form field model definition properties.
 */
export abstract class FormFieldModelDefinition<ValueType> extends FormFieldDefinition implements FormFieldModelDefinitionFrame<ValueType>  {
    config?: FormFieldModelConfig<ValueType>;

    protected constructor(data: FormFieldModelDefinitionFrame<ValueType>) {
        super(data);
        // The config must be assigned in the subclasses.
        this.config = undefined;
    }
}

