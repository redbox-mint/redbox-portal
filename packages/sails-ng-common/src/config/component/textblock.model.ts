import { TemplateCompileInput } from "../../template.model";
import {BaseFormFieldComponentConfig, BaseFormFieldComponentDefinition} from "../form-field-component.model";


/* Names */
export const ContentComponentName = `ContentComponent` as const;

/* Types */
export type ContentComponentType = typeof ContentComponentName;


/* Classes */
export class ContentComponentDefinition implements BaseFormFieldComponentDefinition {
    class: ContentComponentType = ContentComponentName;
    config?: ContentComponentConfig;

    get getTemplateInfo(): TemplateCompileInput[] {
        const template = (this.config?.template ?? "").trim();
        if (template){
            return [{key: "component.config.template", value: template, kind: "handlebars"}];
        } else {
            return [];
        }
    }
}

export class ContentComponentConfig extends BaseFormFieldComponentConfig {
    
    /**
     * The template that can be used for setting content in innerHtml.
     */
    public template?: string = '';
    /**
     * The template that can be used for setting content in innerHtml.
     */
    public content?: string = '';
}
