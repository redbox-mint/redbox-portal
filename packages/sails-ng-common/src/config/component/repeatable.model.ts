import { BaseFormFieldComponentDefinition, BaseFormFieldComponentConfig} from "../form-field-component.model";
import {BaseFormFieldLayoutConfig, BaseFormFieldLayoutDefinition} from "../form-field-layout.model";
import {BaseFormFieldModelConfig, BaseFormFieldModelDefinition } from "../form-field-model.model";
import {FormComponentDefinition} from "../form-component.model";

export type RepeatableModelValueType<ValueType> = ValueType[];

export interface RepeatableFormFieldComponentDefinition extends BaseFormFieldComponentDefinition {
    class: "RepeatableComponent";
    config?: RepeatableFormFieldComponentConfig;
}

export interface RepeatableFormFieldComponentConfig extends BaseFormFieldComponentConfig {
    elementTemplate?: FormComponentDefinition<unknown>;
}

export interface RepeatableElementFormFieldLayoutDefinition extends BaseFormFieldLayoutDefinition {
    class: "RepeatableElementLayoutComponent";
    config: RepeatableElementFormFieldLayoutConfig;
}

export interface RepeatableElementFormFieldLayoutConfig extends BaseFormFieldLayoutConfig {

}

export interface RepeatableFormFieldModelDefinition<ValueType> extends BaseFormFieldModelDefinition<ValueType> {
    class: "RepeatableComponentModel";
    config: RepeatableFormFieldModelConfig<ValueType>;
    // TODO: Migrate properties from `RepeatableContainer`
}

export interface RepeatableFormFieldModelConfig<ValueType> extends BaseFormFieldModelConfig<ValueType> {
    /**
     * The initial value of the repeatable component, e.g. an empty array
     */
    value?: RepeatableModelValueType<ValueType>;
    defaultValue?: RepeatableModelValueType<ValueType>;
    // TODO: Migrate JSON configurable properties from `RepeatableContainer`
}
