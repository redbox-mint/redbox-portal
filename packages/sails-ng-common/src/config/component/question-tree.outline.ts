import {
    AvailableFieldLayoutDefinitionFrames,
    AvailableFieldLayoutDefinitionOutlines,
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
    FieldComponentDefinitionKindType,
    FieldModelConfigFrameKindType,
    FieldModelConfigKindType, FieldModelDefinitionFrameKindType,
    FieldModelDefinitionKindType, FormComponentDefinitionFrameKindType, FormComponentDefinitionKindType
} from "../shared.outline";

/* QuestionTree Component */

export const QuestionTreeComponentName = `QuestionTreeComponent` as const;
export type QuestionTreeComponentNameType = typeof QuestionTreeComponentName;

export interface QuestionTreeFieldComponentConfigFrame extends FieldComponentConfigFrame {

}

export interface QuestionTreeFieldComponentConfigOutline extends QuestionTreeFieldComponentConfigFrame, FieldComponentConfigOutline {

}

export interface QuestionTreeFieldComponentDefinitionFrame extends FieldComponentDefinitionFrame {
    class: QuestionTreeComponentNameType;
    config?: QuestionTreeFieldComponentConfigFrame;
}

export interface QuestionTreeFieldComponentDefinitionOutline extends QuestionTreeFieldComponentDefinitionFrame, FieldComponentDefinitionOutline {
    class: QuestionTreeComponentNameType;
    config?: QuestionTreeFieldComponentConfigOutline;
}


/* QuestionTree Model */

export const QuestionTreeModelName = `QuestionTreeModel` as const;
export type QuestionTreeModelNameType = typeof QuestionTreeModelName;
export type QuestionTreeModelValueType = unknown[];

export interface QuestionTreeFieldModelConfigFrame extends FieldModelConfigFrame<QuestionTreeModelValueType> {

}

export interface QuestionTreeFieldModelConfigOutline extends QuestionTreeFieldModelConfigFrame, FieldModelConfigOutline<QuestionTreeModelValueType> {

}


export interface QuestionTreeFieldModelDefinitionFrame extends FieldModelDefinitionFrame<QuestionTreeModelValueType> {
    class: QuestionTreeModelNameType;
    config?: QuestionTreeFieldModelConfigFrame;
}

export interface QuestionTreeFieldModelDefinitionOutline extends QuestionTreeFieldModelDefinitionFrame, FieldModelDefinitionOutline<QuestionTreeModelValueType> {
    class: QuestionTreeModelNameType;
    config?: QuestionTreeFieldModelConfigOutline;
}

/* QuestionTree Form Component */

export interface QuestionTreeFormComponentDefinitionFrame extends FormComponentDefinitionFrame {
    component: QuestionTreeFieldComponentDefinitionFrame;
    model?: QuestionTreeFieldModelDefinitionFrame;
    layout?: AvailableFieldLayoutDefinitionFrames;
}

export interface QuestionTreeFormComponentDefinitionOutline extends QuestionTreeFormComponentDefinitionFrame, FormComponentDefinitionOutline {
    component: QuestionTreeFieldComponentDefinitionOutline;
    model?: QuestionTreeFieldModelDefinitionOutline;
    layout?: AvailableFieldLayoutDefinitionOutlines;
}


export type QuestionTreeTypes =
    { kind: FieldComponentConfigFrameKindType, class: QuestionTreeFieldComponentConfigFrame }
    | { kind: FieldComponentDefinitionFrameKindType, class: QuestionTreeFieldComponentDefinitionFrame }
    | { kind: FieldModelConfigFrameKindType, class: QuestionTreeFieldModelConfigFrame }
    | { kind: FieldModelDefinitionFrameKindType, class: QuestionTreeFieldModelDefinitionFrame }
    | { kind: FormComponentDefinitionFrameKindType, class: QuestionTreeFormComponentDefinitionFrame }
    | { kind: FieldComponentConfigKindType, class: QuestionTreeFieldComponentConfigOutline }
    | { kind: FieldComponentDefinitionKindType, class: QuestionTreeFieldComponentDefinitionOutline }
    | { kind: FieldModelConfigKindType, class: QuestionTreeFieldModelConfigOutline }
    | { kind: FieldModelDefinitionKindType, class: QuestionTreeFieldModelDefinitionOutline }
    | { kind: FormComponentDefinitionKindType, class: QuestionTreeFormComponentDefinitionOutline }
    ;
