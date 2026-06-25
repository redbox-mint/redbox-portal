import {
    FieldComponentConfigFrame,
    FieldComponentConfigOutline,
    FieldComponentDefinitionFrame,
    FieldComponentDefinitionOutline
} from "../field-component.outline";
import {FormComponentDefinitionFrame, FormComponentDefinitionOutline} from "../form-component.outline";
import {AvailableFieldLayoutDefinitionFrames, AvailableFieldLayoutDefinitionOutlines} from "../dictionary.outline";
import {
    FieldComponentConfigFrameKindType, FieldComponentConfigKindType,
    FieldComponentDefinitionFrameKindType, FieldComponentDefinitionKindType,
    FormComponentDefinitionFrameKindType, FormComponentDefinitionKindType
} from "../shared.outline";

export const IntegrationStatusComponentName = "IntegrationStatusComponent" as const;
export type IntegrationStatusComponentNameType = typeof IntegrationStatusComponentName;

export interface IntegrationStatusFieldComponentConfigFrame extends FieldComponentConfigFrame {
    integrationNames?: string[];
    pollIntervalMs?: number;
    maxPollAttempts?: number;
    heading?: string;
    technicalDetailRoles?: string[];
    // When true, the panel only renders while there is integration activity worth showing
    // (in-progress or an error/failure), or one observed in-progress this session. This
    // suppresses the idle/empty "no integration yet" panel for all roles, including the
    // privileged roles that would otherwise always see it.
    hideWhenInactive?: boolean;
}

export interface IntegrationStatusFieldComponentConfigOutline extends IntegrationStatusFieldComponentConfigFrame, FieldComponentConfigOutline {
}

export interface IntegrationStatusFieldComponentDefinitionFrame extends FieldComponentDefinitionFrame {
    class: IntegrationStatusComponentNameType;
    config?: IntegrationStatusFieldComponentConfigFrame;
}

export interface IntegrationStatusFieldComponentDefinitionOutline extends IntegrationStatusFieldComponentDefinitionFrame, FieldComponentDefinitionOutline {
    class: IntegrationStatusComponentNameType;
    config?: IntegrationStatusFieldComponentConfigOutline;
}

export interface IntegrationStatusFormComponentDefinitionFrame extends FormComponentDefinitionFrame {
    component: IntegrationStatusFieldComponentDefinitionFrame;
    model?: never;
    layout?: AvailableFieldLayoutDefinitionFrames;
}

export interface IntegrationStatusFormComponentDefinitionOutline extends IntegrationStatusFormComponentDefinitionFrame, FormComponentDefinitionOutline {
    component: IntegrationStatusFieldComponentDefinitionOutline;
    model?: never;
    layout?: AvailableFieldLayoutDefinitionOutlines;
}

export type IntegrationStatusTypes =
    { kind: FieldComponentConfigFrameKindType, class: IntegrationStatusFieldComponentConfigFrame }
    | { kind: FieldComponentDefinitionFrameKindType, class: IntegrationStatusFieldComponentDefinitionFrame }
    | { kind: FormComponentDefinitionFrameKindType, class: IntegrationStatusFormComponentDefinitionFrame }
    | { kind: FieldComponentConfigKindType, class: IntegrationStatusFieldComponentConfigOutline }
    | { kind: FieldComponentDefinitionKindType, class: IntegrationStatusFieldComponentDefinitionOutline }
    | { kind: FormComponentDefinitionKindType, class: IntegrationStatusFormComponentDefinitionOutline }
    ;
