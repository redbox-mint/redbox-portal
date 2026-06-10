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
import {
    AvailableFieldLayoutDefinitionOutlines,
    AvailableFormComponentDefinitionOutlines
} from "../dictionary.outline";
import {
    EditTableColumnConfig,
    EditTableComponentName,
    EditTableFieldComponentConfigOutline,
    EditTableFieldComponentDefinitionOutline,
    EditTableFieldModelConfigOutline,
    EditTableFieldModelDefinitionOutline,
    EditTableFormComponentDefinitionOutline,
    EditTableModelName,
    EditTableModelValueType
} from "./edit-table.outline";

/* EditTable Component */

export class EditTableFieldComponentConfig extends FieldComponentConfig implements EditTableFieldComponentConfigOutline {
    componentDefinitions: AvailableFormComponentDefinitionOutlines[];
    columns: EditTableColumnConfig[];
    addButtonLabel?: string;
    editButtonLabel?: string;
    deleteButtonLabel?: string;
    dialogAddTitle?: string;
    dialogEditTitle?: string;
    dialogSaveLabel?: string;
    dialogCancelLabel?: string;
    confirmDelete = false;
    emptyMessage?: string;
    maxRows?: number;

    constructor() {
        super();
        this.componentDefinitions = [];
        this.columns = [];
    }
}

export class EditTableFieldComponentDefinition extends FieldComponentDefinition implements EditTableFieldComponentDefinitionOutline {
    class = EditTableComponentName;
    config?: EditTableFieldComponentConfigOutline;

    constructor() {
        super();
    }

    async accept(visitor: FormConfigVisitorOutline) {
        await visitor.visitEditTableFieldComponentDefinition(this);
    }
}

/* EditTable Model */

export class EditTableFieldModelConfig extends FieldModelConfig<EditTableModelValueType> implements EditTableFieldModelConfigOutline {
    constructor() {
        super();
    }
}

export class EditTableFieldModelDefinition extends FieldModelDefinition<EditTableModelValueType> implements EditTableFieldModelDefinitionOutline {
    class = EditTableModelName;
    config?: EditTableFieldModelConfigOutline;

    constructor() {
        super();
    }

    async accept(visitor: FormConfigVisitorOutline) {
        await visitor.visitEditTableFieldModelDefinition(this);
    }
}

/* EditTable Form Component */

export class EditTableFormComponentDefinition extends FormComponentDefinition implements EditTableFormComponentDefinitionOutline {
    public component!: EditTableFieldComponentDefinitionOutline;
    public model?: EditTableFieldModelDefinitionOutline;
    public layout?: AvailableFieldLayoutDefinitionOutlines;

    constructor() {
        super();
    }

    async accept(visitor: FormConfigVisitorOutline) {
        await visitor.visitEditTableFormComponentDefinition(this);
    }
}

export const EditTableMap = [
    {kind: FieldComponentConfigKind, def: EditTableFieldComponentConfig},
    {kind: FieldComponentDefinitionKind, def: EditTableFieldComponentDefinition, class: EditTableComponentName},
    {kind: FieldModelConfigKind, def: EditTableFieldModelConfig},
    {kind: FieldModelDefinitionKind, def: EditTableFieldModelDefinition, class: EditTableModelName},
    {kind: FormComponentDefinitionKind, def: EditTableFormComponentDefinition, class: EditTableComponentName},
];
export const EditTableDefaults = {
    [FormComponentDefinitionKind]: {
        [EditTableComponentName]: {
            [FieldComponentDefinitionKind]: EditTableComponentName,
            [FieldModelDefinitionKind]: EditTableModelName,
        }
    }
};
