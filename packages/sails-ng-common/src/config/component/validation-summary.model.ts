import {
    FieldComponentConfig,
    FieldComponentConfigFrame,
    FieldComponentDefinition,
    FieldComponentDefinitionFrame
} from "../field-component.model";
import {
    AvailableFieldLayoutDefinitionFrames, AvailableFieldLayoutDefinitions,

} from "../static-types-classes.dictionary";

import {FormComponentDefinition, FormComponentDefinitionFrame} from "../form-component.model";
import {
    FieldComponentConfigKind,
    FieldComponentDefinitionKind, FormComponentDefinitionKind
} from "../shared.model";
import {IFormConfigVisitor} from "../visitor/base.structure";



/*  Validation Summary Component */
export const ValidationSummaryComponentName = "ValidationSummaryComponent" as const;
export type ValidationSummaryComponentNameType = typeof ValidationSummaryComponentName;

export interface ValidationSummaryFieldComponentConfigFrame extends FieldComponentConfigFrame {
}

export class ValidationSummaryFieldComponentConfig extends FieldComponentConfig implements ValidationSummaryFieldComponentConfigFrame {
    constructor() {
        super();
    }
}

export interface ValidationSummaryFieldComponentDefinitionFrame extends FieldComponentDefinitionFrame {
    class: ValidationSummaryComponentNameType;
    config?: ValidationSummaryFieldComponentConfigFrame;
}


export class ValidationSummaryFieldComponentDefinition extends FieldComponentDefinition implements ValidationSummaryFieldComponentDefinitionFrame {
    class = ValidationSummaryComponentName;
    config?: ValidationSummaryFieldComponentConfig;

    constructor() {
        super();
    }


    accept(visitor: IFormConfigVisitor): void {
        visitor.visitValidationSummaryFieldComponentDefinition(this);
    }
}

/* Validation Summary Form Component */
export interface ValidationSummaryFormComponentDefinitionFrame extends FormComponentDefinitionFrame {
    component: ValidationSummaryFieldComponentDefinitionFrame;
    model?: never;
    layout?: AvailableFieldLayoutDefinitionFrames;
}

export class ValidationSummaryFormComponentDefinition extends FormComponentDefinition implements ValidationSummaryFormComponentDefinitionFrame {
    component: ValidationSummaryFieldComponentDefinition;
    model?: never;
    layout?: AvailableFieldLayoutDefinitions;

    constructor() {
        super();
        this.component = new ValidationSummaryFieldComponentDefinition();
    }

    accept(visitor: IFormConfigVisitor) {
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
    {kind: FormComponentDefinitionKind, def: ValidationSummaryFormComponentDefinition},
];
export type ValidationSummaryFrames =
    ValidationSummaryFieldComponentConfigFrame |
    ValidationSummaryFieldComponentDefinitionFrame |
    ValidationSummaryFormComponentDefinitionFrame;

