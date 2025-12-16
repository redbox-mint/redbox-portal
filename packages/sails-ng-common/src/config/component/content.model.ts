import {FormConfigVisitorOutline} from "../visitor/base.outline";
import {
    FieldComponentConfigKind,
    FieldComponentDefinitionKind,
    FieldModelConfigKind, FieldModelDefinitionKind,
    FormComponentDefinitionKind
} from "../shared.outline";
import {FieldComponentConfig, FieldComponentDefinition} from "../field-component.model";
import {FormComponentDefinition} from "../form-component.model";
import {AvailableFieldLayoutDefinitionOutlines} from "../dictionary.outline";
import {
    ContentComponentName,
    ContentFieldComponentConfigOutline,
    ContentFieldComponentDefinitionOutline, ContentFieldModelConfigOutline,
    ContentFieldModelDefinitionOutline, ContentFormComponentDefinitionOutline,
    ContentModelName, ContentModelValueType
} from "./content.outline";
import { FieldModelConfig, FieldModelDefinition } from "../field-model.model";


/* Content Component */

export class ContentFieldComponentConfig extends FieldComponentConfig implements ContentFieldComponentConfigOutline {
    template?: string;
    extraContext?: any;

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

/* Content Model */


export class ContentFieldModelConfig extends FieldModelConfig<ContentModelValueType> implements ContentFieldModelConfigOutline {
    constructor() {
        super();
    }
}

export class ContentFieldModelDefinition extends FieldModelDefinition<ContentModelValueType> implements ContentFieldModelDefinitionOutline {
    class = ContentModelName;
    config?: ContentFieldModelConfigOutline;

    constructor() {
        super();
    }

    accept(visitor: FormConfigVisitorOutline): void {
        visitor.visitContentFieldModelDefinition(this);
    }
}


/* Content Form Component */

export class ContentFormComponentDefinition extends FormComponentDefinition implements ContentFormComponentDefinitionOutline {
    component!: ContentFieldComponentDefinitionOutline;
    model?: ContentFieldModelDefinitionOutline;
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
    {kind: FieldModelConfigKind, def: ContentFieldModelConfig},
    {kind: FieldModelDefinitionKind, def: ContentFieldModelDefinition, class: ContentModelName},
    {kind: FormComponentDefinitionKind, def: ContentFormComponentDefinition, class: ContentComponentName},
];

