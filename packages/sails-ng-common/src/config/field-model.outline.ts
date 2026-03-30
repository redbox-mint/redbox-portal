import { FormValidatorConfig } from "../validation/form.model";
import { FieldDefinitionFrame, FieldDefinitionOutline } from "./field.outline";
import { RepeatableModelValueType } from "./component/repeatable.outline";

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
     * The 'value' is only available after the form config has been processed,
     * and the default values or the existing record values have been populated.
     */
    value?: ValueType;
    /**
     * The default value for this model.
     *
     * The server-side processing uses this as the default for the field.
     * Defaults from ancestor fields will be combined to form the default value for a new record.
     */
    defaultValue?: ValueType;
    /**
     * The value to use when creating new entries in the repeatable.
     *
     * Only available in a repeatable's elementTemplate in 'model.config.newEntryValue'.
     *
     * The default value for a repeatable is specified in 'model.config.defaultValue'.
     * The value for a repeatable is in 'model.config.value'.
     */
    newEntryValue?: ValueType;
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
    /**
     * Whether the form control should be disabled.
     *
     * Disabled controls are excluded from the parent form's value.
     */
    disabled?: boolean;
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
