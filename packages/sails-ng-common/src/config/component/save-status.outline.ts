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
    /**
     * Translation code for a persisted warning after creating a record.
     * Falls back to the global save warning when not provided.
     */
    warningMessageCreate?: string;
    /**
     * Translation code for a persisted warning after updating a record.
     * Falls back to the global save warning when not provided.
     */
    warningMessageUpdate?: string;
    /**
     * Translation code when the result of creating a record cannot be confirmed.
     * Falls back to the global unknown-save message when not provided.
     */
    unknownMessageCreate?: string;
    /**
     * Translation code when the result of updating a record cannot be confirmed.
     * Falls back to the global unknown-save message when not provided.
     */
    unknownMessageUpdate?: string;
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

/**
 * Displays current form save progress and result state.
 *
 * @extensionPoint Use `SaveStatusComponent` alongside save controls without adding a submitted model value.
 * @see https://github.com/redbox-mint/redbox-portal/wiki/Configuring-Record-Forms
 */
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
