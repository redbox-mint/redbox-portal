import {FormConfigItemVisitor} from "../..";

/**
 * Visit each form config class type to build the JSON TypeDef schema that represents the form config.
 */
export class JsonTypeDefSchemaFormConfigVisitor extends FormConfigItemVisitor {
    private _schema: Record<string, unknown> = {};

    constructor() {
        super()
    }

    get result(): Record<string, unknown> {
        return this._schema;
    }

}