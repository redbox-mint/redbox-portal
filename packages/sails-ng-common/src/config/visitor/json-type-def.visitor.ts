import {FormConfigVisitor} from "./base.model";
import {FormConfigOutline} from "../form-config.outline";


/**
 * Visit each form config class type to build the JSON TypeDef schema that represents the form config.
 */
export class JsonTypeDefSchemaFormConfigVisitor extends FormConfigVisitor {
    private result?: Record<string, unknown>;

    start(formConfig: FormConfigOutline): Record<string, unknown> {
        this.result = undefined;
        formConfig.accept(this);
        if (this.result !== undefined) {
            return this.result;
        }
        throw new Error("Not implemented.");
    }

}