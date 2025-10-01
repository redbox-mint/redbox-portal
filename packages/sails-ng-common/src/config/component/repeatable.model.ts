import {
    FieldComponentConfig,
    FieldComponentDefinition,
} from "../field-component.model";
import {
    FieldModelConfig,
    FieldModelDefinition
} from "../field-model.model";
import {FormComponentDefinition} from "../form-component.model";
import {
    FieldLayoutConfig,
    FieldLayoutDefinition,
} from "../field-layout.model";
import {FormConfigVisitorOutline} from "../visitor/base.outline";
import {
    FieldComponentConfigKind, FieldComponentDefinitionKind,
    FieldLayoutConfigKind,
    FieldLayoutDefinitionKind,
    FieldModelConfigKind,
    FieldModelDefinitionKind, FormComponentDefinitionKind
} from "../shared.outline";
import {
    RepeatableComponentName,
    RepeatableElementFieldLayoutConfigOutline,
    RepeatableElementFieldLayoutDefinitionOutline,
    RepeatableElementLayoutName, RepeatableFieldComponentConfigOutline,
    RepeatableFieldComponentDefinitionOutline,
    RepeatableFieldModelConfigOutline, RepeatableFieldModelDefinitionOutline, RepeatableFormComponentDefinitionOutline,
    RepeatableModelName,
    RepeatableModelValueType
} from "./repeatable.outline";
import {
    AllFormComponentDefinitionOutlines,
    AvailableFieldLayoutDefinitionOutlines, AvailableFormComponentDefinitionOutlines
} from "../dictionary.outline";


/* Repeatable Component */
export class RepeatableFieldComponentConfig extends FieldComponentConfig implements RepeatableFieldComponentConfigOutline {
    elementTemplate!: AvailableFormComponentDefinitionOutlines;

    constructor() {
        super();
    }

    /**
     * Create a unique ID using the current timestamp and a random number.
     * This unique id must not be stored in the database.
     * It will be different for each form load.
     * It is for distinguishing the repeatable element entries.
     */
    public static getLocalUID(): string {
        const randomNumber = Math.floor(Math.random() * 10000).toString().padStart(5, '0');
        return `${Date.now()}-${randomNumber}`;
    }
}


export class RepeatableFieldComponentDefinition extends FieldComponentDefinition implements RepeatableFieldComponentDefinitionOutline {
    class = RepeatableComponentName;
    config?: RepeatableFieldComponentConfigOutline;

    constructor() {
        super();
    }

    get children(): AllFormComponentDefinitionOutlines[] {
        throw new Error("Method not implemented.");
    }

    accept(visitor: FormConfigVisitorOutline) {
        visitor.visitRepeatableFieldComponentDefinition(this);
    }
}


/* Repeatable Model */
export class RepeatableFieldModelConfig extends FieldModelConfig<RepeatableModelValueType> implements RepeatableFieldModelConfigOutline {
    constructor() {
        super();
    }
}

export class RepeatableFieldModelDefinition extends FieldModelDefinition<RepeatableModelValueType> implements RepeatableFieldModelDefinitionOutline {
    class = RepeatableModelName;
    config?: RepeatableFieldModelConfigOutline;

    constructor() {
        super();
    }

    accept(visitor: FormConfigVisitorOutline) {
        visitor.visitRepeatableFieldModelDefinition(this);
    }
}


/* Repeatable Element Layout */
export class RepeatableElementFieldLayoutConfig extends FieldLayoutConfig implements RepeatableElementFieldLayoutConfigOutline {
    constructor() {
        super();
    }
}

export class RepeatableElementFieldLayoutDefinition extends FieldLayoutDefinition implements RepeatableElementFieldLayoutDefinitionOutline {
    public class = RepeatableElementLayoutName;
    public config?: RepeatableElementFieldLayoutConfigOutline;

    constructor() {
        super();
    }

    accept(visitor: FormConfigVisitorOutline) {
        visitor.visitRepeatableElementFieldLayoutDefinition(this);
    }
}


/* Repeatable Form Component */
export class RepeatableFormComponentDefinition extends FormComponentDefinition implements RepeatableFormComponentDefinitionOutline {
    public component!: RepeatableFieldComponentDefinitionOutline;
    public model?: RepeatableFieldModelDefinitionOutline;
    public layout?: AvailableFieldLayoutDefinitionOutlines;

    constructor() {
        super();
    }

    accept(visitor: FormConfigVisitorOutline) {
        visitor.visitRepeatableFormComponentDefinition(this);
    }
}

export const RepeatableMap = [
    {kind: FieldComponentConfigKind, def: RepeatableFieldComponentConfig},
    {kind: FieldComponentDefinitionKind, def: RepeatableFieldComponentDefinition, class: RepeatableComponentName},
    {kind: FieldModelConfigKind, def: RepeatableFieldModelConfig},
    {kind: FieldModelDefinitionKind, def: RepeatableFieldModelDefinition, class: RepeatableModelName},
    {kind: FieldLayoutConfigKind, def: RepeatableElementFieldLayoutConfig},
    {kind: FieldLayoutDefinitionKind, def: RepeatableElementFieldLayoutDefinition, class: RepeatableElementLayoutName},
    {kind: FormComponentDefinitionKind, def: RepeatableFormComponentDefinition, class:RepeatableComponentName},
];
