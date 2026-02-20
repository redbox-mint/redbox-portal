import {FormComponentDefinitionFrame, FormComponentDefinitionOutline} from "../form-component.outline";
import {
    FieldLayoutConfigFrame, FieldLayoutConfigOutline,
    FieldLayoutDefinitionFrame,
    FieldLayoutDefinitionOutline
} from "../field-layout.outline";
import {
    FieldComponentConfigFrame, FieldComponentConfigOutline,
    FieldComponentDefinitionFrame,
    FieldComponentDefinitionOutline
} from "../field-component.outline";
import {TabContentFormComponentDefinitionFrame, TabContentFormComponentDefinitionOutline} from "./tab-content.outline";
import {
    FieldComponentConfigFrameKindType, FieldComponentConfigKindType,
    FieldComponentDefinitionFrameKindType,
    FieldComponentDefinitionKindType, FieldLayoutConfigFrameKindType,
    FieldLayoutConfigKindType, FieldLayoutDefinitionFrameKindType, FieldLayoutDefinitionKindType,
    FormComponentDefinitionFrameKindType,
    FormComponentDefinitionKindType
} from "../shared.outline";

/* Tab Component */

export const TabComponentName = "TabComponent" as const;
export type TabComponentNameType = typeof TabComponentName;

export interface TabFieldComponentConfigFrame extends FieldComponentConfigFrame {
    tabs: TabContentFormComponentDefinitionFrame[];
}

export interface TabFieldComponentConfigOutline extends TabFieldComponentConfigFrame, FieldComponentConfigOutline {
    tabs: TabContentFormComponentDefinitionOutline[];
}

export interface TabFieldComponentDefinitionFrame extends FieldComponentDefinitionFrame {
    class: TabComponentNameType;
    config?: TabFieldComponentConfigFrame;
}

export interface TabFieldComponentDefinitionOutline extends TabFieldComponentDefinitionFrame, FieldComponentDefinitionOutline {
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
     * CSS class for the outer tab shell wrapper.
     */
    tabShellCssClass?: string;
    /**
     * CSS class for the tab nav wrapper column.
     */
    tabNavWrapperCssClass?: string;
    /**
     * CSS class for the tab panel wrapper column.
     */
    tabPanelWrapperCssClass?: string;
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

export interface TabFieldLayoutConfigOutline extends TabFieldLayoutConfigFrame, FieldLayoutConfigOutline {
}

export interface TabFieldLayoutDefinitionFrame extends FieldLayoutDefinitionFrame {
    class: TabLayoutNameType;
    config?: TabFieldLayoutConfigFrame;
}

export interface TabFieldLayoutDefinitionOutline extends TabFieldLayoutDefinitionFrame, FieldLayoutDefinitionOutline {
    class: TabLayoutNameType;
    config?: TabFieldLayoutConfigOutline;
}

/* Tab Form Component */
export interface TabFormComponentDefinitionFrame extends FormComponentDefinitionFrame {
    component: TabFieldComponentDefinitionFrame;
    model?: never;
    layout?: TabFieldLayoutDefinitionFrame;
}

export interface TabFormComponentDefinitionOutline extends TabFormComponentDefinitionFrame, FormComponentDefinitionOutline {
    component: TabFieldComponentDefinitionOutline;
    model?: never;
    layout?: TabFieldLayoutDefinitionOutline;
}

export type TabTypes =
    | { kind: FieldComponentConfigFrameKindType, class: TabFieldComponentConfigFrame }
    | { kind: FieldComponentDefinitionFrameKindType, class: TabFieldComponentDefinitionFrame }
    | { kind: FieldLayoutConfigFrameKindType, class: TabFieldLayoutConfigFrame }
    | { kind: FieldLayoutDefinitionFrameKindType, class: TabFieldLayoutDefinitionFrame }
    | { kind: FormComponentDefinitionFrameKindType, class: TabFormComponentDefinitionFrame }
    | { kind: FieldComponentConfigKindType, class: TabFieldComponentConfigOutline }
    | { kind: FieldComponentDefinitionKindType, class: TabFieldComponentDefinitionOutline }
    | { kind: FieldLayoutConfigKindType, class: TabFieldLayoutConfigOutline }
    | { kind: FieldLayoutDefinitionKindType, class: TabFieldLayoutDefinitionOutline }
    | { kind: FormComponentDefinitionKindType, class: TabFormComponentDefinitionOutline }
    ;
