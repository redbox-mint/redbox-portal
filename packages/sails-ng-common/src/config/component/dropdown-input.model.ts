import {BaseFormFieldModelConfig, BaseFormFieldModelDefinition} from "../form-field-model.model";
import {BaseFormFieldComponentConfig, BaseFormFieldComponentDefinition} from "../form-field-component.model";


export type DropdownModelValueType = string | number | null;

export interface DropdownInputComponentDefinition extends BaseFormFieldComponentDefinition {
    class: "DropdownInputComponent";
    config?: DropdownInputComponentConfig;
}

export class DropdownInputComponentConfig extends BaseFormFieldComponentConfig {
    public placeholder?: string = '';
    public options: Array<{ label: string; value: any; disabled?: boolean }> = [];
}

export interface DropdownInputModelDefinition extends BaseFormFieldModelDefinition<DropdownModelValueType> {
    class: "DropdownInputModel";
    config: DropdownInputModelConfig;
}

export class DropdownInputModelConfig extends BaseFormFieldModelConfig<DropdownModelValueType> {

}


