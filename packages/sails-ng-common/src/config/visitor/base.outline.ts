import {
    SimpleInputFieldComponentDefinitionOutline,
    SimpleInputFieldModelDefinitionOutline,
    SimpleInputFormComponentDefinitionOutline,
} from "../component/simpleinput.outline";
import {
    ContentFieldComponentDefinitionOutline,
    ContentFormComponentDefinitionOutline,
} from "../component/textblock.outline";
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
} from "../component/textarea.outline";
import {
    DefaultFieldLayoutDefinitionOutline,
} from "../component/default-layout.outline";


export interface CanVisit {
    /**
     * Accept a visitor to this form field definition.
     */
    accept(visitor: FormConfigVisitorOutline): void;
}


export interface FormConfigVisitorOutline {
    visitFormConfig(item: CanVisit): void;

    /* SimpleInput */

    visitSimpleInputFieldComponentDefinition(item: SimpleInputFieldComponentDefinitionOutline): void;

    visitSimpleInputFieldModelDefinition(item: SimpleInputFieldModelDefinitionOutline): void;

    visitSimpleInputFormComponentDefinition(param: SimpleInputFormComponentDefinitionOutline): void;

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

    visitGroupFormComponentDefinition(param: GroupFormComponentDefinitionOutline): void;

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

    visitSaveButtonFormComponentDefinition(param: SaveButtonFormComponentDefinitionOutline): void;

    /* Text Area */

    visitTextAreaFieldComponentDefinition(item: TextAreaFieldComponentDefinitionOutline): void;

    visitTextAreaFieldModelDefinition(item: TextAreaFieldModelDefinitionOutline): void;

    visitTextAreaFormComponentDefinition(item: TextAreaFormComponentDefinitionOutline): void;

    /* Default Layout  */

    visitDefaultFieldLayoutDefinition(item: DefaultFieldLayoutDefinitionOutline): void;
}