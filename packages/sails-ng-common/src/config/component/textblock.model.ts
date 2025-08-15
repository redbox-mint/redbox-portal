import {BaseFormFieldModelConfig, BaseFormFieldModelDefinition} from "../form-field-model.model";
import {BaseFormFieldComponentConfig, BaseFormFieldComponentDefinition} from "../form-field-component.model";


export type TextBlockModelValueType = string;

export interface TextBlockComponentDefinition extends BaseFormFieldComponentDefinition {
    class: "TextBlockComponent";
    config?: TextBlockComponentConfig;
}

export class TextBlockComponentConfig extends BaseFormFieldComponentConfig {}

export interface TextBlockModelDefinition extends BaseFormFieldModelDefinition<TextBlockModelValueType> {
    class: "TextBlockModel";
    config: TextBlockModelConfig;
}

export class TextBlockModelConfig extends BaseFormFieldModelConfig<TextBlockModelValueType> {}
