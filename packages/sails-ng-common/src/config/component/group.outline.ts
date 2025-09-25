import {
    AvailableFieldLayoutDefinitionOutlines,
    AvailableFormComponentDefinitionFrames, AvailableFormComponentDefinitionOutlines
} from "../dictionary.outline";
import {AvailableFieldLayoutDefinitionFrames} from "../dictionary.outline";
import {FieldModelConfigFrame, FieldModelDefinitionFrame} from "../field-model.outline";
import {FieldComponentConfigFrame, FieldComponentDefinitionFrame} from "../field-component.outline";
import {FormComponentDefinitionFrame, HasChildren} from "../form-component.outline";

/* Group Component */

export const GroupFieldComponentName = "GroupComponent" as const;
export type GroupFieldComponentNameType = typeof GroupFieldComponentName;

export interface GroupFieldComponentConfigFrame extends FieldComponentConfigFrame {
    componentDefinitions: AvailableFormComponentDefinitionFrames[];
}

export interface GroupFieldComponentConfigOutline extends GroupFieldComponentConfigFrame {
    componentDefinitions: AvailableFormComponentDefinitionOutlines[];
}

export interface GroupFieldModelConfigFrame extends FieldModelConfigFrame<GroupFieldModelValueType> {
}

export interface GroupFieldModelConfigOutline extends GroupFieldModelConfigFrame {

}

/* Group Model */

export const GroupFieldModelName = "GroupModel" as const;
export type GroupFieldModelNameType = typeof GroupFieldModelName;
export type GroupFieldModelValueType = Record<string, unknown>;

export interface GroupFieldComponentDefinitionFrame extends FieldComponentDefinitionFrame {
    class: GroupFieldComponentNameType;
    config?: GroupFieldComponentConfigFrame;
}

export interface GroupFieldComponentDefinitionOutline extends GroupFieldComponentDefinitionFrame {
    class: GroupFieldComponentNameType;
    config?: GroupFieldComponentConfigOutline;
}

export interface GroupFieldModelDefinitionFrame extends FieldModelDefinitionFrame<GroupFieldModelValueType> {
    class: GroupFieldModelNameType;
    config?: GroupFieldModelConfigFrame;
}

export interface GroupFieldModelDefinitionOutline extends GroupFieldModelDefinitionFrame, HasChildren {
    class: GroupFieldModelNameType;
    config?: GroupFieldModelConfigOutline;
}

/* Group Form Component */

export interface GroupFormComponentDefinitionFrame extends FormComponentDefinitionFrame {
    component: GroupFieldComponentDefinitionFrame;
    model?: GroupFieldModelDefinitionFrame;
    layout?: AvailableFieldLayoutDefinitionFrames;
}

export interface GroupFormComponentDefinitionOutline extends GroupFormComponentDefinitionFrame {
    component: GroupFieldComponentDefinitionOutline;
    model?: GroupFieldModelDefinitionOutline;
    layout?: AvailableFieldLayoutDefinitionOutlines;
}

export type GroupFrames =
    GroupFieldComponentConfigFrame |
    GroupFieldComponentDefinitionFrame |
    GroupFieldModelConfigFrame |
    GroupFieldModelDefinitionFrame |
    GroupFormComponentDefinitionFrame;
export type GroupOutlines =
    GroupFieldComponentConfigOutline |
    GroupFieldComponentDefinitionOutline |
    GroupFieldModelConfigOutline |
    GroupFieldModelDefinitionOutline |
    GroupFormComponentDefinitionOutline;