import {FormValidatorConfig} from "../validation/form.model";
import {FieldDefinitionFrame, FieldDefinitionOutline} from "./field.outline";

/**
 * The form field model config interface that provides typing for the object literal and schema.
 */
export interface FieldModelConfigFrame<ValueType> {
    /**
     * TODO: What is this for? And rename to `bindingDisabled` or `disabledBinding`.
     */
    disableFormBinding?: boolean;
    /**
     * The current value of this model.
     *
     * TODO: The value is only settable and gettable from the client, not the form config.
     *       The server does need to populate the value.
     *       Maybe use getter/setter methods instead?
     */
    value?: ValueType;
    /**
     * The default value for this model.
     * Only relevant to the server-side.
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

export interface FieldModelConfigOutline<ValueType> extends FieldModelConfigFrame<ValueType> {

}

/**
 * The form field model definition interface that provides typing for the object literal and schema.
 */
export interface FieldModelDefinitionFrame<ValueType> extends FieldDefinitionFrame {
    config?: FieldModelConfigFrame<ValueType>;
}

export interface FieldModelDefinitionOutline<ValueType> extends FieldModelDefinitionFrame<ValueType>, FieldDefinitionOutline {
    config?: FieldModelConfigFrame<ValueType>;
}
