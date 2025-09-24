import {FormConfig} from "../form-config.model";
import {AllDefMap} from "../static-types-classes.dictionary";
import {FormConfigVisitor} from "./base.model";
import {FormConfigFrame} from "../form-config.frame";


/**
 * Visit each form config frame and create an instance of the associated class.
 * Populate the form config hierarchy with the class instances.
 */
export class ConstructFormConfigVisitor extends FormConfigVisitor {
    private _form?: FormConfig;

    constructFormConfig(data: FormConfigFrame): FormConfig {
        this._form = undefined;
        const item = new FormConfig();

        const available = AllDefMap;

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
