import {FieldModelConfig, FieldModelDefinition} from "../field-model.model";
import {FormComponentDefinition} from "../form-component.model";
import {FormConfigVisitorOutline} from "../visitor/base.outline";
import {
    FieldComponentConfigKind,
    FieldComponentDefinitionKind,
    FieldModelConfigKind,
    FieldModelDefinitionKind, FormComponentDefinitionKind
} from "../shared.outline";
import {FieldComponentConfig, FieldComponentDefinition} from "../field-component.model";
import {AvailableFieldLayoutDefinitionOutlines} from "../dictionary.outline";
import {
    RadioInputComponentName,
    RadioInputFieldComponentConfigOutline,
    RadioInputFieldComponentDefinitionOutline, RadioInputFieldModelConfigOutline,
    RadioInputFieldModelDefinitionOutline,
    RadioInputFormComponentDefinitionOutline, RadioInputModelName, RadioInputModelValueType,
    RadioOption
} from "./radio-input.outline";

/* Radio Input Component */


export class RadioInputFieldComponentConfig extends FieldComponentConfig implements RadioInputFieldComponentConfigOutline {
    options: RadioOption[] = [];
    vocabRef?: string;
    inlineVocab?: boolean;

    constructor() {
        super();
    }
}


export class RadioInputFieldComponentDefinition extends FieldComponentDefinition implements RadioInputFieldComponentDefinitionOutline {
    class = RadioInputComponentName;
    config?: RadioInputFieldComponentConfigOutline;

    constructor() {
        super();
    }

    accept(visitor: FormConfigVisitorOutline): void {
        visitor.visitRadioInputFieldComponentDefinition(this);
    }
}


/* Radio Input Model */


export class RadioInputFieldModelConfig extends FieldModelConfig<RadioInputModelValueType> implements RadioInputFieldModelConfigOutline {
    constructor() {
        super();
    }
}


export class RadioInputFieldModelDefinition extends FieldModelDefinition<RadioInputModelValueType> implements RadioInputFieldModelDefinitionOutline {
    class = RadioInputModelName;
    config?: RadioInputFieldModelConfigOutline;

    constructor() {
        super();
    }

    accept(visitor: FormConfigVisitorOutline): void {
        visitor.visitRadioInputFieldModelDefinition(this);
    }
}

/* Radio Input Form Component */

export class RadioInputFormComponentDefinition extends FormComponentDefinition implements RadioInputFormComponentDefinitionOutline {
    public component!: RadioInputFieldComponentDefinitionOutline;
    public model?: RadioInputFieldModelDefinitionOutline;
    public layout?: AvailableFieldLayoutDefinitionOutlines;

    constructor() {
        super();
    }

    accept(visitor: FormConfigVisitorOutline) {
        visitor.visitRadioInputFormComponentDefinition(this);
    }
}

export const RadioInputMap = [
    {kind: FieldComponentConfigKind, def: RadioInputFieldComponentConfig},
    {kind: FieldComponentDefinitionKind, def: RadioInputFieldComponentDefinition, class: RadioInputComponentName},
    {kind: FieldModelConfigKind, def: RadioInputFieldModelConfig},
    {kind: FieldModelDefinitionKind, def: RadioInputFieldModelDefinition, class: RadioInputModelName},
    {kind: FormComponentDefinitionKind, def: RadioInputFormComponentDefinition, class: RadioInputComponentName},
];
export const RadioInputDefaults = {
    [FormComponentDefinitionKind]: {
        [RadioInputComponentName]: {
            [FieldComponentDefinitionKind]: RadioInputComponentName,
            [FieldModelDefinitionKind]: RadioInputModelName,
        },
    },
};
