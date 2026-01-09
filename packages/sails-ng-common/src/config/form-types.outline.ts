import {guessType} from "./helpers";
import {FormComponentDefinitionFrame} from "./form-component.outline";
import {FormConfigFrame} from "./form-config.outline";
import {FieldDefinitionFrame} from "./field.outline";
import {ReusableComponentName, ReusableFormComponentDefinitionFrame} from "./component/reusable.outline";
import {AvailableFormComponentDefinitionFrames} from "./dictionary.outline";


/*
 * The functions starting with 'isType*' use typescript narrowing to check the value
 * see: https://www.typescriptlang.org/docs/handbook/2/narrowing.html
 */

/**
 * Check if the item is a field definition (it has at least 'class' and optional 'config' properties).
 * @param item The item to check.
 */
export function isTypeFieldDefinition(item: unknown): item is FieldDefinitionFrame {
    if (item === undefined || item === null) {
        return false;
    }
    const i = item as FieldDefinitionFrame;

    const hasExpectedPropClass = 'class' in i && guessType(i?.class) === 'string';
    // 'config' can be null or object or not set
    const hasExpectedPropConfig = ('config' in i && ["object", "null"].includes(guessType(i.config))) || i?.config === undefined;

    return hasExpectedPropClass && hasExpectedPropConfig;
}

/**
 * Check if the item is a field definition of a particular type by comparing the class name
 * (class name is the discriminator in the type union).
 * @param item The item to check.
 * @param name The class name to check.
 */
export function isTypeFieldDefinitionName<T extends FieldDefinitionFrame>(item: unknown, name: string): item is T {
    if (item === undefined || item === null) {
        return false;
    }

    const hasExpectedFieldDefClass = isTypeFieldDefinition(item) && item?.class === name;

    return hasExpectedFieldDefClass;
}

/**
 * Check if the item is a form component definition (it has at least 'name' and 'component' properties).
 * @param item The item to check.
 */
export function isTypeFormComponentDefinition(item: unknown): item is FormComponentDefinitionFrame {
    if (item === undefined || item === null) {
        return false;
    }
    // use typescript narrowing to check the value
    const i = item as FormComponentDefinitionFrame;
    // only name and component are required
    const hasName = 'name' in i;
    const hasExpectedNameValue = ["null", "string"].includes(guessType(i?.name));
    const hasComponent = 'component' in i;
    const isFormFieldComponent = isTypeFieldDefinition(i?.component);

    return hasName && hasExpectedNameValue && hasComponent && isFormFieldComponent;
}

/**
 * Check if the item is a form definition of a particular type by comparing the component class
 * (component class name is the discriminator in the type union).
 * @param item The item to check.
 * @param name The class name to check.
 */
export function isTypeFormComponentDefinitionName<T extends FormComponentDefinitionFrame>(item: unknown, name: string): item is T {
    if (item === undefined || item === null) {
        return false;
    }

    const hasExpectedFormDefClass = isTypeFormComponentDefinition(item) && item?.component?.class === name;

    return hasExpectedFormDefClass;
}

/**
 * Check if the item has a componentDefinitions array property.
 * @param item The item to check.
 */
export function isTypeWithComponentDefinitions<T extends {
    componentDefinitions: unknown[]
}>(item: unknown): item is T {
    if (item === undefined || item === null) {
        return false;
    }
    // use typescript narrowing to check the value
    const i = item as { componentDefinitions: unknown[] };

    const hasExpectedPropCompDefs = 'componentDefinitions' in i && guessType(i?.componentDefinitions) === 'array';

    return hasExpectedPropCompDefs;
}

/**
 * Check if the item is a FormConfig (it has a name and componentDefinitions array property).
 * @param item The item to check.
 */
export function isTypeFormConfig<T extends FormConfigFrame>(item: unknown): item is T {
    if (item === undefined || item === null) {
        return false;
    }

    const i = item as FormConfigFrame;

    const hasExpectedPropName = 'name' in i && guessType(i.name) === 'string';
    const hasExpectedPropCompDefs = isTypeWithComponentDefinitions<FormConfigFrame>(item);

    return hasExpectedPropName && hasExpectedPropCompDefs;
}

/**
 * Check if a form component definition specifies to use a reusable form config.
 * @param item The form component definition.
 * @param reusableFormDefNames The names of the available reusable form definitions.
 * @protected
 */
export function isTypeReusableComponent(
    item: AvailableFormComponentDefinitionFrames,
    reusableFormDefNames: string[]
): item is ReusableFormComponentDefinitionFrame {
    const componentClassName = item?.component?.class ?? "";
    const itemReusableFormName = item?.overrides?.reusableFormName ?? "";

    const isReusableComponent = componentClassName === ReusableComponentName;
    const hasReusableFormName = itemReusableFormName && reusableFormDefNames.includes(itemReusableFormName);

    if (!isReusableComponent && !hasReusableFormName) {
        return false;
    }

    if (hasReusableFormName && isTypeFormComponentDefinitionName<ReusableFormComponentDefinitionFrame>(item, ReusableComponentName)) {
        const overrides = item?.overrides ?? {};
        const overrideKeys = Object.keys(overrides);
        const reusableFormNameOnly = overrideKeys.includes('reusableFormName') && overrideKeys.length === 1;
        const noKeys = overrideKeys.length === 0;
        if (!reusableFormNameOnly && !noKeys) {
            throw new Error("Invalid usage of reusable form config. " +
                `Override for component name '${item.name}' class '${item.component.class}' must contain only 'reusableFormName', ` +
                `it cannot be combined with other properties '${JSON.stringify(overrides)}'.`);
        }
        return true;
    }

    throw new Error("Invalid usage of reusable form config. " +
        `Component class '${componentClassName}' must be '${ReusableComponentName}' ` +
        `and reusableFormName '${itemReusableFormName}' must be one of '${reusableFormDefNames.join(', ')}'.`);
}
