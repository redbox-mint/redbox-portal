import {
    FieldComponentConfigFrame, FieldComponentConfigOutline, FieldComponentDefinitionFrame,
    FieldComponentDefinitionOutline,
} from "../field-component.outline";
import {FormComponentDefinitionFrame, FormComponentDefinitionOutline} from "../form-component.outline";
import {AvailableFormComponentDefinitionFrames, AvailableFormComponentDefinitionOutlines} from "../dictionary.outline";
import {
    FieldComponentConfigFrameKindType, FieldComponentConfigKindType,
    FieldComponentDefinitionFrameKindType, FieldComponentDefinitionKindType,
    FormComponentDefinitionFrameKindType, FormComponentDefinitionKindType,
} from "../shared.outline";

/* Reusable Component */

export const ReusableComponentName = "ReusableComponent" as const;
export type ReusableComponentNameType = typeof ReusableComponentName;

export interface ReusableFieldComponentConfigFrame extends FieldComponentConfigFrame {
    componentDefinitions: AvailableFormComponentDefinitionFrames[];
}

export interface ReusableFieldComponentConfigOutline extends ReusableFieldComponentConfigFrame, FieldComponentConfigOutline {
    componentDefinitions: AvailableFormComponentDefinitionOutlines[];
}

export interface ReusableFieldComponentDefinitionFrame extends FieldComponentDefinitionFrame {
    class: ReusableComponentNameType;
    config?: ReusableFieldComponentConfigFrame;
}

export interface ReusableFieldComponentDefinitionOutline extends ReusableFieldComponentDefinitionFrame, FieldComponentDefinitionOutline {
    class: ReusableComponentNameType;
    config?: ReusableFieldComponentConfigOutline;
}

/* Reusable Form Component */

export interface ReusableFormComponentDefinitionFrame extends FormComponentDefinitionFrame {
    component: ReusableFieldComponentDefinitionFrame;
    model?: never;
    layout?: never;
}

/**
 * References a reusable form definition that the construction visitor expands.
 *
 * @extensionPoint Use `ReusableComponent` to compose named reusable definitions; it is a construction-time contract rather than an Angular component.
 * @see https://github.com/redbox-mint/redbox-portal/wiki/Configuring-Record-Forms
 */
export interface ReusableFormComponentDefinitionOutline extends ReusableFormComponentDefinitionFrame, FormComponentDefinitionOutline {
    component: ReusableFieldComponentDefinitionOutline;
    model?: never;
    layout?: never;
}

export type ReusableTypes =
    { kind: FieldComponentConfigFrameKindType, class: ReusableFieldComponentConfigFrame }
    | { kind: FieldComponentDefinitionFrameKindType, class: ReusableFieldComponentDefinitionFrame }
    | { kind: FormComponentDefinitionFrameKindType, class: ReusableFormComponentDefinitionFrame }
    | { kind: FieldComponentConfigKindType, class: ReusableFieldComponentConfigOutline }
    | { kind: FieldComponentDefinitionKindType, class: ReusableFieldComponentDefinitionOutline }
    | { kind: FormComponentDefinitionKindType, class: ReusableFormComponentDefinitionOutline }
    ;
