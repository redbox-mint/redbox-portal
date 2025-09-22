import {BaseFormFieldModelConfig, BaseFormFieldModelDefinition} from "../form-field-model.model";
import {BaseFormFieldComponentConfig, BaseFormFieldComponentDefinition} from "../form-field-component.model";


export type DropdownModelValueType = string | null;

export interface DropdownOption {
  label: string;
  value: string;
  disabled?: boolean;
}

export interface DropdownInputComponentDefinition extends BaseFormFieldComponentDefinition {
    class: "DropdownInputComponent";
    config?: DropdownInputComponentConfig;
}

export class DropdownInputComponentConfig extends BaseFormFieldComponentConfig {
    public placeholder?: string = '';
    public options: Array<DropdownOption> = [];
}

export interface DropdownInputModelDefinition extends BaseFormFieldModelDefinition<DropdownModelValueType> {
    class: "DropdownInputModel";
    config: DropdownInputModelConfig;
}

export class DropdownInputModelConfig extends BaseFormFieldModelConfig<DropdownModelValueType> {

}


