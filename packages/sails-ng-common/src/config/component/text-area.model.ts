import {
    FieldComponentConfig,
    FieldComponentDefinition,
} from "../field-component.model";

import {
    FieldModelConfig,
    FieldModelDefinition
} from "../field-model.model";
import {FormComponentDefinition,} from "../form-component.model";
import {FormConfigVisitorOutline} from "../visitor/base.outline";
import {
    FieldComponentConfigKind,
    FieldComponentDefinitionKind,
    FieldModelConfigKind,
    FieldModelDefinitionKind, FormComponentDefinitionKind
} from "../shared.outline";
import {
    TextAreaComponentName,
    TextAreaFieldComponentConfigOutline,
    TextAreaFieldComponentDefinitionOutline,
    TextAreaFieldModelConfigOutline, TextAreaFieldModelDefinitionOutline,
    TextAreaFormComponentDefinitionOutline, TextAreaModelName, TextAreaModelValueType
} from "./text-area.outline";
import {AvailableFieldLayoutDefinitionOutlines} from "../dictionary.outline";


/* Text Area Component */


export class TextAreaFieldComponentConfig extends FieldComponentConfig implements TextAreaFieldComponentConfigOutline {
    public rows: number = 2;
    public cols: number = 20;
    public placeholder?: string = '';

    constructor() {
        super();
    }
}


export class TextAreaFieldComponentDefinition extends FieldComponentDefinition implements TextAreaFieldComponentDefinitionOutline {
    class = TextAreaComponentName;
    config?: TextAreaFieldComponentConfigOutline;

    constructor() {
        super();
    }

    accept(visitor: FormConfigVisitorOutline): void {
        visitor.visitTextAreaFieldComponentDefinition(this);
    }
}


/* Text Area Model */


export class TextAreaFieldModelConfig extends FieldModelConfig<TextAreaModelValueType> implements TextAreaFieldModelConfigOutline {
    constructor() {
        super();
    }
}

export class TextAreaFieldModelDefinition extends FieldModelDefinition<TextAreaModelValueType> implements TextAreaFieldModelDefinitionOutline {
    class = TextAreaModelName;
    config?: TextAreaFieldModelConfigOutline;

    constructor() {
        super();
    }

    accept(visitor: FormConfigVisitorOutline): void {
        visitor.visitTextAreaFieldModelDefinition(this);
    }
}

/* Text Area Form Component */


export class TextAreaFormComponentDefinition extends FormComponentDefinition implements TextAreaFormComponentDefinitionOutline {
    public component!: TextAreaFieldComponentDefinitionOutline;
    public model?: TextAreaFieldModelDefinitionOutline;
    public layout?: AvailableFieldLayoutDefinitionOutlines;

    constructor() {
        super();
    }

    accept(visitor: FormConfigVisitorOutline) {
        visitor.visitTextAreaFormComponentDefinition(this);
    }
}

export const TextAreaMap = [
    {kind: FieldComponentConfigKind, def: TextAreaFieldComponentConfig},
    {kind: FieldComponentDefinitionKind, def: TextAreaFieldComponentDefinition, class: TextAreaComponentName},
    {kind: FieldModelConfigKind, def: TextAreaFieldModelConfig},
    {kind: FieldModelDefinitionKind, def: TextAreaFieldModelDefinition, class: TextAreaModelName},
    {kind: FormComponentDefinitionKind, def: TextAreaFormComponentDefinition, class:TextAreaComponentName},
];
export const TextAreaDefaults = {
    [FormComponentDefinitionKind]: {
        [TextAreaComponentName]: {
            [FieldComponentDefinitionKind]: TextAreaComponentName,
            [FieldModelDefinitionKind]: TextAreaModelName,
        },
    },
};
