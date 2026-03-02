import {
    FieldComponentConfigKind, FieldComponentDefinitionKind, FieldLayoutConfigKind, FieldLayoutDefinitionKind,
    FormComponentDefinitionKind, KeyValueStringProperty
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


/* Tab Component */

export class TabFieldComponentConfig extends FieldComponentConfig implements TabFieldComponentConfigOutline {
    tabs: TabContentFormComponentDefinitionOutline[];
    hostCssClasses = 'tab-content';

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

    accept(visitor: FormConfigVisitorOutline): void {
        visitor.visitTabFieldComponentDefinition(this);
    }
}

/* Tab Layout */


export class TabFieldLayoutConfig extends FieldLayoutConfig implements TabFieldLayoutConfigOutline {
    hostCssClasses?: KeyValueStringProperty = 'rb-form-tab-layout';
    tabShellCssClass?: string = 'rb-form-tab-shell';
    tabNavWrapperCssClass?: string = 'rb-form-tab-nav-wrapper';
    tabPanelWrapperCssClass?: string = 'rb-form-tab-panel-wrapper';
    buttonSectionCssClass?: string = 'rb-form-tab-nav nav flex-column nav-pills';
    tabPaneCssClass?: string = 'rb-form-tab-pane tab-pane fade';
    tabPaneActiveCssClass?: string = 'active show';
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
export const TabDefaults = {
    [FormComponentDefinitionKind]: {
        [TabComponentName]: {
            [FieldComponentDefinitionKind]: TabComponentName,
            [FieldLayoutDefinitionKind]: TabLayoutName,
        },
    },
};
