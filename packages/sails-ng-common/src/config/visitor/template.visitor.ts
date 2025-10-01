import {FormConfigVisitor} from "./base.model";
import {FormConfigFrame, FormConfigOutline} from "../form-config.outline";
import {TemplateCompileInput} from "../../template.outline";
import {ConstructFormConfigVisitor} from "./construct.visitor";
import {data} from "jquery";


/**
 * Visit each form config class type and extract information about any
 * templates that need to be compiled.
 */
export class TemplateFormConfigVisitor extends FormConfigVisitor {
    private constructed?: FormConfigOutline;
    private result?: TemplateCompileInput[];

    start(data: FormConfigFrame): TemplateCompileInput[] {
        const constructVisitor = new ConstructFormConfigVisitor();
        this.constructed = constructVisitor.start(data);

        this.result = [];
        this.constructed.accept(this);
        return this.result;
    }


    visitFormConfig(item: FormConfigOutline) {

        for (const template of item.templates) {

        }
    }
}