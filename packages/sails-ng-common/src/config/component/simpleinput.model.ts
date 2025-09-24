import {
    FieldComponentConfig,
    FieldComponentConfigFrame,
    FieldComponentDefinition,
    FieldComponentDefinitionFrame
} from "../field-component.model";
import {
    AvailableFieldLayoutDefinitionFrames, AvailableFieldLayoutDefinitions,

} from "../static-types-classes.dictionary";

import {
    FieldModelConfig,
    FieldModelConfigFrame,
    FieldModelDefinition,
    FieldModelDefinitionFrame
} from "../field-model.model";
import {FormComponentDefinition, FormComponentDefinitionFrame, HasChildren} from "../form-component.model";
import {
    FieldComponentConfigKind,
    FieldComponentDefinitionKind,
    FieldModelConfigKind,
    FieldModelDefinitionKind, FormComponentDefinitionKind
} from "../shared.model";
import {IFormConfigVisitor} from "../visitor/base.structure";


/* Simple Input Component */
export const SimpleInputComponentName = "SimpleInputComponent" as const;
export type SimpleInputComponentNameType = typeof SimpleInputComponentName;

export const SimpleInputFieldComponentConfigTypeNames = ["email", "text", "tel", "number", "password", "url"] as const;
export type SimpleInputFieldComponentConfigType = typeof SimpleInputFieldComponentConfigTypeNames[number];

export interface SimpleInputFieldComponentConfigFrame extends FieldComponentConfigFrame {
    type: SimpleInputFieldComponentConfigType;
}


export class SimpleInputFieldComponentConfig extends FieldComponentConfig implements SimpleInputFieldComponentConfigFrame {
    type: SimpleInputFieldComponentConfigType = "text";

    constructor() {
        super();
    }
}

export interface SimpleInputFieldComponentDefinitionFrame extends FieldComponentDefinitionFrame {
    class: SimpleInputComponentNameType;
    config?: SimpleInputFieldComponentConfigFrame;
}

export class SimpleInputFieldComponentDefinition extends FieldComponentDefinition implements SimpleInputFieldComponentDefinitionFrame {
    class = SimpleInputComponentName;
    config?: SimpleInputFieldComponentConfig;

    constructor() {
        super();
    }

    accept(visitor: IFormConfigVisitor): void {
        visitor.visitSimpleInputFieldComponentDefinition(this);
    }
}


/* Simple Input Model */
export const SimpleInputModelName = "SimpleInputModel" as const;
export type SimpleInputModelNameType = typeof SimpleInputModelName;
export type SimpleInputModelValueType = string;

export interface SimpleInputFieldModelConfigFrame extends FieldModelConfigFrame<SimpleInputModelValueType> {
}

export class SimpleInputFieldModelConfig extends FieldModelConfig<SimpleInputModelValueType> implements SimpleInputFieldModelConfigFrame {
    constructor() {
        super();
    }
}


export interface SimpleInputFieldModelDefinitionFrame extends FieldModelDefinitionFrame<SimpleInputModelValueType> {
    class: SimpleInputModelNameType;
    config?: SimpleInputFieldModelConfigFrame
}

export class SimpleInputFieldModelDefinition extends FieldModelDefinition<SimpleInputModelValueType> {
    class = SimpleInputModelName;
    config?: SimpleInputFieldModelConfig;

    constructor() {
        super();
    }

    accept(visitor: IFormConfigVisitor): void {
        visitor.visitSimpleInputFieldModelDefinition(this);
    }
}

/* Simple Input Form Component */
export interface SimpleInputFormComponentDefinitionFrame extends FormComponentDefinitionFrame {
    component: SimpleInputFieldComponentDefinitionFrame;
    model?: SimpleInputFieldModelDefinitionFrame;
    layout?: AvailableFieldLayoutDefinitionFrames;
}

export class SimpleInputFormComponentDefinition extends FormComponentDefinition implements SimpleInputFormComponentDefinitionFrame {
    public component: SimpleInputFieldComponentDefinition;
    public model?: SimpleInputFieldModelDefinition;
    public layout?: AvailableFieldLayoutDefinitions;

    constructor() {
        super();
        this.component = new SimpleInputFieldComponentDefinition();
    }

    accept(visitor: IFormConfigVisitor) {
        visitor.visitSimpleInputFormComponentDefinition(this);
    }
}

export const SimpleInputMap = [
    {kind: FieldComponentConfigKind, def: SimpleInputFieldComponentConfig},
    {kind: FieldComponentDefinitionKind, def: SimpleInputFieldComponentDefinition, class: SimpleInputComponentName},
    {kind: FieldModelConfigKind, def: SimpleInputFieldModelConfig},
    {kind: FieldModelDefinitionKind, def: SimpleInputFieldModelDefinition, class: SimpleInputModelName},
    {kind: FormComponentDefinitionKind, def: SimpleInputFormComponentDefinition},
];
export type SimpleInputFrames =
    SimpleInputFieldComponentConfigFrame |
    SimpleInputFieldComponentDefinitionFrame |
    SimpleInputFieldModelConfigFrame |
    SimpleInputFieldModelDefinitionFrame |
    SimpleInputFormComponentDefinitionFrame;
