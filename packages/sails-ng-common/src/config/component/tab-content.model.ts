import {
    FieldComponentConfig,
    FieldComponentConfigFrame, FieldComponentDefinition,
    FieldComponentDefinitionFrame, FormConfigItemVisitor,
    FieldLayoutConfig,
    FieldLayoutConfigFrame,
    FieldLayoutDefinition,
    FieldLayoutDefinitionFrame, FormComponentDefinitionFrame, FormComponentDefinition,
    FieldComponentConfigKind,
    FieldComponentDefinitionKind,
    FieldLayoutConfigKind,
    FieldLayoutDefinitionKind, FormComponentDefinitionKind, AvailableFormComponentDefinitionFrames,
    AvailableFormComponentDefinitions
} from "../..";


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

    constructor(data?: TabContentFieldComponentConfigFrame, componentDefinitions?: AvailableFormComponentDefinitions[]) {
        super(data);
        this.componentDefinitions = componentDefinitions ?? [];
    }
}

export interface TabContentFieldComponentDefinitionFrame extends FieldComponentDefinitionFrame {
    class: TabContentComponentNameType;
    config?: TabContentFieldComponentConfigFrame;
}

export class TabContentFieldComponentDefinition extends FieldComponentDefinition implements TabContentFieldComponentDefinitionFrame {
    class = TabContentComponentName;
    config?: TabContentFieldComponentConfig;

    constructor(data: TabContentFieldComponentDefinitionFrame) {
        super(data);
        this.config = new TabContentFieldComponentConfig(data.config);
    }

    accept(visitor: FormConfigItemVisitor): void {
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

    constructor(data?: TabContentFieldLayoutConfigFrame) {
        super(data);
    }
}

export interface TabContentFieldLayoutDefinitionFrame extends FieldLayoutDefinitionFrame {
    class: TabContentLayoutNameType;
    config?: TabContentFieldLayoutConfigFrame;
}

export class TabContentFieldLayoutDefinition extends FieldLayoutDefinition implements TabContentFieldLayoutDefinitionFrame {
    class = TabContentLayoutName;
    config?: TabContentFieldLayoutConfig;

    constructor(data?: TabContentFieldLayoutDefinitionFrame) {
        super(data ?? {class: TabContentLayoutName});
        this.config = new TabContentFieldLayoutConfig(data?.config);
    }

    accept(visitor: FormConfigItemVisitor): void {
        visitor.visitTabContentFieldLayoutDefinition(this);
    }
}

/* Tab Content Form Component */
export interface TabContentFormComponentDefinitionFrame extends FormComponentDefinitionFrame {
    component: TabContentFieldComponentDefinitionFrame;
    layout?: TabContentFieldLayoutDefinitionFrame;
}

export class TabContentFormComponentDefinition extends FormComponentDefinition implements TabContentFormComponentDefinitionFrame {
    public component: TabContentFieldComponentDefinition;
    public layout?: TabContentFieldLayoutDefinition;

    constructor(data: TabContentFormComponentDefinitionFrame) {
        super(data);
        this.name = data.name;
        this.component = new TabContentFieldComponentDefinition(data.component);
        this.layout = new TabContentFieldLayoutDefinition(data.layout);
    }

    accept(visitor: FormConfigItemVisitor) {
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
