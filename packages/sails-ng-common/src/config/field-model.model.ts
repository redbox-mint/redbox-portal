import { FormValidatorConfig } from "../validation/form.model";
import { FieldDefinition } from "./field.model";
import { FieldModelConfigOutline, FieldModelDefinitionOutline } from "./field-model.outline";


/**
 * The common form field model config properties.
 */
export abstract class FieldModelConfig<ValueType> implements FieldModelConfigOutline<ValueType> {
    value?: ValueType;
    defaultValue?: ValueType;
    newEntryValue?: ValueType;
    validators?: FormValidatorConfig[];
    wrapperCssClasses?: string;
    editCssClasses?: string;
    disabled?: boolean;
}

/**
 * The common form field model definition properties.
 */
export abstract class FieldModelDefinition<ValueType> extends FieldDefinition implements FieldModelDefinitionOutline<ValueType> {
    abstract config?: FieldModelConfig<ValueType>;
}

