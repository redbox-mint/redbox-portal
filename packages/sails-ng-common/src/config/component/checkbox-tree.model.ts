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
    CheckboxTreeComponentName,
    CheckboxTreeFieldComponentConfigOutline,
    CheckboxTreeFieldComponentDefinitionOutline,
    CheckboxTreeFieldModelConfigOutline,
    CheckboxTreeFieldModelDefinitionOutline,
    CheckboxTreeFormComponentDefinitionOutline,
    CheckboxTreeModelName,
    CheckboxTreeModelValueType,
    CheckboxTreeNode
} from "./checkbox-tree.outline";

/* Checkbox Tree Component */

export class CheckboxTreeFieldComponentConfig extends FieldComponentConfig implements CheckboxTreeFieldComponentConfigOutline {
    vocabRef?: string;
    inlineVocab?: boolean;
    treeData: CheckboxTreeNode[] = [];
    leafOnly?: boolean;
    maxDepth?: number;
    labelTemplate?: string;

    constructor() {
        super();
    }
}

export class CheckboxTreeFieldComponentDefinition extends FieldComponentDefinition implements CheckboxTreeFieldComponentDefinitionOutline {
    class = CheckboxTreeComponentName;
    config?: CheckboxTreeFieldComponentConfigOutline;

    constructor() {
        super();
    }

    accept(visitor: FormConfigVisitorOutline): void {
        visitor.visitCheckboxTreeFieldComponentDefinition(this);
    }
}

/* Checkbox Tree Model */

export class CheckboxTreeFieldModelConfig extends FieldModelConfig<CheckboxTreeModelValueType> implements CheckboxTreeFieldModelConfigOutline {
    constructor() {
        super();
    }
}

export class CheckboxTreeFieldModelDefinition extends FieldModelDefinition<CheckboxTreeModelValueType> implements CheckboxTreeFieldModelDefinitionOutline {
    class = CheckboxTreeModelName;
    config?: CheckboxTreeFieldModelConfigOutline;

    constructor() {
        super();
    }

    accept(visitor: FormConfigVisitorOutline): void {
        visitor.visitCheckboxTreeFieldModelDefinition(this);
    }
}

/* Checkbox Tree Form Component */

export class CheckboxTreeFormComponentDefinition extends FormComponentDefinition implements CheckboxTreeFormComponentDefinitionOutline {
    public component!: CheckboxTreeFieldComponentDefinitionOutline;
    public model?: CheckboxTreeFieldModelDefinitionOutline;
    public layout?: AvailableFieldLayoutDefinitionOutlines;

    constructor() {
        super();
    }

    accept(visitor: FormConfigVisitorOutline) {
        visitor.visitCheckboxTreeFormComponentDefinition(this);
    }
}

export const CheckboxTreeMap = [
    {kind: FieldComponentConfigKind, def: CheckboxTreeFieldComponentConfig},
    {kind: FieldComponentDefinitionKind, def: CheckboxTreeFieldComponentDefinition, class: CheckboxTreeComponentName},
    {kind: FieldModelConfigKind, def: CheckboxTreeFieldModelConfig},
    {kind: FieldModelDefinitionKind, def: CheckboxTreeFieldModelDefinition, class: CheckboxTreeModelName},
    {kind: FormComponentDefinitionKind, def: CheckboxTreeFormComponentDefinition, class: CheckboxTreeComponentName},
];
export const CheckboxTreeDefaults = {
    [FormComponentDefinitionKind]: {
        [CheckboxTreeComponentName]: {
            [FieldComponentDefinitionKind]: CheckboxTreeComponentName,
            [FieldModelDefinitionKind]: CheckboxTreeModelName,
        }
    }
};
