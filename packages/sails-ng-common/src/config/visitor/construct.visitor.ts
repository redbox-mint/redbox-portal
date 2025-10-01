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
    GroupFieldComponentDefinitionFrame,
    GroupFieldComponentDefinitionOutline, GroupFieldComponentName, GroupFieldModelDefinitionFrame,
    GroupFieldModelDefinitionOutline, GroupFieldModelName,
    GroupFormComponentDefinitionOutline
} from "../component/group.outline";
import {
    RepeatableComponentName, RepeatableElementFieldLayoutDefinitionFrame,
    RepeatableElementFieldLayoutDefinitionOutline, RepeatableElementLayoutName, RepeatableFieldComponentDefinitionFrame,
    RepeatableFieldComponentDefinitionOutline,
    RepeatableFieldModelDefinitionFrame, RepeatableFieldModelDefinitionOutline,
    RepeatableFormComponentDefinitionOutline, RepeatableModelName
} from "../component/repeatable.outline";
import {
    RepeatableElementFieldLayoutConfig,
    RepeatableFieldComponentConfig,
    RepeatableFieldModelConfig
} from "../component/repeatable.model";
import {
    GroupFieldComponentConfig,
    GroupFieldModelConfig
} from "../component/group.model";
import {
    SimpleInputComponentName,
    SimpleInputFieldComponentDefinitionFrame,
    SimpleInputFieldComponentDefinitionOutline, SimpleInputFieldModelDefinitionFrame,
    SimpleInputFieldModelDefinitionOutline, SimpleInputFormComponentDefinitionOutline, SimpleInputModelName
} from "../component/simple-input.outline";
import {SimpleInputFieldComponentConfig, SimpleInputFieldModelConfig} from "../component/simple-input.model";
import {
    DefaultFieldLayoutDefinitionFrame,
    DefaultFieldLayoutDefinitionOutline, DefaultLayoutName
} from "../component/default-layout.outline";
import {DefaultFieldLayoutConfig} from "../component/default-layout.model";
import {FormConstraintAuthorizationConfig, FormConstraintConfig, FormExpressionsConfig} from "../form-component.model";
import {isFormComponentDefinition} from "../helpers";
import {FormComponentDefinitionFrame, FormComponentDefinitionOutline} from "../form-component.outline";


/**
 * Visit each form config frame and create an instance of the associated class.
 * Populate the form config hierarchy with the class instances.
 */
export class ConstructFormConfigVisitor extends FormConfigVisitor {
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

    start(data: FormConfigFrame): FormConfigOutline {
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

    /* SimpleInput */

    visitSimpleInputFieldComponentDefinition(item: SimpleInputFieldComponentDefinitionOutline): void {
        // Get the current raw data for constructing the class instance.
        const currentData = this.getDataPath(this.data, this.currentPath);
        if (!this.isFieldDefinition<SimpleInputFieldComponentDefinitionFrame>(currentData, SimpleInputComponentName)) {
            return;
        }
        const config = currentData?.config;

        // Create the class instance for the config
        item.config = new SimpleInputFieldComponentConfig();

        this.sharedPopulateFieldComponentConfig(item.config, config);

        if (config?.type) {
            item.config.type = config?.type;
        }
    }

    visitSimpleInputFieldModelDefinition(item: SimpleInputFieldModelDefinitionOutline): void {
        // Get the current raw data for constructing the class instance.
        const currentData = this.getDataPath(this.data, this.currentPath);
        if (!this.isFieldDefinition<SimpleInputFieldModelDefinitionFrame>(currentData, SimpleInputModelName)) {
            return;
        }

        // Create the class instance for the config
        item.config = new SimpleInputFieldModelConfig();

        this.sharedPopulateFieldModelConfig(item.config, currentData?.config);
    }

    visitSimpleInputFormComponentDefinition(item: SimpleInputFormComponentDefinitionOutline): void {
        this.sharedPopulateFormComponent(item);
    }

    /* Content */

    /* Repeatable  */

    visitRepeatableFieldComponentDefinition(item: RepeatableFieldComponentDefinitionOutline): void {
        // Get the current raw data for constructing the class instance.
        const currentData = this.getDataPath(this.data, this.currentPath);
        if (!this.isFieldDefinition<RepeatableFieldComponentDefinitionFrame>(currentData, RepeatableComponentName)) {
            return;
        }
        const config = currentData?.config;

        // Create the class instance for the config
        item.config = new RepeatableFieldComponentConfig();

        this.sharedPopulateFieldComponentConfig(item.config, config);

        if (!config?.elementTemplate) {
            throw new Error(`Missing elementTemplate for repeatable at '${this.currentPath}'.`)
        }

        const formComponent = this.sharedConstructFormComponent(config?.elementTemplate);

        // Store the instances on the item
        item.config.elementTemplate = formComponent;

        // Continue the construction
        this.currentPath = [...this.currentPath, "config", "elementTemplate"];
        formComponent?.accept(this);
    }

    visitRepeatableFieldModelDefinition(item: RepeatableFieldModelDefinitionOutline): void {
        // Get the current raw data for constructing the class instance.
        const currentData = this.getDataPath(this.data, this.currentPath);
        if (!this.isFieldDefinition<RepeatableFieldModelDefinitionFrame>(currentData, RepeatableModelName)) {
            return;
        }

        // Create the class instance for the config
        item.config = new RepeatableFieldModelConfig();

        this.sharedPopulateFieldModelConfig(item.config, currentData?.config);
    }

    visitRepeatableElementFieldLayoutDefinition(item: RepeatableElementFieldLayoutDefinitionOutline): void {
        // Get the current raw data for constructing the class instance.
        const currentData = this.getDataPath(this.data, this.currentPath);
        if (!this.isFieldDefinition<RepeatableElementFieldLayoutDefinitionFrame>(currentData, RepeatableElementLayoutName)) {
            return;
        }

        // Create the class instance for the config
        item.config = new RepeatableElementFieldLayoutConfig();

        this.sharedPopulateFieldLayoutConfig(item.config, currentData?.config);

    }

    visitRepeatableFormComponentDefinition(item: RepeatableFormComponentDefinitionOutline): void {
        this.sharedPopulateFormComponent(item);
    }

    /* Validation Summary */

    /* Group */

    visitGroupFieldComponentDefinition(item: GroupFieldComponentDefinitionOutline): void {
        // Get the current raw data for constructing the class instance.
        const currentData = this.getDataPath(this.data, this.currentPath);
        if (!this.isFieldDefinition<GroupFieldComponentDefinitionFrame>(currentData, GroupFieldComponentName)) {
            return;
        }
        const config = currentData?.config;

        // Create the class instance for the config
        item.config = new GroupFieldComponentConfig();

        this.sharedPopulateFieldComponentConfig(item.config, config);

        // Visit the components
        const fieldComponentPath = [...this.currentPath];
        (config?.componentDefinitions ?? []).forEach((componentDefinition, index) => {
            const formComponent = this.sharedConstructFormComponent(componentDefinition);

            // Store the instances on the item
            item.config?.componentDefinitions.push(formComponent);

            // Continue the construction
            this.currentPath = [...fieldComponentPath, "config", "componentDefinitions", index.toString()];
            formComponent?.accept(this);
        });
        this.currentPath = fieldComponentPath;
    }

    visitGroupFieldModelDefinition(item: GroupFieldModelDefinitionOutline): void {
        // Get the current raw data for constructing the class instance.
        const currentData = this.getDataPath(this.data, this.currentPath);
        if (!this.isFieldDefinition<GroupFieldModelDefinitionFrame>(currentData, GroupFieldModelName)) {
            return;
        }

        // Create the class instance for the config
        item.config = new GroupFieldModelConfig();

        this.sharedPopulateFieldModelConfig(item.config, currentData?.config);
    }

    visitGroupFormComponentDefinition(item: GroupFormComponentDefinitionOutline): void {
        this.sharedPopulateFormComponent(item);
    }

    /* Tab  */

    /* Tab Content */

    /* Save Button  */

    /* Text Area */

    /* Default Layout  */

    visitDefaultFieldLayoutDefinition(item: DefaultFieldLayoutDefinitionOutline): void {
        // Get the current raw data for constructing the class instance.
        const currentData = this.getDataPath(this.data, this.currentPath);
        if (!this.isFieldDefinition<DefaultFieldLayoutDefinitionFrame>(currentData, DefaultLayoutName)) {
            return;
        }

        // Create the class instance for the config
        item.config = new DefaultFieldLayoutConfig();

        this.sharedPopulateFieldLayoutConfig(item.config, currentData?.config);
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
