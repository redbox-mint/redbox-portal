import {BaseFormFieldModelConfig, BaseFormFieldModelDefinition} from "../form-field-model.model";
import {BaseFormFieldComponentConfig, BaseFormFieldComponentDefinition} from "../form-field-component.model";


export type CheckboxModelValueType = string | null | Array<string>;

export interface CheckboxOption {
  label: string;
  value: string;
  disabled?: boolean;
}

export interface CheckboxInputComponentDefinition extends BaseFormFieldComponentDefinition {
    class: "CheckboxInputComponent";
    config?: CheckboxInputComponentConfig;
}

export class CheckboxInputComponentConfig extends BaseFormFieldComponentConfig {
    public placeholder?: string = '';
    public options: Array<CheckboxOption> = [];
    public multipleValues?: boolean = false;
}

export interface CheckboxInputModelDefinition extends BaseFormFieldModelDefinition<CheckboxModelValueType> {
    class: "CheckboxInputModel";
    config: CheckboxInputModelConfig;
}

export class CheckboxInputModelConfig extends BaseFormFieldModelConfig<CheckboxModelValueType> {

}


