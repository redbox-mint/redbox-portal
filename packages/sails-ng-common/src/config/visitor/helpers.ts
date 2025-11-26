import {FieldComponentConfigFrame} from "../field-component.outline";
import {FieldModelConfigFrame} from "../field-model.outline";
import {FieldLayoutConfigFrame} from "../field-layout.outline";

export class PopulatePropertiesHelper {
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
