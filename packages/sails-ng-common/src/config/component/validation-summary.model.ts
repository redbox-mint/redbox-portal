import {FormConfigVisitorOutline} from "../visitor/base.outline";
import {FieldComponentConfigKind, FieldComponentDefinitionKind, FormComponentDefinitionKind} from "../shared.outline";
import {FieldComponentConfig, FieldComponentDefinition} from "../field-component.model";
import {
    ValidationSummaryComponentName,
    ValidationSummaryFieldComponentConfigOutline,
    ValidationSummaryFieldComponentDefinitionOutline, ValidationSummaryFormComponentDefinitionOutline
} from "./validation-summary.outline";
import {FormComponentDefinition} from "../form-component.model";
import {AvailableFieldLayoutDefinitionOutlines} from "../dictionary.outline";


/*  Validation Summary Component */

export class ValidationSummaryFieldComponentConfig extends FieldComponentConfig implements ValidationSummaryFieldComponentConfigOutline {
    constructor() {
        super();
    }
}


export class ValidationSummaryFieldComponentDefinition extends FieldComponentDefinition implements ValidationSummaryFieldComponentDefinitionOutline {
    class = ValidationSummaryComponentName;
    config?: ValidationSummaryFieldComponentConfigOutline;

    constructor() {
        super();
    }


    accept(visitor: FormConfigVisitorOutline): void {
        visitor.visitValidationSummaryFieldComponentDefinition(this);
    }
}

/* Validation Summary Form Component */


export class ValidationSummaryFormComponentDefinition extends FormComponentDefinition implements ValidationSummaryFormComponentDefinitionOutline {
    component!: ValidationSummaryFieldComponentDefinitionOutline;
    model?: never;
    layout?: AvailableFieldLayoutDefinitionOutlines;

    constructor() {
        super();
    }

    accept(visitor: FormConfigVisitorOutline) {
        visitor.visitValidationSummaryFormComponentDefinition(this);
    }
}

export const ValidationSummaryMap = [
    {kind: FieldComponentConfigKind, def: ValidationSummaryFieldComponentConfig},
    {
        kind: FieldComponentDefinitionKind,
        def: ValidationSummaryFieldComponentDefinition,
        class: ValidationSummaryComponentName
    },
    {kind: FormComponentDefinitionKind, def: ValidationSummaryFormComponentDefinition, class:ValidationSummaryComponentName},
];

