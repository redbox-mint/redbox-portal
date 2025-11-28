import {get as _get} from "lodash";
import {ILogger} from "@researchdatabox/redbox-core-types";
import {FieldLayoutConfigFrame} from "../field-layout.outline";
import {FieldComponentConfigFrame} from "../field-component.outline";
import {FieldModelConfigFrame} from "../field-model.outline";
import {FormComponentDefinitionFrame, FormComponentDefinitionOutline} from "../form-component.outline";
import {CanVisit, FormConfigVisitorOutline} from "./base.outline";
import {FormConstraintAuthorizationConfig, FormConstraintConfig, FormExpressionsConfig} from "../form-component.model";
import {
    ComponentClassDefMapType,
    FieldComponentDefinitionMap,
    FieldLayoutDefinitionMap,
    FieldModelDefinitionMap,
    FormComponentClassDefMapType,
    FormComponentDefinitionMap,
    LayoutClassDefMapType,
    ModelClassDefMapType,
} from "../dictionary.model";

export class PropertiesHelper {
    private fieldComponentMap: ComponentClassDefMapType;
    private fieldModelMap: ModelClassDefMapType;
    private fieldLayoutMap: LayoutClassDefMapType;
    private formComponentMap: FormComponentClassDefMapType;

    constructor() {
        this.fieldComponentMap = FieldComponentDefinitionMap;
        this.fieldModelMap = FieldModelDefinitionMap;
        this.fieldLayoutMap = FieldLayoutDefinitionMap;
        this.formComponentMap = FormComponentDefinitionMap;
    }

    public getDataPath(data?: unknown, path?: string[]) {
        // TODO: fix 'data' typing
        const result = path && path.length > 0 ? _get(data, path.map((i: string) => i.toString())) : data;
        return result;
    }

    /**
     * Create a new instance of a form component.
     * @param item The form component definition.
     * @protected
     */
    public sharedConstructFormComponent(item: FormComponentDefinitionFrame) {
        // The class to use is identified by the class property string values in the field definitions.
        const componentClassString = item?.component?.class;

        // The class to use is identified by the class property string values in the field definitions.
        // The form component is identifier the component field class string
        const formComponentClass = this.formComponentMap?.get(componentClassString);

        // Create new instance
        if (formComponentClass) {
            return new formComponentClass();
        } else {
            return null;
        }
    }

    /**
     * Populate the common form component properties.
     *
     * @param item The form component instance.
     * @param currentData
     * @protected
     */
    public sharedPopulateFormComponent(item: FormComponentDefinitionOutline, currentData: FormComponentDefinitionFrame): void {
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

        // Set the overrides, as they might be used to transform this component into other components.
        item.overrides = currentData.overrides;

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

        // Set the instances
        item.component = component;
        item.model = model || undefined;
        item.layout = layout || undefined;
    }


    /**
     * Set the common field component config properties.
     * @param item Set the value of the named properties on this item.
     * @param config Get the value of the named properties from this config.
     */
    public sharedPopulateFieldComponentConfig(item: FieldComponentConfigFrame, config?: FieldComponentConfigFrame) {
        this.setPropOverride('readonly', item, config);
        this.setPropOverride('visible', item, config);
        this.setPropOverride('editMode', item, config);
        this.setPropOverride('label', item, config);
        this.setPropOverride('defaultComponentCssClasses', item, config);
        this.setPropOverride('hostCssClasses', item, config);
        this.setPropOverride('wrapperCssClasses', item, config);
        this.setPropOverride('disabled', item, config);
        this.setPropOverride('autofocus', item, config);
        this.setPropOverride('tooltip', item, config);
    }

    /**
     * Set the common field model config properties.
     * @param item Set the value of the named properties on this item.
     * @param config Get the value of the named properties from this config.
     */
    public sharedPopulateFieldModelConfig(item: FieldModelConfigFrame<unknown>, config?: FieldModelConfigFrame<unknown>) {
        this.setPropOverride('disableFormBinding', item, config);
        this.setPropOverride('value', item, config);
        this.setPropOverride('defaultValue', item, config);
        this.setPropOverride('validators', item, config);
        this.setPropOverride('wrapperCssClasses', item, config);
        this.setPropOverride('editCssClasses', item, config);
    }

    /**
     * Set the common field model config properties.
     * @param item Set the value of the named properties on this item.
     * @param config Get the value of the named properties from this config.
     */
    public sharedPopulateFieldLayoutConfig(item: FieldLayoutConfigFrame, config?: FieldLayoutConfigFrame) {
        this.sharedPopulateFieldComponentConfig(item, config);
        this.setPropOverride('labelRequiredStr', item, config);
        this.setPropOverride('helpText', item, config);
        this.setPropOverride('cssClassesMap', item, config);
        this.setPropOverride('helpTextVisibleOnInit', item, config);
        this.setPropOverride('helpTextVisible', item, config);
    }

    /**
     * Set the property on target.
     * Retain the target property value if it is not undefined.
     * Use the value of the property from the first source with a non-undefined property of the same name.
     *
     * @param target Set the name property on the target.
     * @param name The property to set.
     * @param sources The sources that might have the name property.
     */
    public setPropDefault(
        name: string,
        target: { [x: string]: any },
        ...sources: ({ [x: string]: any; } | null | undefined)[]
    ) {
        if (target === undefined || target === null) {
            throw new Error("Target provided to setProp was undefined or null.");
        }
        if (name === undefined || name === null) {
            throw new Error("Property name provided to setProp was undefined or null.");
        }

        const propValue = [target, ...sources].find(val => val?.[name] !== undefined)?.[name];
        if (propValue !== undefined) {
            target[name] = propValue;
        }
    }

    /**
     * Set the property on target.
     * Override the value of the property from the last source with a non-undefined property of the same name.
     * @param name The property to set.
     * @param target Set the name property on the target.
     * @param sources The sources that might have the name property.
     */
    public setPropOverride(
        name: string,
        target: { [x: string]: any },
        ...sources: ({ [x: string]: any; } | null | undefined)[]
    ) {
        if (target === undefined || target === null) {
            throw new Error("Target provided to setPropOverride was undefined or null.");
        }
        if (name === undefined || name === null) {
            throw new Error("Property name provided to setPropOverride was undefined or null.");
        }

        const propValue = [target, ...sources].findLast(val => val?.[name] !== undefined)?.[name];
        if (propValue !== undefined) {
            target[name] = propValue;
        }
    }
}

export class FormConfigPathHelper {
    protected logName = "FormConfigPathHelper";

    protected logger: ILogger;
    private visitor: FormConfigVisitorOutline;

    private _formConfigPath: string[];

    constructor(logger: ILogger, visitor: FormConfigVisitorOutline) {
        this.logger = logger;
        this.visitor = visitor;

        this._formConfigPath = [];
    }

    get formConfigPath(): string[] {
        return this._formConfigPath;
    }

    public reset() {
        this._formConfigPath = [];
    }

    /**
     * Call accept on the provided item and set the current path with the given suffix.
     * Set the current path to the previous value after the accept method is done.
     * @param item The item to visit.
     * @param more The path to add to the end of the current path.
     */
    public acceptFormConfigPath(item: CanVisit, more: string[]): void {
        const original = [...(this._formConfigPath ?? [])];
        try {
            this._formConfigPath = [...original, ...(more ?? [])];
            item.accept(this.visitor);
        } catch (error) {
            // rethrow error - the finally block will ensure the formConfigPath is correct
            throw error;
        } finally {
            this._formConfigPath = original;
        }
    }

    /**
     * Call accept on the properties of the form component definition outline that can be visited.
     * @param item The form component definition outline.
     */
    public acceptFormComponentDefinition(item: FormComponentDefinitionOutline): void {
        this.acceptFormConfigPath(item.component, ['component']);
        if (item.model) {
            this.acceptFormConfigPath(item.model, ['model']);
        }
        if (item.layout) {
            this.acceptFormConfigPath(item.layout, ['layout']);
        }
    }
}
