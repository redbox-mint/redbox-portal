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

/* Radio Input Component */
export const RadioInputComponentName = "RadioInputComponent" as const;
export type RadioInputComponentNameType = typeof RadioInputComponentName;

export interface RadioOption {
    label: string;
    value: string;
    disabled?: boolean;
}

export interface RadioInputFieldComponentConfigFrame extends FieldComponentConfigFrame {
    options?: RadioOption[];
    vocabRef?: string;
    inlineVocab?: boolean;
}

export interface RadioInputFieldComponentConfigOutline extends RadioInputFieldComponentConfigFrame, FieldComponentConfigOutline {
}

export interface RadioInputFieldComponentDefinitionFrame extends FieldComponentDefinitionFrame {
    class: RadioInputComponentNameType;
    config?: RadioInputFieldComponentConfigFrame;
}

export interface RadioInputFieldComponentDefinitionOutline extends RadioInputFieldComponentDefinitionFrame, FieldComponentDefinitionOutline {
    class: RadioInputComponentNameType;
    config?: RadioInputFieldComponentConfigOutline;
}

/* Radio Input Model */
export const RadioInputModelName = "RadioInputModel" as const;
export type RadioInputModelNameType = typeof RadioInputModelName;
export type RadioInputModelValueType = string | null | Array<string>;

export interface RadioInputFieldModelConfigFrame extends FieldModelConfigFrame<RadioInputModelValueType> {
}


export interface RadioInputFieldModelConfigOutline extends RadioInputFieldModelConfigFrame, FieldModelConfigOutline<RadioInputModelValueType> {

}

export interface RadioInputFieldModelDefinitionFrame extends FieldModelDefinitionFrame<RadioInputModelValueType> {
    class: RadioInputModelNameType;
    config?: RadioInputFieldModelConfigFrame;
}

export interface RadioInputFieldModelDefinitionOutline extends RadioInputFieldModelDefinitionFrame, FieldModelDefinitionOutline<RadioInputModelValueType> {
    class: RadioInputModelNameType;
    config?: RadioInputFieldModelConfigOutline;
}

/* Radio Input Form Component */
export interface RadioInputFormComponentDefinitionFrame extends FormComponentDefinitionFrame {
    component: RadioInputFieldComponentDefinitionFrame;
    model?: RadioInputFieldModelDefinitionFrame;
    layout?: AvailableFieldLayoutDefinitionFrames;
}

export interface RadioInputFormComponentDefinitionOutline extends RadioInputFormComponentDefinitionFrame, FormComponentDefinitionOutline {
    component: RadioInputFieldComponentDefinitionOutline;
    model?: RadioInputFieldModelDefinitionOutline;
    layout?: AvailableFieldLayoutDefinitionOutlines;
}


export type RadioInputTypes =
    | { kind: FieldComponentConfigFrameKindType, class: RadioInputFieldComponentConfigFrame }
    | { kind: FieldComponentDefinitionFrameKindType, class: RadioInputFieldComponentDefinitionFrame }
    | { kind: FieldModelConfigFrameKindType, class: RadioInputFieldModelConfigFrame }
    | { kind: FieldModelDefinitionFrameKindType, class: RadioInputFieldModelDefinitionFrame }
    | { kind: FormComponentDefinitionFrameKindType, class: RadioInputFormComponentDefinitionFrame }
    | { kind: FieldComponentConfigKindType, class: RadioInputFieldComponentConfigOutline }
    | { kind: FieldComponentDefinitionKindType, class: RadioInputFieldComponentDefinitionOutline }
    | { kind: FieldModelConfigKindType, class: RadioInputFieldModelConfigOutline }
    | { kind: FieldModelDefinitionKindType, class: RadioInputFieldModelDefinitionOutline }
    | { kind: FormComponentDefinitionKindType, class: RadioInputFormComponentDefinitionOutline }
    ;
