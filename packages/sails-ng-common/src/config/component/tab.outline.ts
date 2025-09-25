import {FormComponentDefinitionFrame, HasChildren} from "../form-component.outline";
import {FieldLayoutConfigFrame, FieldLayoutDefinitionFrame} from "../field-layout.outline";
import {FieldComponentConfigFrame, FieldComponentDefinitionFrame} from "../field-component.outline";
import {TabContentFormComponentDefinitionFrame, TabContentFormComponentDefinitionOutline} from "./tab-content.outline";

/* Tab Component */

export const TabComponentName = "TabComponent" as const;
export type TabComponentNameType = typeof TabComponentName;

export interface TabFieldComponentConfigFrame extends FieldComponentConfigFrame {
    tabs: TabContentFormComponentDefinitionFrame[];
}

export interface TabFieldComponentConfigOutline extends TabFieldComponentConfigFrame {
    tabs: TabContentFormComponentDefinitionOutline[];
}

export interface TabFieldComponentDefinitionFrame extends FieldComponentDefinitionFrame {
    class: TabComponentNameType;
    config?: TabFieldComponentConfigFrame;
}

export interface TabFieldComponentDefinitionOutline extends TabFieldComponentDefinitionFrame, HasChildren {
    class: TabComponentNameType;
    config?: TabFieldComponentConfigOutline;
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

export interface TabFieldLayoutConfigOutline extends TabFieldLayoutConfigFrame {
    buttonSectionCssClass?: string;
    tabPaneCssClass?: string;
    tabPaneActiveCssClass?: string;
    buttonSectionAriaOrientation?: ButtonSectionAriaOrientationOptionsType;
}

export interface TabFieldLayoutDefinitionFrame extends FieldLayoutDefinitionFrame {
    class: TabLayoutNameType;
    config?: TabFieldLayoutConfigFrame;
}

export interface TabFieldLayoutDefinitionOutline extends TabFieldLayoutDefinitionFrame {
    class: TabLayoutNameType;
    config?: TabFieldLayoutConfigOutline;
}

/* Tab Form Component */
export interface TabFormComponentDefinitionFrame extends FormComponentDefinitionFrame {
    component: TabFieldComponentDefinitionFrame;
    model?: never;
    layout?: TabFieldLayoutDefinitionFrame;
}

export interface TabFormComponentDefinitionOutline extends TabFormComponentDefinitionFrame {
    component: TabFieldComponentDefinitionOutline;
    model?: never;
    layout?: TabFieldLayoutDefinitionOutline;
}

export type TabFrames =
    TabFieldComponentConfigFrame |
    TabFieldComponentDefinitionFrame |
    TabFieldLayoutConfigFrame |
    TabFieldLayoutDefinitionFrame |
    TabFormComponentDefinitionFrame;
export type TabOutlines =
    TabFieldComponentConfigOutline |
    TabFieldComponentDefinitionOutline |
    TabFieldLayoutConfigOutline |
    TabFieldLayoutDefinitionOutline |
    TabFormComponentDefinitionOutline;