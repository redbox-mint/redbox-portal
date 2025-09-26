
import { TemplateCompileInput} from "../../template.outline";
import {FormConfigVisitorOutline} from "../visitor/base.outline";
import {FieldComponentConfigKind, FieldComponentDefinitionKind, FormComponentDefinitionKind} from "../shared.outline";
import {FieldComponentConfig, FieldComponentDefinition} from "../field-component.model";
import {FormComponentDefinition} from "../form-component.model";
import {AvailableFieldLayoutDefinitionOutlines} from "../dictionary.outline";
import {
    ContentComponentName,
    ContentFieldComponentConfigOutline,
    ContentFieldComponentDefinitionOutline, ContentFormComponentDefinitionOutline
} from "./textblock.outline";


/* Content Component */

export class ContentFieldComponentConfig extends FieldComponentConfig implements ContentFieldComponentConfigOutline {
    template?: string;
    content?: string;

    constructor() {
        super();
    }
}




export class ContentFieldComponentDefinition extends FieldComponentDefinition implements ContentFieldComponentDefinitionOutline {
    class = ContentComponentName;
    config?: ContentFieldComponentConfig;

    constructor() {
        super();
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

    accept(visitor: FormConfigVisitorOutline) {
        visitor.visitContentFieldComponentDefinition(this);
    }

    // get getTemplateInfo(): TemplateCompileInput[] {
    //     const template = (this.config?.template ?? "").trim();
    //     if (template) {
    //         return [{key: "component.config.template", value: template, kind: "handlebars"}];
    //     } else {
    //         return [];
    //     }
    // }
    get templates(): TemplateCompileInput[] {
        throw new Error("Method not implemented.");
    }
}


/* Content Form Component */

export class ContentFormComponentDefinition extends FormComponentDefinition implements ContentFormComponentDefinitionOutline {
    component!: ContentFieldComponentDefinitionOutline;
    model?: never;
    layout?: AvailableFieldLayoutDefinitionOutlines;

    constructor() {
        super();
    }

    get templates(): TemplateCompileInput[] {
        throw new Error("Method not implemented.");
    }

    accept(visitor: FormConfigVisitorOutline) {
        visitor.visitContentFormComponentDefinition(this);
    }
}

export const ContentMap = [
    {kind: FieldComponentConfigKind, def: ContentFieldComponentConfig},
    {
        kind: FieldComponentDefinitionKind,
        def: ContentFieldComponentDefinition,
        class: ContentComponentName
    },
    {kind: FormComponentDefinitionKind, def: ContentFormComponentDefinition, class:ContentComponentName},
];

