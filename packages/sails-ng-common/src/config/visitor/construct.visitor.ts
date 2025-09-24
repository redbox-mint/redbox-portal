import {FormConfigItemVisitor,FormConfig, FormConfigFrame} from "../..";


/**
 * Visit each form config frame and create an instance of the associated class.
 * Populate the form config hierarchy with the class instances.
 */
export class ConstructFormConfigVisitor extends FormConfigItemVisitor {
    private _form?: FormConfig;

    constructFormConfig(data: FormConfigFrame): FormConfig {
        this._form = undefined;
        const item = new FormConfig(data);

        for (const componentDefinition of data.componentDefinitions ?? []) {
            componentDefinition
        }

        item.accept(this);
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
