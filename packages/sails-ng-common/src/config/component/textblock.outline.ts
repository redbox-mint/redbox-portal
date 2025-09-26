/* Content Component */
import {AvailableFieldLayoutDefinitionFrames, AvailableFieldLayoutDefinitionOutlines} from "../dictionary.outline";
import {HasCompilableTemplates} from "../../template.outline";
import {FormComponentDefinitionFrame, FormComponentDefinitionOutline} from "../form-component.outline";
import {
    FieldComponentConfigFrame,
    FieldComponentConfigOutline,
    FieldComponentDefinitionFrame, FieldComponentDefinitionOutline
} from "../field-component.outline";
import {
    FieldComponentConfigFrameKindType, FieldComponentConfigKindType,
    FieldComponentDefinitionFrameKindType, FieldComponentDefinitionKindType, FormComponentDefinitionFrameKindType,
    FormComponentDefinitionKindType
} from "../shared.outline";

export const ContentComponentName = `ContentComponent` as const;
export type ContentComponentNameType = typeof ContentComponentName;

export interface ContentFieldComponentConfigFrame extends FieldComponentConfigFrame {
    /**
     * The template that can be used for setting content in innerHtml.
     */
    template?: string;
    /**
     * The template that can be used for setting content in innerHtml.
     */
    content?: string;
}

export interface ContentFieldComponentConfigOutline extends ContentFieldComponentConfigFrame, FieldComponentConfigOutline {
    template?: string;
    content?: string;
}

export interface ContentFieldComponentDefinitionFrame extends FieldComponentDefinitionFrame {
    class: ContentComponentNameType;
    config?: ContentFieldComponentConfigFrame;
}


export interface ContentFieldComponentDefinitionOutline extends ContentFieldComponentDefinitionFrame, HasCompilableTemplates, FieldComponentDefinitionOutline {
    class: ContentComponentNameType;
    config?: ContentFieldComponentConfigOutline;
}

/* Content Form Component */
export interface ContentFormComponentDefinitionFrame extends FormComponentDefinitionFrame {
    component: ContentFieldComponentDefinitionFrame;
    model?: never;
    layout?: AvailableFieldLayoutDefinitionFrames;
}


export interface ContentFormComponentDefinitionOutline extends ContentFormComponentDefinitionFrame, HasCompilableTemplates, FormComponentDefinitionOutline {
    component: ContentFieldComponentDefinitionOutline;
    model?: never;
    layout?: AvailableFieldLayoutDefinitionOutlines;
}

export type ContentTypes =
    { kind: FieldComponentConfigFrameKindType, class: ContentFieldComponentConfigFrame }
    | { kind: FieldComponentDefinitionFrameKindType, class: ContentFieldComponentDefinitionFrame }
    | { kind: FormComponentDefinitionFrameKindType, class: ContentFormComponentDefinitionFrame }
    | { kind: FieldComponentConfigKindType, class: ContentFieldComponentConfigOutline }
    | { kind: FieldComponentDefinitionKindType, class: ContentFieldComponentDefinitionOutline }
    | { kind: FormComponentDefinitionKindType, class: ContentFormComponentDefinitionOutline }
    ;

