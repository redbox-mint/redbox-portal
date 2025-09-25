import {FieldLayoutConfigFrame, FieldLayoutDefinitionFrame} from "../field-layout.outline";
import {
    AvailableFieldLayoutDefinitionFrames,
    AvailableFieldLayoutDefinitionOutlines,
    AvailableFormComponentDefinitionFrames,
    AvailableFormComponentDefinitionOutlines
} from "../dictionary.outline";
import {FormComponentDefinitionFrame, HasChildren} from "../form-component.outline";
import {FieldModelConfigFrame, FieldModelDefinitionFrame} from "../field-model.outline";
import {FieldComponentConfigFrame, FieldComponentDefinitionFrame} from "../field-component.outline";

/* Repeatable Component */

export const RepeatableComponentName = `RepeatableComponent` as const;
export type RepeatableComponentNameType = typeof RepeatableComponentName;

export interface RepeatableFieldComponentConfigFrame extends FieldComponentConfigFrame {
    elementTemplate: AvailableFormComponentDefinitionFrames;
}

export interface RepeatableFieldComponentConfigOutline extends RepeatableFieldComponentConfigFrame {
    elementTemplate: AvailableFormComponentDefinitionOutlines;
}

export interface RepeatableFieldComponentDefinitionFrame extends FieldComponentDefinitionFrame {
    class: RepeatableComponentNameType;
    config?: RepeatableFieldComponentConfigFrame;
}

export interface RepeatableFieldComponentDefinitionOutline extends RepeatableFieldComponentDefinitionFrame, HasChildren {
    class: RepeatableComponentNameType;
    config?: RepeatableFieldComponentConfigOutline;
}


/* Repeatable Model */

export const RepeatableModelName = `RepeatableModel` as const;
export type RepeatableModelNameType = typeof RepeatableModelName;
export type RepeatableModelValueType = unknown[];

export interface RepeatableFieldModelConfigFrame extends FieldModelConfigFrame<RepeatableModelValueType> {
    // TODO: Migrate JSON configurable properties from `RepeatableContainer`
}

export interface RepeatableFieldModelConfigOutline extends RepeatableFieldModelConfigFrame {

}


export interface RepeatableFieldModelDefinitionFrame extends FieldModelDefinitionFrame<RepeatableModelValueType> {
    class: RepeatableModelNameType;
    config?: RepeatableFieldModelConfigFrame;
    // TODO: Migrate properties from `RepeatableContainer`
}

export interface RepeatableFieldModelDefinitionOutline extends RepeatableFieldModelDefinitionFrame {
    class: RepeatableModelNameType;
    config?: RepeatableFieldModelConfigOutline;
}

/* Repeatable Element Layout */
export const RepeatableElementLayoutName = `RepeatableElementLayout` as const;
export type RepeatableElementLayoutNameType = typeof RepeatableElementLayoutName;

export interface RepeatableElementFieldLayoutConfigFrame extends FieldLayoutConfigFrame {
}

export interface RepeatableElementFieldLayoutConfigOutline extends RepeatableElementFieldLayoutConfigFrame {

}


export interface RepeatableElementFieldLayoutDefinitionFrame extends FieldLayoutDefinitionFrame {
    class: RepeatableElementLayoutNameType;
    config?: RepeatableElementFieldLayoutConfigFrame;
}

export interface RepeatableElementFieldLayoutDefinitionOutline extends RepeatableElementFieldLayoutDefinitionFrame {
    class: RepeatableElementLayoutNameType;
    config?: RepeatableElementFieldLayoutConfigOutline;
}


/* Repeatable Form Component */

export interface RepeatableFormComponentDefinitionFrame extends FormComponentDefinitionFrame {
    component: RepeatableFieldComponentDefinitionFrame;
    model?: RepeatableFieldModelDefinitionFrame;
    layout?: AvailableFieldLayoutDefinitionFrames;
}

export interface RepeatableFormComponentDefinitionOutline extends RepeatableFormComponentDefinitionFrame {
    component: RepeatableFieldComponentDefinitionOutline;
    model?: RepeatableFieldModelDefinitionOutline;
    layout?: AvailableFieldLayoutDefinitionOutlines;
}

export type RepeatableFrames =
    RepeatableFieldComponentConfigFrame |
    RepeatableFieldComponentDefinitionFrame |
    RepeatableFieldModelConfigFrame |
    RepeatableFieldModelDefinitionFrame |
    RepeatableElementFieldLayoutConfigFrame |
    RepeatableElementFieldLayoutDefinitionFrame |
    RepeatableFormComponentDefinitionFrame;

export type RepeatableOutlines =
    RepeatableFieldComponentConfigOutline |
    RepeatableFieldComponentDefinitionOutline |
    RepeatableFieldModelConfigOutline |
    RepeatableFieldModelDefinitionOutline |
    RepeatableElementFieldLayoutConfigOutline |
    RepeatableElementFieldLayoutDefinitionOutline |
    RepeatableFormComponentDefinitionOutline;
