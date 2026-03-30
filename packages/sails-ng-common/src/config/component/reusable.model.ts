import {FieldComponentConfig, FieldComponentDefinition} from "../field-component.model";
import {AvailableFormComponentDefinitionOutlines} from "../dictionary.outline";
import {FormConfigVisitorOutline} from "../visitor/base.outline";
import {
    ReusableComponentName,
    ReusableFieldComponentConfigOutline,
    ReusableFieldComponentDefinitionOutline, ReusableFormComponentDefinitionOutline
} from "./reusable.outline";
import {
    FieldComponentConfigKind,
    FieldComponentDefinitionKind,
    FormComponentDefinitionKind
} from "../shared.outline";
import {FormComponentDefinition} from "../form-component.model";

/*
 * The Reusable classes are only used in the visitor that migrates v4 form config to v5 form config.
 * The reusable form config placeholder is replaced with the form config classes in the construct visitor.
 */


/* Reusable Component */

export class ReusableFieldComponentConfig extends FieldComponentConfig implements ReusableFieldComponentConfigOutline {
    componentDefinitions: AvailableFormComponentDefinitionOutlines[];

    constructor() {
        super();
        this.componentDefinitions = [];
    }

}


export class ReusableFieldComponentDefinition extends FieldComponentDefinition implements ReusableFieldComponentDefinitionOutline {
    class = ReusableComponentName;
    config?: ReusableFieldComponentConfigOutline;

    constructor() {
        super();
    }

    accept(visitor: FormConfigVisitorOutline) {
        visitor.visitReusableFieldComponentDefinition(this);
    }
}

/* Reusable Form Component */
export class ReusableFormComponentDefinition extends FormComponentDefinition implements ReusableFormComponentDefinitionOutline {
    public component!: ReusableFieldComponentDefinitionOutline;
    public model?: never;
    public layout?: never;

    constructor() {
        super();
    }

    accept(visitor: FormConfigVisitorOutline) {
        visitor.visitReusableFormComponentDefinition(this);
    }
}

export const ReusableMap = [
    {kind: FieldComponentConfigKind, def: ReusableFieldComponentConfig},
    {kind: FieldComponentDefinitionKind, def: ReusableFieldComponentDefinition, class: ReusableComponentName},
    {kind: FormComponentDefinitionKind, def: ReusableFormComponentDefinition, class: ReusableComponentName},
];
export const ReusableDefaults = {
    [FormComponentDefinitionKind]: {
        [ReusableComponentName]: {
            [FieldComponentDefinitionKind]: ReusableComponentName,
        },
    },
};
