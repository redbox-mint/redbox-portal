import {AvailableFieldLayoutDefinitionFrames, AvailableFieldLayoutDefinitionOutlines,} from "../dictionary.outline";
import {FieldModelConfigFrame, FieldModelDefinitionFrame} from "../field-model.outline";
import {FieldComponentConfigFrame, FieldComponentDefinitionFrame} from "../field-component.outline";
import {FormComponentDefinitionFrame} from "../form-component.outline";


/* Text Area Component */

export const TextAreaComponentName = "TextAreaComponent" as const;
export type TextAreaComponentNameType = typeof TextAreaComponentName;

export interface TextAreaFieldComponentConfigFrame extends FieldComponentConfigFrame {
    rows: number;
    cols: number;
    placeholder?: string;
}

export interface TextAreaFieldComponentConfigOutline extends TextAreaFieldComponentConfigFrame {
    rows: number;
    cols: number;
    placeholder?: string;
}

export interface TextAreaFieldComponentDefinitionFrame extends FieldComponentDefinitionFrame {
    class: TextAreaComponentNameType;
    config?: TextAreaFieldComponentConfigFrame;
}


export interface TextAreaFieldComponentDefinitionOutline extends TextAreaFieldComponentDefinitionFrame {
    class: TextAreaComponentNameType;
    config?: TextAreaFieldComponentConfigOutline;
}


/* Text Area Model */

export const TextAreaModelName = "TextAreaModel" as const;
export type TextAreaModelNameType = typeof TextAreaModelName;
export type TextAreaModelValueType = string;

export interface TextAreaFieldModelConfigFrame extends FieldModelConfigFrame<TextAreaModelValueType> {
}

export interface TextAreaFieldModelConfigOutline extends TextAreaFieldModelConfigFrame {

}

export interface TextAreaFieldModelDefinitionFrame extends FieldModelDefinitionFrame<TextAreaModelValueType> {
    class: TextAreaModelNameType;
    config?: TextAreaFieldModelConfigFrame;
}

export interface TextAreaFieldModelDefinitionOutline extends TextAreaFieldModelDefinitionFrame {
    class: TextAreaModelNameType;
    config?: TextAreaFieldModelConfigOutline;
}

/* Text Area Form Component */

export interface TextAreaFormComponentDefinitionFrame extends FormComponentDefinitionFrame {
    component: TextAreaFieldComponentDefinitionFrame;
    model?: TextAreaFieldModelDefinitionFrame;
    layout?: AvailableFieldLayoutDefinitionFrames;
}

export interface TextAreaFormComponentDefinitionOutline extends TextAreaFormComponentDefinitionFrame {
    component: TextAreaFieldComponentDefinitionOutline;
    model?: TextAreaFieldModelDefinitionOutline;
    layout?: AvailableFieldLayoutDefinitionOutlines;
}

export type TextAreaFrames =
    TextAreaFieldComponentConfigFrame |
    TextAreaFieldComponentDefinitionFrame |
    TextAreaFieldModelConfigFrame |
    TextAreaFieldModelDefinitionFrame |
    TextAreaFormComponentDefinitionFrame;


export type TextAreaOutlines =
    TextAreaFieldComponentConfigOutline |
    TextAreaFieldComponentDefinitionOutline |
    TextAreaFieldModelConfigOutline |
    TextAreaFieldModelDefinitionOutline |
    TextAreaFormComponentDefinitionOutline;

