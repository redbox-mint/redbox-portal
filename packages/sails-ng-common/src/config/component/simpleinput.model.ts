import {BaseFormFieldModelConfig, BaseFormFieldModelDefinition} from "../form-field-model.model";
import {BaseFormFieldComponentConfig, BaseFormFieldComponentDefinition} from "../form-field-component.model";


export type SimpleInputModelValueType = string;

export interface SimpleInputComponentDefinition extends BaseFormFieldComponentDefinition {
    class: "SimpleInputComponent";
    config?: SimpleInputComponentConfig;
}

export class SimpleInputComponentConfig extends BaseFormFieldComponentConfig {
    type: "email" | "text" | "tel" | "number" | "password" | "url" = "text";
}

export interface SimpleInputModelDefinition extends BaseFormFieldModelDefinition<SimpleInputModelValueType> {
    class: "SimpleInputModel";
    config: SimpleInputModelConfig;
}

export class SimpleInputModelConfig extends BaseFormFieldModelConfig<SimpleInputModelValueType> {

}
