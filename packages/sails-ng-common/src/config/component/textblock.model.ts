import {
    FieldComponentConfig,
    FieldComponentConfigFrame,
    FieldComponentDefinition,
    FieldComponentDefinitionFrame
} from "../field-component.model";
import {
    AvailableFieldLayoutDefinitionFrames, AvailableFieldLayoutDefinitions,

} from "../static-types-classes.dictionary";

import {FormComponentDefinition, FormComponentDefinitionFrame,} from "../form-component.model";
import {
    FieldComponentConfigKind,
    FieldComponentDefinitionKind,
    FormComponentDefinitionKind
} from "../shared.model";
import {HasCompilableTemplates, TemplateCompileInput} from "../../template.model";
import {IFormConfigVisitor} from "../visitor/base.structure";


/* Content Component */
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

export class ContentFieldComponentConfig extends FieldComponentConfig implements ContentFieldComponentConfigFrame {
    template?: string;
    content?: string;

    constructor() {
        super();
    }
}


export interface ContentFieldComponentDefinitionFrame extends FieldComponentDefinitionFrame {
    class: ContentComponentNameType;
    config?: ContentFieldComponentConfigFrame
}


export class ContentFieldComponentDefinition extends FieldComponentDefinition implements ContentFieldComponentDefinitionFrame, HasCompilableTemplates {
    class = ContentComponentName;
    config?: ContentFieldComponentConfig;

    constructor() {
        super();
    }

    accept(visitor: IFormConfigVisitor) {
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
export interface ContentFormComponentDefinitionFrame extends FormComponentDefinitionFrame {
    component: ContentFieldComponentDefinitionFrame;
    model?: never;
    layout?: AvailableFieldLayoutDefinitionFrames;
}

export class ContentFormComponentDefinition extends FormComponentDefinition implements ContentFormComponentDefinitionFrame {
    component: ContentFieldComponentDefinition;
    model?: never;
    layout?: AvailableFieldLayoutDefinitions;

    constructor() {
        super();
        this.component = new ContentFieldComponentDefinition();
    }

    accept(visitor: IFormConfigVisitor) {
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
    {kind: FormComponentDefinitionKind, def: ContentFormComponentDefinition},
];
export type ContentFrames =
    ContentFieldComponentConfigFrame
    | ContentFieldComponentDefinitionFrame
    | ContentFormComponentDefinitionFrame;

