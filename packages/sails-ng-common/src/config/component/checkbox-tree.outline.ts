import {
    FieldComponentConfigFrameKindType, FieldComponentConfigKindType,
    FieldComponentDefinitionFrameKindType, FieldComponentDefinitionKindType,
    FieldModelConfigFrameKindType,
    FieldModelConfigKindType, FieldModelDefinitionFrameKindType,
    FieldModelDefinitionKindType, FormComponentDefinitionFrameKindType, FormComponentDefinitionKindType
} from "../shared.outline";
import {
    FieldComponentConfigFrame,
    FieldComponentConfigOutline,
    FieldComponentDefinitionFrame, FieldComponentDefinitionOutline
} from "../field-component.outline";

import {
    FieldModelConfigFrame,
    FieldModelConfigOutline,
    FieldModelDefinitionFrame,
    FieldModelDefinitionOutline
} from "../field-model.outline";
import {FormComponentDefinitionFrame, FormComponentDefinitionOutline} from "../form-component.outline";
import {AvailableFieldLayoutDefinitionFrames, AvailableFieldLayoutDefinitionOutlines} from "../dictionary.outline";

/* Checkbox Tree Component */
export const CheckboxTreeComponentName = "CheckboxTreeComponent" as const;
export type CheckboxTreeComponentNameType = typeof CheckboxTreeComponentName;

export interface CheckboxTreeNode {
    id: string;
    label: string;
    value: string;
    notation?: string;
    parent?: string | null;
    children?: CheckboxTreeNode[];
    hasChildren?: boolean;
}

export interface CheckboxTreeSelectedItem {
    notation: string;
    label: string;
    name: string;
    genealogy?: string[];
}

export interface CheckboxTreeFieldComponentConfigFrame extends FieldComponentConfigFrame {
    vocabRef?: string;
    inlineVocab?: boolean;
    treeData?: CheckboxTreeNode[];
    leafOnly?: boolean;
    maxDepth?: number;
    labelTemplate?: string;
}

export interface CheckboxTreeFieldComponentConfigOutline extends CheckboxTreeFieldComponentConfigFrame, FieldComponentConfigOutline {
}

export interface CheckboxTreeFieldComponentDefinitionFrame extends FieldComponentDefinitionFrame {
    class: CheckboxTreeComponentNameType;
    config?: CheckboxTreeFieldComponentConfigFrame;
}

export interface CheckboxTreeFieldComponentDefinitionOutline extends CheckboxTreeFieldComponentDefinitionFrame, FieldComponentDefinitionOutline {
    class: CheckboxTreeComponentNameType;
    config?: CheckboxTreeFieldComponentConfigOutline;
}

/* Checkbox Tree Model */
export const CheckboxTreeModelName = "CheckboxTreeModel" as const;
export type CheckboxTreeModelNameType = typeof CheckboxTreeModelName;
export type CheckboxTreeModelValueType = CheckboxTreeSelectedItem[];

export interface CheckboxTreeFieldModelConfigFrame extends FieldModelConfigFrame<CheckboxTreeModelValueType> {
}

export interface CheckboxTreeFieldModelConfigOutline extends CheckboxTreeFieldModelConfigFrame, FieldModelConfigOutline<CheckboxTreeModelValueType> {
}

export interface CheckboxTreeFieldModelDefinitionFrame extends FieldModelDefinitionFrame<CheckboxTreeModelValueType> {
    class: CheckboxTreeModelNameType;
    config?: CheckboxTreeFieldModelConfigFrame;
}

export interface CheckboxTreeFieldModelDefinitionOutline extends CheckboxTreeFieldModelDefinitionFrame, FieldModelDefinitionOutline<CheckboxTreeModelValueType> {
    class: CheckboxTreeModelNameType;
    config?: CheckboxTreeFieldModelConfigOutline;
}

/* Checkbox Tree Form Component */
export interface CheckboxTreeFormComponentDefinitionFrame extends FormComponentDefinitionFrame {
    component: CheckboxTreeFieldComponentDefinitionFrame;
    model?: CheckboxTreeFieldModelDefinitionFrame;
    layout?: AvailableFieldLayoutDefinitionFrames;
}

export interface CheckboxTreeFormComponentDefinitionOutline extends CheckboxTreeFormComponentDefinitionFrame, FormComponentDefinitionOutline {
    component: CheckboxTreeFieldComponentDefinitionOutline;
    model?: CheckboxTreeFieldModelDefinitionOutline;
    layout?: AvailableFieldLayoutDefinitionOutlines;
}

export type CheckboxTreeTypes =
    | { kind: FieldComponentConfigFrameKindType, class: CheckboxTreeFieldComponentConfigFrame }
    | { kind: FieldComponentDefinitionFrameKindType, class: CheckboxTreeFieldComponentDefinitionFrame }
    | { kind: FieldModelConfigFrameKindType, class: CheckboxTreeFieldModelConfigFrame }
    | { kind: FieldModelDefinitionFrameKindType, class: CheckboxTreeFieldModelDefinitionFrame }
    | { kind: FormComponentDefinitionFrameKindType, class: CheckboxTreeFormComponentDefinitionFrame }
    | { kind: FieldComponentConfigKindType, class: CheckboxTreeFieldComponentConfigOutline }
    | { kind: FieldComponentDefinitionKindType, class: CheckboxTreeFieldComponentDefinitionOutline }
    | { kind: FieldModelConfigKindType, class: CheckboxTreeFieldModelConfigOutline }
    | { kind: FieldModelDefinitionKindType, class: CheckboxTreeFieldModelDefinitionOutline }
    | { kind: FormComponentDefinitionKindType, class: CheckboxTreeFormComponentDefinitionOutline }
    ;
