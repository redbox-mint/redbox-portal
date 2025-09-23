import {
    FormFieldComponentConfig,
    FormFieldComponentConfigFrame, FormFieldComponentDefinition, FormFieldComponentDefinitionFrame,
    FormFieldLayoutConfig,
    FormFieldLayoutConfigFrame,
    FormFieldLayoutDefinition,
    FormFieldModelConfig,
    FormFieldModelConfigFrame,
    FormFieldModelDefinition, FormFieldModelDefinitionFrame,
    FormComponentDefinition, FormComponentDefinitionFrame, HasChildren,
    FormComponentDefinitionKind, FormFieldComponentConfigKind,
    FormFieldComponentDefinitionKind, FormFieldLayoutDefinitionKind, FormFieldModelConfigKind,
    FormFieldModelDefinitionKind, DefaultFormFieldLayoutDefinitionFrame, DefaultFormFieldLayoutDefinition,
    FormComponentDefinitionFrameKind,
} from "..";
import {FormConfigItemVisitor} from "../visitor";


/* Repeatable Component */
export interface RepeatableFormFieldComponentConfigFrame extends FormFieldComponentConfigFrame {
    elementTemplate?: FormComponentDefinition;
}

export class RepeatableFormFieldComponentConfig extends FormFieldComponentConfig implements RepeatableFormFieldComponentConfigFrame {
    elementTemplate?: FormComponentDefinition;

    constructor(data?: RepeatableFormFieldComponentConfigFrame) {
        super(data);
        this.elementTemplate = data?.elementTemplate;
    }
}

export interface RepeatableFormFieldComponentDefinitionFrame extends FormFieldComponentDefinitionFrame {
}

export const RepeatableComponentName = `RepeatableComponent` as const;

export class RepeatableFormFieldComponentDefinition extends FormFieldComponentDefinition implements RepeatableFormFieldComponentDefinitionFrame, HasChildren {
    class = RepeatableComponentName;
    config?: RepeatableFormFieldComponentConfig;

    constructor(data: RepeatableFormFieldComponentDefinitionFrame) {
        super(data);
        this.config = new RepeatableFormFieldComponentConfig(data?.config);
    }

    get children(): FormComponentDefinition[] {
        throw new Error("Method not implemented.");
    }

    accept(visitor: FormConfigItemVisitor) {
        visitor.visitRepeatableFormFieldComponentDefinition(this);
    }
}


/* Repeatable Model */
export type RepeatableModelValueType = unknown[];

export interface RepeatableFormFieldModelConfigFrame extends FormFieldModelConfigFrame<RepeatableModelValueType> {
    // TODO: Migrate JSON configurable properties from `RepeatableContainer`
}

export class RepeatableFormFieldModelConfig extends FormFieldModelConfig<RepeatableModelValueType> {
    constructor(data?: RepeatableFormFieldModelConfigFrame) {
        super(data);
    }
}

export interface RepeatableFormFieldModelDefinitionFrame extends FormFieldModelDefinitionFrame<RepeatableModelValueType> {
    // TODO: Migrate properties from `RepeatableContainer`
}

export const RepeatableModelName = `RepeatableComponentModel` as const;

export class RepeatableFormFieldModelDefinition extends FormFieldModelDefinition<RepeatableModelValueType> implements RepeatableFormFieldModelDefinitionFrame {
    class = RepeatableModelName;
    config?: RepeatableFormFieldModelConfig;

    constructor(data?: RepeatableFormFieldModelDefinitionFrame) {
        super(data ?? {class:RepeatableModelName});
        this.config = new RepeatableFormFieldModelConfig(data?.config);
    }

    accept(visitor: FormConfigItemVisitor) {
        visitor.visitRepeatableFormFieldModelDefinition(this);
    }
}


/* Repeatable Element Layout */
export interface RepeatableElementFormFieldLayoutConfigFrame extends FormFieldLayoutConfigFrame {
}

export class RepeatableElementFormFieldLayoutConfig extends FormFieldLayoutConfig implements RepeatableElementFormFieldLayoutConfigFrame {
    constructor(data?: RepeatableElementFormFieldLayoutConfigFrame) {
        super(data);
    }
}

export interface RepeatableElementFormFieldLayoutDefinitionFrame extends FormFieldLayoutDefinition {

}

export const RepeatableElementLayoutComponentName = `RepeatableElementLayoutComponent` as const;

export class RepeatableElementFormFieldLayoutDefinition extends FormFieldLayoutDefinition implements RepeatableElementFormFieldLayoutDefinitionFrame {
    class = RepeatableElementLayoutComponentName;
    config?: RepeatableElementFormFieldLayoutConfig;

    constructor(data: RepeatableElementFormFieldLayoutDefinitionFrame) {
        super(data);
        this.config = new RepeatableElementFormFieldLayoutConfig(data?.config);
    }

    accept(visitor: FormConfigItemVisitor) {
        visitor.visitRepeatableElementFormFieldLayoutDefinition(this);
    }
}


/* Repeatable Form Component */
export interface RepeatableFormComponentDefinitionFrame extends FormComponentDefinitionFrame {
    component: RepeatableFormFieldComponentDefinitionFrame;
    model?: RepeatableFormFieldModelDefinitionFrame;
    layout?: DefaultFormFieldLayoutDefinitionFrame;
}

export class RepeatableFormComponentDefinition extends FormComponentDefinition {
    public component: RepeatableFormFieldComponentDefinition;
    public model?: RepeatableFormFieldModelDefinition;
    public layout?: DefaultFormFieldLayoutDefinition;

    constructor(data: RepeatableFormComponentDefinitionFrame) {
        super(data);
        this.name = data.name;
        this.component = new RepeatableFormFieldComponentDefinition(data.component);
        this.model = new RepeatableFormFieldModelDefinition(data.model);
        this.layout = new DefaultFormFieldLayoutDefinition(data.layout);
    }

    accept(visitor: FormConfigItemVisitor) {
        visitor.visitRepeatableFormComponentDefinition(this);
    }
}

export const RepeatableMap = [
    {kind: FormFieldComponentConfigKind, def: RepeatableFormFieldComponentConfig},
    {
        kind: FormFieldComponentDefinitionKind,
        def: RepeatableFormFieldComponentDefinition,
        class: RepeatableComponentName
    },
    {kind: FormFieldModelConfigKind, def: RepeatableFormFieldModelConfig},
    {kind: FormFieldModelDefinitionKind, def: RepeatableFormFieldModelDefinition, class: RepeatableModelName},
    {kind: FormFieldModelDefinitionKind, def: RepeatableElementFormFieldLayoutConfig,},
    {
        kind: FormFieldLayoutDefinitionKind,
        def: RepeatableElementFormFieldLayoutDefinition,
        class: RepeatableElementLayoutComponentName
    },
    {kind: FormComponentDefinitionKind, def: RepeatableFormComponentDefinition},
];
export type RepeatableFrames =
    RepeatableFormFieldComponentConfigFrame |
    RepeatableFormFieldComponentDefinitionFrame |
    RepeatableFormFieldModelConfigFrame |
    RepeatableFormFieldModelDefinitionFrame |
    RepeatableElementFormFieldLayoutConfigFrame |
    RepeatableElementFormFieldLayoutDefinitionFrame |
    RepeatableFormComponentDefinitionFrame;
