import {
    FieldModelConfig,
    FieldModelConfigFrame,
    FieldModelDefinition,
    FieldModelDefinitionFrame,
    FormComponentDefinition,
    FormComponentDefinitionFrame,
    FieldComponentConfigFrame, FieldComponentDefinitionFrame,
    FieldComponentConfigKind,
    FieldComponentDefinitionKind,
    FieldModelConfigKind,
    FieldModelDefinitionKind, DefaultFieldLayoutDefinitionFrame, DefaultFieldLayoutDefinition,
    FormComponentDefinitionKind,
    FieldComponentConfig, FieldComponentDefinition,
     FormConfigItemVisitor, AvailableFormComponentDefinitionFrames,
    AvailableFormComponentDefinitions
} from "../../";


/* Group Component */
export const GroupFieldComponentName = "GroupComponent" as const;
export type GroupFieldComponentNameType = typeof GroupFieldComponentName;

export interface GroupFieldComponentConfigFrame extends FieldComponentConfigFrame {
    componentDefinitions: AvailableFormComponentDefinitionFrames[];
}

export class GroupFieldComponentConfig extends FieldComponentConfig implements GroupFieldComponentConfigFrame {
    componentDefinitions: AvailableFormComponentDefinitions[];

    constructor(data?: GroupFieldComponentConfigFrame, componentDefinitions?: AvailableFormComponentDefinitions[]) {
        super(data);
        this.componentDefinitions = componentDefinitions ?? [];
    }
}

export interface GroupFieldComponentDefinitionFrame extends FieldComponentDefinitionFrame {
    class: GroupFieldComponentNameType;
    config?: GroupFieldComponentConfigFrame;
}

export class GroupFieldComponentDefinition extends FieldComponentDefinition implements GroupFieldComponentDefinitionFrame {
    class = GroupFieldComponentName;
    config?: GroupFieldComponentConfig;

    constructor(data: GroupFieldComponentDefinitionFrame) {
        super(data);
        this.config = new GroupFieldComponentConfig(data.config);
    }

    accept(visitor: FormConfigItemVisitor): void {
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
    constructor(data?: GroupFieldModelConfigFrame) {
        super(data);
    }
}

export interface GroupFieldModelDefinitionFrame extends FieldModelDefinitionFrame<GroupFieldModelValueType> {
    class: GroupFieldModelNameType;
    config?: GroupFieldModelConfigFrame;
}

export class GroupFieldModelDefinition extends FieldModelDefinition<GroupFieldModelValueType> implements GroupFieldModelDefinitionFrame {
    class = GroupFieldModelName;
    config: GroupFieldModelConfig;

    constructor(data?: FieldModelDefinitionFrame<GroupFieldModelValueType>) {
        super(data ?? {class: GroupFieldModelName});
        this.config = new GroupFieldModelConfig(data?.config);
    }

    accept(visitor: FormConfigItemVisitor): void {
        visitor.visitGroupFieldModelDefinition(this);
    }
}

/* Group Form Component */
export interface GroupFormComponentDefinitionFrame extends FormComponentDefinitionFrame {
    component: GroupFieldComponentDefinitionFrame;
    model?: GroupFieldModelDefinitionFrame;
    layout?: DefaultFieldLayoutDefinitionFrame;
}

export class GroupFormComponentDefinition extends FormComponentDefinition implements GroupFormComponentDefinitionFrame {
    public component: GroupFieldComponentDefinition;
    public model?: GroupFieldModelDefinition;
    public layout?: DefaultFieldLayoutDefinition;

    constructor(data: GroupFormComponentDefinitionFrame) {
        super(data);
        this.component = new GroupFieldComponentDefinition(data.component);
        this.model = new GroupFieldModelDefinition(data.model);
        this.layout = new DefaultFieldLayoutDefinition(data.layout);
    }

    accept(visitor: FormConfigItemVisitor) {
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