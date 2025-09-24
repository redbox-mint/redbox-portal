import {
    FormComponentDefinition,
    FieldLayoutConfig, FieldLayoutDefinition, FieldComponentConfigFrame, FieldComponentConfig,
    FieldComponentDefinitionFrame, FieldComponentDefinition, FieldComponentConfigKind, FieldComponentDefinitionKind,
    FieldLayoutConfigFrame, FieldLayoutDefinitionFrame, FormComponentDefinitionFrame,
    FormComponentDefinitionKind, FieldLayoutConfigKind, FieldLayoutDefinitionKind, FormConfigItemVisitor,
     TabContentFormComponentDefinitionFrame,
    TabContentFormComponentDefinition,
} from "../..";

/* Tab Component */
export const TabComponentName = "TabComponent" as const;
export type TabComponentNameType = typeof TabComponentName;

export interface TabFieldComponentConfigFrame extends FieldComponentConfigFrame {
    tabs: TabContentFormComponentDefinitionFrame[];
}

export class TabFieldComponentConfig extends FieldComponentConfig implements TabFieldComponentConfigFrame {
    tabs: TabContentFormComponentDefinition[];
    constructor(data?: TabFieldComponentConfigFrame, tabs?: TabContentFormComponentDefinition[]) {
        super(data);
        this.tabs = tabs ?? [];
    }
}

export interface TabFieldComponentDefinitionFrame extends FieldComponentDefinitionFrame {
    class: TabComponentNameType;
    config?: TabFieldComponentConfigFrame;
}

export class TabFieldComponentDefinition extends FieldComponentDefinition implements TabFieldComponentDefinitionFrame {
    class = TabComponentName;
    config?: TabFieldComponentConfig

    constructor(data: TabFieldComponentDefinitionFrame) {
        super(data);
        this.config = new TabFieldComponentConfig(data.config);
    }

    accept(visitor: FormConfigItemVisitor): void {
        visitor.visitTabFieldComponentDefinition(this);
    }
}

/* Tab Layout */
export const TabLayoutName = "TabLayout" as const;
export type TabLayoutNameType = typeof TabLayoutName;

export const ButtonSectionAriaOrientationOptions = ["horizontal", "vertical"] as const;
export type ButtonSectionAriaOrientationOptionsType = typeof ButtonSectionAriaOrientationOptions[number];

export interface TabFieldLayoutConfigFrame extends FieldLayoutConfigFrame {
    /**
     * CSS class for the tab buttons
     */
    buttonSectionCssClass?: string;
    /**
     * CSS class for the tab pane
     */
    tabPaneCssClass?: string;
    /**
     * CSS class for the active tab pane
     */
    tabPaneActiveCssClass?: string;
    /**
     * The aria orientation for the section button
     */
    buttonSectionAriaOrientation?: ButtonSectionAriaOrientationOptionsType;
}
export class TabFieldLayoutConfig extends FieldLayoutConfig implements TabFieldLayoutConfigFrame {
    buttonSectionCssClass?: string;
    tabPaneCssClass?: string;
    tabPaneActiveCssClass?: string;
    buttonSectionAriaOrientation?: ButtonSectionAriaOrientationOptionsType = 'vertical';

    constructor(data?: TabFieldLayoutConfigFrame) {
        super(data);
    }
}
export interface TabFieldLayoutDefinitionFrame extends FieldLayoutDefinitionFrame {
    class: TabLayoutNameType;
    config?: TabFieldLayoutConfigFrame;
}
export class TabFieldLayoutDefinition extends FieldLayoutDefinition implements TabFieldLayoutDefinitionFrame {
    class = TabLayoutName;
    config?: TabFieldLayoutConfig;
    constructor(data?: TabFieldLayoutDefinitionFrame) {
        super(data ?? {class:TabLayoutName});
        this.config = new TabFieldLayoutConfig(data?.config);
    }

    accept(visitor: FormConfigItemVisitor): void {
        visitor.visitTabFieldLayoutDefinition(this);
    }
}

/* Tab Form Component */
export interface TabFormComponentDefinitionFrame extends FormComponentDefinitionFrame {
    component: TabFieldComponentDefinitionFrame;
    layout?: TabFieldLayoutDefinitionFrame;
}

export class TabFormComponentDefinition extends FormComponentDefinition implements TabFormComponentDefinitionFrame {
    public component: TabFieldComponentDefinition;
    public layout?: TabFieldLayoutDefinition;

    constructor(data: TabFormComponentDefinitionFrame) {
        super(data);
        this.component = new TabFieldComponentDefinition(data.component);
        this.layout = new TabFieldLayoutDefinition(data.layout);
    }

    accept(visitor: FormConfigItemVisitor) {
        visitor.visitTabFormComponentDefinition(this);
    }
}

export const TabMap = [
    {kind: FieldComponentConfigKind, def: TabFieldComponentConfig},
    {kind: FieldComponentDefinitionKind, def: TabFieldComponentDefinition, class: TabComponentName},
    {kind: FieldLayoutConfigKind, def: TabFieldLayoutConfig},
    {kind: FieldLayoutDefinitionKind, def: TabFieldLayoutDefinition, class: TabLayoutName},
    {kind: FormComponentDefinitionKind, def: TabFormComponentDefinition},
];
export type TabFrames =
    TabFieldComponentConfigFrame |
    TabFieldComponentDefinitionFrame |
    TabFieldLayoutConfigFrame |
    TabFieldLayoutDefinitionFrame |
    TabFormComponentDefinitionFrame;