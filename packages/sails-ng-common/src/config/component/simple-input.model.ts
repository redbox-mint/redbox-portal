
import {    FieldModelConfig,    FieldModelDefinition} from "../field-model.model";
import {FormComponentDefinition} from "../form-component.model";
import {FormConfigVisitorOutline} from "../visitor/base.outline";
import {
    FieldComponentConfigKind,
    FieldComponentDefinitionKind,
    FieldModelConfigKind,
    FieldModelDefinitionKind, FormComponentDefinitionKind
} from "../shared.outline";
import {
    SimpleInputComponentName,
    SimpleInputFieldComponentConfigOutline,
    SimpleInputFieldComponentConfigType,
    SimpleInputFieldComponentDefinitionOutline,
    SimpleInputFieldModelConfigOutline,
    SimpleInputFieldModelDefinitionOutline,
    SimpleInputFormComponentDefinitionOutline,
    SimpleInputModelName,
    SimpleInputModelValueType
} from "./simple-input.outline";
import {FieldComponentConfig, FieldComponentDefinition} from "../field-component.model";
import {AvailableFieldLayoutDefinitionOutlines} from "../dictionary.outline";


/* Simple Input Component */


export class SimpleInputFieldComponentConfig extends FieldComponentConfig implements SimpleInputFieldComponentConfigOutline {
    type: SimpleInputFieldComponentConfigType = "text";

    constructor() {
        super();
    }
}


export class SimpleInputFieldComponentDefinition extends FieldComponentDefinition implements SimpleInputFieldComponentDefinitionOutline {
    class = SimpleInputComponentName;
    config?: SimpleInputFieldComponentConfigOutline;

    constructor() {
        super();
    }

    accept(visitor: FormConfigVisitorOutline): void {
        visitor.visitSimpleInputFieldComponentDefinition(this);
    }
}


/* Simple Input Model */


export class SimpleInputFieldModelConfig extends FieldModelConfig<SimpleInputModelValueType> implements SimpleInputFieldModelConfigOutline {
    constructor() {
        super();
    }
}


export class SimpleInputFieldModelDefinition extends FieldModelDefinition<SimpleInputModelValueType> implements SimpleInputFieldModelDefinitionOutline {
    class = SimpleInputModelName;
    config?: SimpleInputFieldModelConfigOutline;

    constructor() {
        super();
    }

    accept(visitor: FormConfigVisitorOutline): void {
        visitor.visitSimpleInputFieldModelDefinition(this);
    }
}

/* Simple Input Form Component */

export class SimpleInputFormComponentDefinition extends FormComponentDefinition implements SimpleInputFormComponentDefinitionOutline {
    public component!: SimpleInputFieldComponentDefinitionOutline;
    public model?: SimpleInputFieldModelDefinitionOutline;
    public layout?: AvailableFieldLayoutDefinitionOutlines;

    constructor() {
        super();
    }

    accept(visitor: FormConfigVisitorOutline) {
        visitor.visitSimpleInputFormComponentDefinition(this);
    }
}

export const SimpleInputMap = [
    {kind: FieldComponentConfigKind, def: SimpleInputFieldComponentConfig},
    {kind: FieldComponentDefinitionKind, def: SimpleInputFieldComponentDefinition, class: SimpleInputComponentName},
    {kind: FieldModelConfigKind, def: SimpleInputFieldModelConfig},
    {kind: FieldModelDefinitionKind, def: SimpleInputFieldModelDefinition, class: SimpleInputModelName},
    {kind: FormComponentDefinitionKind, def: SimpleInputFormComponentDefinition, class:SimpleInputComponentName},
];
