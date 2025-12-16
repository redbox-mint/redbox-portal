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
    FieldModelConfigFrameKindType,
    FieldModelConfigKindType, FieldModelDefinitionFrameKindType,
    FieldModelDefinitionKindType, FormComponentDefinitionFrameKindType,
    FormComponentDefinitionKindType
} from "../shared.outline";
import {
    FieldModelConfigFrame,
    FieldModelConfigOutline,
    FieldModelDefinitionFrame,
    FieldModelDefinitionOutline
} from "../field-model.outline";

/* Content Component */

export const ContentComponentName = `ContentComponent` as const;
export type ContentComponentNameType = typeof ContentComponentName;

export interface ContentFieldComponentConfigFrame extends FieldComponentConfigFrame {
    /**
     * The template that can be used for setting content in innerHtml.
     */
    template?: string;
    /**
     * Additional context available to the template as `extraContext`.
     */
    extraContext?: any;
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

/* Content Model */

export const ContentModelName = "ContentModel" as const;
export type ContentModelNameType = typeof ContentModelName;
export type ContentModelValueType = unknown | null;

export interface ContentFieldModelConfigFrame extends FieldModelConfigFrame<ContentModelValueType> {
}

export interface ContentFieldModelConfigOutline extends ContentFieldModelConfigFrame, FieldModelConfigOutline<ContentModelValueType> {

}

export interface ContentFieldModelDefinitionFrame extends FieldModelDefinitionFrame<ContentModelValueType> {
    class: ContentModelNameType;
    config?: ContentFieldModelConfigFrame;
}

export interface ContentFieldModelDefinitionOutline extends ContentFieldModelDefinitionFrame, FieldModelDefinitionOutline<ContentModelValueType> {
    class: ContentModelNameType;
    config?: ContentFieldModelConfigOutline;
}

/* Content Form Component */
export interface ContentFormComponentDefinitionFrame extends FormComponentDefinitionFrame {
    component: ContentFieldComponentDefinitionFrame;
    model?: ContentFieldModelDefinitionFrame;
    layout?: AvailableFieldLayoutDefinitionFrames;
}


export interface ContentFormComponentDefinitionOutline extends ContentFormComponentDefinitionFrame, FormComponentDefinitionOutline {
    component: ContentFieldComponentDefinitionOutline;
    model?: ContentFieldModelDefinitionOutline;
    layout?: AvailableFieldLayoutDefinitionOutlines;
}

export type ContentTypes =
    { kind: FieldComponentConfigFrameKindType, class: ContentFieldComponentConfigFrame }
    | { kind: FieldComponentDefinitionFrameKindType, class: ContentFieldComponentDefinitionFrame }
    | { kind: FieldModelConfigFrameKindType, class: ContentFieldModelConfigFrame }
    | { kind: FieldModelDefinitionFrameKindType, class: ContentFieldModelDefinitionFrame }
    | { kind: FormComponentDefinitionFrameKindType, class: ContentFormComponentDefinitionFrame }
    | { kind: FieldComponentConfigKindType, class: ContentFieldComponentConfigOutline }
    | { kind: FieldComponentDefinitionKindType, class: ContentFieldComponentDefinitionOutline }
    | { kind: FieldModelConfigKindType, class: ContentFieldModelConfigOutline }
    | { kind: FieldModelDefinitionKindType, class: ContentFieldModelDefinitionOutline }
    | { kind: FormComponentDefinitionKindType, class: ContentFormComponentDefinitionOutline }
    ;
