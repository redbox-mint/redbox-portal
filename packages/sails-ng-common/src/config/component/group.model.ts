import {BaseFormFieldModelConfig, BaseFormFieldModelDefinition} from "../form-field-model.model";
import {FormComponentDefinition} from "../form-component.model";
import {BaseFormFieldComponentConfig, BaseFormFieldComponentDefinition} from "../form-field-component.model";


export type GroupFieldModelValueType = Record<string, unknown>;

export interface GroupFormFieldComponentDefinition extends BaseFormFieldComponentDefinition {
    class: "GroupFieldComponent";
    config?: GroupFormFieldComponentConfig;
}

export class GroupFormFieldComponentConfig extends BaseFormFieldComponentConfig {
    componentDefinitions?: FormComponentDefinition[];
}

export interface GroupFormFieldModelDefinition extends BaseFormFieldModelDefinition<GroupFieldModelValueType> {
    class: "GroupFieldModel";
    config?: GroupFormFieldModelConfig;
}

export class GroupFormFieldModelConfig extends BaseFormFieldModelConfig<GroupFieldModelValueType> {

}
