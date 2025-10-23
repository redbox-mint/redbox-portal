import {
    FieldComponentConfigFrameKindType, FieldComponentConfigKindType,
    FieldComponentDefinitionFrameKindType, FieldComponentDefinitionKindType,
    FieldModelConfigFrameKindType,
    FieldModelConfigKindType, FieldModelDefinitionFrameKindType,
    FieldModelDefinitionKindType, FormComponentDefinitionFrameKindType, FormComponentDefinitionKindType
} from "../shared.outline";
import {
    FieldComponentConfigFrame,
    FieldComponentConfigOutline,
    FieldComponentDefinitionFrame, FieldComponentDefinitionOutline
} from "../field-component.outline";

import {
    FieldModelConfigFrame,
    FieldModelConfigOutline,
    FieldModelDefinitionFrame,
    FieldModelDefinitionOutline
} from "../field-model.outline";
import {FormComponentDefinitionFrame, FormComponentDefinitionOutline} from "../form-component.outline";
import {AvailableFieldLayoutDefinitionFrames, AvailableFieldLayoutDefinitionOutlines} from "../dictionary.outline";

/* Date Input Component */
export const DateInputComponentName = "DateInputComponent" as const;
export type DateInputComponentNameType = typeof DateInputComponentName;


export interface DateInputFieldComponentConfigFrame extends FieldComponentConfigFrame {
    placeholder?: string;
    dateFormat?: string;
    showWeekNumbers?: boolean;
    containerClass?: string;
    enableTimePicker?: boolean;
    bsFullConfig?: any;
}

export interface DateInputFieldComponentConfigOutline extends DateInputFieldComponentConfigFrame, FieldComponentConfigOutline {
}

export interface DateInputFieldComponentDefinitionFrame extends FieldComponentDefinitionFrame {
    class: DateInputComponentNameType;
    config?: DateInputFieldComponentConfigFrame;
}

export interface DateInputFieldComponentDefinitionOutline extends DateInputFieldComponentDefinitionFrame, FieldComponentDefinitionOutline {
    class: DateInputComponentNameType;
    config?: DateInputFieldComponentConfigOutline;
}

/* Date Input Model */
export const DateInputModelName = "DateInputModel" as const;
export type DateInputModelNameType = typeof DateInputModelName;
export type DateInputModelValueType = Date | null;

export interface DateInputFieldModelConfigFrame extends FieldModelConfigFrame<DateInputModelValueType> {
}


export interface DateInputFieldModelConfigOutline extends DateInputFieldModelConfigFrame, FieldModelConfigOutline<DateInputModelValueType> {

}

export interface DateInputFieldModelDefinitionFrame extends FieldModelDefinitionFrame<DateInputModelValueType> {
    class: DateInputModelNameType;
    config?: DateInputFieldModelConfigFrame;
}

export interface DateInputFieldModelDefinitionOutline extends DateInputFieldModelDefinitionFrame, FieldModelDefinitionOutline<DateInputModelValueType> {
    class: DateInputModelNameType;
    config?: DateInputFieldModelConfigOutline;
}

/* Date Input Form Component */
export interface DateInputFormComponentDefinitionFrame extends FormComponentDefinitionFrame {
    component: DateInputFieldComponentDefinitionFrame;
    model?: DateInputFieldModelDefinitionFrame;
    layout?: AvailableFieldLayoutDefinitionFrames;
}

export interface DateInputFormComponentDefinitionOutline extends DateInputFormComponentDefinitionFrame, FormComponentDefinitionOutline {
    component: DateInputFieldComponentDefinitionOutline;
    model?: DateInputFieldModelDefinitionOutline;
    layout?: AvailableFieldLayoutDefinitionOutlines;
}


export type DateInputTypes =
    | { kind: FieldComponentConfigFrameKindType, class: DateInputFieldComponentConfigFrame }
    | { kind: FieldComponentDefinitionFrameKindType, class: DateInputFieldComponentDefinitionFrame }
    | { kind: FieldModelConfigFrameKindType, class: DateInputFieldModelConfigFrame }
    | { kind: FieldModelDefinitionFrameKindType, class: DateInputFieldModelDefinitionFrame }
    | { kind: FormComponentDefinitionFrameKindType, class: DateInputFormComponentDefinitionFrame }
    | { kind: FieldComponentConfigKindType, class: DateInputFieldComponentConfigOutline }
    | { kind: FieldComponentDefinitionKindType, class: DateInputFieldComponentDefinitionOutline }
    | { kind: FieldModelConfigKindType, class: DateInputFieldModelConfigOutline }
    | { kind: FieldModelDefinitionKindType, class: DateInputFieldModelDefinitionOutline }
    | { kind: FormComponentDefinitionKindType, class: DateInputFormComponentDefinitionOutline }
    ;
