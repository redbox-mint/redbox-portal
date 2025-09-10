import {BaseFormFieldModelConfig, BaseFormFieldModelDefinition} from "../form-field-model.model";
import {BaseFormFieldComponentConfig, BaseFormFieldComponentDefinition} from "../form-field-component.model";


export type DropdownModelValueType = string | number | null;

export interface DropdownComponentDefinition extends BaseFormFieldComponentDefinition {
    class: "DropdownComponent";
    config?: DropdownComponentConfig;
}

export class DropdownComponentConfig extends BaseFormFieldComponentConfig {
    public placeholder?: string = '';
    public options: Array<{ label: string; value: any; disabled?: boolean }> = [];
}

export interface DropdownModelDefinition extends BaseFormFieldModelDefinition<DropdownModelValueType> {
    class: "DropdownModel";
    config: DropdownModelConfig;
}

export class DropdownModelConfig extends BaseFormFieldModelConfig<DropdownModelValueType> {

}


