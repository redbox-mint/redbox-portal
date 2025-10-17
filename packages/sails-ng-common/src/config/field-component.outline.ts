import {
    BaseFieldComponentConfigFrame,
    BaseFieldComponentDefinitionFrame,
    BaseFieldComponentDefinitionOutline
} from "./base-field-component.outline";


export interface FieldComponentConfigFrame extends BaseFieldComponentConfigFrame {
}

export interface FieldComponentConfigOutline extends FieldComponentConfigFrame {

}

export interface FieldComponentDefinitionFrame extends BaseFieldComponentDefinitionFrame {
    config?: FieldComponentConfigFrame;
}

export interface FieldComponentDefinitionOutline extends BaseFieldComponentDefinitionOutline, FieldComponentDefinitionFrame {
    config?: FieldComponentConfigOutline;
}