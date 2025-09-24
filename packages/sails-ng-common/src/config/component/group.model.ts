import {
    FieldComponentConfig,
    FieldComponentConfigFrame,
    FieldComponentDefinition,
    FieldComponentDefinitionFrame
} from "../field-component.model";
import {
    AvailableFieldLayoutDefinitionFrames, AvailableFieldLayoutDefinitions,
    AvailableFormComponentDefinitionFrames,
    AvailableFormComponentDefinitions
} from "../static-types-classes.dictionary";
import {
    FieldModelConfig,
    FieldModelConfigFrame,
    FieldModelDefinition,
    FieldModelDefinitionFrame
} from "../field-model.model";
import {FormComponentDefinition, FormComponentDefinitionFrame} from "../form-component.model";
import {
    FieldComponentConfigKind,
    FieldComponentDefinitionKind,
    FieldModelConfigKind,
    FieldModelDefinitionKind, FormComponentDefinitionKind
} from "../shared.model";
import {IFormConfigVisitor} from "../visitor/base.structure";


/* Group Component */
export const GroupFieldComponentName = "GroupComponent" as const;
export type GroupFieldComponentNameType = typeof GroupFieldComponentName;

export interface GroupFieldComponentConfigFrame extends FieldComponentConfigFrame {
    componentDefinitions: AvailableFormComponentDefinitionFrames[];
}

export class GroupFieldComponentConfig extends FieldComponentConfig implements GroupFieldComponentConfigFrame {
    componentDefinitions: AvailableFormComponentDefinitions[];

    constructor() {
        super();
        this.componentDefinitions = [];
    }
}

export interface GroupFieldComponentDefinitionFrame extends FieldComponentDefinitionFrame {
    class: GroupFieldComponentNameType;
    config?: GroupFieldComponentConfigFrame;
}

export class GroupFieldComponentDefinition extends FieldComponentDefinition implements GroupFieldComponentDefinitionFrame {
    class = GroupFieldComponentName;
    config?: GroupFieldComponentConfig;

    constructor() {
        super();
    }

    accept(visitor: IFormConfigVisitor): void {
        visitor.visitGroupFieldComponentDefinition(this);
    }
}


/* Group Model */
export const GroupFieldModelName = "GroupModel" as const;
export type GroupFieldModelNameType = typeof GroupFieldModelName;
export type GroupFieldModelValueType = Record<string, unknown>;

export interface GroupFieldModelConfigFrame extends FieldModelConfigFrame<GroupFieldModelValueType> {
}

export class GroupFieldModelConfig extends FieldModelConfig<GroupFieldModelValueType> implements GroupFieldModelConfigFrame {
    constructor() {
        super();
    }
}

export interface GroupFieldModelDefinitionFrame extends FieldModelDefinitionFrame<GroupFieldModelValueType> {
    class: GroupFieldModelNameType;
    config?: GroupFieldModelConfigFrame;
}

export class GroupFieldModelDefinition extends FieldModelDefinition<GroupFieldModelValueType> implements GroupFieldModelDefinitionFrame {
    class = GroupFieldModelName;
    config?: GroupFieldModelConfig;

    constructor() {
        super();
    }

    accept(visitor: IFormConfigVisitor): void {
        visitor.visitGroupFieldModelDefinition(this);
    }
}

/* Group Form Component */
export interface GroupFormComponentDefinitionFrame extends FormComponentDefinitionFrame {
    component: GroupFieldComponentDefinitionFrame;
    model?: GroupFieldModelDefinitionFrame;
    layout?: AvailableFieldLayoutDefinitionFrames;
}

export class GroupFormComponentDefinition extends FormComponentDefinition implements GroupFormComponentDefinitionFrame {
    public component: GroupFieldComponentDefinition;
    public model?: GroupFieldModelDefinition;
    public layout?: AvailableFieldLayoutDefinitions;

    constructor() {
        super();
        this.component = new GroupFieldComponentDefinition();
    }

    accept(visitor: IFormConfigVisitor) {
        visitor.visitGroupFormComponentDefinition(this);
    }
}

export const GroupMap = [
    {kind: FieldComponentConfigKind, def: GroupFieldComponentConfig},
    {kind: FieldComponentDefinitionKind, def: GroupFieldComponentDefinition, class: GroupFieldComponentName},
    {kind: FieldModelConfigKind, def: GroupFieldModelConfig},
    {kind: FieldModelDefinitionKind, def: GroupFieldModelDefinition, class: GroupFieldModelName},
    {kind: FormComponentDefinitionKind, def: GroupFormComponentDefinition},
];
export type GroupFrames =
    GroupFieldComponentConfigFrame |
    GroupFieldComponentDefinitionFrame |
    GroupFieldModelConfigFrame |
    GroupFieldModelDefinitionFrame |
    GroupFormComponentDefinitionFrame;