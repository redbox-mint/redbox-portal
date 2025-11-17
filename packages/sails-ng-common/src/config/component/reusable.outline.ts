import {
    FieldComponentConfigFrame, FieldComponentDefinitionFrame,
} from "../field-component.outline";
import {FormComponentDefinitionFrame} from "../form-component.outline";
import {AvailableFormComponentDefinitionFrames} from "../dictionary.outline";
import {
    FieldComponentConfigFrameKindType,
    FieldComponentDefinitionFrameKindType,
    FormComponentDefinitionFrameKindType,
} from "../shared.outline";

/* Reusable Component */

export const ReusableComponentName = "ReusableComponent" as const;
export type ReusableComponentNameType = typeof ReusableComponentName;

export interface ReusableFieldComponentConfigFrame extends FieldComponentConfigFrame {
    componentDefinitions: AvailableFormComponentDefinitionFrames[];
}


export interface ReusableFieldComponentDefinitionFrame extends FieldComponentDefinitionFrame {
    class: ReusableComponentNameType;
    config?: ReusableFieldComponentConfigFrame;
}


/* Reusable Form Component */

export interface ReusableFormComponentDefinitionFrame extends FormComponentDefinitionFrame {
    component: ReusableFieldComponentDefinitionFrame;
    model?: never;
    layout?: never;
}


export type ReusableTypes =
    | { kind: FieldComponentConfigFrameKindType, class: ReusableFieldComponentConfigFrame }
    | { kind: FieldComponentDefinitionFrameKindType, class: ReusableFieldComponentDefinitionFrame }
    | { kind: FormComponentDefinitionFrameKindType, class: ReusableFormComponentDefinitionFrame }
    ;
