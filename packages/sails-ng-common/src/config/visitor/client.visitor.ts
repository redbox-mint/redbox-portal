import {FormConfigFrame, FormConfigOutline} from "../form-config.outline";
import {FormConfigVisitor} from "./base.model";
import {FormConfig} from "../form-config.model";
import {
    FieldComponentDefinitionMap,
    FieldLayoutDefinitionMap,
    FieldModelDefinitionMap,
    FormComponentDefinitionMap
} from "../dictionary.model";
import {FormComponentDefinitionFrame, FormComponentDefinitionOutline} from "../form-component.outline";
import {isFormComponentDefinition} from "../helpers";
import {FormConstraintAuthorizationConfig, FormConstraintConfig, FormExpressionsConfig} from "../form-component.model";
import {FormModesConfig} from "../shared.outline";


/**
 * Visit each form config class type and build the form config for the client-side.
 */
export class ClientFormConfigVisitor extends FormConfigVisitor {
    private formMode?: FormModesConfig;
    private userRoles?: string[];
    private recordOid?: string;
    private recordData?: unknown;

    private result?: FormConfigOutline;
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
    start(data: FormConfigFrame, formMode?: FormModesConfig, userRoles?: string[], recordOid?: string, recordData?: unknown): FormConfigFrame {
        this.formMode = formMode;
        this.userRoles = userRoles;
        this.recordOid = recordOid;
        this.recordData = recordData;

        this.result = new FormConfig();
        this.data = data;
        this.currentPath = [];

        this.result.accept(this);
        return this.result;
    }

    visitFormConfig(item: FormConfigOutline): void {
        const currentData = this.getDataPath(this.data, this.currentPath);
        if (!this.isFormConfig(currentData)) {
            return;
        }

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
            const formComponent = this.sharedConstructFormComponent(componentDefinition);

            // Store the instances on the item
            item.componentDefinitions.push(formComponent);

            // Continue the construction
            this.currentPath = [...this.currentPath, "componentDefinitions", index.toString()];
            formComponent?.accept(this);
        });
    }


    protected sharedConstructFormComponent(item: FormComponentDefinitionFrame) {
        // The class to use is identified by the class property string values in the field definitions.
        const componentClassString = item?.component?.class;

        // The class to use is identified by the class property string values in the field definitions.
        // The form component is identifier the component field class string
        const formComponentClass = this.formComponentMap?.get(componentClassString);

        // Create new instance
        if (!formComponentClass) {
            throw new Error(`Could not find class for form component class name '${componentClassString}' at path '${this.currentPath}'.`)
        }
        const formComponent = new formComponentClass(item);
        return formComponent;
    }

    protected sharedPopulateFormComponent(item: FormComponentDefinitionOutline): void {
        // Get the current raw data for constructing the class instance.
        const currentData = this.getDataPath(this.data, this.currentPath);
        if (!isFormComponentDefinition(currentData)) {
            throw new Error("Invalid FormComponentDefinition");
        }

        // Set the simple properties
        item.name = currentData.name;
        item.module = currentData.module;

        // Set the constraints
        item.constraints = new FormConstraintConfig();
        item.constraints.allowModes = currentData?.constraints?.allowModes ?? [];

        item.constraints.authorization = new FormConstraintAuthorizationConfig();
        item.constraints.authorization.allowRoles = currentData?.constraints?.authorization?.allowRoles ?? [];

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
        if (!componentClass) {
            throw new Error(`Could not find class for field component class string '${componentClassString}'.`)
        }
        const component = new componentClass();
        const model = modelClass ? new modelClass() : null;
        const layout = layoutClass ? new layoutClass() : null;

        // Set the instances and then continue the construction
        const formComponentPath = [...this.currentPath];
        item.component = component;
        this.currentPath = [...formComponentPath, 'component'];
        item.component?.accept(this);

        if (model) {
            item.model = model;
            this.currentPath = [...formComponentPath, 'model'];
            item.model?.accept(this);
        }
        if (layout) {
            item.layout = layout;
            this.currentPath = [...formComponentPath, 'layout'];
            item.layout?.accept(this);
        }
        this.currentPath = formComponentPath;
    }
}
