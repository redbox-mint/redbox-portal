import {
    FormComponentDefinition,
    FormComponentDefinitionFrame, FormComponentDefinitionFrameKind, FormComponentDefinitionKind,
    FormFieldComponentConfig,
    FormFieldComponentConfigFrame,
    FormFieldComponentConfigKind,
    FormFieldComponentDefinition,
    FormFieldComponentDefinitionFrame,
    FormFieldComponentDefinitionKind, GroupFormComponentDefinition,
} from "..";
import {FormConfigItemVisitor} from "../visitor";


/* Save Button Component */
export interface SaveButtonFormFieldComponentConfigFrame extends FormFieldComponentConfigFrame {
}

export class SaveButtonFormFieldComponentConfig extends FormFieldComponentConfig implements SaveButtonFormFieldComponentConfigFrame {
    targetStep?: string;
    forceSave?: boolean;
    skipValidation?: boolean;

    constructor(data?: SaveButtonFormFieldComponentConfigFrame) {
        super(data);
    }
}

export interface SaveButtonFormFieldComponentDefinitionFrame extends FormFieldComponentDefinitionFrame {
}

export const SaveButtonComponentName = "SaveButtonComponent" as const;

export class SaveButtonFormFieldComponentDefinition extends FormFieldComponentDefinition implements SaveButtonFormFieldComponentDefinitionFrame {
    class = SaveButtonComponentName;
    config?: SaveButtonFormFieldComponentConfig;

    constructor(data: SaveButtonFormFieldComponentDefinitionFrame) {
        super(data);
        this.config = new SaveButtonFormFieldComponentConfig(data.config);
    }

    accept(visitor: FormConfigItemVisitor): void {
        visitor.visitSaveButtonFormFieldComponentDefinition(this);
    }
}

/* Save Button Form Component */
export interface SaveButtonFormComponentDefinitionFrame extends FormComponentDefinitionFrame {
    component: SaveButtonFormFieldComponentDefinitionFrame;
}

export class SaveButtonFormComponentDefinition extends FormComponentDefinition {
    public component: SaveButtonFormFieldComponentDefinition;

    constructor(data: SaveButtonFormComponentDefinitionFrame) {
        super(data);
        this.name = data.name;
        this.component = new SaveButtonFormFieldComponentDefinition(data.component);
    }

    accept(visitor: FormConfigItemVisitor) {
        visitor.visitSaveButtonFormComponentDefinition(this);
    }
}

export const SaveButtonMap = [
    {kind: FormFieldComponentConfigKind, def: SaveButtonFormFieldComponentConfig},
    {
        kind: FormFieldComponentDefinitionKind,
        def: SaveButtonFormFieldComponentDefinition,
        class: SaveButtonComponentName
    },
    {kind: FormComponentDefinitionKind, def: SaveButtonFormComponentDefinition},
];
export type SaveButtonFrames =
    SaveButtonFormFieldComponentConfigFrame |
    SaveButtonFormFieldComponentDefinitionFrame |
    SaveButtonFormComponentDefinitionFrame;

