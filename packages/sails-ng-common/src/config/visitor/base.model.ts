import {IFormConfig} from "../form-config.frame";
import {IFormConfigVisitor} from "./base.structure";


/**
 * The form config visitor definition.
 */
export abstract class FormConfigVisitor implements IFormConfigVisitor {

    visitFormConfig(item: IFormConfig): void {
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

    visitSaveButtonFormComponentDefinition(param: SaveButtonFormComponentDefinition): void {
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