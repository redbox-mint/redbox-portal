import {AvailableFieldLayoutDefinitionFrames, AvailableFieldLayoutDefinitionOutlines,} from "../dictionary.outline";
import {
    FieldModelConfigFrame,
    FieldModelConfigOutline,
    FieldModelDefinitionFrame,
    FieldModelDefinitionOutline
} from "../field-model.outline";
import {
    FieldComponentConfigFrame, FieldComponentConfigOutline,
    FieldComponentDefinitionFrame,
    FieldComponentDefinitionOutline
} from "../field-component.outline";
import {FormComponentDefinitionFrame, FormComponentDefinitionOutline} from "../form-component.outline";
import {
    FieldComponentConfigFrameKindType, FieldComponentConfigKindType,
    FieldComponentDefinitionFrameKindType, FieldComponentDefinitionKindType,
    FieldModelConfigFrameKindType, FieldModelConfigKindType, FieldModelDefinitionFrameKindType,
    FieldModelDefinitionKindType,
    FormComponentDefinitionFrameKindType, FormComponentDefinitionKindType
} from "../shared.outline";


/* Text Area Component */

export const TextAreaComponentName = "TextAreaComponent" as const;
export type TextAreaComponentNameType = typeof TextAreaComponentName;

export interface TextAreaFieldComponentConfigFrame extends FieldComponentConfigFrame {
    rows: number;
    cols: number;
    placeholder?: string;
}

export interface TextAreaFieldComponentConfigOutline extends TextAreaFieldComponentConfigFrame, FieldComponentConfigOutline {
    rows: number;
    cols: number;
    placeholder?: string;
}

export interface TextAreaFieldComponentDefinitionFrame extends FieldComponentDefinitionFrame {
    class: TextAreaComponentNameType;
    config?: TextAreaFieldComponentConfigFrame;
}


export interface TextAreaFieldComponentDefinitionOutline extends TextAreaFieldComponentDefinitionFrame, FieldComponentDefinitionOutline {
    class: TextAreaComponentNameType;
    config?: TextAreaFieldComponentConfigOutline;
}


/* Text Area Model */

export const TextAreaModelName = "TextAreaModel" as const;
export type TextAreaModelNameType = typeof TextAreaModelName;
export type TextAreaModelValueType = string;

export interface TextAreaFieldModelConfigFrame extends FieldModelConfigFrame<TextAreaModelValueType> {
}

export interface TextAreaFieldModelConfigOutline extends TextAreaFieldModelConfigFrame, FieldModelConfigOutline<TextAreaModelValueType> {

}

export interface TextAreaFieldModelDefinitionFrame extends FieldModelDefinitionFrame<TextAreaModelValueType> {
    class: TextAreaModelNameType;
    config?: TextAreaFieldModelConfigFrame;
}

export interface TextAreaFieldModelDefinitionOutline extends TextAreaFieldModelDefinitionFrame, FieldModelDefinitionOutline<TextAreaModelValueType> {
    class: TextAreaModelNameType;
    config?: TextAreaFieldModelConfigOutline;
}

/* Text Area Form Component */

export interface TextAreaFormComponentDefinitionFrame extends FormComponentDefinitionFrame {
    component: TextAreaFieldComponentDefinitionFrame;
    model?: TextAreaFieldModelDefinitionFrame;
    layout?: AvailableFieldLayoutDefinitionFrames;
}

export interface TextAreaFormComponentDefinitionOutline extends TextAreaFormComponentDefinitionFrame, FormComponentDefinitionOutline {
    component: TextAreaFieldComponentDefinitionOutline;
    model?: TextAreaFieldModelDefinitionOutline;
    layout?: AvailableFieldLayoutDefinitionOutlines;
}

export type TextAreaTypes =
    | { kind: FieldComponentConfigFrameKindType, class: TextAreaFieldComponentConfigFrame }
    | { kind: FieldComponentDefinitionFrameKindType, class: TextAreaFieldComponentDefinitionFrame }
    | { kind: FieldModelConfigFrameKindType, class: TextAreaFieldModelConfigFrame }
    | { kind: FieldModelDefinitionFrameKindType, class: TextAreaFieldModelDefinitionFrame }
    | { kind: FormComponentDefinitionFrameKindType, class: TextAreaFormComponentDefinitionFrame }
    | { kind: FieldComponentConfigKindType, class: TextAreaFieldComponentConfigOutline }
    | { kind: FieldComponentDefinitionKindType, class: TextAreaFieldComponentDefinitionOutline }
    | { kind: FieldModelConfigKindType, class: TextAreaFieldModelConfigOutline }
    | { kind: FieldModelDefinitionKindType, class: TextAreaFieldModelDefinitionOutline }
    | { kind: FormComponentDefinitionKindType, class: TextAreaFormComponentDefinitionOutline }
    ;

