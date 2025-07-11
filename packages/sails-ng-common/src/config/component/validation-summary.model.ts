import {BaseFormFieldComponentConfig, BaseFormFieldComponentDefinition} from "../form-field-component.model";
import {BaseFormFieldModelConfig, BaseFormFieldModelDefinition} from "../form-field-model.model";

export interface ValidationSummaryFormFieldComponentDefinition extends BaseFormFieldComponentDefinition {
    class: "ValidationSummaryFieldComponent";
    config?: ValidationSummaryFormFieldComponentConfig;
}

export class ValidationSummaryFormFieldComponentConfig extends BaseFormFieldComponentConfig {

}

export interface ValidationSummaryFormFieldModelDefinition<ValueType> extends BaseFormFieldModelDefinition<ValueType> {
    class: "ValidationSummaryFieldModel";
    config: ValidationSummaryFormFieldModelConfig<ValueType>;
}

export class ValidationSummaryFormFieldModelConfig<ValueType> extends BaseFormFieldModelConfig<ValueType> {

}