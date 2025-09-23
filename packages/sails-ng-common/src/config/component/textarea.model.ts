import {
    FieldModelConfig, FieldModelDefinition, FieldComponentConfigFrame, FieldComponentConfig,
    FieldComponentDefinitionFrame, FieldComponentDefinition, FieldModelDefinitionFrame,
    FieldModelConfigFrame, FieldComponentConfigKind, FieldComponentDefinitionKind,
FormConfigItemVisitor
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



export class TextareaModelDefinition extends FieldModelDefinition<TextAreaModelValueType> implements TextAreaFieldModelDefinitionFrame {
    class = TextAreaModelName;
    config: TextAreaFieldModelConfig;

    constructor(data: TextAreaFieldModelDefinitionFrame) {
        super(data);
        this.config = new TextAreaFieldModelConfig(data.config);
    }

    accept(visitor: FormConfigItemVisitor): void {
        visitor.visitTextAreaFieldModelDefinition(this);
    }
}


export const TextAreaMap = [
    {kind: FieldComponentConfigKind, def: TextAreaFieldComponentConfig},
    {
        kind: FieldComponentDefinitionKind,
        def: TextAreaFieldComponentDefinition,
        class: TextAreaComponentName
    },
];
export type TextAreaFrames =
    TextAreaFieldComponentConfigFrame |
    TextAreaFieldComponentDefinitionFrame;

