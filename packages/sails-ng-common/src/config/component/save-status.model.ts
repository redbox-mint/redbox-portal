import {FormConfigVisitorOutline} from "../visitor/base.outline";
import {FieldComponentConfigKind, FieldComponentDefinitionKind, FormComponentDefinitionKind} from "../shared.outline";
import {FieldComponentConfig, FieldComponentDefinition} from "../field-component.model";
import {
    SaveStatusComponentName,
    SaveStatusFieldComponentConfigOutline,
    SaveStatusFieldComponentDefinitionOutline,
    SaveStatusFormComponentDefinitionOutline
} from "./save-status.outline";
import {FormComponentDefinition} from "../form-component.model";
import {AvailableFieldLayoutDefinitionOutlines} from "../dictionary.outline";

/* Save Status Component */

export class SaveStatusFieldComponentConfig extends FieldComponentConfig implements SaveStatusFieldComponentConfigOutline {
    successDisplayDurationMs = 3000;

    constructor() {
        super();
    }
}

export class SaveStatusFieldComponentDefinition extends FieldComponentDefinition implements SaveStatusFieldComponentDefinitionOutline {
    class = SaveStatusComponentName;
    config?: SaveStatusFieldComponentConfigOutline;

    constructor() {
        super();
    }

    accept(visitor: FormConfigVisitorOutline): void {
        visitor.visitSaveStatusFieldComponentDefinition(this);
    }
}

/* Save Status Form Component */

export class SaveStatusFormComponentDefinition extends FormComponentDefinition implements SaveStatusFormComponentDefinitionOutline {
    component!: SaveStatusFieldComponentDefinitionOutline;
    model?: never;
    layout?: AvailableFieldLayoutDefinitionOutlines;

    constructor() {
        super();
    }

    accept(visitor: FormConfigVisitorOutline) {
        visitor.visitSaveStatusFormComponentDefinition(this);
    }
}

export const SaveStatusMap = [
    {kind: FieldComponentConfigKind, def: SaveStatusFieldComponentConfig},
    {
        kind: FieldComponentDefinitionKind,
        def: SaveStatusFieldComponentDefinition,
        class: SaveStatusComponentName
    },
    {
        kind: FormComponentDefinitionKind,
        def: SaveStatusFormComponentDefinition,
        class: SaveStatusComponentName
    },
];
export const SaveStatusDefaults = {
    [FormComponentDefinitionKind]: {
        [SaveStatusComponentName]: {
            [FieldComponentDefinitionKind]: SaveStatusComponentName,
        },
    },
};
