import {FormValidatorConfig} from "../validation/form.model";
import {AllFormComponentDefinitionOutlines, AvailableFormComponentDefinitionOutlines} from "./dictionary.outline";
import {TemplateCompileInput} from "../template.outline";
import {FormConfigOutline} from "./form-config.outline";
import {FormConfigVisitorOutline} from "./visitor/base.outline";
import {KeyValueStringNested, KeyValueStringProperty} from "./shared.outline";


/**
 * The form definition.
 * */
export class FormConfig implements FormConfigOutline {
    public name?: string;
    public type?: string;
    public domElementType?: string;
    public domId?: string;
    public viewCssClasses?: KeyValueStringProperty;
    public editCssClasses?: KeyValueStringProperty;
    public defaultComponentConfig?: KeyValueStringNested;
    public defaultLayoutComponent?: string;
    public skipValidationOnSave: boolean = false;
    public validators: FormValidatorConfig[] = [];
    public componentDefinitions: AvailableFormComponentDefinitionOutlines[] = [];
    public debugValue: boolean = false;

    get templates(): TemplateCompileInput[] {
        // TODO: validators
        throw new Error("Method not implemented.");
    }

    get children(): AllFormComponentDefinitionOutlines[] {
        return this.componentDefinitions;
    }

    accept(visitor: FormConfigVisitorOutline): void {
        visitor.visitFormConfig(this);
    }
}

