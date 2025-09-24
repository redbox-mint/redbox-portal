import {
    FieldComponentConfig,
    FieldComponentConfigFrame,
    FieldComponentDefinition,
    FieldComponentDefinitionFrame
} from "../field-component.model";
import {

    AvailableFormComponentDefinitionFrames,
    AvailableFormComponentDefinitions
} from "../static-types-classes.dictionary";


import {FormComponentDefinition, FormComponentDefinitionFrame, } from "../form-component.model";
import {
    FieldComponentConfigKind,
    FieldComponentDefinitionKind, FieldLayoutConfigKind, FieldLayoutDefinitionKind,
    FormComponentDefinitionKind
} from "../shared.model";
import {
    FieldLayoutConfig,
    FieldLayoutConfigFrame,
    FieldLayoutDefinition,
    FieldLayoutDefinitionFrame
} from "../field-layout.model";
import {IFormConfigVisitor} from "../visitor/base.structure";


/* Tab Content Component */
export const TabContentComponentName = "TabContentComponent" as const;
export type TabContentComponentNameType = typeof TabContentComponentName;


export interface TabContentFieldComponentConfigFrame extends FieldComponentConfigFrame {
    /**
     * The components to render in the tab.
     */
    componentDefinitions: AvailableFormComponentDefinitionFrames[];
    /**
     * Whether the tab is selected on initialization
     */
    selected?: boolean;
}

export class TabContentFieldComponentConfig extends FieldComponentConfig implements TabContentFieldComponentConfigFrame {
    componentDefinitions: AvailableFormComponentDefinitions[];
    selected?: boolean = false;

    constructor() {
        super();
        this.componentDefinitions = [];
    }
}

export interface TabContentFieldComponentDefinitionFrame extends FieldComponentDefinitionFrame {
    class: TabContentComponentNameType;
    config?: TabContentFieldComponentConfigFrame;
}

export class TabContentFieldComponentDefinition extends FieldComponentDefinition implements TabContentFieldComponentDefinitionFrame {
    class = TabContentComponentName;
    config?: TabContentFieldComponentConfig;

    constructor() {
        super();
    }


    accept(visitor: IFormConfigVisitor): void {
        visitor.visitTabContentFieldComponentDefinition(this);
    }
}


/* Tab Content Layout */
export const TabContentLayoutName = "TabContentLayout" as const;
export type TabContentLayoutNameType = typeof TabContentLayoutName;

export interface TabContentFieldLayoutConfigFrame extends FieldLayoutConfigFrame {
    /**
     * The text on the button
     */
    buttonLabel?: string;
}

export class TabContentFieldLayoutConfig extends FieldLayoutConfig implements TabContentFieldLayoutConfigFrame {
    buttonLabel?: string;

    constructor() {
        super();
    }
}

export interface TabContentFieldLayoutDefinitionFrame extends FieldLayoutDefinitionFrame {
    class: TabContentLayoutNameType;
    config?: TabContentFieldLayoutConfigFrame;
}

export class TabContentFieldLayoutDefinition extends FieldLayoutDefinition implements TabContentFieldLayoutDefinitionFrame {
    class = TabContentLayoutName;
    config?: TabContentFieldLayoutConfig;

    constructor() {
        super();
    }

    accept(visitor: IFormConfigVisitor): void {
        visitor.visitTabContentFieldLayoutDefinition(this);
    }
}

/* Tab Content Form Component */
export interface TabContentFormComponentDefinitionFrame extends FormComponentDefinitionFrame {
    component: TabContentFieldComponentDefinitionFrame;
    model?: never;
    layout?: TabContentFieldLayoutDefinitionFrame;
}

export class TabContentFormComponentDefinition extends FormComponentDefinition implements TabContentFormComponentDefinitionFrame {
    public component: TabContentFieldComponentDefinition;
    public model?: never;
    public layout?: TabContentFieldLayoutDefinition;

    constructor() {
        super();
        this.component = new TabContentFieldComponentDefinition();
    }

    accept(visitor: IFormConfigVisitor) {
        visitor.visitTabContentFormComponentDefinition(this);
    }
}

export const TabContentMap = [
    {kind: FieldComponentConfigKind, def: TabContentFieldComponentConfig},
    {kind: FieldComponentDefinitionKind, def: TabContentFieldComponentDefinition, class: TabContentComponentName},
    {kind: FieldLayoutConfigKind, def: TabContentFieldLayoutConfig},
    {kind: FieldLayoutDefinitionKind, def: TabContentFieldLayoutDefinition, class: TabContentLayoutName},
    {kind: FormComponentDefinitionKind, def: TabContentFormComponentDefinition},
];
export type TabContentFrames =
    TabContentFieldComponentConfigFrame |
    TabContentFieldComponentDefinitionFrame |
    TabContentFieldLayoutConfigFrame |
    TabContentFieldLayoutDefinitionFrame |
    TabContentFormComponentDefinitionFrame;
