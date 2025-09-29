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
    RepeatableElementFieldLayoutDefinitionOutline, RepeatableElementLayoutName,
    RepeatableFieldComponentDefinitionOutline, RepeatableFieldModelDefinitionOutline,
    RepeatableFormComponentDefinitionOutline, RepeatableModelName
} from "../component/repeatable.outline";
import { get as _get} from "lodash";
import {FormConstraintAuthorizationConfig, FormConstraintConfig, FormExpressionsConfig} from "../form-component.model";
import {isFormComponentDefinition, isFormFieldDefinition} from "../helpers";
import {RepeatableFieldComponentConfig} from "../component/repeatable.model";

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
        // TODO: fix the typing
        (currentData?.componentDefinitions as any[] ?? []).forEach((componentDefinition, index) => {
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
            this.currentPath = [...this.currentPath, "componentDefinitions", index.toString()];
            formComponent?.accept(this);
        });
    }

    /* SimpleInput */

    /* Content */

    /* Repeatable  */

    visitRepeatableFieldComponentDefinition(item: RepeatableFieldComponentDefinitionOutline): void {
        // Get the current raw data for constructing the class instance.
        const currentData = this.getDataPath(this.data, this.currentPath);
        if (!this.isRepeatableFieldComponentDefinition(currentData)){
            throw new Error("Invalid RepeatableFieldComponentDefinition");
        }
        const config = currentData?.config;

        // Create the class instance for the config
        item.config = new RepeatableFieldComponentConfig();

        // Set the common field component config properties
        item.config.readonly = config?.readonly;
        item.config.visible = config?.visible;
        item.config.editMode = config?.editMode;
        item.config.label = config?.label;
        item.config.defaultComponentCssClasses = config?.defaultComponentCssClasses;
        item.config.hostCssClasses = config?.hostCssClasses;
        item.config.wrapperCssClasses = config?.wrapperCssClasses;
        item.config.disabled = config?.disabled;
        item.config.autofocus = config?.autofocus;
        item.config.tooltip = config?.tooltip;

        // The class to use is identified by the class property string values in the field definitions.
        const elementTemplateClassString = config?.elementTemplate?.component?.class;

        // The class to use is identified by the class property string values in the field definitions.
        // The form component is identifier the component field class string
        const formComponentClass = this.formComponentMap?.get(elementTemplateClassString);

        // Create new instance
        if (!formComponentClass){
            throw new Error(`Could not find repeatable field component form class string '${formComponentClass}'.`)
        }
        const formComponent = new formComponentClass();

        // Store the instances on the item
        item.config.elementTemplate = formComponent;

        // Continue the construction
        this.currentPath = [...this.currentPath, "config", "elementTemplate"];
        formComponent?.accept(this);
    }

    visitRepeatableFieldModelDefinition(item: RepeatableFieldModelDefinitionOutline): void {
        // Get the current raw data for constructing the class instance.
        const currentData = this.getDataPath(this.data, this.currentPath);
        if (!this.isRepeatableFieldModelDefinition(currentData)){
            throw new Error("Invalid RepeatableFieldModelDefinition");
        }
        super.visitRepeatableFieldModelDefinition(item);
    }

    visitRepeatableElementFieldLayoutDefinition(item: RepeatableElementFieldLayoutDefinitionOutline): void {
        // Get the current raw data for constructing the class instance.
        const currentData = this.getDataPath(this.data, this.currentPath);
        if (!this.isRepeatableElementFieldLayoutDefinition(currentData)){
            throw new Error("Invalid RepeatableElementFieldLayoutDefinition");
        }
        super.visitRepeatableElementFieldLayoutDefinition(item);
    }

    visitRepeatableFormComponentDefinition(item: RepeatableFormComponentDefinitionOutline): void {
        // Get the current raw data for constructing the class instance.
        const currentData = this.getDataPath(this.data, this.currentPath);
        if (!this.isRepeatableFormComponentDefinition(currentData)){
            throw new Error("Invalid RepeatableFormComponentDefinition");
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
        if (!componentClass){
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

        if (model){
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

    private isRepeatableFormComponentDefinition(value: unknown): value is RepeatableFormComponentDefinitionOutline {
        return isFormComponentDefinition(value) &&
            value?.['component']?.['class'] === RepeatableComponentName;
    }

    private isRepeatableFieldComponentDefinition(value: unknown) : value is RepeatableFieldComponentDefinitionOutline {
        return isFormFieldDefinition(value) && value?.class === RepeatableComponentName;
    }

    private isRepeatableFieldModelDefinition(value: unknown) : value is RepeatableFieldModelDefinitionOutline {
        return isFormFieldDefinition(value) && value?.class === RepeatableModelName;
    }
    private isRepeatableElementFieldLayoutDefinition(value: unknown) : value is RepeatableElementFieldLayoutDefinitionOutline {
        return isFormFieldDefinition(value) && value?.class === RepeatableElementLayoutName;
    }

    /* Validation Summary */

    /* Group */

    visitGroupFieldComponentDefinition(item: GroupFieldComponentDefinitionOutline): void {
        this.notImplemented('visitGroupFieldComponentDefinition');
    }

    visitGroupFieldModelDefinition(item: GroupFieldModelDefinitionOutline): void {
        this.notImplemented('visitGroupFieldModelDefinition');
    }

    visitGroupFormComponentDefinition(item: GroupFormComponentDefinitionOutline): void {
        // Get the current raw data for constructing the class instance.
        const currentData = this.getDataPath(this.data, this.currentPath);

        // Get the class string names.
        const componentClassString = currentData?.component?.class;
        const modelClassString = currentData?.model?.class;
        const layoutClassString = currentData?.layout?.class;

        // Get the classes
        const componentClass = this.fieldComponentMap?.get(componentClassString);
        const modelClass = modelClassString ? this.fieldModelMap?.get(modelClassString) : null;
        const layoutClass = layoutClassString ? this.fieldLayoutMap?.get(layoutClassString) : null;

        super.visitGroupFormComponentDefinition(item);
    }

    /* Tab  */

    /*  Tab Content */

    /* Save Button  */

    /* Text Area */

    /* Default Layout  */

    // TODO: fix typing
    private getDataPath(data?: object, path?: string[]) {
        if (!path || path.length < 1){
            return data;
        }
        const pathStr = path.map((i: any) => i.toString());
        const result = _get(data, pathStr);
        return result;
    }
}
