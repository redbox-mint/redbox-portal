import {AvailableFieldLayoutDefinitionFrames, AvailableFieldLayoutDefinitionOutlines} from "../dictionary.outline";
import {FormComponentDefinitionFrame, FormComponentDefinitionOutline} from "../form-component.outline";
import {
    FieldComponentConfigFrame,
    FieldComponentConfigOutline,
    FieldComponentDefinitionFrame, FieldComponentDefinitionOutline
} from "../field-component.outline";
import {
    FieldComponentConfigFrameKindType, FieldComponentConfigKindType,
    FieldComponentDefinitionFrameKindType, FieldComponentDefinitionKindType,
    FormComponentDefinitionFrameKindType,
    FormComponentDefinitionKindType
} from "../shared.outline";

/* Static Component */

export const StaticComponentName = `StaticComponent` as const;
export type StaticComponentNameType = typeof StaticComponentName;

export interface StaticFieldComponentConfigFrame extends FieldComponentConfigFrame {
    /**
     * The template that can be used for setting content in innerHtml.
     */
    template?: string;
    /**
     * Additional context available to the template as `extraContext`.
     */
    extraContext?: any;
}

export interface StaticFieldComponentConfigOutline extends StaticFieldComponentConfigFrame, FieldComponentConfigOutline {
}

export interface StaticFieldComponentDefinitionFrame extends FieldComponentDefinitionFrame {
    class: StaticComponentNameType;
    config?: StaticFieldComponentConfigFrame;
}


export interface StaticFieldComponentDefinitionOutline extends StaticFieldComponentDefinitionFrame, FieldComponentDefinitionOutline {
    class: StaticComponentNameType;
    config?: StaticFieldComponentConfigOutline;
}


/* Static Form Component */
export interface StaticFormComponentDefinitionFrame extends FormComponentDefinitionFrame {
    component: StaticFieldComponentDefinitionFrame;
    model?: never;
    layout?: AvailableFieldLayoutDefinitionFrames;
}


export interface StaticFormComponentDefinitionOutline extends StaticFormComponentDefinitionFrame, FormComponentDefinitionOutline {
    component: StaticFieldComponentDefinitionOutline;
    model?: never;
    layout?: AvailableFieldLayoutDefinitionOutlines;
}

export type StaticTypes =
    { kind: FieldComponentConfigFrameKindType, class: StaticFieldComponentConfigFrame }
    | { kind: FieldComponentDefinitionFrameKindType, class: StaticFieldComponentDefinitionFrame }
    | { kind: FormComponentDefinitionFrameKindType, class: StaticFormComponentDefinitionFrame }
    | { kind: FieldComponentConfigKindType, class: StaticFieldComponentConfigOutline }
    | { kind: FieldComponentDefinitionKindType, class: StaticFieldComponentDefinitionOutline }
    | { kind: FormComponentDefinitionKindType, class: StaticFormComponentDefinitionOutline }
    ;
