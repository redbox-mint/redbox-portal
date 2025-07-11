import {BaseFormFieldModelConfig, BaseFormFieldModelDefinition} from "../form-field-model.model";
import {FormComponentDefinition} from "../form-component.model";
import {BaseFormFieldComponentConfig, BaseFormFieldComponentDefinition} from "../form-field-component.model";


export type GroupFieldModelValueType = Record<string, unknown>;

export interface GroupFormFieldComponentDefinition extends BaseFormFieldComponentDefinition {
    class: "GroupFieldComponent";
    config?: GroupFormFieldComponentConfig;
}

export interface GroupFormFieldComponentConfig extends BaseFormFieldComponentConfig {
    componentDefinitions?: FormComponentDefinition<unknown>[];
}

export interface GroupFormFieldModelDefinition<ValueType> extends BaseFormFieldModelDefinition<ValueType> {
    class: "GroupFieldModel";
    config: GroupFormFieldModelConfig<ValueType>;
}

export interface GroupFormFieldModelConfig<ValueType> extends BaseFormFieldModelConfig<ValueType> {
    value?: GroupFieldModelValueType | ValueType;
    defaultValue?: GroupFieldModelValueType | ValueType;
}
