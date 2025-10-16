import {FormConfigVisitorOutline} from "../visitor/base.outline";
import {
    FieldComponentConfigKind,
    FieldComponentDefinitionKind,
    FieldLayoutConfigKind,
    FieldLayoutDefinitionKind, FormComponentDefinitionKind
} from "../shared.outline";
import {AvailableFormComponentDefinitionOutlines} from "../dictionary.outline";
import {FieldComponentConfig, FieldComponentDefinition} from "../field-component.model";
import {FieldLayoutConfig, FieldLayoutDefinition} from "../field-layout.model";
import {FormComponentDefinition} from "../form-component.model";
import {
    TabContentComponentName,
    TabContentFieldComponentConfigOutline,
    TabContentFieldComponentDefinitionOutline,
    TabContentFieldLayoutConfigOutline,
    TabContentFieldLayoutDefinitionOutline, TabContentFormComponentDefinitionOutline, TabContentLayoutName
} from "./tab-content.outline";


/* Tab Content Component */

export class TabContentFieldComponentConfig extends FieldComponentConfig implements TabContentFieldComponentConfigOutline {
    componentDefinitions: AvailableFormComponentDefinitionOutlines[];
    selected?: boolean = false;

    constructor() {
        super();
        this.componentDefinitions = [];
    }
}


export class TabContentFieldComponentDefinition extends FieldComponentDefinition implements TabContentFieldComponentDefinitionOutline {
    class = TabContentComponentName;
    config?: TabContentFieldComponentConfig;

    constructor() {
        super();
    }


    accept(visitor: FormConfigVisitorOutline): void {
        visitor.visitTabContentFieldComponentDefinition(this);
    }
}


/* Tab Content Layout */

export class TabContentFieldLayoutConfig extends FieldLayoutConfig implements TabContentFieldLayoutConfigOutline {
    buttonLabel?: string;

    constructor() {
        super();
    }
}


export class TabContentFieldLayoutDefinition extends FieldLayoutDefinition implements TabContentFieldLayoutDefinitionOutline {
    class = TabContentLayoutName;
    config?: TabContentFieldLayoutConfig;

    constructor() {
        super();
    }

    accept(visitor: FormConfigVisitorOutline): void {
        visitor.visitTabContentFieldLayoutDefinition(this);
    }
}

/* Tab Content Form Component */

export class TabContentFormComponentDefinition extends FormComponentDefinition implements TabContentFormComponentDefinitionOutline {
    public component!: TabContentFieldComponentDefinitionOutline;
    public model?: never;
    public layout?: TabContentFieldLayoutDefinitionOutline;

    constructor() {
        super();
    }

    accept(visitor: FormConfigVisitorOutline) {
        visitor.visitTabContentFormComponentDefinition(this);
    }
}

export const TabContentMap = [
    {kind: FieldComponentConfigKind, def: TabContentFieldComponentConfig},
    {kind: FieldComponentDefinitionKind, def: TabContentFieldComponentDefinition, class: TabContentComponentName},
    {kind: FieldLayoutConfigKind, def: TabContentFieldLayoutConfig},
    {kind: FieldLayoutDefinitionKind, def: TabContentFieldLayoutDefinition, class: TabContentLayoutName},
    {kind: FormComponentDefinitionKind, def: TabContentFormComponentDefinition, class: TabContentComponentName},
];
