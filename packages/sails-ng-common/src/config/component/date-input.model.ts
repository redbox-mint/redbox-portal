import {BaseFormFieldModelConfig, BaseFormFieldModelDefinition} from "../form-field-model.model";
import {BaseFormFieldComponentConfig, BaseFormFieldComponentDefinition} from "../form-field-component.model";

export type DateInputModelValueType = string | Date | null;

export interface DateInputComponentDefinition extends BaseFormFieldComponentDefinition {
    class: "DateInputComponent";
    config?: DateInputComponentConfig;
}

export class DateInputComponentConfig extends BaseFormFieldComponentConfig {
    public placeholder?: string = '';
    public dateFormat?: string = 'DD/MM/YYYY';
    public showWeekNumbers?: boolean = false;
    public containerClass?: string = 'theme-dark-blue';
    public enableTimePicker?: boolean = false;
    public bsFullConfig?: any = null;
}

export interface DateInputModelDefinition extends BaseFormFieldModelDefinition<DateInputModelValueType> {
    class: "DateInputModel";
    config: DateInputModelConfig;
}

export class DateInputModelConfig extends BaseFormFieldModelConfig<DateInputModelValueType> {

}


