import {FieldComponentConfigFrame, FieldComponentDefinitionFrame} from "../field-component.outline";
import {AvailableFormComponentDefinitionFrames, AvailableFormComponentDefinitionOutlines} from "../dictionary.outline";
import {FieldLayoutConfigFrame, FieldLayoutDefinitionFrame} from "../field-layout.outline";
import {FormComponentDefinitionFrame, HasChildren} from "../form-component.outline";

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


export interface TabContentFieldComponentConfigOutline extends TabContentFieldComponentConfigFrame {
    componentDefinitions: AvailableFormComponentDefinitionOutlines[];
    selected?: boolean;
}

export interface TabContentFieldComponentDefinitionFrame extends FieldComponentDefinitionFrame {
    class: TabContentComponentNameType;
    config?: TabContentFieldComponentConfigFrame;
}

export interface TabContentFieldComponentDefinitionOutline extends TabContentFieldComponentDefinitionFrame {
    class: TabContentComponentNameType;
    config?: TabContentFieldComponentConfigOutline;
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

export interface TabContentFieldLayoutConfigOutline extends TabContentFieldLayoutConfigFrame {
    buttonLabel?: string;
}


export interface TabContentFieldLayoutDefinitionFrame extends FieldLayoutDefinitionFrame {
    class: TabContentLayoutNameType;
    config?: TabContentFieldLayoutConfigFrame;
}

export interface TabContentFieldLayoutDefinitionOutline extends TabContentFieldLayoutDefinitionFrame, HasChildren {
    class: TabContentLayoutNameType;
    config?: TabContentFieldLayoutConfigOutline;
}

/* Tab Content Form Component */
export interface TabContentFormComponentDefinitionFrame extends FormComponentDefinitionFrame {
    component: TabContentFieldComponentDefinitionFrame;
    model?: never;
    layout?: TabContentFieldLayoutDefinitionFrame;
}

export interface TabContentFormComponentDefinitionOutline extends TabContentFormComponentDefinitionFrame {
    component: TabContentFieldComponentDefinitionOutline;
    model?: never;
    layout?: TabContentFieldLayoutDefinitionOutline;
}

export type TabContentFrames =
    TabContentFieldComponentConfigFrame |
    TabContentFieldComponentDefinitionFrame |
    TabContentFieldLayoutConfigFrame |
    TabContentFieldLayoutDefinitionFrame |
    TabContentFormComponentDefinitionFrame;

export type TabContentOutlines =
    TabContentFieldComponentConfigOutline |
    TabContentFieldComponentDefinitionOutline |
    TabContentFieldLayoutConfigOutline |
    TabContentFieldLayoutDefinitionOutline |
    TabContentFormComponentDefinitionOutline;
