import {FormConfigVisitorOutline} from "../visitor/base.outline";
import {
    FieldComponentConfigKind,
    FieldComponentDefinitionKind,
    FormComponentDefinitionKind
} from "../shared.outline";
import {FieldComponentConfig, FieldComponentDefinition} from "../field-component.model";
import {FormComponentDefinition} from "../form-component.model";
import {AvailableFieldLayoutDefinitionOutlines} from "../dictionary.outline";
import {StaticComponentName, StaticFieldComponentConfigOutline, StaticFieldComponentDefinitionOutline, StaticFormComponentDefinitionOutline} from "./static.outline";


/* Static Component */

export class StaticFieldComponentConfig extends FieldComponentConfig implements StaticFieldComponentConfigOutline {
    template?: string;
    extraContext?: any;

    constructor() {
        super();
    }
}


export class StaticFieldComponentDefinition extends FieldComponentDefinition implements StaticFieldComponentDefinitionOutline {
    class = StaticComponentName;
    config?: StaticFieldComponentConfig;

    constructor() {
        super();
    }

    accept(visitor: FormConfigVisitorOutline) {
        visitor.visitStaticFieldComponentDefinition(this);
    }
}

/* Static Form Component */

export class StaticFormComponentDefinition extends FormComponentDefinition implements StaticFormComponentDefinitionOutline {
    component!: StaticFieldComponentDefinitionOutline;
    model?: never;
    layout?: AvailableFieldLayoutDefinitionOutlines;

    constructor() {
        super();
    }

    accept(visitor: FormConfigVisitorOutline) {
        visitor.visitStaticFormComponentDefinition(this);
    }
}

export const StaticMap = [
    {kind: FieldComponentConfigKind, def: StaticFieldComponentConfig},
    {kind: FieldComponentDefinitionKind, def: StaticFieldComponentDefinition, class: StaticComponentName},
    {kind: FormComponentDefinitionKind, def: StaticFormComponentDefinition, class: StaticComponentName},
];

