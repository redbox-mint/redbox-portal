import {
    FormComponentDefinition,
    FormComponentDefinitionFrame,
    FormComponentDefinitionKind,
    FieldComponentConfig,
    FieldComponentConfigFrame,
    FieldComponentConfigKind,
    FieldComponentDefinition,
    FieldComponentDefinitionFrame,
    FieldComponentDefinitionKind,
    FormConfigItemVisitor
} from "../..";


/* Save Button Component */
export const SaveButtonComponentName = "SaveButtonComponent" as const;
export type SaveButtonComponentNameType = typeof SaveButtonComponentName;
export interface SaveButtonFieldComponentConfigFrame extends FieldComponentConfigFrame {
}

export class SaveButtonFieldComponentConfig extends FieldComponentConfig implements SaveButtonFieldComponentConfigFrame {
    targetStep?: string;
    forceSave?: boolean;
    skipValidation?: boolean;

    constructor(data?: SaveButtonFieldComponentConfigFrame) {
        super(data);
    }
}

export interface SaveButtonFieldComponentDefinitionFrame extends FieldComponentDefinitionFrame {
    class: SaveButtonComponentNameType;
    config?: SaveButtonFieldComponentConfigFrame
}


export class SaveButtonFieldComponentDefinition extends FieldComponentDefinition implements SaveButtonFieldComponentDefinitionFrame {
    class = SaveButtonComponentName;
    config?: SaveButtonFieldComponentConfig;

    constructor(data: SaveButtonFieldComponentDefinitionFrame) {
        super(data);
        this.config = new SaveButtonFieldComponentConfig(data.config);
    }

    accept(visitor: FormConfigItemVisitor): void {
        visitor.visitSaveButtonFieldComponentDefinition(this);
    }
}

/* Save Button Form Component */
export interface SaveButtonFormComponentDefinitionFrame extends FormComponentDefinitionFrame {
    component: SaveButtonFieldComponentDefinitionFrame;
}

export class SaveButtonFormComponentDefinition extends FormComponentDefinition {
    public component: SaveButtonFieldComponentDefinition;

    constructor(data: SaveButtonFormComponentDefinitionFrame) {
        super(data);
        this.component = new SaveButtonFieldComponentDefinition(data.component);
    }

    accept(visitor: FormConfigItemVisitor) {
        visitor.visitSaveButtonFormComponentDefinition(this);
    }
}

export const SaveButtonMap = [
    {kind: FieldComponentConfigKind, def: SaveButtonFieldComponentConfig},
    {
        kind: FieldComponentDefinitionKind,
        def: SaveButtonFieldComponentDefinition,
        class: SaveButtonComponentName
    },
    {kind: FormComponentDefinitionKind, def: SaveButtonFormComponentDefinition},
];
export type SaveButtonFrames =
    SaveButtonFieldComponentConfigFrame |
    SaveButtonFieldComponentDefinitionFrame |
    SaveButtonFormComponentDefinitionFrame;

