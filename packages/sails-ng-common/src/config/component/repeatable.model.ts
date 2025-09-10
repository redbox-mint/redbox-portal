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
    elementTemplate?: RepeatableFormComponentDefinition;

    /**
     * Create a unique ID using the current timestamp and a random number.
     * This unique id must not be stored in the database.
     * It will be different for each form load.
     * It is for distinguishing the repeatable element entries.
     */
    public static getLocalUID(): string {
        const randomNumber = Math.floor(Math.random() * 10000).toString().padStart(5, '0');
        return `${Date.now()}-${randomNumber}`;
    }
}

export interface RepeatableElementFormFieldLayoutDefinition extends BaseFormFieldLayoutDefinition {
    class: "RepeatableElementLayoutComponent";
    config?: RepeatableElementFormFieldLayoutConfig;
}

export class RepeatableElementFormFieldLayoutConfig extends BaseFormFieldLayoutConfig {

}

export interface RepeatableFormFieldModelDefinition extends BaseFormFieldModelDefinition<RepeatableModelValueType> {
    class: "RepeatableComponentModel";
    config?: RepeatableFormFieldModelConfig;
    // TODO: Migrate properties from `RepeatableContainer`
}

export class RepeatableFormFieldModelConfig extends BaseFormFieldModelConfig<RepeatableModelValueType> {
    // TODO: Migrate JSON configurable properties from `RepeatableContainer`
}

export interface RepeatableFormComponentDefinition extends Omit<FormComponentDefinition, "name"> {

}