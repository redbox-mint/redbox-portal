import {BaseFormFieldComponentConfig, BaseFormFieldComponentDefinition} from "../form-field-component.model";
import {BaseFormFieldLayoutConfig, BaseFormFieldLayoutDefinition} from "../form-field-layout.model";
import {BaseFormFieldModelConfig, BaseFormFieldModelDefinition} from "../form-field-model.model";
import {FormComponentDefinition} from "../form-component.model";
import { TemplateCompileInput } from "../../template.model";

/* Names */
export const RepeatableComponentName = `RepeatableComponent` as const;
export const RepeatableModelName = `RepeatableComponentModel` as const;
export const RepeatableElementLayoutComponentName = `RepeatableElementLayoutComponent` as const;

/* Types */
export type RepeatableComponentType = typeof RepeatableComponentName;
export type RepeatableModelType = typeof RepeatableModelName;
export type RepeatableElementLayoutComponentType = typeof RepeatableElementLayoutComponentName;

export type RepeatableModelValueType = unknown[];

/* Classes */
export class RepeatableFormFieldComponentDefinition implements BaseFormFieldComponentDefinition {
    class: RepeatableComponentType = RepeatableComponentName;
    config?: RepeatableFormFieldComponentConfig;

    get getTemplateInfo(): TemplateCompileInput[] {
        return [];
    }
}

export class RepeatableFormFieldComponentConfig extends BaseFormFieldComponentConfig {
    elementTemplate?: FormComponentDefinition;
}

export class RepeatableElementFormFieldLayoutDefinition implements BaseFormFieldLayoutDefinition {
    class: RepeatableElementLayoutComponentType = RepeatableElementLayoutComponentName;
    config?: RepeatableElementFormFieldLayoutConfig;

    get getTemplateInfo(): TemplateCompileInput[] {
        return [];
    }
}

export class RepeatableElementFormFieldLayoutConfig extends BaseFormFieldLayoutConfig {

}

export class RepeatableFormFieldModelDefinition implements BaseFormFieldModelDefinition<RepeatableModelValueType> {
    class: RepeatableModelType = RepeatableModelName;
    config?: RepeatableFormFieldModelConfig;
    // TODO: Migrate properties from `RepeatableContainer`

    get getTemplateInfo(): TemplateCompileInput[] {
        return [];
    }
}

export class RepeatableFormFieldModelConfig extends BaseFormFieldModelConfig<RepeatableModelValueType> {
    // TODO: Migrate JSON configurable properties from `RepeatableContainer`
}
