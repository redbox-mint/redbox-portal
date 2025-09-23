import {FormConfigItemVisitor,FormConfig} from "../..";


/**
 * Visit each form config class type and build the form config for the client-side.
 */
export class ClientFormConfigVisitor extends FormConfigItemVisitor {
    private _form?: FormConfig;

    buildClientFormConfig(original: FormConfig): FormConfig {
        this._form = undefined;
        original.accept(this);
        if (this._form !== undefined) {
            return this._form;
        }
        throw new Error("Form building failed.");
    }

    visitFormConfig(item: FormConfig): void {
        for (const child of item.children) {
            child.accept(this);
        }
    }
}
