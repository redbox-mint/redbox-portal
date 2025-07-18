import {BaseFormFieldComponentConfig, BaseFormFieldComponentDefinition} from "../form-field-component.model";
import {BaseFormFieldModelConfig, BaseFormFieldModelDefinition} from "../form-field-model.model";
import {FormValidatorSummaryErrors} from "../../validation";


export interface ValidationSummaryFormFieldComponentDefinition extends BaseFormFieldComponentDefinition {
    class: "ValidationSummaryFieldComponent";
    config?: ValidationSummaryFormFieldComponentConfig;
}

export class ValidationSummaryFormFieldComponentConfig extends BaseFormFieldComponentConfig {

}

export interface ValidationSummaryFormFieldModelDefinition extends BaseFormFieldModelDefinition<FormValidatorSummaryErrors> {
    class: "ValidationSummaryFieldModel";
    config: ValidationSummaryFormFieldModelConfig;
}

export class ValidationSummaryFormFieldModelConfig extends BaseFormFieldModelConfig<FormValidatorSummaryErrors> {

}