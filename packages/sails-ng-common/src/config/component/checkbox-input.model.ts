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
    CheckboxInputComponentName,
    CheckboxInputFieldComponentConfigOutline,
    CheckboxInputFieldComponentDefinitionOutline, CheckboxInputFieldModelConfigOutline,
    CheckboxInputFieldModelDefinitionOutline,
    CheckboxInputFormComponentDefinitionOutline, CheckboxInputModelName, CheckboxInputModelValueType,
    CheckboxOption
} from "./checkbox-input.outline";

/* Checkbox Input Component */


export class CheckboxInputFieldComponentConfig extends FieldComponentConfig implements CheckboxInputFieldComponentConfigOutline {
    placeholder?: string;
    options: CheckboxOption[] = [];
    multipleValues?: boolean;
    vocabRef?: string;
    inlineVocab?: boolean;

    constructor() {
        super();
    }
}


export class CheckboxInputFieldComponentDefinition extends FieldComponentDefinition implements CheckboxInputFieldComponentDefinitionOutline {
    class = CheckboxInputComponentName;
    config?: CheckboxInputFieldComponentConfigOutline;

    constructor() {
        super();
    }

    accept(visitor: FormConfigVisitorOutline): void {
        visitor.visitCheckboxInputFieldComponentDefinition(this);
    }
}


/* Checkbox Input Model */


export class CheckboxInputFieldModelConfig extends FieldModelConfig<CheckboxInputModelValueType> implements CheckboxInputFieldModelConfigOutline {
    constructor() {
        super();
    }
}


export class CheckboxInputFieldModelDefinition extends FieldModelDefinition<CheckboxInputModelValueType> implements CheckboxInputFieldModelDefinitionOutline {
    class = CheckboxInputModelName;
    config?: CheckboxInputFieldModelConfigOutline;

    constructor() {
        super();
    }

    accept(visitor: FormConfigVisitorOutline): void {
        visitor.visitCheckboxInputFieldModelDefinition(this);
    }
}

/* Checkbox Input Form Component */

export class CheckboxInputFormComponentDefinition extends FormComponentDefinition implements CheckboxInputFormComponentDefinitionOutline {
    public component!: CheckboxInputFieldComponentDefinitionOutline;
    public model?: CheckboxInputFieldModelDefinitionOutline;
    public layout?: AvailableFieldLayoutDefinitionOutlines;

    constructor() {
        super();
    }

    accept(visitor: FormConfigVisitorOutline) {
        visitor.visitCheckboxInputFormComponentDefinition(this);
    }
}

export const CheckboxInputMap = [
    {kind: FieldComponentConfigKind, def: CheckboxInputFieldComponentConfig},
    {kind: FieldComponentDefinitionKind, def: CheckboxInputFieldComponentDefinition, class: CheckboxInputComponentName},
    {kind: FieldModelConfigKind, def: CheckboxInputFieldModelConfig},
    {kind: FieldModelDefinitionKind, def: CheckboxInputFieldModelDefinition, class: CheckboxInputModelName},
    {kind: FormComponentDefinitionKind, def: CheckboxInputFormComponentDefinition, class: CheckboxInputComponentName},
];
export const CheckboxInputDefaults = {
    [FormComponentDefinitionKind]: {
        [CheckboxInputComponentName]: {
            [FieldComponentDefinitionKind]: CheckboxInputComponentName,
            [FieldModelDefinitionKind]: CheckboxInputModelName,
        }
    }
};
