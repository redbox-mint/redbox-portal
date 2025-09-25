import {FieldComponentConfigFrame, FieldComponentDefinitionFrame} from "../field-component.outline";
import {FormComponentDefinitionFrame} from "../form-component.outline";
import {AvailableFieldLayoutDefinitionFrames, AvailableFieldLayoutDefinitionOutlines} from "../dictionary.outline";

/* Save Button Component */

export const SaveButtonComponentName = "SaveButtonComponent" as const;
export type SaveButtonComponentNameType = typeof SaveButtonComponentName;

export interface SaveButtonFieldComponentConfigFrame extends FieldComponentConfigFrame {
}


export interface SaveButtonFieldComponentConfigOutline extends SaveButtonFieldComponentConfigFrame {

}

export interface SaveButtonFieldComponentDefinitionFrame extends FieldComponentDefinitionFrame {
    class: SaveButtonComponentNameType;
    config?: SaveButtonFieldComponentConfigFrame;
}

export interface SaveButtonFieldComponentDefinitionOutline extends SaveButtonFieldComponentDefinitionFrame {
    class: SaveButtonComponentNameType;
    config?: SaveButtonFieldComponentConfigOutline;
}


/* Save Button Form Component */

export interface SaveButtonFormComponentDefinitionFrame extends FormComponentDefinitionFrame {
    component: SaveButtonFieldComponentDefinitionFrame;
    model?: never;
    layout?: AvailableFieldLayoutDefinitionFrames;
}

export interface SaveButtonFormComponentDefinitionOutline extends SaveButtonFormComponentDefinitionFrame {
    component: SaveButtonFieldComponentDefinitionOutline;
    model?: never;
    layout?: AvailableFieldLayoutDefinitionOutlines;
}

export type SaveButtonFrames =
    SaveButtonFieldComponentConfigFrame |
    SaveButtonFieldComponentDefinitionFrame |
    SaveButtonFormComponentDefinitionFrame;


export type SaveButtonOutlines =
    SaveButtonFieldComponentConfigOutline |
    SaveButtonFieldComponentDefinitionOutline |
    SaveButtonFormComponentDefinitionOutline;

