import {FormComponentDefinition} from "../form-component.model";
import {BaseFormFieldComponentConfig, BaseFormFieldComponentDefinition} from "../form-field-component.model";


export interface TabFormFieldComponentDefinition extends BaseFormFieldComponentDefinition {
    class: "TabComponent";
    config?: TabComponentConfig;
}

export interface TabComponentEntryDefinition {
    id: string; // internal identifier for the tab
    buttonLabel: string; // The text on the button
    componentDefinitions: FormComponentDefinition[]; // The components to render in the tab
    active?: boolean; // Whether the tab is active
}

export class TabComponentConfig extends BaseFormFieldComponentConfig {
    mainCssClass?: string; // Main CSS class for the tab component
    buttonSectionCssClass?: string; // CSS class for the tab buttons
    tabContentSectionCssClass?: string; // CSS class for the tab content
    tabPaneCssClass?: string; // CSS class for the tab pane
    tabPaneActiveCssClass?: string; // CSS class for the active tab pane
    tabs?: TabComponentEntryDefinition[];
}

export interface TabContentComponentDefinition extends BaseFormFieldComponentDefinition {
    class: "TabContentComponent";
    config?: TabContentComponentConfig;
}

export class TabContentComponentConfig extends BaseFormFieldComponentConfig {
    tab?: TabComponentEntryDefinition;
}