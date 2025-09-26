import {FormConfig} from "../form-config.model";
import {
    FieldComponentDefinitionMap,
    FieldLayoutDefinitionMap,
    FieldModelDefinitionMap,
    FormComponentDefinitionMap,
} from "../dictionary.model";
import {FormConfigVisitor} from "./base.model";
import {FormConfigFrame, FormConfigOutline} from "../form-config.outline";
import {
    GroupFieldComponentDefinitionOutline,
    GroupFieldModelDefinitionOutline,
    GroupFormComponentDefinitionOutline
} from "../component/group.outline";
import {
    RepeatableComponentName,
    RepeatableElementFieldLayoutDefinitionOutline,
    RepeatableFieldComponentDefinitionOutline, RepeatableFieldModelDefinitionOutline,
    RepeatableFormComponentDefinitionOutline
} from "../component/repeatable.outline";
import _ from "lodash";
import {FormConstraintAuthorizationConfig, FormConstraintConfig, FormExpressionsConfig} from "../form-component.model";

/**
 * Visit each form config frame and create an instance of the associated class.
 * Populate the form config hierarchy with the class instances.
 */
export class ConstructFormConfigVisitor extends FormConfigVisitor {
    private result?: FormConfig;
    private data?: FormConfigFrame;
    private currentPath: string[] = [];

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
        this.currentPath = [];
        this.result.accept(this);
        return this.result;
    }

    visitFormConfig(item: FormConfigOutline): void {
        const currentData = this.getDataPath(this.data, this.currentPath);

        // Set the simple properties
        item.name = currentData.name;
        item.type = currentData.type;
        item.domElementType = currentData.domElementType;
        item.domId = currentData.domId;
        item.viewCssClasses = currentData.viewCssClasses;
        item.editCssClasses = currentData.editCssClasses;
        item.defaultComponentConfig = currentData.defaultComponentConfig;
        item.skipValidationOnSave = currentData.skipValidationOnSave;
        item.validators = currentData.validators;
        item.defaultLayoutComponent = currentData.defaultLayoutComponent;
        item.debugValue = currentData.debugValue;

        // Visit the components
        (currentData?.componentDefinitions ?? []).forEach((componentDefinition, index) => {
            // The class to use is identified by the class property string values in the field definitions.
            // The form component is identifier the component field class string
            const componentClassString = componentDefinition?.component?.class;

            // Get the class from the class string name
            const formComponentClass = this.formComponentMap?.get(componentClassString);

            // Create new instance
            if (!formComponentClass){
                throw new Error(`Could not find class for form component class string '${formComponentClass}'.`)
            }
            const formComponent = new formComponentClass();

            // Store the instances on the item
            item.componentDefinitions.push(formComponent);

            // Continue the construction
            this.currentPath = [...this.currentPath, index.toString()];
            formComponent?.accept(this);
        });
    }

    /* SimpleInput */

    /* Content */

    /* Repeatable  */

    visitRepeatableFieldComponentDefinition(item: RepeatableFieldComponentDefinitionOutline): void {
        this.notImplemented('visitRepeatableFieldComponentDefinition');
    }

    visitRepeatableFieldModelDefinition(item: RepeatableFieldModelDefinitionOutline): void {
        this.notImplemented('visitRepeatableFieldModelDefinition');
    }

    visitRepeatableElementFieldLayoutDefinition(item: RepeatableElementFieldLayoutDefinitionOutline): void {
        this.notImplemented('visitRepeatableElementFieldLayoutDefinition');
    }

    visitRepeatableFormComponentDefinition(item: RepeatableFormComponentDefinitionOutline): void {
        // Get the current raw data for constructing the class instance.
        const currentData = this.getDataPath(this.data, this.currentPath);
        if (currentData?.component?.class !== RepeatableComponentName){
            throw
        } else {
            currentData is RepeatableFormComponentDefinitionOutline
        }

        // Set the simple properties
        item.name = currentData.name;
        item.module = currentData.module;

        // Set the constraints
        item.constraints = new FormConstraintConfig();
        item.constraints.allowModes = currentData.constraints.allowModes ?? [];

        item.constraints.authorization = new FormConstraintAuthorizationConfig();
        item.constraints.authorization.allowRoles = currentData.constraints.authorization.allowRoles ?? [];

        // Set the expressions
        item.expressions = new FormExpressionsConfig();
        for (const [key, value] of Object.entries(currentData.expressions ?? {})) {
            item.expressions[key] = value;
        }

        // Get the class string names.
        const componentClassString = currentData?.component?.class;
        const modelClassString = currentData?.model?.class;
        const layoutClassString = currentData?.layout?.class;

        // Get the classes
        const componentClass = this.fieldComponentMap?.get(componentClassString);
        const modelClass = modelClassString ? this.fieldModelMap?.get(modelClassString) : null;
        const layoutClass = layoutClassString ? this.fieldLayoutMap?.get(layoutClassString) : null;

        // Create new instances
        if (!componentClass){
            throw new Error(`Could not find class for field component class string '${componentClassString}'.`)
        }
        const component = new componentClass();
        const model = modelClass ? new modelClass() : null;
        const layout = layoutClass ? new layoutClass() : null;

        // Set the instances and then continue the construction
        item.component = component;
        this.currentPath = [...this.currentPath, 'component'];
        item.component?.accept(this);

        if (model){
            item.model = model;
            this.currentPath = [...this.currentPath, 'model'];
            item.model?.accept(this);
        }
        if (layout) {
            item.layout = layout;
            this.currentPath = [...this.currentPath, 'layout'];
            item.layout?.accept(this);
        }
    }

    /* Validation Summary */

    /* Group */

    visitGroupFieldComponentDefinition(item: GroupFieldComponentDefinitionOutline): void {
        this.notImplemented('visitGroupFieldComponentDefinition');
    }

    visitGroupFieldModelDefinition(item: GroupFieldModelDefinitionOutline): void {
        this.notImplemented('visitGroupFieldModelDefinition');
    }

    visitGroupFormComponentDefinition(param: GroupFormComponentDefinitionOutline): void {
        // Get the current raw data for constructing the class instance.
        const currentData = this.getData();

        // Get the class string names.
        const componentClassString = currentData?.component?.class;
        const modelClassString = currentData?.model?.class;
        const layoutClassString = currentData?.layout?.class;

        // Get the classes
        const componentClass = this.fieldComponentMap?.get(componentClassString);
        const modelClass = modelClassString ? this.fieldModelMap?.get(modelClassString) : null;
        const layoutClass = layoutClassString ? this.fieldLayoutMap?.get(layoutClassString) : null;

    }

    /* Tab  */

    /*  Tab Content */

    /* Save Button  */

    /* Text Area */

    /* Default Layout  */

    private getDataPath(data, path) {
        if (!path){
            return data;
        }
        return _.get(data, path.map(i => i.toString()));
    }
}
