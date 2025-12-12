import {guessType} from "./helpers";
import {FormValidatorDefinition} from "../validation/form.model";


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
