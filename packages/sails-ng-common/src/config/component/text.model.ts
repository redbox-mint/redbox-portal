import {BaseFormFieldModelConfig, BaseFormFieldModelDefinition} from "../form-field-model.model";
import {FormComponentDefinition} from "../form-component.model";
import {BaseFormFieldComponentConfig, BaseFormFieldComponentDefinition} from "../form-field-component.model";


export type TextFieldModelValueType = string;

export interface TextFormFieldComponentDefinition extends BaseFormFieldComponentDefinition {
    class: "TextFieldComponent";
    config?: TextFormFieldComponentConfig;
}

export class TextFormFieldComponentConfig extends BaseFormFieldComponentConfig {
    componentDefinitions?: FormComponentDefinition[];
}

export interface TextFormFieldModelDefinition extends BaseFormFieldModelDefinition<TextFieldModelValueType> {
    class: "TextFieldModel";
    config: TextFormFieldModelConfig;
}

export class TextFormFieldModelConfig extends BaseFormFieldModelConfig<TextFieldModelValueType> {

}
