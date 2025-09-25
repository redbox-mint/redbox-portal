

/* Content Component */
import {AvailableFieldLayoutDefinitionFrames, AvailableFieldLayoutDefinitionOutlines} from "../dictionary.outline";
import {HasCompilableTemplates} from "../../template.outline";
import {FormComponentDefinitionFrame} from "../form-component.outline";
import {FieldComponentConfigFrame, FieldComponentDefinitionFrame} from "../field-component.outline";

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

export interface ContentFieldComponentConfigOutline extends ContentFieldComponentConfigFrame {
    template?: string;
    content?: string;
}
export interface ContentFieldComponentDefinitionFrame extends FieldComponentDefinitionFrame {
    class: ContentComponentNameType;
    config?: ContentFieldComponentConfigFrame;
}


export interface ContentFieldComponentDefinitionOutline extends ContentFieldComponentDefinitionFrame, HasCompilableTemplates {
    class: ContentComponentNameType;
    config?: ContentFieldComponentConfigOutline;
}

/* Content Form Component */
export interface ContentFormComponentDefinitionFrame extends FormComponentDefinitionFrame {
    component: ContentFieldComponentDefinitionFrame;
    model?: never;
    layout?: AvailableFieldLayoutDefinitionFrames;
}



export interface ContentFormComponentDefinitionOutline extends ContentFormComponentDefinitionFrame, HasCompilableTemplates {
    component: ContentFieldComponentDefinitionOutline;
    model?: never;
    layout?: AvailableFieldLayoutDefinitionOutlines;
}

export type ContentFrames =
    ContentFieldComponentConfigFrame
    | ContentFieldComponentDefinitionFrame
    | ContentFormComponentDefinitionFrame;


export type ContentOutlines =
    ContentFieldComponentConfigOutline
    | ContentFieldComponentDefinitionOutline
    | ContentFormComponentDefinitionOutline;

