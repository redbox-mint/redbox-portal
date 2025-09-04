import {BaseFormFieldComponentConfig, BaseFormFieldComponentDefinition} from "../form-field-component.model";
import {BaseFormFieldLayoutConfig, BaseFormFieldLayoutDefinition} from "../form-field-layout.model";
import {BaseFormFieldModelConfig, BaseFormFieldModelDefinition} from "../form-field-model.model";
import {FormComponentDefinition} from "../form-component.model";

export type RepeatableModelValueType = unknown[];

export interface RepeatableFormFieldComponentDefinition extends BaseFormFieldComponentDefinition {
    class: "RepeatableComponent";
    config?: RepeatableFormFieldComponentConfig;
}

export class RepeatableFormFieldComponentConfig extends BaseFormFieldComponentConfig {
    elementTemplate?: FormComponentDefinition;
}

export interface RepeatableElementFormFieldLayoutDefinition extends BaseFormFieldLayoutDefinition {
    class: "RepeatableElementLayoutComponent";
    config: RepeatableElementFormFieldLayoutConfig;
}

export class RepeatableElementFormFieldLayoutConfig extends BaseFormFieldLayoutConfig {

}

export interface RepeatableFormFieldModelDefinition extends BaseFormFieldModelDefinition<RepeatableModelValueType> {
    class: "RepeatableComponentModel";
    config: RepeatableFormFieldModelConfig;
    // TODO: Migrate properties from `RepeatableContainer`
}

export class RepeatableFormFieldModelConfig extends BaseFormFieldModelConfig<RepeatableModelValueType> {
    // TODO: Migrate JSON configurable properties from `RepeatableContainer`
}
