import {ILogger} from "@researchdatabox/redbox-core-types";
import {FieldComponentConfigFrame} from "../field-component.outline";
import {FieldModelConfigFrame} from "../field-model.outline";
import {FieldLayoutConfigFrame} from "../field-layout.outline";
import {TemplateCompileKey} from "../../template.outline";
import {CanVisit, FormConfigVisitorOutline} from "./base.outline";
import {FormComponentDefinitionOutline} from "../form-component.outline";

export class PopulateProperties {
    public sharedPopulateFieldComponentConfig(item: FieldComponentConfigFrame, config?: FieldComponentConfigFrame) {
        // Set the common field component config properties
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

    public sharedPopulateFieldModelConfig(item: FieldModelConfigFrame<unknown>, config?: FieldModelConfigFrame<unknown>) {
        // Set the common field model config properties
        this.setPropOverride('disableFormBinding', item, config);
        this.setPropOverride('value', item, config);
        this.setPropOverride('defaultValue', item, config);
        this.setPropOverride('validators', item, config);
        this.setPropOverride('wrapperCssClasses', item, config);
        this.setPropOverride('editCssClasses', item, config);
    }

    public sharedPopulateFieldLayoutConfig(item: FieldLayoutConfigFrame, config?: FieldLayoutConfigFrame) {
        // Set the common field model config properties
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
     * @param target Set the name property on the target.
     * @param name The property to set.
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

export class CurrentPathHelper {
    private readonly logName = "CurrentPathHelper";
    private _currentPath: TemplateCompileKey;
    private readonly logger: ILogger;
    private readonly visitor: FormConfigVisitorOutline;

    constructor(logger: ILogger, visitor: FormConfigVisitorOutline) {
        this._currentPath = [];
        this.logger = logger;
        this.visitor = visitor;
    }

    get currentPath(): TemplateCompileKey {
        return this._currentPath;
    }

    /**
     * Reset the current path to an empty array.
     */
    resetCurrentPath(): void {
        this._currentPath = [];
    }

    /**
     * Call accept on the provided item and set the current path with the given suffix.
     * Set the current path to the previous value after the accept method is done.
     * @param item The item to visit.
     * @param suffixPath The path to add to the end of the current path.
     */
    acceptCurrentPath(item: CanVisit, suffixPath: TemplateCompileKey): void {
        const itemCurrentPath = [...(this._currentPath ?? [])];
        try {
            this._currentPath = [...itemCurrentPath, ...(suffixPath ?? [])];

            // for debugging
            // this.logger.debug(`Accept '${item.constructor.name}' at '${this.currentPath}'.`);

            item.accept(this.visitor);
        } catch (error) {
            // rethrow error - the finally block will ensure the currentPath is correct
            throw error;
        } finally {
            this._currentPath = itemCurrentPath;
        }
    }

    /**
     * Call accept on the properties of the form component definition outline that can be visited.
     * @param item The form component definition outline.
     */
    acceptFormComponentDefinition(item: FormComponentDefinitionOutline): void {
        this.acceptCurrentPath(item.component, ['component']);
        if (item.model) {
            this.acceptCurrentPath(item.model, ['model']);
        }
        if (item.layout) {
            this.acceptCurrentPath(item.layout, ['layout']);
        }
    }
}

