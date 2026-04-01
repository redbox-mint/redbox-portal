import {FieldComponentConfig, FieldComponentDefinition} from "../field-component.model";
import {AvailableFieldLayoutDefinitionOutlines} from "../dictionary.outline";
import {FormComponentDefinition,} from "../form-component.model";
import {FormConfigVisitorOutline} from "../visitor/base.outline";
import {
    FieldComponentConfigKind,
    FieldComponentDefinitionKind,
    FormComponentDefinitionKind
} from "../shared.outline";
import {
    SaveButtonComponentName,
    SaveButtonFieldComponentConfigOutline,
    SaveButtonFieldComponentDefinitionOutline, SaveButtonFormComponentDefinitionOutline
} from "./save-button.outline";


/* Save Button Component */

export class SaveButtonFieldComponentConfig extends FieldComponentConfig implements SaveButtonFieldComponentConfigOutline {
    targetStep?: string;
    forceSave?: boolean;
    labelSaving?: string;
    buttonCssClasses?: string;

    constructor() {
        super();
    }
}


export class SaveButtonFieldComponentDefinition extends FieldComponentDefinition implements SaveButtonFieldComponentDefinitionOutline {
    class = SaveButtonComponentName;
    config?: SaveButtonFieldComponentConfigOutline;

    constructor() {
        super();
    }

    accept(visitor: FormConfigVisitorOutline): void {
        visitor.visitSaveButtonFieldComponentDefinition(this);
    }
}

/* Save Button Form Component */


export class SaveButtonFormComponentDefinition extends FormComponentDefinition implements SaveButtonFormComponentDefinitionOutline {
    component!: SaveButtonFieldComponentDefinitionOutline;
    model?: never;
    layout?: AvailableFieldLayoutDefinitionOutlines;

    constructor() {
        super();
    }

    accept(visitor: FormConfigVisitorOutline) {
        visitor.visitSaveButtonFormComponentDefinition(this);
    }
}

export const SaveButtonMap = [
    {kind: FieldComponentConfigKind, def: SaveButtonFieldComponentConfig},
    {kind: FieldComponentDefinitionKind, def: SaveButtonFieldComponentDefinition, class: SaveButtonComponentName},
    {kind: FormComponentDefinitionKind, def: SaveButtonFormComponentDefinition, class:SaveButtonComponentName},
];
export const SaveButtonDefaults = {
    [FormComponentDefinitionKind]: {
        [SaveButtonComponentName]: {
            [FieldComponentDefinitionKind]: SaveButtonComponentName,
        },
    },
};
