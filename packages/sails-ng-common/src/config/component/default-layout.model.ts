import {BaseFormFieldLayoutConfig, BaseFormFieldLayoutDefinition} from "../form-field-layout.model";

export interface DefaultFormFieldLayoutDefinition extends BaseFormFieldLayoutDefinition {
    class: "DefaultLayoutComponent";
    config: DefaultFormFieldLayoutConfig;
}

export interface DefaultFormFieldLayoutConfig extends BaseFormFieldLayoutConfig {

}