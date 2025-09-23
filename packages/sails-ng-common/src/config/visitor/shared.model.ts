import {
    FormConfig,
    GroupFormComponentDefinition,
    RepeatableFormComponentDefinition,
    SaveButtonFormComponentDefinition, SimpleInputFormComponentDefinition,
    TabFieldLayoutDefinition, TabFormComponentDefinition, ValidationSummaryFormComponentDefinition,
    ContentFormComponentDefinition,
    ContentFieldComponentDefinition,
    DefaultFieldLayoutDefinition,
    GroupFieldComponentDefinition,
    GroupFieldModelDefinition,
    RepeatableElementFieldLayoutDefinition,
    RepeatableFieldComponentDefinition,
    RepeatableFieldModelDefinition,
    SaveButtonFieldComponentDefinition,
    SimpleInputFieldComponentDefinition,
    SimpleInputFieldModelDefinition,
    TabFieldComponentDefinition,
    TextAreaFieldComponentDefinition,
    TextareaModelDefinition,
    ValidationSummaryFieldComponentDefinition,
    TabContentFieldComponentDefinition,
    TabContentFieldLayoutDefinition,
    TabContentFormComponentDefinition
} from "../..";

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

    visitSimpleInputFieldComponentDefinition(item: SimpleInputFieldComponentDefinition): void {
        throw new Error("Method not implemented.");
    }

    visitSimpleInputFieldModelDefinition(item: SimpleInputFieldModelDefinition): void {
        throw new Error("Method not implemented.");
    }

    visitSimpleInputFormComponentDefinition(param: SimpleInputFormComponentDefinition): void {
        throw new Error("Method not implemented.");
    }

    /* Content */

    visitContentFieldComponentDefinition(item: ContentFieldComponentDefinition): void {
        throw new Error("Method not implemented.");
    }

    visitContentFormComponentDefinition(item: ContentFormComponentDefinition): void {
        throw new Error("Method not implemented.");
    }

    /* Repeatable  */

    visitRepeatableFieldComponentDefinition(item: RepeatableFieldComponentDefinition): void {
        throw new Error("Method not implemented.");
    }

    visitRepeatableFieldModelDefinition(item: RepeatableFieldModelDefinition): void {
        throw new Error("Method not implemented.");
    }

    visitRepeatableElementFieldLayoutDefinition(item: RepeatableElementFieldLayoutDefinition): void {
        throw new Error("Method not implemented.");
    }

    visitRepeatableFormComponentDefinition(item: RepeatableFormComponentDefinition): void {
        throw new Error("Method not implemented.");
    }

    /*
     * Validation Summary
     */
    visitValidationSummaryFieldComponentDefinition(item: ValidationSummaryFieldComponentDefinition): void {
        throw new Error("Method not implemented.");
    }

    visitValidationSummaryFormComponentDefinition(item: ValidationSummaryFormComponentDefinition): void {
        throw new Error("Method not implemented.");
    }

    /*
     * Group
     */
    visitGroupFieldComponentDefinition(item: GroupFieldComponentDefinition): void {
        throw new Error("Method not implemented.");
    }

    visitGroupFieldModelDefinition(item: GroupFieldModelDefinition): void {
        throw new Error("Method not implemented.");
    }

    visitGroupFormComponentDefinition(param: GroupFormComponentDefinition): void {
        throw new Error("Method not implemented.");
    }

    /*
     * Tab
     */
    visitTabFieldComponentDefinition(item: TabFieldComponentDefinition): void {
        throw new Error("Method not implemented.");
    }
    visitTabFieldLayoutDefinition(item: TabFieldLayoutDefinition): void {
        throw new Error("Method not implemented.");
    }
    visitTabFormComponentDefinition(item: TabFormComponentDefinition): void {
        throw new Error("Method not implemented.");
    }

    /*
     * Tab Content
     */
    visitTabContentFieldComponentDefinition(item: TabContentFieldComponentDefinition): void {
        throw new Error("Method not implemented.");
    }
    visitTabContentFieldLayoutDefinition(item: TabContentFieldLayoutDefinition): void {
        throw new Error("Method not implemented.");
    }
    visitTabContentFormComponentDefinition(item: TabContentFormComponentDefinition): void {
        throw new Error("Method not implemented.");
    }



    /*
     * Save Button
     */
    visitSaveButtonFieldComponentDefinition(item: SaveButtonFieldComponentDefinition): void {
        throw new Error("Method not implemented.");
    }

    visitSaveButtonFormComponentDefinition(param: SaveButtonFormComponentDefinition) {
        throw new Error("Method not implemented.");
    }

    /*
     * Text Area
     */
    visitTextAreaFieldComponentDefinition(item: TextAreaFieldComponentDefinition): void {
        throw new Error("Method not implemented.");
    }

    visitTextAreaFieldModelDefinition(item: TextareaModelDefinition): void {
        throw new Error("Method not implemented.");
    }

    /*
     * Default Layout
     */
    visitDefaultFieldLayoutDefinition(item: DefaultFieldLayoutDefinition): void {
        throw new Error("Method not implemented.");
    }


}

