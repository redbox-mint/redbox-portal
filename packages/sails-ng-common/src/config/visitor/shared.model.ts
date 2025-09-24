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
    TextAreaFieldModelDefinition,
    ValidationSummaryFieldComponentDefinition,
    TabContentFieldComponentDefinition,
    TabContentFieldLayoutDefinition,
    TabContentFormComponentDefinition, TextAreaFormComponentDefinition
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
        this.notImplemented('visitFormConfig');
    }

    /* SimpleInput */

    visitSimpleInputFieldComponentDefinition(item: SimpleInputFieldComponentDefinition): void {
        this.notImplemented('visitSimpleInputFieldComponentDefinition');
    }

    visitSimpleInputFieldModelDefinition(item: SimpleInputFieldModelDefinition): void {
        this.notImplemented('visitSimpleInputFieldModelDefinition');
    }

    visitSimpleInputFormComponentDefinition(param: SimpleInputFormComponentDefinition): void {
        this.notImplemented('visitSimpleInputFormComponentDefinition');
    }

    /* Content */

    visitContentFieldComponentDefinition(item: ContentFieldComponentDefinition): void {
        this.notImplemented('visitContentFieldComponentDefinition');
    }

    visitContentFormComponentDefinition(item: ContentFormComponentDefinition): void {
        this.notImplemented('visitContentFormComponentDefinition');
    }

    /* Repeatable  */

    visitRepeatableFieldComponentDefinition(item: RepeatableFieldComponentDefinition): void {
        this.notImplemented('visitRepeatableFieldComponentDefinition');
    }

    visitRepeatableFieldModelDefinition(item: RepeatableFieldModelDefinition): void {
        this.notImplemented('visitRepeatableFieldModelDefinition');
    }

    visitRepeatableElementFieldLayoutDefinition(item: RepeatableElementFieldLayoutDefinition): void {
        this.notImplemented('visitRepeatableElementFieldLayoutDefinition');
    }

    visitRepeatableFormComponentDefinition(item: RepeatableFormComponentDefinition): void {
        this.notImplemented('visitRepeatableFormComponentDefinition');
    }

    /* Validation Summary */

    visitValidationSummaryFieldComponentDefinition(item: ValidationSummaryFieldComponentDefinition): void {
        this.notImplemented('visitValidationSummaryFieldComponentDefinition');
    }

    visitValidationSummaryFormComponentDefinition(item: ValidationSummaryFormComponentDefinition): void {
        this.notImplemented('visitValidationSummaryFormComponentDefinition');
    }

    /* Group */

    visitGroupFieldComponentDefinition(item: GroupFieldComponentDefinition): void {
        this.notImplemented('visitGroupFieldComponentDefinition');
    }

    visitGroupFieldModelDefinition(item: GroupFieldModelDefinition): void {
        this.notImplemented('visitGroupFieldModelDefinition');
    }

    visitGroupFormComponentDefinition(param: GroupFormComponentDefinition): void {
        this.notImplemented('visitGroupFormComponentDefinition');
    }

    /* Tab  */

    visitTabFieldComponentDefinition(item: TabFieldComponentDefinition): void {
        this.notImplemented('visitTabFieldComponentDefinition');
    }

    visitTabFieldLayoutDefinition(item: TabFieldLayoutDefinition): void {
        this.notImplemented('visitTabFieldLayoutDefinition');
    }

    visitTabFormComponentDefinition(item: TabFormComponentDefinition): void {
        this.notImplemented('visitTabFormComponentDefinition');
    }

    /*  Tab Content */

    visitTabContentFieldComponentDefinition(item: TabContentFieldComponentDefinition): void {
        this.notImplemented('visitTabContentFieldComponentDefinition');
    }

    visitTabContentFieldLayoutDefinition(item: TabContentFieldLayoutDefinition): void {
        this.notImplemented('visitTabContentFieldLayoutDefinition');
    }

    visitTabContentFormComponentDefinition(item: TabContentFormComponentDefinition): void {
        this.notImplemented('visitTabContentFormComponentDefinition');
    }

    /* Save Button  */

    visitSaveButtonFieldComponentDefinition(item: SaveButtonFieldComponentDefinition): void {
        this.notImplemented('visitSaveButtonFieldComponentDefinition');
    }

    visitSaveButtonFormComponentDefinition(param: SaveButtonFormComponentDefinition) {
        this.notImplemented('visitSaveButtonFormComponentDefinition');
    }

    /* Text Area */

    visitTextAreaFieldComponentDefinition(item: TextAreaFieldComponentDefinition): void {
        this.notImplemented('visitTextAreaFieldComponentDefinition');
    }

    visitTextAreaFieldModelDefinition(item: TextAreaFieldModelDefinition): void {
        this.notImplemented('visitTextAreaFieldModelDefinition');
    }

    visitTextAreaFormComponentDefinition(item: TextAreaFormComponentDefinition): void {
        this.notImplemented('visitTextAreaFormComponentDefinition');
    }

    /* Default Layout  */
    visitDefaultFieldLayoutDefinition(item: DefaultFieldLayoutDefinition): void {
        this.notImplemented('visitDefaultFieldLayoutDefinition');
    }

    private notImplemented(name: string) {
        throw new Error(`Method '${name}' is not implemented.`);
    }
}

