import {BaseFormFieldModelConfig, BaseFormFieldModelDefinition} from "../form-field-model.model";
import {FormComponentDefinition} from "../form-component.model";
import {BaseFormFieldComponentConfig, BaseFormFieldComponentDefinition} from "../form-field-component.model";


export type TextFieldModelValueType = Record<string, unknown>;

export interface TextFormFieldComponentDefinition extends BaseFormFieldComponentDefinition {
    class: "TextFieldComponent";
    config?: TextFormFieldComponentConfig;
}

export interface TextFormFieldComponentConfig extends BaseFormFieldComponentConfig {
    componentDefinitions?: FormComponentDefinition<unknown>[];
}

export interface TextFormFieldModelDefinition<ValueType> extends BaseFormFieldModelDefinition<ValueType> {
    class: "TextFieldModel";
    config: TextFormFieldModelConfig<ValueType>;
}

export interface TextFormFieldModelConfig<ValueType> extends BaseFormFieldModelConfig<ValueType> {
    value?: TextFieldModelValueType | ValueType;
    defaultValue?: TextFieldModelValueType | ValueType;
}
