import {FormFieldModelConfig, FormFieldModelDefinition} from "../form-field-model.model";
import {BaseFormFieldComponentConfig, BaseFormFieldComponentDefinition} from "../form-field-component.model";

/* Simple Inpout Component */

export type SimpleInputModelValueType = string;

export class SimpleInputComponentConfig extends BaseFormFieldComponentConfig {
    type: "email" | "text" | "tel" | "number" | "password" | "url" = "text";
}
export class SimpleInputComponentDefinition implements BaseFormFieldComponentDefinition {
    class: "SimpleInputComponent";
    config?: SimpleInputComponentConfig;
}


/* Simple Input Model */
export class SimpleInputModelConfig extends FormFieldModelConfig<SimpleInputModelValueType> {
}

export interface SimpleInputModelDefinition extends FormFieldModelDefinition<SimpleInputModelValueType> {
    class: "SimpleInputModel";
    config: SimpleInputModelConfig;
}

