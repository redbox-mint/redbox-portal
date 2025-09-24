import {
    FieldComponentConfig,
    FieldComponentConfigFrame,
    FieldComponentDefinition,
    FieldComponentDefinitionFrame
} from "../field-component.model";
import {FormComponentDefinition, FormComponentDefinitionFrame} from "../form-component.model";
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
import {TabContentFormComponentDefinition, TabContentFormComponentDefinitionFrame} from "./tab-content.model";
import {IFormConfigVisitor} from "../visitor/base.structure";

/* Tab Component */
export const TabComponentName = "TabComponent" as const;
export type TabComponentNameType = typeof TabComponentName;

export interface TabFieldComponentConfigFrame extends FieldComponentConfigFrame {
    tabs: TabContentFormComponentDefinitionFrame[];
}

export class TabFieldComponentConfig extends FieldComponentConfig implements TabFieldComponentConfigFrame {
    tabs: TabContentFormComponentDefinition[];

    constructor() {
        super();
        this.tabs = [];
    }
}

export interface TabFieldComponentDefinitionFrame extends FieldComponentDefinitionFrame {
    class: TabComponentNameType;
    config?: TabFieldComponentConfigFrame;
}

export class TabFieldComponentDefinition extends FieldComponentDefinition implements TabFieldComponentDefinitionFrame {
    class = TabComponentName;
    config?: TabFieldComponentConfig

    constructor() {
        super();
    }

    accept(visitor: IFormConfigVisitor): void {
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

    constructor() {
        super();
    }
}

export interface TabFieldLayoutDefinitionFrame extends FieldLayoutDefinitionFrame {
    class: TabLayoutNameType;
    config?: TabFieldLayoutConfigFrame;
}

export class TabFieldLayoutDefinition extends FieldLayoutDefinition implements TabFieldLayoutDefinitionFrame {
    class = TabLayoutName;
    config?: TabFieldLayoutConfig;

    constructor() {
        super();
    }

    accept(visitor: IFormConfigVisitor): void {
        visitor.visitTabFieldLayoutDefinition(this);
    }
}

/* Tab Form Component */
export interface TabFormComponentDefinitionFrame extends FormComponentDefinitionFrame {
    component: TabFieldComponentDefinitionFrame;
    model?: never;
    layout?: TabFieldLayoutDefinitionFrame;
}

export class TabFormComponentDefinition extends FormComponentDefinition implements TabFormComponentDefinitionFrame {
    public component: TabFieldComponentDefinition;
    public model?: never;
    public layout?: TabFieldLayoutDefinition;

    constructor() {
        super();
        this.component = new TabFieldComponentDefinition();
    }

    accept(visitor: IFormConfigVisitor) {
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