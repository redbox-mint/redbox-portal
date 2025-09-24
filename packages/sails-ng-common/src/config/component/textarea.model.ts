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
import {FormComponentDefinition, FormComponentDefinitionFrame,} from "../form-component.model";
import {
    FieldComponentConfigKind,
    FieldComponentDefinitionKind,
    FieldModelConfigKind,
    FieldModelDefinitionKind, FormComponentDefinitionKind
} from "../shared.model";
import {IFormConfigVisitor} from "../visitor/base.structure";


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

    constructor() {
        super();
    }
}

export interface TextAreaFieldComponentDefinitionFrame extends FieldComponentDefinitionFrame {
    class: TextAreaComponentNameType;
    config?: TextAreaFieldComponentConfigFrame
}


export class TextAreaFieldComponentDefinition extends FieldComponentDefinition implements TextAreaFieldComponentDefinitionFrame {
    class = TextAreaComponentName;
    config?: TextAreaFieldComponentConfig;

    constructor() {
        super();
    }

    accept(visitor: IFormConfigVisitor): void {
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
    constructor() {
        super();
    }
}

export interface TextAreaFieldModelDefinitionFrame extends FieldModelDefinitionFrame<TextAreaModelValueType> {
    class: TextAreaModelNameType;
    config?: TextAreaFieldModelConfigFrame;
}


export class TextAreaFieldModelDefinition extends FieldModelDefinition<TextAreaModelValueType> implements TextAreaFieldModelDefinitionFrame {
    class = TextAreaModelName;
    config?: TextAreaFieldModelConfig;

    constructor() {
        super();
    }

    accept(visitor: IFormConfigVisitor): void {
        visitor.visitTextAreaFieldModelDefinition(this);
    }
}

/* Text Area Form Component */
export interface TextAreaFormComponentDefinitionFrame extends FormComponentDefinitionFrame {
    component: TextAreaFieldComponentDefinitionFrame;
    model?: TextAreaFieldModelDefinitionFrame;
    layout?: AvailableFieldLayoutDefinitionFrames;
}

export class TextAreaFormComponentDefinition extends FormComponentDefinition implements TextAreaFormComponentDefinitionFrame {
    public component: TextAreaFieldComponentDefinition;
    public model?: TextAreaFieldModelDefinition;
    public layout?: AvailableFieldLayoutDefinitions;

    constructor() {
        super();
        this.component = new TextAreaFieldComponentDefinition();
    }

    accept(visitor: IFormConfigVisitor) {
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

