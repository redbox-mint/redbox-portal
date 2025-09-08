import {BaseFormFieldModelConfig, BaseFormFieldModelDefinition} from "../form-field-model.model";
import {BaseFormFieldComponentConfig, BaseFormFieldComponentDefinition} from "../form-field-component.model";


export type TextareaModelValueType = string;

export interface TextAreaComponentDefinition extends BaseFormFieldComponentDefinition {
    class: "TextAreaComponent";
    config?: TextAreaComponentConfig;
}

export class TextAreaComponentConfig extends BaseFormFieldComponentConfig {
    public rows:number = 2;
    public cols:number = 20;
    public placeholder?:string = '';
}

export interface TextareaModelDefinition extends BaseFormFieldModelDefinition<TextareaModelValueType> {
    class: "TextAreaModel";
    config: TextareaModelConfig;
}

export class TextareaModelConfig extends BaseFormFieldModelConfig<TextareaModelValueType> {

}
