import {
    FormFieldModelConfig,
    FormFieldModelConfigFrame,
    FormFieldModelDefinition,
    FormFieldModelDefinitionFrame,
    FormComponentDefinition,
    FormComponentDefinitionFrame,
    BaseFormFieldComponentConfig, BaseFormFieldComponentConfigFrame,
    BaseFormFieldComponentDefinition,
    FormFieldComponentConfigFrame, FormFieldComponentDefinitionFrame,
    FormFieldComponentConfigKind,
    FormFieldComponentDefinitionKind,
    FormFieldModelConfigKind,
    FormFieldModelDefinitionKind, DefaultFormFieldLayoutDefinitionFrame, DefaultFormFieldLayoutDefinition,
    FormComponentDefinitionKind
} from "..";
import {FormConfigItemVisitor} from "../visitor";


/* Group Component */
export interface GroupFormFieldComponentConfigFrame extends FormFieldComponentConfigFrame {
    componentDefinitions?: FormComponentDefinitionFrame[];
}

export class GroupFormFieldComponentConfig extends BaseFormFieldComponentConfig implements GroupFormFieldComponentConfigFrame {
    componentDefinitions?: FormComponentDefinition[];

    constructor(data?: BaseFormFieldComponentConfigFrame) {
        super(data);
    }
}

export interface GroupFormFieldComponentDefinitionFrame extends FormFieldComponentDefinitionFrame {
}

export const GroupFieldComponentName = "GroupFieldComponent" as const;

export class GroupFormFieldComponentDefinition extends BaseFormFieldComponentDefinition implements GroupFormFieldComponentDefinitionFrame {
    class = GroupFieldComponentName;
    config?: GroupFormFieldComponentConfig;

    constructor(data: GroupFormFieldComponentDefinitionFrame) {
        super(data);
        this.config = new GroupFormFieldComponentConfig(data.config);
    }

    accept(visitor: FormConfigItemVisitor): void {
        visitor.visitGroupFormFieldComponentDefinition(this);
    }
}


/* Group Model */
export type GroupFieldModelValueType = Record<string, unknown>;

export interface GroupFormFieldModelConfigFrame extends FormFieldModelConfigFrame<GroupFieldModelValueType> {
}

export class GroupFormFieldModelConfig extends FormFieldModelConfig<GroupFieldModelValueType> implements GroupFormFieldModelConfigFrame {
    constructor(data?: FormFieldModelConfigFrame<GroupFieldModelValueType>) {
        super(data);
    }
}

export interface GroupFormFieldModelDefinitionFrame extends FormFieldModelDefinitionFrame<GroupFieldModelValueType> {
}

export const GroupFieldModelName = "GroupFieldModel" as const;

export class GroupFormFieldModelDefinition extends FormFieldModelDefinition<GroupFieldModelValueType> implements GroupFormFieldModelDefinitionFrame {
    class = GroupFieldModelName;
    config: GroupFormFieldModelConfig;

    constructor(data?: FormFieldModelDefinitionFrame<GroupFieldModelValueType>) {
        super(data ?? {class: GroupFieldModelName});
        this.config = new GroupFormFieldModelConfig(data?.config);
    }

    accept(visitor: FormConfigItemVisitor): void {
        visitor.visitGroupFormFieldModelDefinition(this);
    }
}

/* Group Form Component */
export interface GroupFormComponentDefinitionFrame extends FormComponentDefinitionFrame {
    component: GroupFormFieldComponentDefinitionFrame;
    model?: GroupFormFieldModelDefinitionFrame;
    layout?: DefaultFormFieldLayoutDefinitionFrame;
}

export class GroupFormComponentDefinition extends FormComponentDefinition {
    public component: GroupFormFieldComponentDefinition;
    public model?: GroupFormFieldModelDefinition;
    public layout?: DefaultFormFieldLayoutDefinition;

    constructor(data: GroupFormComponentDefinitionFrame) {
        super(data);
        this.name = data.name;
        this.component = new GroupFormFieldComponentDefinition(data.component);
        this.model = new GroupFormFieldModelDefinition(data.model);
        this.layout = new DefaultFormFieldLayoutDefinition(data.layout);
    }

    accept(visitor: FormConfigItemVisitor) {
        visitor.visitGroupFormComponentDefinition(this);
    }
}

export const GroupMap = [
    {kind: FormFieldComponentConfigKind, def: GroupFormFieldComponentConfig},
    {kind: FormFieldComponentDefinitionKind, def: GroupFormFieldComponentDefinition, class: GroupFieldComponentName},
    {kind: FormFieldModelConfigKind, def: GroupFormFieldModelConfig},
    {kind: FormFieldModelDefinitionKind, def: GroupFormFieldModelDefinition, class: GroupFieldModelName},
    {kind: FormComponentDefinitionKind, def: GroupFormComponentDefinition},
];
export type GroupFrames =
    GroupFormFieldComponentConfigFrame |
    GroupFormFieldComponentDefinitionFrame |
    GroupFormFieldModelConfigFrame |
    GroupFormFieldModelDefinitionFrame;