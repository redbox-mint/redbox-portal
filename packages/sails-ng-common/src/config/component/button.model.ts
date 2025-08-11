
import {BaseFormFieldComponentConfig, BaseFormFieldComponentDefinition} from "../form-field-component.model";

export interface SaveButtonComponentDefinition extends BaseFormFieldComponentDefinition {
    class: "SaveButtonComponent";
    config?: SaveButtonComponentConfig;
}

export class SaveButtonComponentConfig extends BaseFormFieldComponentConfig {
  
}

