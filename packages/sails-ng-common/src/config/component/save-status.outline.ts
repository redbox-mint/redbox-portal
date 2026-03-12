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

/* Save Status Component */

export const SaveStatusComponentName = "SaveStatusComponent" as const;
export type SaveStatusComponentNameType = typeof SaveStatusComponentName;

export interface SaveStatusFieldComponentConfigFrame extends FieldComponentConfigFrame {
    /**
     * How long to keep the success message visible after a save succeeds.
     * Defaults to 3000 milliseconds.
     */
    successDisplayDurationMs?: number;
}

export interface SaveStatusFieldComponentConfigOutline extends SaveStatusFieldComponentConfigFrame, FieldComponentConfigOutline {
}

export interface SaveStatusFieldComponentDefinitionFrame extends FieldComponentDefinitionFrame {
    class: SaveStatusComponentNameType;
    config?: SaveStatusFieldComponentConfigFrame;
}

export interface SaveStatusFieldComponentDefinitionOutline extends SaveStatusFieldComponentDefinitionFrame, FieldComponentDefinitionOutline {
    class: SaveStatusComponentNameType;
    config?: SaveStatusFieldComponentConfigOutline;
}

/* Save Status Form Component */
export interface SaveStatusFormComponentDefinitionFrame extends FormComponentDefinitionFrame {
    component: SaveStatusFieldComponentDefinitionFrame;
    model?: never;
    layout?: AvailableFieldLayoutDefinitionFrames;
}

export interface SaveStatusFormComponentDefinitionOutline extends SaveStatusFormComponentDefinitionFrame, FormComponentDefinitionOutline {
    component: SaveStatusFieldComponentDefinitionOutline;
    model?: never;
    layout?: AvailableFieldLayoutDefinitionOutlines;
}

export type SaveStatusTypes =
    { kind: FieldComponentConfigFrameKindType, class: SaveStatusFieldComponentConfigFrame }
    | { kind: FieldComponentDefinitionFrameKindType, class: SaveStatusFieldComponentDefinitionFrame }
    | { kind: FormComponentDefinitionFrameKindType, class: SaveStatusFormComponentDefinitionFrame }
    | { kind: FieldComponentConfigKindType, class: SaveStatusFieldComponentConfigOutline }
    | { kind: FieldComponentDefinitionKindType, class: SaveStatusFieldComponentDefinitionOutline }
    | { kind: FormComponentDefinitionKindType, class: SaveStatusFormComponentDefinitionOutline }
    ;
