import {
    FieldComponentConfigFrameKindType, FieldComponentConfigKindType,
    FieldComponentDefinitionFrameKindType, FieldComponentDefinitionKindType,
    FieldModelConfigFrameKindType,
    FieldModelConfigKindType, FieldModelDefinitionFrameKindType,
    FieldModelDefinitionKindType, FormComponentDefinitionFrameKindType, FormComponentDefinitionKindType
} from "../shared.outline";
import {
    FieldComponentConfigFrame,
    FieldComponentConfigOutline,
    FieldComponentDefinitionFrame, FieldComponentDefinitionOutline
} from "../field-component.outline";

import {
    FieldModelConfigFrame,
    FieldModelConfigOutline,
    FieldModelDefinitionFrame,
    FieldModelDefinitionOutline
} from "../field-model.outline";
import {FormComponentDefinitionFrame, FormComponentDefinitionOutline} from "../form-component.outline";
import {AvailableFieldLayoutDefinitionFrames, AvailableFieldLayoutDefinitionOutlines} from "../dictionary.outline";

/* Checkbox Input Component */
export const CheckboxInputComponentName = "CheckboxInputComponent" as const;
export type CheckboxInputComponentNameType = typeof CheckboxInputComponentName;

export interface CheckboxOption {
    label: string;
    value: string;
    disabled?: boolean;
}

export interface CheckboxInputFieldComponentConfigFrame extends FieldComponentConfigFrame {
    placeholder?: string;
    options?: CheckboxOption[];
    multipleValues?: boolean;
    vocabRef?: string;
    inlineVocab?: boolean;
}

export interface CheckboxInputFieldComponentConfigOutline extends CheckboxInputFieldComponentConfigFrame, FieldComponentConfigOutline {
}

export interface CheckboxInputFieldComponentDefinitionFrame extends FieldComponentDefinitionFrame {
    class: CheckboxInputComponentNameType;
    config?: CheckboxInputFieldComponentConfigFrame;
}

export interface CheckboxInputFieldComponentDefinitionOutline extends CheckboxInputFieldComponentDefinitionFrame, FieldComponentDefinitionOutline {
    class: CheckboxInputComponentNameType;
    config?: CheckboxInputFieldComponentConfigOutline;
}

/* Checkbox Input Model */
export const CheckboxInputModelName = "CheckboxInputModel" as const;
export type CheckboxInputModelNameType = typeof CheckboxInputModelName;
export type CheckboxInputModelValueType = string | null | Array<string>;

export interface CheckboxInputFieldModelConfigFrame extends FieldModelConfigFrame<CheckboxInputModelValueType> {
}


export interface CheckboxInputFieldModelConfigOutline extends CheckboxInputFieldModelConfigFrame, FieldModelConfigOutline<CheckboxInputModelValueType> {

}

export interface CheckboxInputFieldModelDefinitionFrame extends FieldModelDefinitionFrame<CheckboxInputModelValueType> {
    class: CheckboxInputModelNameType;
    config?: CheckboxInputFieldModelConfigFrame;
}

export interface CheckboxInputFieldModelDefinitionOutline extends CheckboxInputFieldModelDefinitionFrame, FieldModelDefinitionOutline<CheckboxInputModelValueType> {
    class: CheckboxInputModelNameType;
    config?: CheckboxInputFieldModelConfigOutline;
}

/* Checkbox Input Form Component */
export interface CheckboxInputFormComponentDefinitionFrame extends FormComponentDefinitionFrame {
    component: CheckboxInputFieldComponentDefinitionFrame;
    model?: CheckboxInputFieldModelDefinitionFrame;
    layout?: AvailableFieldLayoutDefinitionFrames;
}

export interface CheckboxInputFormComponentDefinitionOutline extends CheckboxInputFormComponentDefinitionFrame, FormComponentDefinitionOutline {
    component: CheckboxInputFieldComponentDefinitionOutline;
    model?: CheckboxInputFieldModelDefinitionOutline;
    layout?: AvailableFieldLayoutDefinitionOutlines;
}


export type CheckboxInputTypes =
    | { kind: FieldComponentConfigFrameKindType, class: CheckboxInputFieldComponentConfigFrame }
    | { kind: FieldComponentDefinitionFrameKindType, class: CheckboxInputFieldComponentDefinitionFrame }
    | { kind: FieldModelConfigFrameKindType, class: CheckboxInputFieldModelConfigFrame }
    | { kind: FieldModelDefinitionFrameKindType, class: CheckboxInputFieldModelDefinitionFrame }
    | { kind: FormComponentDefinitionFrameKindType, class: CheckboxInputFormComponentDefinitionFrame }
    | { kind: FieldComponentConfigKindType, class: CheckboxInputFieldComponentConfigOutline }
    | { kind: FieldComponentDefinitionKindType, class: CheckboxInputFieldComponentDefinitionOutline }
    | { kind: FieldModelConfigKindType, class: CheckboxInputFieldModelConfigOutline }
    | { kind: FieldModelDefinitionKindType, class: CheckboxInputFieldModelDefinitionOutline }
    | { kind: FormComponentDefinitionKindType, class: CheckboxInputFormComponentDefinitionOutline }
    ;
