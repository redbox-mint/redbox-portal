import {FormConfigItemVisitor} from ".";


/**
 * Visit each form config class type and extract information about any
 * templates that need to be compiled.
 */
export class TemplateFormConfigVisitor extends FormConfigItemVisitor {
    private _templates: Record<string, unknown> = {};

    constructor() {
        super()
    }

    get result(): Record<string, unknown> {
        return this._templates;
    }
}