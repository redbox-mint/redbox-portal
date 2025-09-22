import {FormConfigItemVisitor} from "./shared.model";
import {FormConfig} from "../form-config.model";
import {
    ContentFormComponentDefinition,
    ContentFormFieldComponentDefinition, DefaultFormFieldLayoutDefinition,
    GroupFormFieldComponentDefinition,
    GroupFormFieldModelDefinition,
    RepeatableElementFormFieldLayoutDefinition,
    RepeatableFormFieldComponentDefinition,
    RepeatableFormFieldModelDefinition, SaveButtonComponentDefinition,
    SimpleInputComponentDefinition,
    SimpleInputModelDefinition, TabComponentFormFieldLayoutDefinition, TabContentComponentDefinition,
    TabFormFieldComponentDefinition, TextAreaComponentDefinition, TextareaModelDefinition,
    ValidationSummaryFormFieldComponentDefinition,
    ValidationSummaryFormFieldModelDefinition
} from "../component";

/**
 * Visit each form config class type and extract the default value for each field.
 */
export class DefaultValueFormConfigVisitor extends FormConfigItemVisitor {
    private _defaults: Record<string, unknown> = {};

    constructor() {
        super()
    }

    get result(): Record<string, unknown> {
        return this._defaults;
    }

    visitFormConfig(item: FormConfig): void {
        throw new Error("Method not implemented.");
    }

    visitSimpleInputComponentDefinition(item: SimpleInputComponentDefinition): void {
        throw new Error("Method not implemented.");
    }

    visitSimpleInputModelDefinition(item: SimpleInputModelDefinition): void {
        throw new Error("Method not implemented.");
    }

    visitContentFormFieldComponentDefinition(item: ContentFormFieldComponentDefinition): void {
        throw new Error("Method not implemented.");
    }

    visitContentFormComponentDefinition(item: ContentFormComponentDefinition): void {
        throw new Error("Method not implemented.");
    }

    visitRepeatableFormFieldComponentDefinition(item: RepeatableFormFieldComponentDefinition): void {
        throw new Error("Method not implemented.");
    }

    visitRepeatableFormFieldModelDefinition(item: RepeatableFormFieldModelDefinition): void {
        throw new Error("Method not implemented.");
    }

    visitRepeatableElementFormFieldLayoutDefinition(item: RepeatableElementFormFieldLayoutDefinition): void {
        throw new Error("Method not implemented.");
    }

    visitValidationSummaryFormFieldComponentDefinition(item: ValidationSummaryFormFieldComponentDefinition): void {
        throw new Error("Method not implemented.");
    }

    visitValidationSummaryFormFieldModelDefinition(item: ValidationSummaryFormFieldModelDefinition): void {
        throw new Error("Method not implemented.");
    }

    visitGroupFormFieldComponentDefinition(item: GroupFormFieldComponentDefinition): void {
        throw new Error("Method not implemented.");
    }

    visitGroupFormFieldModelDefinition(item: GroupFormFieldModelDefinition): void {
        throw new Error("Method not implemented.");
    }

    visitTabFormFieldComponentDefinition(item: TabFormFieldComponentDefinition): void {
        throw new Error("Method not implemented.");
    }

    visitTabContentComponentDefinition(item: TabContentComponentDefinition): void {
        throw new Error("Method not implemented.");
    }

    visitTabComponentFormFieldLayoutDefinition(item: TabComponentFormFieldLayoutDefinition): void {
        throw new Error("Method not implemented.");
    }

    visitSaveButtonComponentDefinition(item: SaveButtonComponentDefinition): void {
        throw new Error("Method not implemented.");
    }

    visitTextAreaComponentDefinition(item: TextAreaComponentDefinition): void {
        throw new Error("Method not implemented.");
    }

    visitTextareaModelDefinition(item: TextareaModelDefinition): void {
        throw new Error("Method not implemented.");
    }

    visitDefaultFormFieldLayoutDefinition(item: DefaultFormFieldLayoutDefinition): void {
        throw new Error("Method not implemented.");
    }
}
