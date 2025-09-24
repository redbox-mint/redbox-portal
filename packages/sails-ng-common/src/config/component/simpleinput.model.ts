import {
    FieldModelConfig, FieldModelDefinition, FieldComponentConfigFrame,
    FieldComponentDefinitionFrame, FieldComponentConfig, FieldComponentDefinition,
    FieldModelConfigFrame, FieldModelDefinitionFrame, FieldComponentConfigKind,
    FieldComponentDefinitionKind, FormComponentDefinitionKind, FormComponentDefinitionFrame,
    FormComponentDefinition,
    DefaultFieldLayoutDefinitionFrame, FieldModelConfigKind, FieldModelDefinitionKind,
    FormConfigItemVisitor, DefaultFieldLayoutDefinition
} from "../..";

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

    constructor(data?: SimpleInputFieldComponentConfigFrame) {
        super(data);
    }
}

export interface SimpleInputFieldComponentDefinitionFrame extends FieldComponentDefinitionFrame {
    class: SimpleInputComponentNameType;
    config?: SimpleInputFieldComponentConfigFrame;
}

export class SimpleInputFieldComponentDefinition extends FieldComponentDefinition implements SimpleInputFieldComponentDefinitionFrame {
    class = SimpleInputComponentName;
    config?: SimpleInputFieldComponentConfig;

    constructor(data: SimpleInputFieldComponentDefinitionFrame) {
        super(data);
        this.config = new SimpleInputFieldComponentConfig(data.config);
    }

    accept(visitor: FormConfigItemVisitor): void {
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
    constructor(data?: SimpleInputFieldModelConfigFrame) {
        super(data);
    }
}


export interface SimpleInputFieldModelDefinitionFrame extends FieldModelDefinitionFrame<SimpleInputModelValueType> {
    class: SimpleInputModelNameType;
    config?: SimpleInputFieldModelConfigFrame
}

export class SimpleInputFieldModelDefinition extends FieldModelDefinition<SimpleInputModelValueType> {
    class = SimpleInputModelName;
    config: SimpleInputFieldModelConfig;

    constructor(data?: SimpleInputFieldModelDefinitionFrame) {
        super(data ?? {class: SimpleInputModelName});
        this.config = new SimpleInputFieldModelConfig(data?.config);
    }

    accept(visitor: FormConfigItemVisitor): void {
        visitor.visitSimpleInputFieldModelDefinition(this);
    }
}

/* Simple Input Form Component */
export interface SimpleInputFormComponentDefinitionFrame extends FormComponentDefinitionFrame {
    component: SimpleInputFieldComponentDefinitionFrame;
    model?: SimpleInputFieldModelDefinitionFrame;
    layout?: DefaultFieldLayoutDefinitionFrame
}

export class SimpleInputFormComponentDefinition extends FormComponentDefinition implements SimpleInputFormComponentDefinitionFrame {
    public component: SimpleInputFieldComponentDefinition;
    public model?: SimpleInputFieldModelDefinition;
    public layout?: DefaultFieldLayoutDefinition;
    constructor(data: SimpleInputFormComponentDefinitionFrame) {
        super(data);
        this.component = new SimpleInputFieldComponentDefinition(data.component);
        this.model = new SimpleInputFieldModelDefinition(data.model);
        this.layout = new DefaultFieldLayoutDefinition(data.layout);
    }

    accept(visitor: FormConfigItemVisitor) {
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
