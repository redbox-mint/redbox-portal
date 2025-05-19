/**
 * These classes are used to define the configuration for the form and form components.
 *
 * These can be used to generate JSON schema for validation, etc. both on the client and server side.
 */

/** The form definition */
export class FormConfig {
  // optional form name, will be used to identify the form in the config
  name?: string | null | undefined = null;
  // the record type
  type?: string | null | undefined = null;

  // DOM related config
  // the dom element type to inject, e.g. div, span, etc. leave empty to use 'ng-container'
  domElementType?: string | null | undefined = null;
  // optional form dom id property. When set, value will be injected into the overall dom node
  domId?: string | null | undefined = null;
  // the optional css clases to be applied to the form dom node
  viewCssClasses?: { [key: string]: string } | string | null | undefined = null;
  editCssClasses?: { [key: string]: string } | string | null | undefined = null;
  // optional configuration to set in each compoment
  defaultComponentConfig?: { [key: string]: { [key: string]: string } | string | null } | string | null | undefined = null;



  // validation related config
  // whether to trigger validation on save
  skipValidationOnSave?: boolean = false;
  // form-wide validators
  validatorDefinitions?: FormValidatorDefinition[] | null | undefined = null;
  validators?: FormValidatorBlock[] | null | undefined = null;

  // Component related config
  // the default layout component
  defaultLayoutComponent?: string | null | undefined = null;
  // the components of this form
  componentDefinitions?: FormComponentDefinition[] | null | undefined = null;

  // debug: show the form JSON
  debugValue?: boolean = false;
}

export interface HasFormComponentIdentity {
  name?: string | null | undefined; // top-level field name, applies to field and the component, etc.
}

export interface HasFormComponentClass {
  class?: string | null | undefined; // makes the 'layout' optional
}

export interface HasFormComponentConfigBlock {
  config?: any;
}
/**
 * The form component configuration definition.
 *
 */
export class FormComponentDefinition implements HasFormComponentIdentity {
  name?: string | null | undefined; // top-level field name, applies to field and the component, etc.
  // Either 'class' or 'layout' should be defined, but not both.
  // Note: This exclusivity is not enforced at compile time by this class definition alone.
  // the inheried `class` property makes the 'layout' optional
  layout?: FormComponentLayoutDefinition | null | undefined;
  model?: FormFieldModelConfig | null | undefined = null;
  component?: FormFieldComponentDefinition | null | undefined = null;
  module?: string | null | undefined = null;
}

/**
 * Minimum configuration block for all configuration components.
 */
export class FormComponentBaseConfig  {
  // the view read-only state
  public readonly?: boolean = false;
  // the visibility state
  public visible?: boolean = true;
  // the editMode
  public editMode?: boolean = true;
  // the component/control type
  public type?: string = '';
  // the label
  public label?: string = '';
  // the form-supplied css classes
  public defaultComponentCssClasses?: { [key: string]: string } | string | null | undefined = null;
}

export class FormFieldModelConfigBlock<ValueType> {
  // TODO: rename to `bindingDisabled` or `disabledBinding`
  public disableFormBinding?: boolean = false;
  public value?: ValueType | undefined = undefined;
  // the default value
  public defaultValue?: ValueType | undefined = undefined;
  // the data model describing this field's value
  public dataSchema?: FormFieldModelDataConfig | string | null | undefined = null;
  // the validators
  validators?: FormValidatorBlock[] | null | undefined = null;
}
/**
 * Config for the field model configuration, aka the data binding
 */
export class FormFieldModelConfig<ValueType = string | undefined> implements HasFormComponentIdentity, HasFormComponentClass, HasFormComponentConfigBlock {
  public name?: string | null | undefined; // top-level field name, applies to field and the component, etc.
  public class: string = ''; // make the class mandatory
  // set the `disabled` property: https://angular.dev/api/forms/FormControl#disabled

  public config?: FormFieldModelConfigBlock<ValueType> | null | undefined = null;

}
/** Layout specific config block */
export class FormLayoutConfig extends FormComponentBaseConfig {
  public labelRequiredStr: string = '*';
  public helpText: string = '';
  public cssClassesMap: { [key: string]: string } = {};
}
/**
 * Config for the layout component configuration.
 */
export class FormComponentLayoutDefinition implements HasFormComponentIdentity, HasFormComponentClass, HasFormComponentConfigBlock {
  public name?: string | null | undefined; // top-level field name, applies to field and the component, etc.
  public class?: string | null | undefined; // makes the 'layout' optional

  public config?: FormLayoutConfig | null | undefined = null;
}

/**
 * the UI-specific config block
 */
export class FormFieldConfig extends FormComponentBaseConfig {

}
/**
 * Config for the main component configuration.
 */
export class FormFieldComponentDefinition implements HasFormComponentClass, HasFormComponentConfigBlock {
  public class?: string | null | undefined; // makes the 'layout' optional
  public config?: FormFieldConfig | null | undefined = null;
}

/**
 * The data model description for the field value (e.g. string, object, number, array)
 */
export class FormFieldModelDataConfig {

}


/**
 * The map of validation errors.
 */
export type FormValidatorErrors = {
  [key: string]: {[key:string]: any};
};

/**
 * The map of validator config.
 * The config is different for each validator.
 */
export type FormValidatorConfig = {
  [key: string]: any;
};

/**
 * The interface that a form control must implement to be validated by a validator function.
 * Some form controls are a collection of controls, these must provide a way to access the control they contain.
 */
export type FormValidatorControl = {
  /**
   * The value of the control.
   */
  value: any;
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
 * The returned function takes an Angular AbstractControl object and
 * returns either null if the control value is valid or a validation error object.
 *
 * The validation error object typically has a property whose name is the validation key, e.g. 'min', and
 * value is an arbitrary dictionary of values that can be used to render an error message template.
 */
export type FormValidatorCreateFn = (config: FormValidatorConfig | null | undefined) => FormValidatorFn;

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
export interface FormValidatorBlock {
  /**
   * The name used in a validator definition.
   * The optional message and config will be applied to the validator definition with this name.
   */
  name: string;
  /**
   * The optional message id to display when the validator fails.
   * This is only needed if the message to show is different to the validator definition.
   */
  message?: string | null| undefined;
  /**
   * The validator config. Can be left out if the validator takes no config.
   */
  config?: FormValidatorConfig | null| undefined;
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
  params?: { [key: string]: any };
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
