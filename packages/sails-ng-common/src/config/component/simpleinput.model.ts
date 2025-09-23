import {
    FormFieldModelConfig, FormFieldModelDefinition,
    BaseFormFieldComponentConfig, BaseFormFieldComponentDefinition
} from "../";
import { FormConfigItemVisitor } from "../visitor";

/* Simple Inpout Component */

export type SimpleInputModelValueType = string;

export class SimpleInputComponentConfig extends BaseFormFieldComponentConfig {
    type: "email" | "text" | "tel" | "number" | "password" | "url" = "text";
}

export class SimpleInputComponentDefinition implements BaseFormFieldComponentDefinition {
    class: "SimpleInputComponent";
    config?: SimpleInputComponentConfig;
    accept(visitor: FormConfigItemVisitor): void {
        visitor.visitSimpleInputComponentDefinition(this);
    }
}


/* Simple Input Model */
export class SimpleInputModelConfig extends FormFieldModelConfig<SimpleInputModelValueType> {
}

export interface SimpleInputModelDefinition extends FormFieldModelDefinition<SimpleInputModelValueType> {
    class: "SimpleInputModel";
    config: SimpleInputModelConfig;
}

