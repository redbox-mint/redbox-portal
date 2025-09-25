import {FormConfigOutline} from "../form-config.outline";
import {FormConfigVisitor} from "./base.model";


/**
 * Visit each form config class type and build the form config for the client-side.
 */
export class ClientFormConfigVisitor extends FormConfigVisitor {
    private result?: FormConfigOutline;

    start(original: FormConfigOutline): FormConfigOutline {
        this.result = undefined;
        original.accept(this);
        if (this.result !== undefined) {
            return this.result;
        }
        throw new Error("Not implemented.");
    }

    visitFormConfig(item: FormConfigOutline): void {
        for (const child of item.children) {
            child.accept(this);
        }
    }
}
