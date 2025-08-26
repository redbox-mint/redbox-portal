import {BaseFormFieldComponentConfig, BaseFormFieldComponentDefinition} from "../form-field-component.model";


export interface ContentComponentDefinition extends BaseFormFieldComponentDefinition {
    class: "ContentComponent";
    config?: ContentComponentConfig;
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

