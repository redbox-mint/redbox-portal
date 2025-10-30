import { get as _get } from 'lodash';

/**
 * The parameters for a validator error.
 *
 * These can be used with the translation message id to create the translated text.
 *
 * For example:
 * {actual: 2, requiredThreshold: 3}
 */
export type FormValidatorErrorParams = {
  [key: string]: unknown;
}

/**
 * The map of validation errors.
 *
 * Typically, has a property whose name is the validation key, e.g. 'min', and
 * value is a dictionary of message and params that are arbitrary values
 * that can be used to render an error message template.
 *
 * This is similar to FormValidatorComponentErrors, but with the name as the key in a parent object.
 *
 * This is similar to the angular form ValidationErrors type.
 */
export type FormValidatorErrors = {
  [key: string]: { message: string; params: FormValidatorErrorParams };
};

/**
 * The map of validator config.
 * The config is different for each validator.
 */
export type FormValidatorCreateConfig = {
  [key: string]: unknown;
};

/**
 * The interface that a form control must implement to be validated by a validator function.
 * Some form controls are a collection of controls, these must provide a way to access the controls they contain.
 *
 * This is similar to the angular AbstractControl class, with only the properties needed for validation.
 */
export interface FormValidatorControl {
  /**
   * The value of the control.
   */
  value: unknown;
  /**
   * Get the descendant control that matches the path.
   * @param path
   */
  get<P extends string>(path: P): FormValidatorControl | null;
}

/**
 * A simple form validator control that can be used on the server-side to mimic client-side controls.
 *
 * Do not use this on the client-side.
 */
export class SimpleServerFormValidatorControl implements FormValidatorControl {
    value: unknown;

    constructor(value: unknown) {
        this.value = value;
    }

    get<P extends string>(path: P): FormValidatorControl | null {
        const result = _get(this.value, path) ?? null;
        console.debug(`SimpleServerFormValidatorControl.get path '${path}' with result '${JSON.stringify(result)}' from value '${JSON.stringify(this.value)}'`);
        return result;
    }
}

/**
 * The validator function.
 *
 * Accepts an AbstractControl and returns either validation errors or no errors (null).
 *
 * This is similar to the angular form ValidatorFn interface.
 */
export interface FormValidatorFn {
    (control: FormValidatorControl): FormValidatorErrors | null;
}

/**
 * The validation function creator.
 *
 * Takes one config argument, which contains config for the specific validator.
 *
 * Returns a form validator function.
 */
export type FormValidatorCreateFn = (config: FormValidatorCreateConfig | null | undefined) => FormValidatorFn;

/**
 * The definition of a validator for a form or a form control.
 */
export interface FormValidatorDefinition {
  /**
   * The unique name of the form validator.
   */
  name: string;
  /**
   * The message id to display when the validator fails.
   */
  message: string;
  /**
   * The validation function creator.
   */
  create: FormValidatorCreateFn;
}

/**
 * The configuration block for a validator for a form or a form control.
 */
export interface FormValidatorConfig {
  /**
   * The name used in a validator definition.
   * The optional message and config will be applied to the validator definition with this name.
   */
  name: string;
  /**
   * The optional message id to display when the validator fails.
   * This is only needed if the message to show is different to the validator definition.
   */
  message?: string;
  /**
   * The optional validator config.
   * Can be left out if the validator takes no config.
   */
  config?: FormValidatorCreateConfig;

  /**
   * Zero or more validation group names this validator belongs to.
   * Validation groups make it easier to run a subset of validators on a form.
   */
  groups?: FormFieldValidationGroup;
}

/**
 * One validator error.
 */
export interface FormValidatorComponentErrors {
  /**
   * The message id for the validator.
   */
  message: string;
  /**
   * The name of the validator.
   */
  name: string;
  /**
   * The params for rendering the translated message.
   */
  params: FormValidatorErrorParams;
}

/**
 * Form or form control errors from a validator.
 *
 * Controls can be nested, so validation errors can be nested.
 * The nesting is how the client-side is able to reveal a form field when
 * a link in the validation summary is clicked.
 *
 * If all errors arrays are empty, then the validation summary is treated as 'form is valid'.
 */
export interface FormValidatorSummaryErrors {
  /**
   * The id of the form control.
   *
   * This is used on the client-side for linking to the form control to reveal it.
   * If this is not available, the validation error is rendered with the form field label and with no link.
   */
  id: string | null;
  /**
   * The message id for the form control label.
   *
   * This is passed to the translation service to get the label text.
   * If this is not available, the id is used, otherwise a default label is used.
   */
  message: string | null;
  /**
   * The validation errors for the form control.
   *
   * These are rendered using the translation service - the message id can use the params to calculate the text to show.
   * If there are no errors, then the form field is not shown in the error summary.
   */
  errors: FormValidatorComponentErrors[];
  /**
   * Parent form or form control names that contain this form or form control.
   *
   * This enables revealing the parents, to be able to navigate to the form control.
   * The parent names are in order from top-most to direct parent of this form control.
   */
  parents: string[];
}

/**
 * Form validation groups, where the key is the name, and the value is the definition.
 */
export interface FormValidationGroups {
    /**
     * The key is the name of the validation group.
     */
    [key: string]: FormValidationGroup;
}

/**
 * A form validation group,
 * which describes the purpose or usage of the group and the initial membership of the group.
 */
export interface FormValidationGroup {
    /**
     * A short description of the purpose or usage of the validation group.
     */
    description: string;

    /**
     * The approach this validation group uses to specify which validators are included.
     * Options are:
     * - 'all': Start with all validators included
     * - 'none' Start with no validators
     */
    initialMembership?: FormValidationGroupMembership;
}

/**
 * The available form validation group membership approaches.
 */
export const formValidationGroupMembership = ["all", "none"] as const;
/**
 * The available form validation group membership approaches as a typescript type.
 */
export type FormValidationGroupMembership = typeof formValidationGroupMembership[number];

/**
 * Specify which validation groups the validator is part of or is not part of.
 * All the validation groups used here must also be present in the top-level validationGroups property.
 */
export interface FormFieldValidationGroup {
    /**
     * A list of the validation groups this field is included in.
     */
    include?: string[];
    /**
     * A list of the validation groups this field is excluded from.
     */
    exclude?: string[];
}