import {
    FormFieldModelConfig, FormFieldModelDefinition, FormFieldComponentConfigFrame, FormFieldComponentConfig,
    FormFieldComponentDefinitionFrame, FormFieldComponentDefinition, FormFieldModelDefinitionFrame,
    FormFieldModelConfigFrame, FormFieldComponentConfigKind, FormFieldComponentDefinitionKind,
} from "..";
import {FormConfigItemVisitor} from "../visitor";

/* Text Area Component */
export interface TextAreaFormFieldComponentConfigFrame extends FormFieldComponentConfigFrame {
    rows: number;
    cols: number;
    placeholder?: string;
}

export class TextAreaFormFieldComponentConfig extends FormFieldComponentConfig implements TextAreaFormFieldComponentConfigFrame {
    public rows: number = 2;
    public cols: number = 20;
    public placeholder?: string = '';

    constructor(data?: TextAreaFormFieldComponentConfigFrame) {
        super(data);
    }
}

export interface TextAreaFormFieldComponentDefinitionFrame extends FormFieldComponentDefinitionFrame {
    config?: TextAreaFormFieldComponentConfigFrame
}

export const TextAreaComponentName = "TextAreaComponent" as const;

export class TextAreaFormFieldComponentDefinition extends FormFieldComponentDefinition implements TextAreaFormFieldComponentDefinitionFrame {
    class = TextAreaComponentName;
    config?: TextAreaFormFieldComponentConfig;

    constructor(data: TextAreaFormFieldComponentDefinitionFrame) {
        super(data);
        this.config = new TextAreaFormFieldComponentConfig(data.config);
    }

    accept(visitor: FormConfigItemVisitor): void {
        visitor.visitTextAreaFormFieldComponentDefinition(this);
    }
}


/* Text Area Model */
export type TextAreaModelValueType = string;

export interface TextAreaFormFieldModelConfigFrame extends FormFieldModelConfigFrame<TextAreaModelValueType> {
}

export class TextAreaFormFieldModelConfig extends FormFieldModelConfig<TextAreaModelValueType> implements TextAreaFormFieldModelConfigFrame {
    constructor(data?: TextAreaFormFieldModelConfigFrame) {
        super(data);
    }
}

export interface TextAreaFormFieldModelDefinitionFrame extends FormFieldModelDefinitionFrame<TextAreaModelValueType> {
}

export const TextAreaModelName = "TextAreaModel" as const;

export class TextareaModelDefinition extends FormFieldModelDefinition<TextAreaModelValueType> implements TextAreaFormFieldModelDefinitionFrame {
    class = TextAreaModelName;
    config: TextAreaFormFieldModelConfig;

    constructor(data: TextAreaFormFieldModelDefinitionFrame) {
        super(data);
        this.config = new TextAreaFormFieldModelConfig(data.config);
    }

    accept(visitor: FormConfigItemVisitor): void {
        visitor.visitTextAreaFormFieldModelDefinition(this);
    }
}


export const TextAreaMap = [
    {kind: FormFieldComponentConfigKind, def: TextAreaFormFieldComponentConfig},
    {
        kind: FormFieldComponentDefinitionKind,
        def: TextAreaFormFieldComponentDefinition,
        class: TextAreaComponentName
    },
];
export type TextAreaFrames =
    TextAreaFormFieldComponentConfigFrame |
    TextAreaFormFieldComponentDefinitionFrame;

