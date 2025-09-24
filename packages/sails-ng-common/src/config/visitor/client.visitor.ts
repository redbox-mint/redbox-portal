import {IFormConfig} from "../form-config.frame";
import {FormConfigVisitor} from "./base.model";


/**
 * Visit each form config class type and build the form config for the client-side.
 */
export class ClientFormConfigVisitor extends FormConfigVisitor {
    private _form?: IFormConfig;

    buildClientFormConfig(original: IFormConfig): IFormConfig {
        this._form = undefined;
        original.accept(this);
        if (this._form !== undefined) {
            return this._form;
        }
        throw new Error("Form building failed.");
    }

    visitFormConfig(item: IFormConfig): void {
        for (const child of item.children) {
            child.accept(this);
        }
    }
}
