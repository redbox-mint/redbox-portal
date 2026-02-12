import {
    FieldComponentConfig,
    FieldComponentDefinition,
} from "../field-component.model";
import {
    FieldModelConfig,
    FieldModelDefinition
} from "../field-model.model";
import {FormComponentDefinition,} from "../form-component.model";
import {FormConfigVisitorOutline} from "../visitor/base.outline";
import {
    FieldComponentConfigKind,
    FieldComponentDefinitionKind,
    FieldModelConfigKind,
    FieldModelDefinitionKind, FormComponentDefinitionKind
} from "../shared.outline";
import {
    RichTextEditorComponentName,
    RichTextEditorFieldComponentConfigOutline,
    RichTextEditorFieldComponentDefinitionOutline,
    RichTextEditorFieldModelConfigOutline,
    RichTextEditorFieldModelDefinitionOutline,
    RichTextEditorFormComponentDefinitionOutline,
    RichTextEditorModelName,
    RichTextEditorModelValueType
} from "./rich-text-editor.outline";
import {AvailableFieldLayoutDefinitionOutlines} from "../dictionary.outline";

/* Rich Text Editor Component */

const defaultToolbar = ["heading", "bold", "italic", "link", "bulletList", "orderedList", "blockquote", "table", "undo", "redo"];

export class RichTextEditorFieldComponentConfig extends FieldComponentConfig implements RichTextEditorFieldComponentConfigOutline {
    outputFormat: "html" | "markdown" = "html";
    showSourceToggle = false;
    toolbar: string[] = [...defaultToolbar];
    minHeight: string = "200px";
    placeholder: string = "";

    constructor() {
        super();
    }
}

export class RichTextEditorFieldComponentDefinition extends FieldComponentDefinition implements RichTextEditorFieldComponentDefinitionOutline {
    class = RichTextEditorComponentName;
    config?: RichTextEditorFieldComponentConfigOutline;

    constructor() {
        super();
    }

    accept(visitor: FormConfigVisitorOutline): void {
        visitor.visitRichTextEditorFieldComponentDefinition(this);
    }
}

/* Rich Text Editor Model */

export class RichTextEditorFieldModelConfig extends FieldModelConfig<RichTextEditorModelValueType> implements RichTextEditorFieldModelConfigOutline {
    constructor() {
        super();
    }
}

export class RichTextEditorFieldModelDefinition extends FieldModelDefinition<RichTextEditorModelValueType> implements RichTextEditorFieldModelDefinitionOutline {
    class = RichTextEditorModelName;
    config?: RichTextEditorFieldModelConfigOutline;

    constructor() {
        super();
    }

    accept(visitor: FormConfigVisitorOutline): void {
        visitor.visitRichTextEditorFieldModelDefinition(this);
    }
}

/* Rich Text Editor Form Component */

export class RichTextEditorFormComponentDefinition extends FormComponentDefinition implements RichTextEditorFormComponentDefinitionOutline {
    public component!: RichTextEditorFieldComponentDefinitionOutline;
    public model?: RichTextEditorFieldModelDefinitionOutline;
    public layout?: AvailableFieldLayoutDefinitionOutlines;

    constructor() {
        super();
    }

    accept(visitor: FormConfigVisitorOutline) {
        visitor.visitRichTextEditorFormComponentDefinition(this);
    }
}

export const RichTextEditorMap = [
    {kind: FieldComponentConfigKind, def: RichTextEditorFieldComponentConfig},
    {kind: FieldComponentDefinitionKind, def: RichTextEditorFieldComponentDefinition, class: RichTextEditorComponentName},
    {kind: FieldModelConfigKind, def: RichTextEditorFieldModelConfig},
    {kind: FieldModelDefinitionKind, def: RichTextEditorFieldModelDefinition, class: RichTextEditorModelName},
    {kind: FormComponentDefinitionKind, def: RichTextEditorFormComponentDefinition, class: RichTextEditorComponentName},
];
export const RichTextEditorDefaults = {
    [FormComponentDefinitionKind]: {
        [RichTextEditorComponentName]: {
            [FieldComponentDefinitionKind]: RichTextEditorComponentName,
            [FieldModelDefinitionKind]: RichTextEditorModelName,
        },
    },
};
