import {
    FieldModelConfig, FieldModelDefinition, FieldComponentConfigFrame, FieldComponentConfig,
    FieldComponentDefinitionFrame, FieldComponentDefinition, FieldModelDefinitionFrame,
    FieldModelConfigFrame, FieldComponentConfigKind, FieldComponentDefinitionKind,
    FormConfigItemVisitor, FormComponentDefinitionFrame, DefaultFieldLayoutDefinitionFrame, FormComponentDefinition,
    DefaultFieldLayoutDefinition, FormComponentDefinitionKind, FieldModelConfigKind, FieldModelDefinitionKind
} from "../..";

/* Text Area Component */
export const TextAreaComponentName = "TextAreaComponent" as const;
export type TextAreaComponentNameType = typeof TextAreaComponentName;
export interface TextAreaFieldComponentConfigFrame extends FieldComponentConfigFrame {
    rows: number;
    cols: number;
    placeholder?: string;
}

export class TextAreaFieldComponentConfig extends FieldComponentConfig implements TextAreaFieldComponentConfigFrame {
    public rows: number = 2;
    public cols: number = 20;
    public placeholder?: string = '';

    constructor(data?: TextAreaFieldComponentConfigFrame) {
        super(data);
    }
}

export interface TextAreaFieldComponentDefinitionFrame extends FieldComponentDefinitionFrame {
    class: TextAreaComponentNameType;
    config?: TextAreaFieldComponentConfigFrame
}



export class TextAreaFieldComponentDefinition extends FieldComponentDefinition implements TextAreaFieldComponentDefinitionFrame {
    class = TextAreaComponentName;
    config?: TextAreaFieldComponentConfig;

    constructor(data: TextAreaFieldComponentDefinitionFrame) {
        super(data);
        this.config = new TextAreaFieldComponentConfig(data.config);
    }

    accept(visitor: FormConfigItemVisitor): void {
        visitor.visitTextAreaFieldComponentDefinition(this);
    }
}


/* Text Area Model */
export const TextAreaModelName = "TextAreaModel" as const;
export type TextAreaModelNameType = typeof TextAreaModelName;
export type TextAreaModelValueType = string;

export interface TextAreaFieldModelConfigFrame extends FieldModelConfigFrame<TextAreaModelValueType> {
}

export class TextAreaFieldModelConfig extends FieldModelConfig<TextAreaModelValueType> implements TextAreaFieldModelConfigFrame {
    constructor(data?: TextAreaFieldModelConfigFrame) {
        super(data);
    }
}

export interface TextAreaFieldModelDefinitionFrame extends FieldModelDefinitionFrame<TextAreaModelValueType> {
    class: TextAreaModelNameType;
    config?: TextAreaFieldModelConfigFrame;
}



export class TextAreaFieldModelDefinition extends FieldModelDefinition<TextAreaModelValueType> implements TextAreaFieldModelDefinitionFrame {
    class = TextAreaModelName;
    config: TextAreaFieldModelConfig;

    constructor(data?: TextAreaFieldModelDefinitionFrame) {
        super(data ?? {class: TextAreaModelName});
        this.config = new TextAreaFieldModelConfig(data?.config);
    }

    accept(visitor: FormConfigItemVisitor): void {
        visitor.visitTextAreaFieldModelDefinition(this);
    }
}

/* Text Area Form Component */
export interface TextAreaFormComponentDefinitionFrame extends FormComponentDefinitionFrame {
    component: TextAreaFieldComponentDefinitionFrame;
    model?: TextAreaFieldModelDefinitionFrame;
    layout?: DefaultFieldLayoutDefinitionFrame;
}

export class TextAreaFormComponentDefinition extends FormComponentDefinition implements TextAreaFormComponentDefinitionFrame {
    public component: TextAreaFieldComponentDefinition;
    public model?: TextAreaFieldModelDefinition;
    public layout?: DefaultFieldLayoutDefinition;

    constructor(data: TextAreaFormComponentDefinitionFrame) {
        super(data);
        this.component = new TextAreaFieldComponentDefinition(data.component);
        this.model = new TextAreaFieldModelDefinition(data.model);
        this.layout = new DefaultFieldLayoutDefinition(data.layout);
    }

    accept(visitor: FormConfigItemVisitor) {
        visitor.visitTextAreaFormComponentDefinition(this);
    }
}

export const TextAreaMap = [
    {kind: FieldComponentConfigKind, def: TextAreaFieldComponentConfig},
    {kind: FieldComponentDefinitionKind, def: TextAreaFieldComponentDefinition, class: TextAreaComponentName},
    {kind: FieldModelConfigKind, def: TextAreaFieldModelConfig},
    {kind: FieldModelDefinitionKind, def: TextAreaFieldModelDefinition, class: TextAreaModelName},
    {kind: FormComponentDefinitionKind, def: TextAreaFormComponentDefinition},
];
export type TextAreaFrames =
    TextAreaFieldComponentConfigFrame |
    TextAreaFieldComponentDefinitionFrame |
    TextAreaFieldModelConfigFrame |
    TextAreaFieldModelDefinitionFrame |
    TextAreaFormComponentDefinitionFrame;

