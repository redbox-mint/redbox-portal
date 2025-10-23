import {FormConfigVisitorOutline} from "./visitor/base.outline";
import {
    FormComponentDefinitionOutline, FormConstraintAuthorizationConfigOutline,
    FormConstraintConfigOutline,
    FormExpressionsConfigOutline
} from "./form-component.outline";
import {FieldComponentDefinitionOutline} from "./field-component.outline";
import {FieldModelDefinitionOutline} from "./field-model.outline";
import {FieldLayoutDefinitionOutline} from "./field-layout.outline";
import {FormModesConfig} from "./shared.outline";

export class FormExpressionsConfig implements FormExpressionsConfigOutline {
    [key: string]: { template: string; condition?: unknown; };
}

/**
 * The constraints that must be fulfilled for the form field to be included.
 */
export class FormConstraintConfig implements FormConstraintConfigOutline {
    authorization?: FormConstraintAuthorizationConfig;
    allowModes?: FormModesConfig[]
}

/**
 * The options available for the authorization constraints.
 */
export class FormConstraintAuthorizationConfig implements FormConstraintAuthorizationConfigOutline {
    allowRoles?: string[];
}


/**
 * The form component abstract class is the base for each real component definition class.
 */
export abstract class FormComponentDefinition implements FormComponentDefinitionOutline {
    public name: string = "";
    public abstract component: FieldComponentDefinitionOutline;
    public abstract model?: FieldModelDefinitionOutline<unknown>;
    public abstract layout?: FieldLayoutDefinitionOutline;
    public expressions?: FormExpressionsConfigOutline;
    public module?: string;
    public constraints?: FormConstraintConfigOutline;

    abstract accept(visitor: FormConfigVisitorOutline): void;
}


/**
 *
 */
export interface FormComponentDefinitionTemplate {
    /**
     * The component template to use as defaults for properties not defined in the definitions.
     */
    templateName: string;
    /**
     * Override any properties from the component template.
     * Overrides are done by matching the 'name' property in
     * the component template and the components defined here.
     */
    componentDefinitions?: FormComponentDefinition[];
}