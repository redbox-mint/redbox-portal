import {
    FormComponentDefinition,
    FieldComponentDefinition,
    FieldComponentConfigFrame,
    FieldComponentDefinitionFrame,
    FieldComponentConfigKind,
    FieldComponentDefinitionKind,
    FormComponentDefinitionKind,
    FormComponentDefinitionFrame,
    DefaultFieldLayoutDefinitionFrame,
    FieldComponentConfig,
    FormConfigItemVisitor,
    HasCompilableTemplates,
    TemplateCompileInput, DefaultFieldLayoutDefinition,
} from "../..";


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

    constructor(data?: ContentFieldComponentConfigFrame) {
        super(data);
    }
}


export interface ContentFieldComponentDefinitionFrame extends FieldComponentDefinitionFrame {
    class: ContentComponentNameType;
    config?: ContentFieldComponentConfigFrame
}


export class ContentFieldComponentDefinition extends FieldComponentDefinition implements ContentFieldComponentDefinitionFrame, HasCompilableTemplates {
    class = ContentComponentName;
    config?: ContentFieldComponentConfig;

    constructor(data: ContentFieldComponentDefinitionFrame) {
        super(data);
        this.config = new ContentFieldComponentConfig(data.config);
    }

    accept(visitor: FormConfigItemVisitor) {
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
    layout?: DefaultFieldLayoutDefinitionFrame;
}

export class ContentFormComponentDefinition extends FormComponentDefinition implements ContentFormComponentDefinitionFrame {
    component: ContentFieldComponentDefinition;
    layout?: DefaultFieldLayoutDefinition;
    constructor(data: ContentFormComponentDefinitionFrame) {
        super(data);
        this.component = new ContentFieldComponentDefinition(data.component);
        this.layout = new DefaultFieldLayoutDefinition(data.layout);
    }

    accept(visitor: FormConfigItemVisitor) {
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

