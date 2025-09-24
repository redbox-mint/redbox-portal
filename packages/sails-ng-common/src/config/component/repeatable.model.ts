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
import {FormComponentDefinition, FormComponentDefinitionFrame, HasChildren} from "../form-component.model";
import {
    FieldComponentConfigKind,
    FieldComponentDefinitionKind, FieldLayoutConfigKind, FieldLayoutDefinitionKind,
    FieldModelConfigKind,
    FieldModelDefinitionKind, FormComponentDefinitionKind
} from "../shared.model";
import {
    FieldLayoutConfig,
    FieldLayoutConfigFrame,
    FieldLayoutDefinition,
    FieldLayoutDefinitionFrame
} from "../field-layout.model";
import {GroupFormComponentDefinition} from "./group.model";
import {IFormConfigVisitor} from "../visitor/base.structure";


/* Repeatable Component */
export const RepeatableComponentName = `RepeatableComponent` as const;
export type RepeatableComponentNameType = typeof RepeatableComponentName;

export interface RepeatableFieldComponentConfigFrame extends FieldComponentConfigFrame {
    elementTemplate: AvailableFormComponentDefinitionFrames;
}

export class RepeatableFieldComponentConfig extends FieldComponentConfig implements RepeatableFieldComponentConfigFrame {
    elementTemplate: AvailableFormComponentDefinitions;

    constructor() {
        super();
        this.elementTemplate = new GroupFormComponentDefinition();
    }
}

export interface RepeatableFieldComponentDefinitionFrame extends FieldComponentDefinitionFrame {
    class: RepeatableComponentNameType;
    config?: RepeatableFieldComponentConfigFrame
}


export class RepeatableFieldComponentDefinition extends FieldComponentDefinition implements RepeatableFieldComponentDefinitionFrame, HasChildren {
    class = RepeatableComponentName;
    config?: RepeatableFieldComponentConfig;

    constructor() {
        super();
    }

    get children(): FormComponentDefinition[] {
        throw new Error("Method not implemented.");
    }

    accept(visitor: IFormConfigVisitor) {
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

export class RepeatableFieldModelConfig extends FieldModelConfig<RepeatableModelValueType> implements RepeatableFieldModelConfigFrame {
    constructor() {
        super();
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

    constructor() {
        super();
    }

    accept(visitor: IFormConfigVisitor) {
        visitor.visitRepeatableFieldModelDefinition(this);
    }
}


/* Repeatable Element Layout */
export const RepeatableElementLayoutName = `RepeatableElementLayout` as const;
export type RepeatableElementLayoutNameType = typeof RepeatableElementLayoutName;

export interface RepeatableElementFieldLayoutConfigFrame extends FieldLayoutConfigFrame {
}

export class RepeatableElementFieldLayoutConfig extends FieldLayoutConfig implements RepeatableElementFieldLayoutConfigFrame {
    constructor() {
        super();
    }
}

export interface RepeatableElementFieldLayoutDefinitionFrame extends FieldLayoutDefinitionFrame {
    class: RepeatableElementLayoutNameType;
    config?: RepeatableElementFieldLayoutConfig;
}


export class RepeatableElementFieldLayoutDefinition extends FieldLayoutDefinition implements RepeatableElementFieldLayoutDefinitionFrame {
    public class = RepeatableElementLayoutName;
    public config?: RepeatableElementFieldLayoutConfig;

    constructor() {
        super();
    }

    accept(visitor: IFormConfigVisitor) {
        visitor.visitRepeatableElementFieldLayoutDefinition(this);
    }
}


/* Repeatable Form Component */
export interface RepeatableFormComponentDefinitionFrame extends FormComponentDefinitionFrame {
    component: RepeatableFieldComponentDefinitionFrame;
    model?: RepeatableFieldModelDefinitionFrame;
    layout?: AvailableFieldLayoutDefinitionFrames;
}

export class RepeatableFormComponentDefinition extends FormComponentDefinition implements RepeatableFormComponentDefinitionFrame {
    public component: RepeatableFieldComponentDefinition;
    public model?: RepeatableFieldModelDefinition;
    public layout?: AvailableFieldLayoutDefinitions;

    constructor() {
        super();
        this.component = new RepeatableFieldComponentDefinition();
    }

    accept(visitor: IFormConfigVisitor) {
        visitor.visitRepeatableFormComponentDefinition(this);
    }
}

export const RepeatableMap = [
    {kind: FieldComponentConfigKind, def: RepeatableFieldComponentConfig},
    {kind: FieldComponentDefinitionKind, def: RepeatableFieldComponentDefinition, class: RepeatableComponentName},
    {kind: FieldModelConfigKind, def: RepeatableFieldModelConfig},
    {kind: FieldModelDefinitionKind, def: RepeatableFieldModelDefinition, class: RepeatableModelName},
    {kind: FieldLayoutConfigKind, def: RepeatableElementFieldLayoutConfig},
    {kind: FieldLayoutDefinitionKind, def: RepeatableElementFieldLayoutDefinition, class: RepeatableElementLayoutName},
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
