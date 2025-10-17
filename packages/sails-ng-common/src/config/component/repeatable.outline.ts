import {
    FieldLayoutConfigFrame,
    FieldLayoutConfigOutline,
    FieldLayoutDefinitionFrame,
    FieldLayoutDefinitionOutline
} from "../field-layout.outline";
import {
    AvailableFieldLayoutDefinitionFrames,
    AvailableFieldLayoutDefinitionOutlines,
    AvailableFormComponentDefinitionFrames,
    AvailableFormComponentDefinitionOutlines
} from "../dictionary.outline";
import {FormComponentDefinitionFrame, FormComponentDefinitionOutline} from "../form-component.outline";
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
import {
    FieldComponentConfigFrameKindType, FieldComponentConfigKindType,
    FieldComponentDefinitionFrameKindType,
    FieldComponentDefinitionKindType, FieldLayoutConfigFrameKindType,
    FieldLayoutConfigKindType, FieldLayoutDefinitionFrameKindType,
    FieldLayoutDefinitionKindType,
    FieldModelConfigFrameKindType,
    FieldModelConfigKindType, FieldModelDefinitionFrameKindType,
    FieldModelDefinitionKindType, FormComponentDefinitionFrameKindType, FormComponentDefinitionKindType
} from "../shared.outline";

/* Repeatable Component */

export const RepeatableComponentName = `RepeatableComponent` as const;
export type RepeatableComponentNameType = typeof RepeatableComponentName;

export interface RepeatableFieldComponentConfigFrame extends FieldComponentConfigFrame {
    elementTemplate: AvailableFormComponentDefinitionFrames;
}

export interface RepeatableFieldComponentConfigOutline extends RepeatableFieldComponentConfigFrame, FieldComponentConfigOutline {
    elementTemplate: AvailableFormComponentDefinitionOutlines;
}

export interface RepeatableFieldComponentDefinitionFrame extends FieldComponentDefinitionFrame {
    class: RepeatableComponentNameType;
    config?: RepeatableFieldComponentConfigFrame;
}

export interface RepeatableFieldComponentDefinitionOutline extends RepeatableFieldComponentDefinitionFrame, FieldComponentDefinitionOutline {
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

export interface RepeatableFieldModelConfigOutline extends RepeatableFieldModelConfigFrame, FieldModelConfigOutline<RepeatableModelValueType> {

}


export interface RepeatableFieldModelDefinitionFrame extends FieldModelDefinitionFrame<RepeatableModelValueType> {
    class: RepeatableModelNameType;
    config?: RepeatableFieldModelConfigFrame;
    // TODO: Migrate properties from `RepeatableContainer`
}

export interface RepeatableFieldModelDefinitionOutline extends RepeatableFieldModelDefinitionFrame, FieldModelDefinitionOutline<RepeatableModelValueType> {
    class: RepeatableModelNameType;
    config?: RepeatableFieldModelConfigOutline;
}

/* Repeatable Element Layout */
export const RepeatableElementLayoutName = `RepeatableElementLayout` as const;
export type RepeatableElementLayoutNameType = typeof RepeatableElementLayoutName;

export interface RepeatableElementFieldLayoutConfigFrame extends FieldLayoutConfigFrame {
}

export interface RepeatableElementFieldLayoutConfigOutline extends RepeatableElementFieldLayoutConfigFrame, FieldLayoutConfigOutline {

}


export interface RepeatableElementFieldLayoutDefinitionFrame extends FieldLayoutDefinitionFrame {
    class: RepeatableElementLayoutNameType;
    config?: RepeatableElementFieldLayoutConfigFrame;
}

export interface RepeatableElementFieldLayoutDefinitionOutline extends RepeatableElementFieldLayoutDefinitionFrame, FieldLayoutDefinitionOutline {
    class: RepeatableElementLayoutNameType;
    config?: RepeatableElementFieldLayoutConfigOutline;
}


/* Repeatable Form Component */

export interface RepeatableFormComponentDefinitionFrame extends FormComponentDefinitionFrame {
    component: RepeatableFieldComponentDefinitionFrame;
    model?: RepeatableFieldModelDefinitionFrame;
    layout?: AvailableFieldLayoutDefinitionFrames;
}

export interface RepeatableFormComponentDefinitionOutline extends RepeatableFormComponentDefinitionFrame, FormComponentDefinitionOutline {
    component: RepeatableFieldComponentDefinitionOutline;
    model?: RepeatableFieldModelDefinitionOutline;
    layout?: AvailableFieldLayoutDefinitionOutlines;
}


export type RepeatableTypes = { kind: FieldComponentConfigFrameKindType, class: RepeatableFieldComponentConfigFrame }
    | { kind: FieldComponentDefinitionFrameKindType, class: RepeatableFieldComponentDefinitionFrame }
    | { kind: FieldModelConfigFrameKindType, class: RepeatableFieldModelConfigFrame }
    | { kind: FieldModelDefinitionFrameKindType, class: RepeatableFieldModelDefinitionFrame }
    | { kind: FieldLayoutConfigFrameKindType, class: RepeatableElementFieldLayoutConfigFrame }
    | { kind: FieldLayoutDefinitionFrameKindType, class: RepeatableElementFieldLayoutDefinitionFrame }
    | { kind: FormComponentDefinitionFrameKindType, class: RepeatableFormComponentDefinitionFrame }
    | { kind: FieldComponentConfigKindType, class: RepeatableFieldComponentConfigOutline }
    | { kind: FieldComponentDefinitionKindType, class: RepeatableFieldComponentDefinitionOutline }
    | { kind: FieldModelConfigKindType, class: RepeatableFieldModelConfigOutline }
    | { kind: FieldModelDefinitionKindType, class: RepeatableFieldModelDefinitionOutline }
    | { kind: FieldLayoutConfigKindType, class: RepeatableElementFieldLayoutConfigOutline }
    | { kind: FieldLayoutDefinitionKindType, class: RepeatableElementFieldLayoutDefinitionOutline }
    | { kind: FormComponentDefinitionKindType, class: RepeatableFormComponentDefinitionOutline }
    ;
