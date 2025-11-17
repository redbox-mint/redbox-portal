import {
    FieldComponentConfigFrame,
    FieldComponentConfigOutline,
    FieldComponentDefinitionFrame, FieldComponentDefinitionOutline
} from "../field-component.outline";
import {AvailableFormComponentDefinitionFrames, AvailableFormComponentDefinitionOutlines} from "../dictionary.outline";
import {
    FieldLayoutConfigFrame,
    FieldLayoutDefinitionFrame,
    FieldLayoutDefinitionOutline
} from "../field-layout.outline";
import {FormComponentDefinitionFrame, FormComponentDefinitionOutline} from "../form-component.outline";
import {
    FieldComponentConfigFrameKindType, FieldComponentConfigKindType,
    FieldComponentDefinitionFrameKindType, FieldComponentDefinitionKindType,
    FieldLayoutConfigFrameKindType,
    FieldLayoutConfigKindType, FieldLayoutDefinitionFrameKindType,
    FieldLayoutDefinitionKindType, FormComponentDefinitionFrameKindType, FormComponentDefinitionKindType
} from "../shared.outline";

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


export interface TabContentFieldComponentConfigOutline extends TabContentFieldComponentConfigFrame, FieldComponentConfigOutline {
    componentDefinitions: AvailableFormComponentDefinitionOutlines[];
    selected?: boolean;
}

export interface TabContentFieldComponentDefinitionFrame extends FieldComponentDefinitionFrame {
    class: TabContentComponentNameType;
    config?: TabContentFieldComponentConfigFrame;
}

export interface TabContentFieldComponentDefinitionOutline extends TabContentFieldComponentDefinitionFrame, FieldComponentDefinitionOutline {
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

interface FieldLayoutConfigOutline {
}

export interface TabContentFieldLayoutConfigOutline extends TabContentFieldLayoutConfigFrame, FieldLayoutConfigOutline {
    buttonLabel?: string;
}


export interface TabContentFieldLayoutDefinitionFrame extends FieldLayoutDefinitionFrame {
    class: TabContentLayoutNameType;
    config?: TabContentFieldLayoutConfigFrame;
}

export interface TabContentFieldLayoutDefinitionOutline extends TabContentFieldLayoutDefinitionFrame, FieldLayoutDefinitionOutline {
    class: TabContentLayoutNameType;
    config?: TabContentFieldLayoutConfigOutline;
}

/* Tab Content Form Component */
export interface TabContentFormComponentDefinitionFrame extends FormComponentDefinitionFrame {
    component: TabContentFieldComponentDefinitionFrame;
    model?: never;
    layout?: TabContentFieldLayoutDefinitionFrame;
}

export interface TabContentFormComponentDefinitionOutline extends TabContentFormComponentDefinitionFrame, FormComponentDefinitionOutline {
    component: TabContentFieldComponentDefinitionOutline;
    model?: never;
    layout?: TabContentFieldLayoutDefinitionOutline;
}

export type TabContentTypes =
    | { kind: FieldComponentConfigFrameKindType, class: TabContentFieldComponentConfigFrame }
    | { kind: FieldComponentDefinitionFrameKindType, class: TabContentFieldComponentDefinitionFrame }
    | { kind: FieldLayoutConfigFrameKindType, class: TabContentFieldLayoutConfigFrame }
    | { kind: FieldLayoutDefinitionFrameKindType, class: TabContentFieldLayoutDefinitionFrame }
    | { kind: FormComponentDefinitionFrameKindType, class: TabContentFormComponentDefinitionFrame }
    | { kind: FieldComponentConfigKindType, class: TabContentFieldComponentConfigOutline }
    | { kind: FieldComponentDefinitionKindType, class: TabContentFieldComponentDefinitionOutline }
    | { kind: FieldLayoutConfigKindType, class: TabContentFieldLayoutConfigOutline }
    | { kind: FieldLayoutDefinitionKindType, class: TabContentFieldLayoutDefinitionOutline }
    | { kind: FormComponentDefinitionKindType, class: TabContentFormComponentDefinitionOutline }
    ;
