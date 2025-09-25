import {FormConfig} from "../form-config.model";
import {
    FieldComponentDefinitionMap,
    FieldLayoutDefinitionMap,
    FieldModelDefinitionMap,
    FormComponentDefinitionMap,
} from "../dictionary.model";
import {FormConfigVisitor} from "./base.model";
import {FormConfigFrame} from "../form-config.outline";


/**
 * Visit each form config frame and create an instance of the associated class.
 * Populate the form config hierarchy with the class instances.
 */
export class ConstructFormConfigVisitor extends FormConfigVisitor {
    private result?: FormConfig;
    private data?: FormConfigFrame;

    private fieldComponentMap?;
    private fieldModelMap?;
    private fieldLayoutMap?;
    private formComponentMap?;

    constructor() {
        super();
        this.fieldComponentMap = FieldComponentDefinitionMap;
        this.fieldModelMap = FieldModelDefinitionMap;
        this.fieldLayoutMap = FieldLayoutDefinitionMap;
        this.formComponentMap = FormComponentDefinitionMap;
    }

    start(data: FormConfigFrame): FormConfig {
        this.result = new FormConfig();
        this.data = data;
        this.result.accept(this);
        return this.result;
    }

    visitFormConfig(item: FormConfig): void {
        for (const componentDefinition of this.data?.componentDefinitions ?? []) {
            // The class to use is identified by the class property string values in the field definitions.
            // The form component is identifier the component field class string
            const componentClassString = componentDefinition?.component?.class;
            const modelClassString = componentDefinition?.model?.class;
            const layoutClassString = componentDefinition?.layout?.class;

            // Get the classes
            const componentClass = this.fieldComponentMap?.get(componentClassString);
            const modelClass = modelClassString ? this.fieldModelMap?.get(modelClassString) : null;
            const layoutClass = layoutClassString ? this.fieldLayoutMap?.get(layoutClassString) : null;
            const formComponentClass = this.formComponentMap?.get(componentClassString);

            // Create new instances
            if (!componentClass){
                throw new Error(`Could not find class for '${componentClassString}'.`)
            }
            const formComponent = formComponentClass ? new formComponentClass() : null;
            const component = new componentClass();
            const model = modelClass ? new modelClass() : null;
            const layout = layoutClass ? new layoutClass() : null;

            // all accept on the instances
            formComponent?.accept(this);
            component?.accept(this);
            model?.accept(this);
            layout?.accept(this);
        }
    }
}
