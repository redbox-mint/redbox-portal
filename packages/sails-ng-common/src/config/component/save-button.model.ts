import {
    FieldComponentConfig,
    FieldComponentConfigFrame,
    FieldComponentDefinition,
    FieldComponentDefinitionFrame
} from "../field-component.model";
import {
    AvailableFieldLayoutDefinitionFrames, AvailableFieldLayoutDefinitions,
} from "../static-types-classes.dictionary";
import {FormComponentDefinition, FormComponentDefinitionFrame,} from "../form-component.model";
import {
    FieldComponentConfigKind,
    FieldComponentDefinitionKind, FormComponentDefinitionKind
} from "../shared.model";
import {IFormConfigVisitor} from "../visitor/base.structure";


/* Save Button Component */
export const SaveButtonComponentName = "SaveButtonComponent" as const;
export type SaveButtonComponentNameType = typeof SaveButtonComponentName;

export interface SaveButtonFieldComponentConfigFrame extends FieldComponentConfigFrame {
}

export class SaveButtonFieldComponentConfig extends FieldComponentConfig implements SaveButtonFieldComponentConfigFrame {
    targetStep?: string;
    forceSave?: boolean;
    skipValidation?: boolean;

    constructor() {
        super();
    }
}

export interface SaveButtonFieldComponentDefinitionFrame extends FieldComponentDefinitionFrame {
    class: SaveButtonComponentNameType;
    config?: SaveButtonFieldComponentConfigFrame
}


export class SaveButtonFieldComponentDefinition extends FieldComponentDefinition implements SaveButtonFieldComponentDefinitionFrame {
    class = SaveButtonComponentName;
    config?: SaveButtonFieldComponentConfig;

    constructor() {
        super();
    }

    accept(visitor: IFormConfigVisitor): void {
        visitor.visitSaveButtonFieldComponentDefinition(this);
    }
}

/* Save Button Form Component */
export interface SaveButtonFormComponentDefinitionFrame extends FormComponentDefinitionFrame {
    component: SaveButtonFieldComponentDefinitionFrame;
    model?: never;
    layout?: AvailableFieldLayoutDefinitionFrames;
}

export class SaveButtonFormComponentDefinition extends FormComponentDefinition implements SaveButtonFormComponentDefinitionFrame {
    component: SaveButtonFieldComponentDefinition;
    model?: never;
    layout?: AvailableFieldLayoutDefinitions;

    constructor() {
        super();
        this.component = new SaveButtonFieldComponentDefinition();
    }

    accept(visitor: IFormConfigVisitor) {
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

