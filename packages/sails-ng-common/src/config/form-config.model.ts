import {KeyValueStringNested, KeyValueStringProperty} from "./shared.model";
import {FormValidatorConfig} from "../validation/form.model";
import {AvailableFormComponentDefinitions} from "./static-types-classes.dictionary";
import {FormComponentDefinition} from "./form-component.model";
import {TemplateCompileInput} from "../template.model";
import {FormConfigVisitor} from "./visitor/base.model";
import {IFormConfig} from "./form-config.frame";

/**
 * The form definition.
 * */
export class FormConfig implements IFormConfig {
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
    public componentDefinitions: AvailableFormComponentDefinitions[] = [];
    public debugValue: boolean = false;

    get templates(): TemplateCompileInput[] {
        // TODO: validators
        throw new Error("Method not implemented.");
    }

    get children(): FormComponentDefinition[] {
        return this.componentDefinitions;
    }

    accept(visitor: FormConfigVisitor): void {
        visitor.visitFormConfig(this);
    }
}

