import {FormConfigVisitorOutline} from "../visitor/base.outline";
import {
    FieldComponentConfigKind,
    FieldComponentDefinitionKind,
    FormComponentDefinitionKind
} from "../shared.outline";
import {FieldComponentConfig, FieldComponentDefinition} from "../field-component.model";
import {FormComponentDefinition} from "../form-component.model";
import {AvailableFieldLayoutDefinitionOutlines} from "../dictionary.outline";
import {
    ContentComponentName,
    ContentFieldComponentConfigOutline,
    ContentFieldComponentDefinitionOutline,
     ContentFormComponentDefinitionOutline,
} from "./content.outline";


/* Content Component */

export class ContentFieldComponentConfig extends FieldComponentConfig implements ContentFieldComponentConfigOutline {
    template?: string;
    content?: unknown;
    contentIsTranslationCode?: boolean;

    constructor() {
        super();
    }
}


export class ContentFieldComponentDefinition extends FieldComponentDefinition implements ContentFieldComponentDefinitionOutline {
    class = ContentComponentName;
    config?: ContentFieldComponentConfig;

    constructor() {
        super();
    }

    accept(visitor: FormConfigVisitorOutline) {
        visitor.visitContentFieldComponentDefinition(this);
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

    accept(visitor: FormConfigVisitorOutline) {
        visitor.visitContentFormComponentDefinition(this);
    }
}

export const ContentMap = [
    {kind: FieldComponentConfigKind, def: ContentFieldComponentConfig},
    {kind: FieldComponentDefinitionKind, def: ContentFieldComponentDefinition, class: ContentComponentName},
    {kind: FormComponentDefinitionKind, def: ContentFormComponentDefinition, class: ContentComponentName},
];
export const ContentDefaults = {
    [FormComponentDefinitionKind]: {
        [ContentComponentName]: {
            [FieldComponentDefinitionKind]: ContentComponentName,
        },
    },
};
