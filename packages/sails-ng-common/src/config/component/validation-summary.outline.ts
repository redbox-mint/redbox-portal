
import {FieldComponentConfigFrame, FieldComponentDefinitionFrame} from "../field-component.outline";
import {FormComponentDefinitionFrame} from "../form-component.outline";
import {AvailableFieldLayoutDefinitionFrames, AvailableFieldLayoutDefinitionOutlines} from "../dictionary.outline";

/*  Validation Summary Component */

export const ValidationSummaryComponentName = "ValidationSummaryComponent" as const;
export type ValidationSummaryComponentNameType = typeof ValidationSummaryComponentName;

export interface ValidationSummaryFieldComponentConfigFrame extends FieldComponentConfigFrame {
}

export interface ValidationSummaryFieldComponentConfigOutline extends ValidationSummaryFieldComponentConfigFrame {

}

export interface ValidationSummaryFieldComponentDefinitionFrame extends FieldComponentDefinitionFrame {
    class: ValidationSummaryComponentNameType;
    config?: ValidationSummaryFieldComponentConfigFrame;
}

export interface ValidationSummaryFieldComponentDefinitionOutline extends ValidationSummaryFieldComponentDefinitionFrame {
    class: ValidationSummaryComponentNameType;
    config?: ValidationSummaryFieldComponentConfigOutline;
}

/* Validation Summary Form Component */
export interface ValidationSummaryFormComponentDefinitionFrame extends FormComponentDefinitionFrame {
    component: ValidationSummaryFieldComponentDefinitionFrame;
    model?: never;
    layout?: AvailableFieldLayoutDefinitionFrames;
}


export interface ValidationSummaryFormComponentDefinitionOutline extends ValidationSummaryFormComponentDefinitionFrame {
    component: ValidationSummaryFieldComponentDefinitionOutline;
    model?: never;
    layout?: AvailableFieldLayoutDefinitionOutlines;
}

export type ValidationSummaryFrames =
    ValidationSummaryFieldComponentConfigFrame |
    ValidationSummaryFieldComponentDefinitionFrame |
    ValidationSummaryFormComponentDefinitionFrame;

export type ValidationSummaryOutlines =
    ValidationSummaryFieldComponentConfigOutline |
    ValidationSummaryFieldComponentDefinitionOutline |
    ValidationSummaryFormComponentDefinitionOutline;

