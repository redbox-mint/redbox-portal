import {FieldModelConfig, FieldModelDefinition} from "../field-model.model";
import {FormComponentDefinition} from "../form-component.model";
import {FormConfigVisitorOutline} from "../visitor/base.outline";
import {
    FieldComponentConfigKind,
    FieldComponentDefinitionKind,
    FieldModelConfigKind,
    FieldModelDefinitionKind,
    FormComponentDefinitionKind
} from "../shared.outline";
import {FieldComponentConfig, FieldComponentDefinition} from "../field-component.model";
import {AvailableFieldLayoutDefinitionOutlines} from "../dictionary.outline";
import {
    TypeaheadInputComponentName,
    TypeaheadInputFieldComponentConfigOutline,
    TypeaheadInputFieldComponentDefinitionOutline,
    TypeaheadInputFieldModelConfigOutline,
    TypeaheadInputFieldModelDefinitionOutline,
    TypeaheadInputFormComponentDefinitionOutline,
    TypeaheadInputModelName,
    TypeaheadInputModelValueType,
    TypeaheadOption
} from "./typeahead-input.outline";

/* Typeahead Input Component */

export class TypeaheadInputFieldComponentConfig extends FieldComponentConfig implements TypeaheadInputFieldComponentConfigOutline {
    sourceType: "static" | "vocabulary" | "namedQuery" = "static";
    staticOptions: TypeaheadOption[] = [];
    vocabRef?: string;
    queryId?: string;
    labelField?: string;
    labelTemplate?: string;
    valueField?: string;
    minChars = 2;
    debounceMs = 250;
    maxResults = 25;
    allowFreeText = false;
    valueMode: "value" | "optionObject" = "value";
    cacheResults = true;
    multiSelect = false;
    placeholder?: string;
    readOnlyAfterSelect?: boolean;

    constructor() {
        super();
    }
}

export class TypeaheadInputFieldComponentDefinition extends FieldComponentDefinition implements TypeaheadInputFieldComponentDefinitionOutline {
    class = TypeaheadInputComponentName;
    config?: TypeaheadInputFieldComponentConfigOutline;

    constructor() {
        super();
    }

    accept(visitor: FormConfigVisitorOutline): void {
        visitor.visitTypeaheadInputFieldComponentDefinition(this);
    }
}

/* Typeahead Input Model */

export class TypeaheadInputFieldModelConfig extends FieldModelConfig<TypeaheadInputModelValueType> implements TypeaheadInputFieldModelConfigOutline {
    constructor() {
        super();
    }
}

export class TypeaheadInputFieldModelDefinition extends FieldModelDefinition<TypeaheadInputModelValueType> implements TypeaheadInputFieldModelDefinitionOutline {
    class = TypeaheadInputModelName;
    config?: TypeaheadInputFieldModelConfigOutline;

    constructor() {
        super();
    }

    accept(visitor: FormConfigVisitorOutline): void {
        visitor.visitTypeaheadInputFieldModelDefinition(this);
    }
}

/* Typeahead Input Form Component */

export class TypeaheadInputFormComponentDefinition extends FormComponentDefinition implements TypeaheadInputFormComponentDefinitionOutline {
    public component!: TypeaheadInputFieldComponentDefinitionOutline;
    public model?: TypeaheadInputFieldModelDefinitionOutline;
    public layout?: AvailableFieldLayoutDefinitionOutlines;

    constructor() {
        super();
    }

    accept(visitor: FormConfigVisitorOutline) {
        visitor.visitTypeaheadInputFormComponentDefinition(this);
    }
}

export const TypeaheadInputMap = [
    {kind: FieldComponentConfigKind, def: TypeaheadInputFieldComponentConfig},
    {kind: FieldComponentDefinitionKind, def: TypeaheadInputFieldComponentDefinition, class: TypeaheadInputComponentName},
    {kind: FieldModelConfigKind, def: TypeaheadInputFieldModelConfig},
    {kind: FieldModelDefinitionKind, def: TypeaheadInputFieldModelDefinition, class: TypeaheadInputModelName},
    {kind: FormComponentDefinitionKind, def: TypeaheadInputFormComponentDefinition, class: TypeaheadInputComponentName},
];

export const TypeaheadInputDefaults = {
    [FormComponentDefinitionKind]: {
        [TypeaheadInputComponentName]: {
            [FieldComponentDefinitionKind]: TypeaheadInputComponentName,
            [FieldModelDefinitionKind]: TypeaheadInputModelName,
        },
    },
};
