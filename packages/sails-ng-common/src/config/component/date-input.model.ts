import {FieldModelConfig, FieldModelDefinition} from "../field-model.model";
import {FormComponentDefinition} from "../form-component.model";
import {FormConfigVisitorOutline} from "../visitor/base.outline";
import {
    FieldComponentConfigKind,
    FieldComponentDefinitionKind,
    FieldModelConfigKind,
    FieldModelDefinitionKind, FormComponentDefinitionKind
} from "../shared.outline";
import {FieldComponentConfig, FieldComponentDefinition} from "../field-component.model";
import {AvailableFieldLayoutDefinitionOutlines} from "../dictionary.outline";
import {
    DateInputComponentName,
    DateInputFieldComponentConfigOutline,
    DateInputFieldComponentDefinitionOutline, DateInputFieldModelConfigOutline,
    DateInputFieldModelDefinitionOutline,
    DateInputFormComponentDefinitionOutline, DateInputModelName, DateInputModelValueType
} from "./date-input.outline";

/* Date Input Component */


export class DateInputFieldComponentConfig extends FieldComponentConfig implements DateInputFieldComponentConfigOutline {
    placeholder?: string = '';
    dateFormat?: string = 'DD/MM/YYYY';
    showWeekNumbers?: boolean = false;
    containerClass?: string = 'theme-dark-blue';
    enableTimePicker?: boolean = false;
    bsFullConfig?: any = null;

    constructor() {
        super();
    }
}


export class DateInputFieldComponentDefinition extends FieldComponentDefinition implements DateInputFieldComponentDefinitionOutline {
    class = DateInputComponentName;
    config?: DateInputFieldComponentConfigOutline;

    constructor() {
        super();
    }

    accept(visitor: FormConfigVisitorOutline): void {
        visitor.visitDateInputFieldComponentDefinition(this);
    }
}


/* Date Input Model */


export class DateInputFieldModelConfig extends FieldModelConfig<DateInputModelValueType> implements DateInputFieldModelConfigOutline {
    constructor() {
        super();
    }
}


export class DateInputFieldModelDefinition extends FieldModelDefinition<DateInputModelValueType> implements DateInputFieldModelDefinitionOutline {
    class = DateInputModelName;
    config?: DateInputFieldModelConfigOutline;

    constructor() {
        super();
    }

    accept(visitor: FormConfigVisitorOutline): void {
        visitor.visitDateInputFieldModelDefinition(this);
    }
}

/* Date Input Form Component */

export class DateInputFormComponentDefinition extends FormComponentDefinition implements DateInputFormComponentDefinitionOutline {
    public component!: DateInputFieldComponentDefinitionOutline;
    public model?: DateInputFieldModelDefinitionOutline;
    public layout?: AvailableFieldLayoutDefinitionOutlines;

    constructor() {
        super();
    }

    accept(visitor: FormConfigVisitorOutline) {
        visitor.visitDateInputFormComponentDefinition(this);
    }
}

export const DateInputMap = [
    {kind: FieldComponentConfigKind, def: DateInputFieldComponentConfig},
    {kind: FieldComponentDefinitionKind, def: DateInputFieldComponentDefinition, class: DateInputComponentName},
    {kind: FieldModelConfigKind, def: DateInputFieldModelConfig},
    {kind: FieldModelDefinitionKind, def: DateInputFieldModelDefinition, class: DateInputModelName},
    {kind: FormComponentDefinitionKind, def: DateInputFormComponentDefinition, class: DateInputComponentName},
];

