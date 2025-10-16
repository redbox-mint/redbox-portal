import {FormConfigFrame, FormConfigOutline} from "../form-config.outline";
import {CurrentPathFormConfigVisitor} from "./base.model";
import {FormConfig} from "../form-config.model";
import {
    FieldComponentDefinitionMap,
    FieldLayoutDefinitionMap,
    FieldModelDefinitionMap,
    FormComponentDefinitionMap
} from "../dictionary.model";
import {FormComponentDefinitionFrame} from "../form-component.outline";
import {FormModesConfig} from "../shared.outline";
import {isTypeFormConfig, isTypeWithComponentDefinitions} from "../helpers";


/**
 * Visit each form config class type and build the form config for the client-side.
 */
export class ClientFormConfigVisitor extends CurrentPathFormConfigVisitor {
    private formMode?: FormModesConfig;
    private userRoles?: string[];
    private recordOid?: string;
    private recordData?: unknown;

    private result?: FormConfigOutline;
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
    start(data: FormConfigFrame, formMode?: FormModesConfig, userRoles?: string[], recordOid?: string, recordData?: unknown): FormConfigFrame {
        this.formMode = formMode;
        this.userRoles = userRoles;
        this.recordOid = recordOid;
        this.recordData = recordData;

        this.result = new FormConfig();
        this.data = data;
        this.resetCurrentPath();

        this.result.accept(this);
        return this.result;
    }

    visitFormConfig(item: FormConfigOutline): void {
        const currentData = this.getDataPath(this.data, this.currentPath);
        if (!isTypeFormConfig(currentData)) {
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
            this.acceptCurrentPath(formComponent, ["componentDefinitions", index.toString()]);
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
}
