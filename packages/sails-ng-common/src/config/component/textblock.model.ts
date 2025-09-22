import {TemplateCompileInput} from "../../template.model";
import {BaseFormFieldComponentConfig, FormFieldComponentDefinition} from "../form-field-component.model";
import {FormConfigItemVisitor} from "../visitor";
import {FormComponentDefinition} from "../form-component.model";
import {RepeatableFormFieldComponentDefinition} from "./repeatable.model";


/* Content Component */
export const ContentComponentName = `ContentComponent` as const;
export type ContentComponentType = typeof ContentComponentName;

export class ContentFormFieldComponentDefinition extends FormFieldComponentDefinition {
    class: ContentComponentType = ContentComponentName;
    config?: ContentFormFieldComponentConfig;

    constructor(className: ContentComponentType, config?: ContentFormFieldComponentConfig) {
        super(className, config);
        this.config = config;
    }

    accept(visitor: FormConfigItemVisitor) {
        visitor.visitContentFormFieldComponentDefinition(this);
    }

    // get getTemplateInfo(): TemplateCompileInput[] {
    //     const template = (this.config?.template ?? "").trim();
    //     if (template) {
    //         return [{key: "component.config.template", value: template, kind: "handlebars"}];
    //     } else {
    //         return [];
    //     }
    // }
}

export class ContentFormFieldComponentConfig extends BaseFormFieldComponentConfig {

    /**
     * The template that can be used for setting content in innerHtml.
     */
    public template?: string = '';
    /**
     * The template that can be used for setting content in innerHtml.
     */
    public content?: string = '';
}

/* Content Form Component */
export class ContentFormComponentDefinition extends FormComponentDefinition {
    constructor(name: string, component: ContentFormFieldComponentDefinition) {
        super(name, component);
    }
    accept(visitor: FormConfigItemVisitor) {
        visitor.visitContentFormComponentDefinition(this);
    }
}
