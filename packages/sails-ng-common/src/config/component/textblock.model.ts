import {BaseFormFieldComponentConfig, BaseFormFieldComponentDefinition} from "../form-field-component.model";


export interface ContentComponentDefinition extends BaseFormFieldComponentDefinition {
    class: "ContentComponent";
    config?: ContentComponentConfig;

    // TODO: some way to obtain the path to the property that contains a template that needs to be compiled
    //       should include the type of template
    // or in the Config class
    // this is a way to allow custom components to provide their templates for compilation
    // static getTemplates();

    // e.g. in the form config
    // template: {
    //     class: '',
    //     template: '<h3>{{content}}</h3>',
    // }
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

