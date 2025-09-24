import {FormConfigVisitor} from "./base.model";


/**
 * Visit each form config class type and extract information about any
 * templates that need to be compiled.
 */
export class TemplateFormConfigVisitor extends FormConfigVisitor {
    private _templates: Record<string, unknown> = {};

    constructor() {
        super()
    }

    get result(): Record<string, unknown> {
        return this._templates;
    }
}