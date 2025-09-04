import { get as _get } from 'lodash';

/**
 * The map of validation errors.
 *
 * Typically, has a property whose name is the validation key, e.g. 'min', and
 * value is a dictionary of message and params that are arbitrary values
 * that can be used to render an error message template.
 */
export type FormValidatorErrors = {
  [key: string]: { message: string; params: { [key: string]: unknown } };
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
 */
export type FormValidatorControl = {
  /**
   * The value of the control.
   */
  value: unknown;
  /**
   * Get the descendant control that matches the path.
   * @param path
   */
  get<P extends string>(path: P): FormValidatorControl | null;
  /**
   * Set the validation errors map manually.
   * This method updates the entire errors map, so include all the existing errors.
   * @param errors The complete map of validation errors.
   */
  setErrors(errors: FormValidatorErrors | null): void;
};

/**
 * A simple form validator control that can be used on the server-side to mimic client-side controls.
 *
 * Do not use this on the client-side.
 */
export class SimpleServerFormValidatorControl implements FormValidatorControl {
    value: unknown;
    private _setErrors: (FormValidatorErrors | null)[] = [];

    constructor(value: unknown) {
        this.value = value;
    }

    get<P extends string>(path: P): FormValidatorControl | null {
        const result = _get(this.value, path) ?? null;
        console.debug(`SimpleServerFormValidatorControl.get path '${path}' with result '${JSON.stringify(result)}' from value '${JSON.stringify(this.value)}'`);
        return result;
    }
    setErrors(errors: FormValidatorErrors | null): void {
        console.debug(`SimpleServerFormValidatorControl.setErrors adding '${JSON.stringify(errors)}'`);
        this._setErrors.push(errors);
    }

    get storedErrors(): any[] {
        return this._setErrors;
    }
}

/**
 * The validator function.
 *
 * Accepts an AbstractControl and returns either a map of validation errors or null.
 */
export type FormValidatorFn = (control: FormValidatorControl) => FormValidatorErrors | null;

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
  message?: string | null | undefined;
  /**
   * The validator config. Can be left out if the validator takes no config.
   */
  config?: FormValidatorCreateConfig | null | undefined;
}

/**
 * One validator error.
 */
export interface FormValidatorComponentErrors {
  /**
   * The message id.
   */
  message: string | null;
  /**
   * The name of the validator.
   */
  name: string | null;
  /**
   * The params for rendering the translated message.
   */
  params?: { [key: string]: unknown };
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
   * If this is not available, the validation error is rendered without the form field name and with no link.
   */
  id: string | null;
  /**
   * The message id for the form control label.
   *
   * This is passed to the translation service to get the label text.
   * If this is not available, the name is used.
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
  parents: string[] | null;
}
