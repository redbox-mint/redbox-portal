import {FormConfig} from "../form-config.model";

import {
    ContentFormComponentDefinition,
    ContentFormFieldComponentDefinition,
    DefaultFormFieldLayoutDefinition,
    GroupFormFieldComponentDefinition,
    GroupFormFieldModelDefinition,
    RepeatableElementFormFieldLayoutDefinition,
    RepeatableFormFieldComponentDefinition,
    RepeatableFormFieldModelDefinition,
    SaveButtonComponentDefinition,
    SimpleInputComponentDefinition,
    SimpleInputModelDefinition,
    TabComponentFormFieldLayoutDefinition,
    TabContentComponentDefinition,
    TabFormFieldComponentDefinition,
    TextAreaComponentDefinition,
    TextareaModelDefinition,
    ValidationSummaryFormFieldComponentDefinition,
    ValidationSummaryFormFieldModelDefinition
} from "../component";

export interface Visitee {
    /**
     * Accept a visitor to this form field definition.
     */
    accept(visitor: FormConfigItemVisitor): void;
}

/**
 * The form config visitor definition.
 */
export abstract class FormConfigItemVisitor {

    abstract visitFormConfig(item: FormConfig): void;

    /* SimpleInput */

    abstract visitSimpleInputComponentDefinition(item: SimpleInputComponentDefinition): void;

    abstract visitSimpleInputModelDefinition(item: SimpleInputModelDefinition): void;

    /* Content */

    abstract visitContentFormFieldComponentDefinition(item: ContentFormFieldComponentDefinition): void;

    abstract visitContentFormComponentDefinition(item: ContentFormComponentDefinition): void;

    /* Repeatable  */

    abstract visitRepeatableFormFieldComponentDefinition(item: RepeatableFormFieldComponentDefinition): void;

    abstract visitRepeatableFormFieldModelDefinition(item: RepeatableFormFieldModelDefinition): void;

    abstract visitRepeatableElementFormFieldLayoutDefinition(item: RepeatableElementFormFieldLayoutDefinition): void;

    /*
     * Validation Summary
     */
    abstract visitValidationSummaryFormFieldComponentDefinition(item: ValidationSummaryFormFieldComponentDefinition): void;

    abstract visitValidationSummaryFormFieldModelDefinition(item: ValidationSummaryFormFieldModelDefinition): void;

    /*
     * Group
     */
    abstract visitGroupFormFieldComponentDefinition(item: GroupFormFieldComponentDefinition): void;

    abstract visitGroupFormFieldModelDefinition(item: GroupFormFieldModelDefinition): void;

    /*
     * Tab
     */
    abstract visitTabFormFieldComponentDefinition(item: TabFormFieldComponentDefinition): void;

    abstract visitTabContentComponentDefinition(item: TabContentComponentDefinition): void;

    abstract visitTabComponentFormFieldLayoutDefinition(item: TabComponentFormFieldLayoutDefinition): void;

    /*
     * Save Button
     */
    abstract visitSaveButtonComponentDefinition(item: SaveButtonComponentDefinition): void;

    /*
     * Text Area
     */
    abstract visitTextAreaComponentDefinition(item: TextAreaComponentDefinition): void;

    abstract visitTextareaModelDefinition(item: TextareaModelDefinition): void;

    /*
     * Default Layout
     */
    abstract visitDefaultFormFieldLayoutDefinition(item: DefaultFormFieldLayoutDefinition): void;
}

