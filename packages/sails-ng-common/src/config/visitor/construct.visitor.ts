import {FormConfig} from "../form-config.model";
import {AllDefMap} from "../dictionary.model";
import {FormConfigVisitor} from "./base.model";
import {FormConfigFrame} from "../form-config.outline";


/**
 * Visit each form config frame and create an instance of the associated class.
 * Populate the form config hierarchy with the class instances.
 */
export class ConstructFormConfigVisitor extends FormConfigVisitor {
    private result?: FormConfig;

    start(data: FormConfigFrame): FormConfig {
        this.result = undefined;
        const item = new FormConfig();

        const available = AllDefMap;

        // for (const componentDefinition of data.componentDefinitions ?? []) {
        //     // componentDefinition
        // }

        item.accept(this);
        if (this.result !== undefined) {
            return this.result;
        }
        throw new Error("Not implemented.");
    }

    visitFormConfig(item: FormConfig): void {
        for (const child of item.children) {
            child.accept(this);
        }
    }
}
