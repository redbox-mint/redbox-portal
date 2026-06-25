import {FormConfigVisitorOutline} from "../visitor/base.outline";
import {FieldComponentConfigKind, FieldComponentDefinitionKind, FormComponentDefinitionKind} from "../shared.outline";
import {FieldComponentConfig, FieldComponentDefinition} from "../field-component.model";
import {
    IntegrationStatusComponentName,
    IntegrationStatusFieldComponentConfigOutline,
    IntegrationStatusFieldComponentDefinitionOutline,
    IntegrationStatusFormComponentDefinitionOutline
} from "./integration-status.outline";
import {FormComponentDefinition} from "../form-component.model";
import {AvailableFieldLayoutDefinitionOutlines} from "../dictionary.outline";

export class IntegrationStatusFieldComponentConfig extends FieldComponentConfig implements IntegrationStatusFieldComponentConfigOutline {
    integrationNames?: string[];
    pollIntervalMs = 5000;
    maxPollAttempts = 60;
    heading?: string;
    technicalDetailRoles: string[] = ['Admin', 'Librarians'];
    hideWhenInactive = false;

    constructor() {
        super();
    }
}

export class IntegrationStatusFieldComponentDefinition extends FieldComponentDefinition implements IntegrationStatusFieldComponentDefinitionOutline {
    class = IntegrationStatusComponentName;
    config?: IntegrationStatusFieldComponentConfigOutline;

    constructor() {
        super();
    }

    async accept(visitor: FormConfigVisitorOutline) {
        await visitor.visitIntegrationStatusFieldComponentDefinition(this);
    }
}

export class IntegrationStatusFormComponentDefinition extends FormComponentDefinition implements IntegrationStatusFormComponentDefinitionOutline {
    component!: IntegrationStatusFieldComponentDefinitionOutline;
    model?: never;
    layout?: AvailableFieldLayoutDefinitionOutlines;

    constructor() {
        super();
    }

    async accept(visitor: FormConfigVisitorOutline) {
        await visitor.visitIntegrationStatusFormComponentDefinition(this);
    }
}

export const IntegrationStatusMap = [
    {kind: FieldComponentConfigKind, def: IntegrationStatusFieldComponentConfig},
    {
        kind: FieldComponentDefinitionKind,
        def: IntegrationStatusFieldComponentDefinition,
        class: IntegrationStatusComponentName
    },
    {
        kind: FormComponentDefinitionKind,
        def: IntegrationStatusFormComponentDefinition,
        class: IntegrationStatusComponentName
    },
];
export const IntegrationStatusDefaults = {
    [FormComponentDefinitionKind]: {
        [IntegrationStatusComponentName]: {
            [FieldComponentDefinitionKind]: IntegrationStatusComponentName,
        },
    },
};
