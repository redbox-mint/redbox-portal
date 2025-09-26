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
    public name: string;
    // Using definite assignment assertion operator (!) to say that component does not need to be set in the abstract class constructor.
    // The component property can't be set here, as FieldComponentDefinition is abstract there is no way to work out which class to use.
    // Subclasses set the component property with a new instance of the proper class.
    public abstract component: FieldComponentDefinitionOutline;
    public abstract model?: FieldModelDefinitionOutline<unknown>;
    public abstract layout?: FieldLayoutDefinitionOutline;
    public expressions?: FormExpressionsConfigOutline;
    public module?: string;
    public constraints?: FormConstraintConfigOutline;

    protected constructor() {
        this.name = "";
    }

    abstract accept(visitor: FormConfigVisitorOutline): void;
}

