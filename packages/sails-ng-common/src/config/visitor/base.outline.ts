import {
    SimpleInputFieldComponentDefinitionOutline,
    SimpleInputFieldModelDefinitionOutline,
    SimpleInputFormComponentDefinitionOutline,
} from "../component/simple-input.outline";
import {
    ContentFieldComponentDefinitionOutline,
    ContentFormComponentDefinitionOutline,
} from "../component/content.outline";
import {
    RepeatableElementFieldLayoutDefinitionOutline,
    RepeatableFieldComponentDefinitionOutline,
    RepeatableFieldModelDefinitionOutline,
    RepeatableFormComponentDefinitionOutline,
} from "../component/repeatable.outline";
import {
    ValidationSummaryFieldComponentDefinitionOutline,
    ValidationSummaryFormComponentDefinitionOutline,
} from "../component/validation-summary.outline";
import {
    GroupFieldComponentDefinitionOutline,
    GroupFieldModelDefinitionOutline,
    GroupFormComponentDefinitionOutline,
} from "../component/group.outline";
import {
    TabFieldComponentDefinitionOutline,
    TabFieldLayoutDefinitionOutline,
    TabFormComponentDefinitionOutline,
} from "../component/tab.outline";
import {
    TabContentFieldComponentDefinitionOutline,
    TabContentFieldLayoutDefinitionOutline,
    TabContentFormComponentDefinitionOutline,
} from "../component/tab-content.outline";
import {
    SaveButtonFieldComponentDefinitionOutline,
    SaveButtonFormComponentDefinitionOutline,
} from "../component/save-button.outline";
import {
    TextAreaFieldComponentDefinitionOutline,
    TextAreaFieldModelDefinitionOutline,
    TextAreaFormComponentDefinitionOutline,
} from "../component/text-area.outline";
import {
    DefaultFieldLayoutDefinitionOutline,
} from "../component/default-layout.outline";
import {
    CheckboxInputFieldComponentDefinitionOutline,
    CheckboxInputFieldModelDefinitionOutline, CheckboxInputFormComponentDefinitionOutline
} from "../component/checkbox-input.outline";
import {
    DropdownInputFieldComponentDefinitionOutline,
    DropdownInputFieldModelDefinitionOutline, DropdownInputFormComponentDefinitionOutline
} from "../component/dropdown-input.outline";
import {
    RadioInputFieldComponentDefinitionOutline,
    RadioInputFieldModelDefinitionOutline, RadioInputFormComponentDefinitionOutline
} from "../component/radio-input.outline";
import {
    DateInputFieldComponentDefinitionOutline,
    DateInputFieldModelDefinitionOutline,
    DateInputFormComponentDefinitionOutline
} from "../component/date-input.outline";
import {FormModesConfig} from "../shared.outline";
import {FormConfigOutline} from "../form-config.outline";

/**
 * Interface for classes that can be visited by a visitor.
 */
export interface CanVisit {
    /**
     * Accept a visitor to this form field definition.
     */
    accept(visitor: FormConfigVisitorOutline): void;
}

// TODO: the visitor start interfaces actually don't make much sense, remove them and use the props in the method signature directly.

/**
 * Interface for starting a visitor with a constructed form.
 */
export interface VisitorStartConstructed {
    /**
     * The constructed form.
     */
    form: FormConfigOutline;
}

/**
 * Interface for starting a visitor with values to match to constraints
 * and record values or to use the form default values.
 */
export interface VisitorStartCurrentRecordValues {
    /**
     * The currently active form mode.
     */
    formMode?: FormModesConfig;
    /**
     * The current user's roles.
     */
    userRoles?: string[];
    /**
     * The record values.
     * Don't provide useFormDefaults or set to false when providing the record.
     */
    record?: Record<string, unknown>;
    /**
     * Whether to use the form defaults.
     * Don't provide the record when setting useFormDefaults to true.
     */
    useFormDefaults?: boolean,
}

/**
 * Visitors must implement this structure.
 */
export interface FormConfigVisitorOutline {
    visitFormConfig(item: CanVisit): void;

    /* SimpleInput */

    visitSimpleInputFieldComponentDefinition(item: SimpleInputFieldComponentDefinitionOutline): void;

    visitSimpleInputFieldModelDefinition(item: SimpleInputFieldModelDefinitionOutline): void;

    visitSimpleInputFormComponentDefinition(item: SimpleInputFormComponentDefinitionOutline): void;

    /* Content */

    visitContentFieldComponentDefinition(item: ContentFieldComponentDefinitionOutline): void;

    /* Repeatable  */

    visitContentFormComponentDefinition(item: ContentFormComponentDefinitionOutline): void;

    visitRepeatableFieldComponentDefinition(item: RepeatableFieldComponentDefinitionOutline): void;

    visitRepeatableFieldModelDefinition(item: RepeatableFieldModelDefinitionOutline): void;

    visitRepeatableElementFieldLayoutDefinition(item: RepeatableElementFieldLayoutDefinitionOutline): void;

    visitRepeatableFormComponentDefinition(item: RepeatableFormComponentDefinitionOutline): void;

    /* Validation Summary */

    visitValidationSummaryFieldComponentDefinition(item: ValidationSummaryFieldComponentDefinitionOutline): void;

    visitValidationSummaryFormComponentDefinition(item: ValidationSummaryFormComponentDefinitionOutline): void;

    /* Group */

    visitGroupFieldComponentDefinition(item: GroupFieldComponentDefinitionOutline): void;

    visitGroupFieldModelDefinition(item: GroupFieldModelDefinitionOutline): void;

    visitGroupFormComponentDefinition(item: GroupFormComponentDefinitionOutline): void;

    /* Tab  */

    visitTabFieldComponentDefinition(item: TabFieldComponentDefinitionOutline): void;

    visitTabFieldLayoutDefinition(item: TabFieldLayoutDefinitionOutline): void;

    visitTabFormComponentDefinition(item: TabFormComponentDefinitionOutline): void;

    /*  Tab Content */

    visitTabContentFieldComponentDefinition(item: TabContentFieldComponentDefinitionOutline): void;

    visitTabContentFieldLayoutDefinition(item: TabContentFieldLayoutDefinitionOutline): void;

    visitTabContentFormComponentDefinition(item: TabContentFormComponentDefinitionOutline): void;

    /* Save Button  */

    visitSaveButtonFieldComponentDefinition(item: SaveButtonFieldComponentDefinitionOutline): void;

    visitSaveButtonFormComponentDefinition(item: SaveButtonFormComponentDefinitionOutline): void;

    /* Text Area */

    visitTextAreaFieldComponentDefinition(item: TextAreaFieldComponentDefinitionOutline): void;

    visitTextAreaFieldModelDefinition(item: TextAreaFieldModelDefinitionOutline): void;

    visitTextAreaFormComponentDefinition(item: TextAreaFormComponentDefinitionOutline): void;

    /* Default Layout  */

    visitDefaultFieldLayoutDefinition(item: DefaultFieldLayoutDefinitionOutline): void;

    /* Checkbox Input */

    visitCheckboxInputFieldComponentDefinition(item: CheckboxInputFieldComponentDefinitionOutline): void;

    visitCheckboxInputFieldModelDefinition(item: CheckboxInputFieldModelDefinitionOutline): void;

    visitCheckboxInputFormComponentDefinition(item: CheckboxInputFormComponentDefinitionOutline): void;

    /* Dropdown Input */

    visitDropdownInputFieldComponentDefinition(item: DropdownInputFieldComponentDefinitionOutline): void;

    visitDropdownInputFieldModelDefinition(item: DropdownInputFieldModelDefinitionOutline): void;

    visitDropdownInputFormComponentDefinition(item: DropdownInputFormComponentDefinitionOutline): void;

    /* Radio Input */

    visitRadioInputFieldComponentDefinition(item: RadioInputFieldComponentDefinitionOutline): void;

    visitRadioInputFieldModelDefinition(item: RadioInputFieldModelDefinitionOutline): void;

    visitRadioInputFormComponentDefinition(item: RadioInputFormComponentDefinitionOutline): void;

    /* Date Input */

    visitDateInputFieldComponentDefinition(item: DateInputFieldComponentDefinitionOutline): void;

    visitDateInputFieldModelDefinition(item: DateInputFieldModelDefinitionOutline): void;

    visitDateInputFormComponentDefinition(item: DateInputFormComponentDefinitionOutline): void;

}
