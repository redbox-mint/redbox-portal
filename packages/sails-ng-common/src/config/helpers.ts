import {
    isBoolean as _isBoolean,
    isArray as _isArray,
    isString as _isString,
    isPlainObject as _isPlainObject
} from "lodash";
import {DateTime} from 'luxon';
import {FormComponentDefinitionFrame} from "./form-component.outline";
import {FormConfigFrame} from "./form-config.outline";
import {FieldDefinitionFrame} from "./field.outline";
import {FormValidatorDefinition} from "../validation/form.model";

/**
 * Guess the type of the value.
 * @param value Guess the type of this value.
 * @private
 */
export function guessType(value: unknown): "array" | "object" | "boolean" | "string" | "timestamp" | "number" | "null" | "undefined" | "unknown" {
    if (value === null) {
        return "null";
    }
    if (value === undefined) {
        return "undefined";
    }

    if (_isBoolean(value)) {
        return "boolean";
    }

    if (Number.isFinite(value)) {
        return "number";
    }

    if (_isArray(value)) {
        return "array";
    }

    if (_isPlainObject(value)) {
        return "object";
    }

    // check for date
    const dateTimeFormats = [
        DateTime.fromISO,
        DateTime.fromRFC2822,
        DateTime.fromHTTP,
    ];
    try {
        for (const dateTimeFormat of dateTimeFormats) {
            const result = dateTimeFormat(value?.toString() ?? "");
            if (result && result.isValid) {
                return "timestamp";
            }
        }

    } catch (err) {
        console.debug(`guessType parse error with value '${value}' formats ${JSON.stringify(dateTimeFormats)}: ${err}`);
    }

    if (_isString(value)) {
        return "string";
    }

    return "unknown";
}

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
 * Check if the item is a valid form validation definition.
 * @param item The item to check.
 */
export function isTypeFormValidatorDefinition(item: unknown): item is FormValidatorDefinition {
    if (item === undefined || item === null) {
        return false;
    }
    const i = item as FormValidatorDefinition;

    const hasExpectedPropClass = 'class' in i && guessType(i.class) === 'string';
    const hasExpectedPropClassValue = i.class?.toString()?.trim().length > 0;

    const hasExpectedPropMessage = 'message' in i && guessType(i.message) === 'string';
    const hasExpectedPropMessageValue = i.message?.toString()?.trim().length > 0;

    const hasExpectedPropCreate = 'create' in i;

    return hasExpectedPropClass && hasExpectedPropClassValue
        && hasExpectedPropMessage && hasExpectedPropMessageValue
        && hasExpectedPropCreate;
}
