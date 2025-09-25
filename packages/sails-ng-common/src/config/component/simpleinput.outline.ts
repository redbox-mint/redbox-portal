import {    AvailableFieldLayoutDefinitionFrames,} from "../dictionary.outline";
import {FieldModelConfigFrame, FieldModelDefinitionFrame} from "../field-model.outline";
import {FieldComponentConfigFrame, FieldComponentDefinitionFrame} from "../field-component.outline";
import {FormComponentDefinitionFrame} from "../form-component.outline";


/* Simple Input Component */
export const SimpleInputComponentName = "SimpleInputComponent" as const;
export type SimpleInputComponentNameType = typeof SimpleInputComponentName;

export const SimpleInputFieldComponentConfigTypeNames = ["email", "text", "tel", "number", "password", "url"] as const;
export type SimpleInputFieldComponentConfigType = typeof SimpleInputFieldComponentConfigTypeNames[number];

export interface SimpleInputFieldComponentConfigFrame extends FieldComponentConfigFrame {
    type: SimpleInputFieldComponentConfigType;
}

export interface SimpleInputFieldComponentConfigOutline extends SimpleInputFieldComponentConfigFrame {

}

export interface SimpleInputFieldComponentDefinitionFrame extends FieldComponentDefinitionFrame {
    class: SimpleInputComponentNameType;
    config?: SimpleInputFieldComponentConfigFrame;
}
export interface SimpleInputFieldComponentDefinitionOutline extends SimpleInputFieldComponentDefinitionFrame {

}


/* Simple Input Model */
export const SimpleInputModelName = "SimpleInputModel" as const;
export type SimpleInputModelNameType = typeof SimpleInputModelName;
export type SimpleInputModelValueType = string;

export interface SimpleInputFieldModelConfigFrame extends FieldModelConfigFrame<SimpleInputModelValueType> {
}


export interface SimpleInputFieldModelConfigOutline extends SimpleInputFieldModelConfigFrame {

}
export interface SimpleInputFieldModelDefinitionFrame extends FieldModelDefinitionFrame<SimpleInputModelValueType> {
    class: SimpleInputModelNameType;
    config?: SimpleInputFieldModelConfigFrame
}
export interface SimpleInputFieldModelDefinitionOutline extends SimpleInputFieldModelDefinitionFrame {

}

/* Simple Input Form Component */
export interface SimpleInputFormComponentDefinitionFrame extends FormComponentDefinitionFrame {
    component: SimpleInputFieldComponentDefinitionFrame;
    model?: SimpleInputFieldModelDefinitionFrame;
    layout?: AvailableFieldLayoutDefinitionFrames;
}export interface SimpleInputFormComponentDefinitionOutline extends SimpleInputFormComponentDefinitionFrame {

}



export type SimpleInputFrames =
    SimpleInputFieldComponentConfigFrame |
    SimpleInputFieldComponentDefinitionFrame |
    SimpleInputFieldModelConfigFrame |
    SimpleInputFieldModelDefinitionFrame |
    SimpleInputFormComponentDefinitionFrame;

export type SimpleInputOutlines =
    SimpleInputFieldComponentConfigOutline |
    SimpleInputFieldComponentDefinitionOutline |
    SimpleInputFieldModelConfigOutline |
    SimpleInputFieldModelDefinitionOutline |
    SimpleInputFormComponentDefinitionOutline;
