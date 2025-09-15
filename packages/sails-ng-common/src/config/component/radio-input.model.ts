import {BaseFormFieldModelConfig, BaseFormFieldModelDefinition} from "../form-field-model.model";
import {BaseFormFieldComponentConfig, BaseFormFieldComponentDefinition} from "../form-field-component.model";


export type RadioInputModelValueType = string | number | null;

export interface RadioInputComponentDefinition extends BaseFormFieldComponentDefinition {
    class: "RadioInputComponent";
    config?: RadioInputComponentConfig;
}

export class RadioInputComponentConfig extends BaseFormFieldComponentConfig {
    public options: Array<{ label: string; value: any; disabled?: boolean }> = [];
}

export interface RadioInputModelDefinition extends BaseFormFieldModelDefinition<RadioInputModelValueType> {
    class: "RadioInputModel";
    config: RadioInputModelConfig;
}

export class RadioInputModelConfig extends BaseFormFieldModelConfig<RadioInputModelValueType> {

}
