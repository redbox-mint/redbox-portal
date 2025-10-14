import {
    FieldComponentConfigKind, FieldComponentDefinitionKind, FieldLayoutConfigKind, FieldLayoutDefinitionKind,
    FormComponentDefinitionKind
} from "../shared.outline";
import {
    ButtonSectionAriaOrientationOptionsType,
    TabComponentName, TabFieldComponentConfigOutline, TabFieldComponentDefinitionOutline, TabFieldLayoutConfigOutline,
    TabFieldLayoutDefinitionOutline, TabFormComponentDefinitionOutline,
    TabLayoutName
} from "./tab.outline";
import {FormComponentDefinition} from "../form-component.model";
import {FormConfigVisitorOutline} from "../visitor/base.outline";
import {FieldComponentConfig, FieldComponentDefinition} from "../field-component.model";
import {FieldLayoutConfig, FieldLayoutDefinition} from "../field-layout.model";
import {TabContentFormComponentDefinitionOutline} from "./tab-content.outline";
import {AllFormComponentDefinitionOutlines} from "../dictionary.outline";


/* Tab Component */

export class TabFieldComponentConfig extends FieldComponentConfig implements TabFieldComponentConfigOutline {
    tabs: TabContentFormComponentDefinitionOutline[];

    constructor() {
        super();
        this.tabs = [];
    }
}


export class TabFieldComponentDefinition extends FieldComponentDefinition implements TabFieldComponentDefinitionOutline {
    class = TabComponentName;
    config?: TabFieldComponentConfigOutline;

    constructor() {
        super();
    }

    get children(): AllFormComponentDefinitionOutlines[] {
        throw new Error("Method not implemented.");
    }

    accept(visitor: FormConfigVisitorOutline): void {
        visitor.visitTabFieldComponentDefinition(this);
    }
}

/* Tab Layout */


export class TabFieldLayoutConfig extends FieldLayoutConfig implements TabFieldLayoutConfigOutline {
    buttonSectionCssClass?: string;
    tabPaneCssClass?: string;
    tabPaneActiveCssClass?: string;
    buttonSectionAriaOrientation?: ButtonSectionAriaOrientationOptionsType = 'vertical';

    constructor() {
        super();
    }
}

export class TabFieldLayoutDefinition extends FieldLayoutDefinition implements TabFieldLayoutDefinitionOutline {
    class = TabLayoutName;
    config?: TabFieldLayoutConfigOutline;

    constructor() {
        super();
    }

    accept(visitor: FormConfigVisitorOutline): void {
        visitor.visitTabFieldLayoutDefinition(this);
    }
}

/* Tab Form Component */


export class TabFormComponentDefinition extends FormComponentDefinition implements TabFormComponentDefinitionOutline {
    public component!: TabFieldComponentDefinitionOutline;
    public model?: never;
    public layout?: TabFieldLayoutDefinitionOutline;

    constructor() {
        super();
    }

    accept(visitor: FormConfigVisitorOutline) {
        visitor.visitTabFormComponentDefinition(this);
    }
}

export const TabMap = [
    {kind: FieldComponentConfigKind, def: TabFieldComponentConfig},
    {kind: FieldComponentDefinitionKind, def: TabFieldComponentDefinition, class: TabComponentName},
    {kind: FieldLayoutConfigKind, def: TabFieldLayoutConfig},
    {kind: FieldLayoutDefinitionKind, def: TabFieldLayoutDefinition, class: TabLayoutName},
    {kind: FormComponentDefinitionKind, def: TabFormComponentDefinition, class:TabComponentName},
];
