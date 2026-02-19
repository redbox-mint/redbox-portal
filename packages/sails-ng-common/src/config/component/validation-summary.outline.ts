import {
    FieldComponentConfigFrame,
    FieldComponentConfigOutline,
    FieldComponentDefinitionFrame, FieldComponentDefinitionOutline
} from "../field-component.outline";
import {FormComponentDefinitionFrame, FormComponentDefinitionOutline} from "../form-component.outline";
import {AvailableFieldLayoutDefinitionFrames, AvailableFieldLayoutDefinitionOutlines} from "../dictionary.outline";
import {
    FieldComponentConfigFrameKindType, FieldComponentConfigKindType,
    FieldComponentDefinitionFrameKindType, FieldComponentDefinitionKindType,
    FormComponentDefinitionFrameKindType, FormComponentDefinitionKindType
} from "../shared.outline";

/*  Validation Summary Component */

export const ValidationSummaryComponentName = "ValidationSummaryComponent" as const;
export type ValidationSummaryComponentNameType = typeof ValidationSummaryComponentName;

export interface ValidationSummaryFieldComponentConfigFrame extends FieldComponentConfigFrame {
    /**
     * Whether to include tab labels in validation summary labels.
     * Group labels are always included.
     */
    includeTabLabel?: boolean;
}

export interface ValidationSummaryFieldComponentConfigOutline extends ValidationSummaryFieldComponentConfigFrame, FieldComponentConfigOutline {

}

export interface ValidationSummaryFieldComponentDefinitionFrame extends FieldComponentDefinitionFrame {
    class: ValidationSummaryComponentNameType;
    config?: ValidationSummaryFieldComponentConfigFrame;
}

export interface ValidationSummaryFieldComponentDefinitionOutline extends ValidationSummaryFieldComponentDefinitionFrame, FieldComponentDefinitionOutline {
    class: ValidationSummaryComponentNameType;
    config?: ValidationSummaryFieldComponentConfigOutline;
}

/* Validation Summary Form Component */
export interface ValidationSummaryFormComponentDefinitionFrame extends FormComponentDefinitionFrame {
    component: ValidationSummaryFieldComponentDefinitionFrame;
    model?: never;
    layout?: AvailableFieldLayoutDefinitionFrames;
}


export interface ValidationSummaryFormComponentDefinitionOutline extends ValidationSummaryFormComponentDefinitionFrame, FormComponentDefinitionOutline {
    component: ValidationSummaryFieldComponentDefinitionOutline;
    model?: never;
    layout?: AvailableFieldLayoutDefinitionOutlines;
}

export type ValidationSummaryTypes =
    { kind: FieldComponentConfigFrameKindType, class: ValidationSummaryFieldComponentConfigFrame }
    | { kind: FieldComponentDefinitionFrameKindType, class: ValidationSummaryFieldComponentDefinitionFrame }
    | { kind: FormComponentDefinitionFrameKindType, class: ValidationSummaryFormComponentDefinitionFrame }
    | { kind: FieldComponentConfigKindType, class: ValidationSummaryFieldComponentConfigOutline }
    | { kind: FieldComponentDefinitionKindType, class: ValidationSummaryFieldComponentDefinitionOutline }
    | { kind: FormComponentDefinitionKindType, class: ValidationSummaryFormComponentDefinitionOutline }
    ;
