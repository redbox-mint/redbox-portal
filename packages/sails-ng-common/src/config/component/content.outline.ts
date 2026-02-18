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

/* Content Component */

export const ContentComponentName = `ContentComponent` as const;
export type ContentComponentNameType = typeof ContentComponentName;

export interface ContentFieldComponentConfigFrame extends FieldComponentConfigFrame {
    /**
     * The template that can be used for setting content in innerHtml.
     */
    template?: string;
    /**
     * The value available to the template as `content`.
     * Set 'content' to static content, with no template, to just show the static content.
     */
    content?: unknown;
    /**
     * Whether the `content` value should be treated as a translation key.
     */
    contentIsTranslationCode?: boolean;
}

export interface ContentFieldComponentConfigOutline extends ContentFieldComponentConfigFrame, FieldComponentConfigOutline {
}

export interface ContentFieldComponentDefinitionFrame extends FieldComponentDefinitionFrame {
    class: ContentComponentNameType;
    config?: ContentFieldComponentConfigFrame;
}


export interface ContentFieldComponentDefinitionOutline extends ContentFieldComponentDefinitionFrame, FieldComponentDefinitionOutline {
    class: ContentComponentNameType;
    config?: ContentFieldComponentConfigOutline;
}

/* Content Form Component */
export interface ContentFormComponentDefinitionFrame extends FormComponentDefinitionFrame {
    component: ContentFieldComponentDefinitionFrame;
    model?: never;
    layout?: AvailableFieldLayoutDefinitionFrames;
}


export interface ContentFormComponentDefinitionOutline extends ContentFormComponentDefinitionFrame, FormComponentDefinitionOutline {
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
