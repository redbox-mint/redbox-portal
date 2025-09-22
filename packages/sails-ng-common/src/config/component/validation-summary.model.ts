import {BaseFormFieldComponentConfig, BaseFormFieldComponentDefinition} from "../form-field-component.model";
import {FormFieldModelConfig, FormFieldModelDefinition} from "../form-field-model.model";
import {FormValidatorSummaryErrors} from "../../validation";


export interface ValidationSummaryFormFieldComponentDefinition extends BaseFormFieldComponentDefinition {
    class: "ValidationSummaryFieldComponent";
    config?: ValidationSummaryFormFieldComponentConfig;
}

export class ValidationSummaryFormFieldComponentConfig extends BaseFormFieldComponentConfig {

}

export interface ValidationSummaryFormFieldModelDefinition extends FormFieldModelDefinition<FormValidatorSummaryErrors> {
    class: "ValidationSummaryFieldModel";
    config: ValidationSummaryFormFieldModelConfig;
}

export class ValidationSummaryFormFieldModelConfig extends FormFieldModelConfig<FormValidatorSummaryErrors> {

}