import {BaseFormFieldModelConfig, BaseFormFieldModelDefinition} from "../form-field-model.model";
import {BaseFormFieldComponentConfig, BaseFormFieldComponentDefinition} from "../form-field-component.model";

export type DateInputModelValueType = string | Date | null;

export interface DateInputComponentDefinition extends BaseFormFieldComponentDefinition {
    class: "DateInputComponent";
    config?: DateInputComponentConfig;
}

export class DateInputComponentConfig extends BaseFormFieldComponentConfig {
    public placeholder?: string = '';
    public dateFormat?: string = 'YYYY-MM-DD';
    public minDate?: string | Date | null = null;
    public maxDate?: string | Date | null = null;
}

export interface DateInputModelDefinition extends BaseFormFieldModelDefinition<DateInputModelValueType> {
    class: "DateInputModel";
    config: DateInputModelConfig;
}

export class DateInputModelConfig extends BaseFormFieldModelConfig<DateInputModelValueType> {

}


