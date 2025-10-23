import {FormValidatorConfig} from "../validation/form.model";
import {AvailableFormComponentDefinitionOutlines} from "./dictionary.outline";
import {FormConfigOutline} from "./form-config.outline";
import {FormConfigVisitorOutline} from "./visitor/base.outline";
import {KeyValueStringNested, KeyValueStringProperty} from "./shared.outline";


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
    public skipValidationOnSave: boolean = false;
    public validators: FormValidatorConfig[] = [];
    public componentDefinitions: AvailableFormComponentDefinitionOutlines[] = [];
    public debugValue: boolean = false;

    accept(visitor: FormConfigVisitorOutline): void {
        visitor.visitFormConfig(this);
    }
}

