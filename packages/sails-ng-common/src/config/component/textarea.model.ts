import {BaseFormFieldModelConfig, BaseFormFieldModelDefinition} from "../form-field-model.model";
import {BaseFormFieldComponentConfig, BaseFormFieldComponentDefinition} from "../form-field-component.model";


export type TextareaModelValueType = string;

export interface TextareaComponentDefinition extends BaseFormFieldComponentDefinition {
    class: "TextareaComponent";
    config?: TextareaComponentConfig;
}

export class TextareaComponentConfig extends BaseFormFieldComponentConfig {
    public rows:number = 4;
    public cols:number = 50;
    public placeholder:string = '';
}

export interface TextareaModelDefinition extends BaseFormFieldModelDefinition<TextareaModelValueType> {
    class: "TextareaModel";
    config: TextareaModelConfig;
}

export class TextareaModelConfig extends BaseFormFieldModelConfig<TextareaModelValueType> {

}
