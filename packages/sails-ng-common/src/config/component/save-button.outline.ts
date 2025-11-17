import {
    FieldComponentConfigFrame, FieldComponentConfigOutline,
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

/* Save Button Component */

export const SaveButtonComponentName = "SaveButtonComponent" as const;
export type SaveButtonComponentNameType = typeof SaveButtonComponentName;

export interface SaveButtonFieldComponentConfigFrame extends FieldComponentConfigFrame {
    targetStep?: string;
    forceSave?: boolean;
    skipValidation?: boolean;
    labelSaving?: string;
}

export interface SaveButtonFieldComponentConfigOutline extends SaveButtonFieldComponentConfigFrame, FieldComponentConfigOutline {
}

export interface SaveButtonFieldComponentDefinitionFrame extends FieldComponentDefinitionFrame {
    class: SaveButtonComponentNameType;
    config?: SaveButtonFieldComponentConfigFrame;
}

export interface SaveButtonFieldComponentDefinitionOutline extends SaveButtonFieldComponentDefinitionFrame, FieldComponentDefinitionOutline {
    class: SaveButtonComponentNameType;
    config?: SaveButtonFieldComponentConfigOutline;
}


/* Save Button Form Component */

export interface SaveButtonFormComponentDefinitionFrame extends FormComponentDefinitionFrame {
    component: SaveButtonFieldComponentDefinitionFrame;
    model?: never;
    layout?: AvailableFieldLayoutDefinitionFrames;
}

export interface SaveButtonFormComponentDefinitionOutline extends SaveButtonFormComponentDefinitionFrame, FormComponentDefinitionOutline {
    component: SaveButtonFieldComponentDefinitionOutline;
    model?: never;
    layout?: AvailableFieldLayoutDefinitionOutlines;
}

export type SaveButtonTypes =
    | { kind: FieldComponentConfigFrameKindType, class: SaveButtonFieldComponentConfigFrame }
    | { kind: FieldComponentDefinitionFrameKindType, class: SaveButtonFieldComponentDefinitionFrame }
    | { kind: FormComponentDefinitionFrameKindType, class: SaveButtonFormComponentDefinitionFrame }
    | { kind: FieldComponentConfigKindType, class: SaveButtonFieldComponentConfigOutline }
    | { kind: FieldComponentDefinitionKindType, class: SaveButtonFieldComponentDefinitionOutline }
    | { kind: FormComponentDefinitionKindType, class: SaveButtonFormComponentDefinitionOutline }
    ;

