import {
    DefaultFieldLayoutDefinitionFrame, FormComponentDefinition,
    FormComponentDefinitionFrame, FormComponentDefinitionKind,
    FieldComponentConfig,
    FieldComponentConfigFrame, FieldComponentConfigKind,
    FieldComponentDefinition, FieldComponentDefinitionFrame,
    FieldComponentDefinitionKind,
    FormConfigItemVisitor, DefaultFieldLayoutDefinition, TextAreaFieldComponentDefinition, TextAreaFieldModelDefinition
} from "../..";



/*  Validation Summary Component */
export const ValidationSummaryComponentName = "ValidationSummaryComponent" as const;
export type ValidationSummaryComponentNameType =  typeof ValidationSummaryComponentName;
export interface ValidationSummaryFieldComponentConfigFrame extends FieldComponentConfigFrame {
}

export class ValidationSummaryFieldComponentConfig extends FieldComponentConfig implements ValidationSummaryFieldComponentConfigFrame {
    constructor(data?: ValidationSummaryFieldComponentConfigFrame) {
        super(data);
    }
}

export interface ValidationSummaryFieldComponentDefinitionFrame extends FieldComponentDefinitionFrame {
    class: ValidationSummaryComponentNameType;
    config?: ValidationSummaryFieldComponentConfigFrame;
}


export class ValidationSummaryFieldComponentDefinition extends FieldComponentDefinition implements ValidationSummaryFieldComponentDefinitionFrame {
    class = ValidationSummaryComponentName;
    config?: ValidationSummaryFieldComponentConfig;


    constructor(data: ValidationSummaryFieldComponentDefinitionFrame) {
        super(data);
        this.config = new ValidationSummaryFieldComponentConfig(data.config);
    }

    accept(visitor: FormConfigItemVisitor): void {
        visitor.visitValidationSummaryFieldComponentDefinition(this);
    }
}

/* Validation Summary Form Component */
export interface ValidationSummaryFormComponentDefinitionFrame extends FormComponentDefinitionFrame {
    component: ValidationSummaryFieldComponentDefinitionFrame;
    layout?: DefaultFieldLayoutDefinitionFrame;
}

export class ValidationSummaryFormComponentDefinition extends FormComponentDefinition {
    component: ValidationSummaryFieldComponentDefinition;
    layout?: DefaultFieldLayoutDefinition;
    constructor(data: ValidationSummaryFormComponentDefinitionFrame) {
        super(data);
        this.component = new ValidationSummaryFieldComponentDefinition(data.component);
        this.layout = new DefaultFieldLayoutDefinition(data.layout);
    }

    accept(visitor: FormConfigItemVisitor) {
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

