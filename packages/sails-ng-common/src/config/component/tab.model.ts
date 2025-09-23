import {
    FormComponentDefinition,
    BaseFormFieldComponentConfig, BaseFormFieldComponentDefinition,
    FormFieldLayoutConfig, FormFieldLayoutDefinition
} from "..";

export interface TabFormFieldComponentDefinition extends BaseFormFieldComponentDefinition {
    class: "TabComponent";
    config?: TabComponentConfig;
}

export interface TabComponentEntryDefinition {
    id: string; // internal identifier for the tab
    buttonLabel: string; // The text on the button
    componentDefinitions: FormComponentDefinition[]; // The components to render in the tab
    selected?: boolean; // Whether the tab is selected on initialization
}

export class TabComponentConfig extends BaseFormFieldComponentConfig {
    tabs?: TabComponentEntryDefinition[];
}

export interface TabContentComponentDefinition extends BaseFormFieldComponentDefinition {
    class: "TabContentComponent";
    config?: TabContentComponentConfig;
}

export class TabContentComponentConfig extends BaseFormFieldComponentConfig {
    tab?: TabComponentEntryDefinition;
}

export interface TabComponentFormFieldLayoutDefinition extends FormFieldLayoutDefinition {
    class: "TabComponentLayout";
    config: TabComponentFormFieldLayoutConfig;
}

export class TabComponentFormFieldLayoutConfig extends FormFieldLayoutConfig {
    buttonSectionCssClass?: string; // CSS class for the tab buttons
    tabPaneCssClass?: string; // CSS class for the tab pane
    tabPaneActiveCssClass?: string; // CSS class for the active tab pane
    buttonSectionAriaOrientation?: "horizontal" | "vertical" = "vertical";
}