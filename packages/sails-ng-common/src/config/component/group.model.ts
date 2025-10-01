import {FieldComponentConfig, FieldComponentDefinition} from "../field-component.model";
import {FieldModelConfig, FieldModelDefinition} from "../field-model.model";
import {FormComponentDefinition,} from "../form-component.model";
import {FormConfigVisitorOutline} from "../visitor/base.outline";
import {
    FieldComponentConfigKind,
    FieldComponentDefinitionKind,
    FieldModelConfigKind,
    FieldModelDefinitionKind,
    FormComponentDefinitionKind
} from "../shared.outline";
import {
    GroupFieldComponentConfigOutline,
    GroupFieldComponentDefinitionOutline,
    GroupFieldComponentName,
    GroupFieldModelConfigOutline,
    GroupFieldModelDefinitionOutline,
    GroupFieldModelName,
    GroupFieldModelValueType,
    GroupFormComponentDefinitionOutline,
} from "./group.outline";
import {
    AllFormComponentDefinitionOutlines,
    AvailableFieldLayoutDefinitionOutlines, AvailableFormComponentDefinitionOutlines
} from "../dictionary.outline";
import {FormComponentDefinitionOutline} from "../form-component.outline";


/* Group Component */

export class GroupFieldComponentConfig extends FieldComponentConfig implements GroupFieldComponentConfigOutline {
    componentDefinitions: AvailableFormComponentDefinitionOutlines[];

    constructor() {
        super();
        this.componentDefinitions = [];
    }
}


export class GroupFieldComponentDefinition extends FieldComponentDefinition implements GroupFieldComponentDefinitionOutline {
    class = GroupFieldComponentName;
    config?: GroupFieldComponentConfigOutline;

    constructor() {
        super();
    }

    accept(visitor: FormConfigVisitorOutline): void {
        visitor.visitGroupFieldComponentDefinition(this);
    }
}


/* Group Model */

export class GroupFieldModelConfig extends FieldModelConfig<GroupFieldModelValueType> implements GroupFieldModelConfigOutline {
    constructor() {
        super();
    }
}


export class GroupFieldModelDefinition extends FieldModelDefinition<GroupFieldModelValueType> implements GroupFieldModelDefinitionOutline {
    class = GroupFieldModelName;
    config?: GroupFieldModelConfigOutline;

    constructor() {
        super();
    }

    get children(): AllFormComponentDefinitionOutlines[] {
        throw new Error("Method not implemented.");
    }

    accept(visitor: FormConfigVisitorOutline): void {
        visitor.visitGroupFieldModelDefinition(this);
    }
}

/* Group Form Component */

export class GroupFormComponentDefinition extends FormComponentDefinition implements GroupFormComponentDefinitionOutline {
    public component!: GroupFieldComponentDefinitionOutline;
    public model?: GroupFieldModelDefinitionOutline;
    public layout?: AvailableFieldLayoutDefinitionOutlines;

    constructor() {
        super();
    }

    accept(visitor: FormConfigVisitorOutline) {
        visitor.visitGroupFormComponentDefinition(this);
    }
}

export const GroupMap = [
    {kind: FieldComponentConfigKind, def: GroupFieldComponentConfig},
    {kind: FieldComponentDefinitionKind, def: GroupFieldComponentDefinition, class: GroupFieldComponentName},
    {kind: FieldModelConfigKind, def: GroupFieldModelConfig},
    {kind: FieldModelDefinitionKind, def: GroupFieldModelDefinition, class: GroupFieldModelName},
    {kind: FormComponentDefinitionKind, def: GroupFormComponentDefinition, class: GroupFieldComponentName},
];
