import {BaseFormFieldModelConfig, BaseFormFieldModelDefinition} from "../form-field-model.model";
import {FormComponentDefinition} from "../form-component.model";
import {BaseFormFieldComponentConfig, BaseFormFieldComponentDefinition} from "../form-field-component.model";


export interface TabComponentDefinition extends BaseFormFieldComponentDefinition {
    class: "TabComponent";
    config?: TabComponentConfig;
}

export class TabComponentConfig extends BaseFormFieldComponentConfig {
}

