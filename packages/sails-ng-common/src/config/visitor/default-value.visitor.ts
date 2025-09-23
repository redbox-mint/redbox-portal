import {FormConfigItemVisitor,FormConfig} from "../..";


/**
 * Visit each form config class type and extract the default value for each field.
 */
export class DefaultValueFormConfigVisitor extends FormConfigItemVisitor {
    visitFormConfig(item: FormConfig): void {
        throw new Error("Method not implemented.");
    }

    private _defaults: Record<string, unknown> = {};

    constructor() {
        super()
    }

    get result(): Record<string, unknown> {
        return this._defaults;
    }
}
