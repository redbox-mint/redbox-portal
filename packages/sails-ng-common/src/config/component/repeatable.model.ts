import {
    FieldComponentConfig,
    FieldComponentConfigFrame, FieldComponentDefinition, FieldComponentDefinitionFrame,
    FieldLayoutConfig,
    FieldLayoutConfigFrame,
    FieldLayoutDefinition,
    FieldModelConfig,
    FieldModelConfigFrame,
    FieldModelDefinition, FieldModelDefinitionFrame,
    FormComponentDefinition, FormComponentDefinitionFrame, HasChildren,
    FormComponentDefinitionKind, FieldComponentConfigKind,
    FieldComponentDefinitionKind, FieldLayoutDefinitionKind, FieldModelConfigKind,
    FieldModelDefinitionKind, DefaultFieldLayoutDefinitionFrame, DefaultFieldLayoutDefinition,
    FieldLayoutConfigKind,
FormConfigItemVisitor
} from "../..";
import {AvailableFormComponentDefinitionFrames} from "../..";
import {AvailableFormComponentDefinitions} from "../..";


/* Repeatable Component */
export const RepeatableComponentName = `RepeatableComponent` as const;
export type RepeatableComponentNameType = typeof RepeatableComponentName;
export interface RepeatableFieldComponentConfigFrame extends FieldComponentConfigFrame {
    elementTemplate?: AvailableFormComponentDefinitionFrames;
}

export class RepeatableFieldComponentConfig extends FieldComponentConfig implements RepeatableFieldComponentConfigFrame {
    elementTemplate?: AvailableFormComponentDefinitions;

    constructor(data?: RepeatableFieldComponentConfigFrame, elementTemplate?: AvailableFormComponentDefinitions) {
        super(data);
        this.elementTemplate = elementTemplate;
    }
}

export interface RepeatableFieldComponentDefinitionFrame extends FieldComponentDefinitionFrame {
    class: RepeatableComponentNameType;
    config?: RepeatableFieldComponentConfigFrame
}


export class RepeatableFieldComponentDefinition extends FieldComponentDefinition implements RepeatableFieldComponentDefinitionFrame, HasChildren {
    class = RepeatableComponentName;
    config?: RepeatableFieldComponentConfig;

    constructor(data: RepeatableFieldComponentDefinitionFrame) {
        super(data);
        this.config = new RepeatableFieldComponentConfig(data?.config);
    }

    get children(): FormComponentDefinition[] {
        throw new Error("Method not implemented.");
    }

    accept(visitor: FormConfigItemVisitor) {
        visitor.visitRepeatableFieldComponentDefinition(this);
    }
}


/* Repeatable Model */
export const RepeatableModelName = `RepeatableModel` as const;
export type RepeatableModelNameType = typeof RepeatableModelName;
export type RepeatableModelValueType = unknown[];

export interface RepeatableFieldModelConfigFrame extends FieldModelConfigFrame<RepeatableModelValueType> {
    // TODO: Migrate JSON configurable properties from `RepeatableContainer`
}

export class RepeatableFieldModelConfig extends FieldModelConfig<RepeatableModelValueType> {
    constructor(data?: RepeatableFieldModelConfigFrame) {
        super(data);
    }
}

export interface RepeatableFieldModelDefinitionFrame extends FieldModelDefinitionFrame<RepeatableModelValueType> {
    class: RepeatableModelNameType;
    config?: RepeatableFieldModelConfigFrame
    // TODO: Migrate properties from `RepeatableContainer`
}



export class RepeatableFieldModelDefinition extends FieldModelDefinition<RepeatableModelValueType> implements RepeatableFieldModelDefinitionFrame {
    class = RepeatableModelName;
    config?: RepeatableFieldModelConfig;

    constructor(data?: RepeatableFieldModelDefinitionFrame) {
        super(data ?? {class: RepeatableModelName});
        this.config = new RepeatableFieldModelConfig(data?.config);
    }

    accept(visitor: FormConfigItemVisitor) {
        visitor.visitRepeatableFieldModelDefinition(this);
    }
}


/* Repeatable Element Layout */
export const RepeatableElementLayoutName = `RepeatableElementLayout` as const;
export type RepeatableElementLayoutNameType = typeof RepeatableElementLayoutName;
export interface RepeatableElementFieldLayoutConfigFrame extends FieldLayoutConfigFrame {
}

export class RepeatableElementFieldLayoutConfig extends FieldLayoutConfig implements RepeatableElementFieldLayoutConfigFrame {
    constructor(data?: RepeatableElementFieldLayoutConfigFrame) {
        super(data);
    }
}

export interface RepeatableElementFieldLayoutDefinitionFrame extends FieldLayoutDefinition {
    class: RepeatableElementLayoutNameType;
    config?: RepeatableElementFieldLayoutConfig;
}


export class RepeatableElementFieldLayoutDefinition extends FieldLayoutDefinition implements RepeatableElementFieldLayoutDefinitionFrame {
    class = RepeatableElementLayoutName;
    config?: RepeatableElementFieldLayoutConfig;

    constructor(data: RepeatableElementFieldLayoutDefinitionFrame) {
        super(data);
        this.config = new RepeatableElementFieldLayoutConfig(data?.config);
    }

    accept(visitor: FormConfigItemVisitor) {
        visitor.visitRepeatableElementFieldLayoutDefinition(this);
    }
}


/* Repeatable Form Component */
export interface RepeatableFormComponentDefinitionFrame extends FormComponentDefinitionFrame {
    component: RepeatableFieldComponentDefinitionFrame;
    model?: RepeatableFieldModelDefinitionFrame;
    layout?: DefaultFieldLayoutDefinitionFrame;
}

export class RepeatableFormComponentDefinition extends FormComponentDefinition {
    public component: RepeatableFieldComponentDefinition;
    public model?: RepeatableFieldModelDefinition;
    public layout?: DefaultFieldLayoutDefinition;

    constructor(data: RepeatableFormComponentDefinitionFrame) {
        super(data);
        this.name = data.name;
        this.component = new RepeatableFieldComponentDefinition(data.component);
        this.model = new RepeatableFieldModelDefinition(data.model);
        this.layout = new DefaultFieldLayoutDefinition(data.layout);
    }

    accept(visitor: FormConfigItemVisitor) {
        visitor.visitRepeatableFormComponentDefinition(this);
    }
}

export const RepeatableMap = [
    {kind: FieldComponentConfigKind, def: RepeatableFieldComponentConfig},
    {kind: FieldComponentDefinitionKind, def: RepeatableFieldComponentDefinition, class: RepeatableComponentName},
    {kind: FieldModelConfigKind, def: RepeatableFieldModelConfig},
    {kind: FieldModelDefinitionKind, def: RepeatableFieldModelDefinition, class: RepeatableModelName},
    {kind: FieldLayoutConfigKind, def: RepeatableElementFieldLayoutConfig,},
    {kind: FieldLayoutDefinitionKind,def: RepeatableElementFieldLayoutDefinition,class: RepeatableElementLayoutName},
    {kind: FormComponentDefinitionKind, def: RepeatableFormComponentDefinition},
];
export type RepeatableFrames =
    RepeatableFieldComponentConfigFrame |
    RepeatableFieldComponentDefinitionFrame |
    RepeatableFieldModelConfigFrame |
    RepeatableFieldModelDefinitionFrame |
    RepeatableElementFieldLayoutConfigFrame |
    RepeatableElementFieldLayoutDefinitionFrame |
    RepeatableFormComponentDefinitionFrame;
