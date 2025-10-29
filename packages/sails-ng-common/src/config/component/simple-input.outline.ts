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
    FieldModelConfigFrameKindType,
    FieldModelConfigKindType, FieldModelDefinitionFrameKindType,
    FieldModelDefinitionKindType, FormComponentDefinitionFrameKindType, FormComponentDefinitionKindType
} from "../shared.outline";


/* Simple Input Component */
export const SimpleInputComponentName = "SimpleInputComponent" as const;
export type SimpleInputComponentNameType = typeof SimpleInputComponentName;

export const SimpleInputFieldComponentConfigTypeNames = ["email", "text", "tel", "number", "password", "url"] as const;
export type SimpleInputFieldComponentConfigType = typeof SimpleInputFieldComponentConfigTypeNames[number];

export interface SimpleInputFieldComponentConfigFrame extends FieldComponentConfigFrame {
    type?: SimpleInputFieldComponentConfigType;
}

export interface SimpleInputFieldComponentConfigOutline extends SimpleInputFieldComponentConfigFrame, FieldComponentConfigOutline {
}

export interface SimpleInputFieldComponentDefinitionFrame extends FieldComponentDefinitionFrame {
    class: SimpleInputComponentNameType;
    config?: SimpleInputFieldComponentConfigFrame;
}

export interface SimpleInputFieldComponentDefinitionOutline extends SimpleInputFieldComponentDefinitionFrame, FieldComponentDefinitionOutline {
    class: SimpleInputComponentNameType;
    config?: SimpleInputFieldComponentConfigOutline;
}


/* Simple Input Model */
export const SimpleInputModelName = "SimpleInputModel" as const;
export type SimpleInputModelNameType = typeof SimpleInputModelName;
export type SimpleInputModelValueType = string;

export interface SimpleInputFieldModelConfigFrame extends FieldModelConfigFrame<SimpleInputModelValueType> {
}


export interface SimpleInputFieldModelConfigOutline extends SimpleInputFieldModelConfigFrame, FieldModelConfigOutline<SimpleInputModelValueType>  {

}

export interface SimpleInputFieldModelDefinitionFrame extends FieldModelDefinitionFrame<SimpleInputModelValueType> {
    class: SimpleInputModelNameType;
    config?: SimpleInputFieldModelConfigFrame;
}

export interface SimpleInputFieldModelDefinitionOutline extends SimpleInputFieldModelDefinitionFrame, FieldModelDefinitionOutline<SimpleInputModelValueType>  {
    class: SimpleInputModelNameType;
    config?: SimpleInputFieldModelConfigOutline;
}

/* Simple Input Form Component */
export interface SimpleInputFormComponentDefinitionFrame extends FormComponentDefinitionFrame {
    component: SimpleInputFieldComponentDefinitionFrame;
    model?: SimpleInputFieldModelDefinitionFrame;
    layout?: AvailableFieldLayoutDefinitionFrames;
}

export interface SimpleInputFormComponentDefinitionOutline extends SimpleInputFormComponentDefinitionFrame, FormComponentDefinitionOutline {
    component: SimpleInputFieldComponentDefinitionOutline;
    model?: SimpleInputFieldModelDefinitionOutline;
    layout?: AvailableFieldLayoutDefinitionOutlines;
}


export type SimpleInputTypes =
    | { kind: FieldComponentConfigFrameKindType, class: SimpleInputFieldComponentConfigFrame }
    | { kind: FieldComponentDefinitionFrameKindType, class: SimpleInputFieldComponentDefinitionFrame }
    | { kind: FieldModelConfigFrameKindType, class: SimpleInputFieldModelConfigFrame }
    | { kind: FieldModelDefinitionFrameKindType, class: SimpleInputFieldModelDefinitionFrame }
    | { kind: FormComponentDefinitionFrameKindType, class: SimpleInputFormComponentDefinitionFrame }
    | { kind: FieldComponentConfigKindType, class: SimpleInputFieldComponentConfigOutline }
    | { kind: FieldComponentDefinitionKindType, class: SimpleInputFieldComponentDefinitionOutline }
    | { kind: FieldModelConfigKindType, class: SimpleInputFieldModelConfigOutline }
    | { kind: FieldModelDefinitionKindType, class: SimpleInputFieldModelDefinitionOutline }
    | { kind: FormComponentDefinitionKindType, class: SimpleInputFormComponentDefinitionOutline }
    ;
