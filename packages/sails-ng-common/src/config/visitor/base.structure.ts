export interface Visitee {
    /**
     * Accept a visitor to this form field definition.
     */
    accept(visitor: IFormConfigVisitor): void;
}


export interface IFormConfigVisitor {
    visitFormConfig(item: Visitee): void;

    /* SimpleInput */

    visitSimpleInputFieldComponentDefinition(item: SimpleInputFieldComponentDefinition): void;

    visitSimpleInputFieldModelDefinition(item: SimpleInputFieldModelDefinition): void;

    visitSimpleInputFormComponentDefinition(param: SimpleInputFormComponentDefinition): void;

    /* Content */

    visitContentFieldComponentDefinition(item: ContentFieldComponentDefinition): void;

    /* Repeatable  */

    visitContentFormComponentDefinition(item: ContentFormComponentDefinition): void;

    visitRepeatableFieldComponentDefinition(item: RepeatableFieldComponentDefinition): void;

    visitRepeatableFieldModelDefinition(item: RepeatableFieldModelDefinition): void;

    visitRepeatableElementFieldLayoutDefinition(item: RepeatableElementFieldLayoutDefinition): void;

    visitRepeatableFormComponentDefinition(item: RepeatableFormComponentDefinition): void;

    /* Validation Summary */

    visitValidationSummaryFieldComponentDefinition(item: ValidationSummaryFieldComponentDefinition): void;

    visitValidationSummaryFormComponentDefinition(item: ValidationSummaryFormComponentDefinition): void;

    /* Group */

    visitGroupFieldComponentDefinition(item: GroupFieldComponentDefinition): void;

    visitGroupFieldModelDefinition(item: GroupFieldModelDefinition): void;

    visitGroupFormComponentDefinition(param: GroupFormComponentDefinition): void;

    /* Tab  */

    visitTabFieldComponentDefinition(item: TabFieldComponentDefinition): void;

    visitTabFieldLayoutDefinition(item: TabFieldLayoutDefinition): void;

    visitTabFormComponentDefinition(item: TabFormComponentDefinition): void;

    /*  Tab Content */

    visitTabContentFieldComponentDefinition(item: TabContentFieldComponentDefinition): void;

    visitTabContentFieldLayoutDefinition(item: TabContentFieldLayoutDefinition): void;

    visitTabContentFormComponentDefinition(item: TabContentFormComponentDefinition): void;

    /* Save Button  */

    visitSaveButtonFieldComponentDefinition(item: SaveButtonFieldComponentDefinition): void;

    visitSaveButtonFormComponentDefinition(param: SaveButtonFormComponentDefinition): void;

    /* Text Area */

    visitTextAreaFieldComponentDefinition(item: TextAreaFieldComponentDefinition): void;

    visitTextAreaFieldModelDefinition(item: TextAreaFieldModelDefinition): void;

    visitTextAreaFormComponentDefinition(item: TextAreaFormComponentDefinition): void;

    /* Default Layout  */

    visitDefaultFieldLayoutDefinition(item: DefaultFieldLayoutDefinition): void;
}