import {
    FormConfig,
    GroupFormComponentDefinition,
    RepeatableFormComponentDefinition,
    SaveButtonFormComponentDefinition
} from "..";
import {
    ContentFormComponentDefinition,
    ContentFormFieldComponentDefinition,
    DefaultFormFieldLayoutDefinition,
    GroupFormFieldComponentDefinition,
    GroupFormFieldModelDefinition,
    RepeatableElementFormFieldLayoutDefinition,
    RepeatableFormFieldComponentDefinition,
    RepeatableFormFieldModelDefinition,
    SaveButtonFormFieldComponentDefinition,
    SimpleInputComponentDefinition,
    SimpleInputModelDefinition,
    TabComponentFormFieldLayoutDefinition,
    TabContentComponentDefinition,
    TabFormFieldComponentDefinition,
    TextAreaFormFieldComponentDefinition,
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

    visitFormConfig(item: FormConfig): void {
        throw new Error("Method not implemented.");
    }

    /* SimpleInput */

    visitSimpleInputComponentDefinition(item: SimpleInputComponentDefinition): void {
        throw new Error("Method not implemented.");
    }

    visitSimpleInputModelDefinition(item: SimpleInputModelDefinition): void {
        throw new Error("Method not implemented.");
    }

    /* Content */

    visitContentFormFieldComponentDefinition(item: ContentFormFieldComponentDefinition): void {
        throw new Error("Method not implemented.");
    }

    visitContentFormComponentDefinition(item: ContentFormComponentDefinition): void {
        throw new Error("Method not implemented.");
    }

    /* Repeatable  */

    visitRepeatableFormFieldComponentDefinition(item: RepeatableFormFieldComponentDefinition): void {
        throw new Error("Method not implemented.");
    }

    visitRepeatableFormFieldModelDefinition(item: RepeatableFormFieldModelDefinition): void {
        throw new Error("Method not implemented.");
    }

    visitRepeatableElementFormFieldLayoutDefinition(item: RepeatableElementFormFieldLayoutDefinition): void {
        throw new Error("Method not implemented.");
    }

    visitRepeatableFormComponentDefinition(item: RepeatableFormComponentDefinition): void {
        throw new Error("Method not implemented.");
    }

    /*
     * Validation Summary
     */
    visitValidationSummaryFormFieldComponentDefinition(item: ValidationSummaryFormFieldComponentDefinition): void {
        throw new Error("Method not implemented.");
    }

    visitValidationSummaryFormFieldModelDefinition(item: ValidationSummaryFormFieldModelDefinition): void {
        throw new Error("Method not implemented.");
    }

    /*
     * Group
     */
    visitGroupFormFieldComponentDefinition(item: GroupFormFieldComponentDefinition): void {
        throw new Error("Method not implemented.");
    }

    visitGroupFormFieldModelDefinition(item: GroupFormFieldModelDefinition): void {
        throw new Error("Method not implemented.");
    }

    visitGroupFormComponentDefinition(param: GroupFormComponentDefinition): void {
        throw new Error("Method not implemented.");
    }

    /*
     * Tab
     */
    visitTabFormFieldComponentDefinition(item: TabFormFieldComponentDefinition): void {
        throw new Error("Method not implemented.");
    }

    visitTabContentComponentDefinition(item: TabContentComponentDefinition): void {
        throw new Error("Method not implemented.");
    }

    visitTabComponentFormFieldLayoutDefinition(item: TabComponentFormFieldLayoutDefinition): void {
        throw new Error("Method not implemented.");
    }

    /*
     * Save Button
     */
    visitSaveButtonFormFieldComponentDefinition(item: SaveButtonFormFieldComponentDefinition): void {
        throw new Error("Method not implemented.");
    }
    visitSaveButtonFormComponentDefinition(param: SaveButtonFormComponentDefinition) {
        throw new Error("Method not implemented.");
    }
    /*
     * Text Area
     */
    visitTextAreaFormFieldComponentDefinition(item: TextAreaFormFieldComponentDefinition): void {
        throw new Error("Method not implemented.");
    }

    visitTextAreaFormFieldModelDefinition(item: TextareaModelDefinition): void {
        throw new Error("Method not implemented.");
    }

    /*
     * Default Layout
     */
    visitDefaultFormFieldLayoutDefinition(item: DefaultFormFieldLayoutDefinition): void {
        throw new Error("Method not implemented.");
    }
}

