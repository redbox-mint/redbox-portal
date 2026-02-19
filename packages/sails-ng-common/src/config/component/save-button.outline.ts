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
    /**
     * Try to transition to this workflow step as part of the save process on the server.
     */
    targetStep?: string;
    /**
     * Save the form, even if it would otherwise not be able to save.
     * For example, save even if nothing has changed or there are validation failures.
     */
    forceSave?: boolean;
    /**
     * The label to set to the button while saving.
     */
    labelSaving?: string;
    /**
     * CSS classes to apply to the underlying button element.
     * Example: 'btn-success' or 'btn btn-success'.
     */
    buttonCssClasses?: string;
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
