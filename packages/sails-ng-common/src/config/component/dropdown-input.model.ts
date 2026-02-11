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
    DropdownInputComponentName,
    DropdownInputFieldComponentConfigOutline,
    DropdownInputFieldComponentDefinitionOutline, DropdownInputFieldModelConfigOutline,
    DropdownInputFieldModelDefinitionOutline,
    DropdownInputFormComponentDefinitionOutline, DropdownInputModelName, DropdownInputModelValueType,
    DropdownOption
} from "./dropdown-input.outline";

/* Dropdown Input Component */


export class DropdownInputFieldComponentConfig extends FieldComponentConfig implements DropdownInputFieldComponentConfigOutline {
    placeholder?: string;
    options: DropdownOption[] = [];
    vocabRef?: string;
    inlineVocab?: boolean;

    constructor() {
        super();
    }
}


export class DropdownInputFieldComponentDefinition extends FieldComponentDefinition implements DropdownInputFieldComponentDefinitionOutline {
    class = DropdownInputComponentName;
    config?: DropdownInputFieldComponentConfigOutline;

    constructor() {
        super();
    }

    accept(visitor: FormConfigVisitorOutline): void {
        visitor.visitDropdownInputFieldComponentDefinition(this);
    }
}


/* Dropdown Input Model */


export class DropdownInputFieldModelConfig extends FieldModelConfig<DropdownInputModelValueType> implements DropdownInputFieldModelConfigOutline {
    constructor() {
        super();
    }
}


export class DropdownInputFieldModelDefinition extends FieldModelDefinition<DropdownInputModelValueType> implements DropdownInputFieldModelDefinitionOutline {
    class = DropdownInputModelName;
    config?: DropdownInputFieldModelConfigOutline;

    constructor() {
        super();
    }

    accept(visitor: FormConfigVisitorOutline): void {
        visitor.visitDropdownInputFieldModelDefinition(this);
    }
}

/* Dropdown Input Form Component */

export class DropdownInputFormComponentDefinition extends FormComponentDefinition implements DropdownInputFormComponentDefinitionOutline {
    public component!: DropdownInputFieldComponentDefinitionOutline;
    public model?: DropdownInputFieldModelDefinitionOutline;
    public layout?: AvailableFieldLayoutDefinitionOutlines;

    constructor() {
        super();
    }

    accept(visitor: FormConfigVisitorOutline) {
        visitor.visitDropdownInputFormComponentDefinition(this);
    }
}

export const DropdownInputMap = [
    {kind: FieldComponentConfigKind, def: DropdownInputFieldComponentConfig},
    {kind: FieldComponentDefinitionKind, def: DropdownInputFieldComponentDefinition, class: DropdownInputComponentName},
    {kind: FieldModelConfigKind, def: DropdownInputFieldModelConfig},
    {kind: FieldModelDefinitionKind, def: DropdownInputFieldModelDefinition, class: DropdownInputModelName},
    {kind: FormComponentDefinitionKind, def: DropdownInputFormComponentDefinition, class: DropdownInputComponentName},
];
export const DropdownInputDefaults = {
    [FormComponentDefinitionKind]: {
        [DropdownInputComponentName]: {
            [FieldComponentDefinitionKind]: DropdownInputComponentName,
            [FieldModelDefinitionKind]: DropdownInputModelName,
        },
    },
};
