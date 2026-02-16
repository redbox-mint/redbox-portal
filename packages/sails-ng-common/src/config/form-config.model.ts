import { FormValidationGroups, FormValidatorConfig } from "../validation/form.model";
import { AvailableFormComponentDefinitionOutlines } from "./dictionary.outline";
import { FormConfigOutline } from "./form-config.outline";
import { FormConfigVisitorOutline } from "./visitor/base.outline";
import { KeyValueStringNested, KeyValueStringProperty } from "./shared.outline";
import { FormExpressionsConfigOutline } from "./form-component.outline";


/**
 * The form definition.
 * */
export class FormConfig implements FormConfigOutline {
    public name: string = '';
    public type?: string;
    public domElementType?: string;
    public domId?: string;
    public viewCssClasses?: KeyValueStringProperty;
    public editCssClasses?: KeyValueStringProperty;
    public defaultComponentConfig?: KeyValueStringNested;
    public defaultLayoutComponent?: string;
    public enabledValidationGroups?: string[] = ["all"];
    public validators: FormValidatorConfig[] = [];
    public validationGroups?: FormValidationGroups = {
        all: { description: "Validate all fields with validators.", initialMembership: "all" },
        none: { description: "Validate none of the fields.", initialMembership: "none" },
    };
    public componentDefinitions: AvailableFormComponentDefinitionOutlines[] = [];
    public debugValue: boolean = false;
    public expressions?: FormExpressionsConfigOutline[];

    public attachmentFields?: string[];

    accept(visitor: FormConfigVisitorOutline): void {
        visitor.visitFormConfig(this);
    }
}

