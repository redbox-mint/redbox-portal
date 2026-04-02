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

/* Dropdown Input Component */
export const DropdownInputComponentName = "DropdownInputComponent" as const;
export type DropdownInputComponentNameType = typeof DropdownInputComponentName;

export interface DropdownOption {
    label: string;
    value: string;
    disabled?: boolean;
}

export interface DropdownInputFieldComponentConfigFrame extends FieldComponentConfigFrame {
    placeholder?: string;
    options?: DropdownOption[];
    vocabRef?: string;
    inlineVocab?: boolean;
}

export interface DropdownInputFieldComponentConfigOutline extends DropdownInputFieldComponentConfigFrame, FieldComponentConfigOutline {
}

export interface DropdownInputFieldComponentDefinitionFrame extends FieldComponentDefinitionFrame {
    class: DropdownInputComponentNameType;
    config?: DropdownInputFieldComponentConfigFrame;
}

export interface DropdownInputFieldComponentDefinitionOutline extends DropdownInputFieldComponentDefinitionFrame, FieldComponentDefinitionOutline {
    class: DropdownInputComponentNameType;
    config?: DropdownInputFieldComponentConfigOutline;
}

/* Dropdown Input Model */
export const DropdownInputModelName = "DropdownInputModel" as const;
export type DropdownInputModelNameType = typeof DropdownInputModelName;
export type DropdownInputModelValueType = string | null | Array<string>;

export interface DropdownInputFieldModelConfigFrame extends FieldModelConfigFrame<DropdownInputModelValueType> {
}


export interface DropdownInputFieldModelConfigOutline extends DropdownInputFieldModelConfigFrame, FieldModelConfigOutline<DropdownInputModelValueType> {

}

export interface DropdownInputFieldModelDefinitionFrame extends FieldModelDefinitionFrame<DropdownInputModelValueType> {
    class: DropdownInputModelNameType;
    config?: DropdownInputFieldModelConfigFrame;
}

export interface DropdownInputFieldModelDefinitionOutline extends DropdownInputFieldModelDefinitionFrame, FieldModelDefinitionOutline<DropdownInputModelValueType> {
    class: DropdownInputModelNameType;
    config?: DropdownInputFieldModelConfigOutline;
}

/* Dropdown Input Form Component */
export interface DropdownInputFormComponentDefinitionFrame extends FormComponentDefinitionFrame {
    component: DropdownInputFieldComponentDefinitionFrame;
    model?: DropdownInputFieldModelDefinitionFrame;
    layout?: AvailableFieldLayoutDefinitionFrames;
}

export interface DropdownInputFormComponentDefinitionOutline extends DropdownInputFormComponentDefinitionFrame, FormComponentDefinitionOutline {
    component: DropdownInputFieldComponentDefinitionOutline;
    model?: DropdownInputFieldModelDefinitionOutline;
    layout?: AvailableFieldLayoutDefinitionOutlines;
}


export type DropdownInputTypes =
    | { kind: FieldComponentConfigFrameKindType, class: DropdownInputFieldComponentConfigFrame }
    | { kind: FieldComponentDefinitionFrameKindType, class: DropdownInputFieldComponentDefinitionFrame }
    | { kind: FieldModelConfigFrameKindType, class: DropdownInputFieldModelConfigFrame }
    | { kind: FieldModelDefinitionFrameKindType, class: DropdownInputFieldModelDefinitionFrame }
    | { kind: FormComponentDefinitionFrameKindType, class: DropdownInputFormComponentDefinitionFrame }
    | { kind: FieldComponentConfigKindType, class: DropdownInputFieldComponentConfigOutline }
    | { kind: FieldComponentDefinitionKindType, class: DropdownInputFieldComponentDefinitionOutline }
    | { kind: FieldModelConfigKindType, class: DropdownInputFieldModelConfigOutline }
    | { kind: FieldModelDefinitionKindType, class: DropdownInputFieldModelDefinitionOutline }
    | { kind: FormComponentDefinitionKindType, class: DropdownInputFormComponentDefinitionOutline }
    ;
