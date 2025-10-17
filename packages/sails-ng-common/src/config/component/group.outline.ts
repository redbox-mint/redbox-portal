import {
    AvailableFieldLayoutDefinitionOutlines,
    AvailableFormComponentDefinitionFrames,
    AvailableFormComponentDefinitionOutlines,
    AvailableFieldLayoutDefinitionFrames
} from "../dictionary.outline";
import {
    FieldModelConfigFrame,
    FieldModelConfigOutline,
    FieldModelDefinitionFrame,
    FieldModelDefinitionOutline
} from "../field-model.outline";
import {
    FieldComponentConfigFrame,
    FieldComponentConfigOutline,
    FieldComponentDefinitionFrame, FieldComponentDefinitionOutline
} from "../field-component.outline";
import {FormComponentDefinitionFrame, FormComponentDefinitionOutline} from "../form-component.outline";
import {
    FieldComponentConfigFrameKindType, FieldComponentConfigKindType,
    FieldComponentDefinitionFrameKindType, FieldComponentDefinitionKindType,
    FieldModelConfigFrameKindType,
    FieldModelConfigKindType, FieldModelDefinitionFrameKindType,
    FieldModelDefinitionKindType, FormComponentDefinitionFrameKindType, FormComponentDefinitionKindType
} from "../shared.outline";

/* Group Component */

export const GroupFieldComponentName = "GroupComponent" as const;
export type GroupFieldComponentNameType = typeof GroupFieldComponentName;

export interface GroupFieldComponentConfigFrame extends FieldComponentConfigFrame {
    componentDefinitions: AvailableFormComponentDefinitionFrames[];
}

export interface GroupFieldComponentConfigOutline extends GroupFieldComponentConfigFrame, FieldComponentConfigOutline {
    componentDefinitions: AvailableFormComponentDefinitionOutlines[];
}

export interface GroupFieldModelConfigFrame extends FieldModelConfigFrame<GroupFieldModelValueType> {
}

export interface GroupFieldModelConfigOutline extends GroupFieldModelConfigFrame, FieldModelConfigOutline<GroupFieldModelValueType> {

}

/* Group Model */

export const GroupFieldModelName = "GroupModel" as const;
export type GroupFieldModelNameType = typeof GroupFieldModelName;
export type GroupFieldModelValueType = Record<string, unknown>;

export interface GroupFieldComponentDefinitionFrame extends FieldComponentDefinitionFrame {
    class: GroupFieldComponentNameType;
    config?: GroupFieldComponentConfigFrame;
}

export interface GroupFieldComponentDefinitionOutline extends GroupFieldComponentDefinitionFrame, FieldComponentDefinitionOutline {
    class: GroupFieldComponentNameType;
    config?: GroupFieldComponentConfigOutline;
}

export interface GroupFieldModelDefinitionFrame extends FieldModelDefinitionFrame<GroupFieldModelValueType> {
    class: GroupFieldModelNameType;
    config?: GroupFieldModelConfigFrame;
}

export interface GroupFieldModelDefinitionOutline extends GroupFieldModelDefinitionFrame, FieldModelDefinitionOutline<GroupFieldModelValueType> {
    class: GroupFieldModelNameType;
    config?: GroupFieldModelConfigOutline;
}

/* Group Form Component */

export interface GroupFormComponentDefinitionFrame extends FormComponentDefinitionFrame {
    component: GroupFieldComponentDefinitionFrame;
    model?: GroupFieldModelDefinitionFrame;
    layout?: AvailableFieldLayoutDefinitionFrames;
}

export interface GroupFormComponentDefinitionOutline extends GroupFormComponentDefinitionFrame, FormComponentDefinitionOutline {
    component: GroupFieldComponentDefinitionOutline;
    model?: GroupFieldModelDefinitionOutline;
    layout?: AvailableFieldLayoutDefinitionOutlines;
}

export type GroupTypes = { kind: FieldComponentConfigFrameKindType, class: GroupFieldComponentConfigFrame }
    | { kind: FieldComponentDefinitionFrameKindType, class: GroupFieldComponentDefinitionFrame }
    | { kind: FieldModelConfigFrameKindType, class: GroupFieldModelConfigFrame }
    | { kind: FieldModelDefinitionFrameKindType, class: GroupFieldModelDefinitionFrame }
    | { kind: FormComponentDefinitionFrameKindType, class: GroupFormComponentDefinitionFrame }
    | { kind: FieldComponentConfigKindType, class: GroupFieldComponentConfigOutline }
    | { kind: FieldComponentDefinitionKindType, class: GroupFieldComponentDefinitionOutline }
    | { kind: FieldModelConfigKindType, class: GroupFieldModelConfigOutline }
    | { kind: FieldModelDefinitionKindType, class: GroupFieldModelDefinitionOutline }
    | { kind: FormComponentDefinitionKindType, class: GroupFormComponentDefinitionOutline }
    ;