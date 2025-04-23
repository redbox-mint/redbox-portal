/**
 * These classes are used to define the configuration for the form and form components. 
 * 
 * These can be used to generate JSON schema for validation, etc.
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
  viewCssClasses?: string | null | undefined = null;
  editCssClasses?: string | null | undefined = null;
  
  // validation related config
  // whether to trigger validation on save
  skipValidationOnSave?: boolean = false;
  // form-wide validators

  // Component related config
  // the default layout component
  defaultLayoutComponent?: string | null | undefined = null;
  // the components of this form
  fields?: FormComponentConfig[] | null | undefined = null;
}

/**
 * The form component configuration, the basic building block config of the form.
 * 
 */
export class FormComponentConfig {
  layout?: FormComponentLayoutConfig | null;
  model?: FormFieldModelConfig | null | undefined = null;
  component?: FormFieldComponentConfig | null | undefined = null; 
  module?: string | null | undefined = null;
}

/**
 * Base configuration class for all components.
 */
export class FormComponentBaseConfig {
  // class name 
  public class: string = '';
  // field name 
  public name: string | null = null;
  // the view read-only state
  public readonly: boolean = false;
  // the visibility state
  public visible: boolean = true;
  // the editMode
  public editMode: boolean = true;
}

/**
 * Config for the field model configuration, the data binding
 */
export class FormFieldModelConfig<ValueType = string | undefined>  {
  // class name 
  public class: string = '';
  // set the `disabled` property: https://angular.dev/api/forms/FormControl#disabled
  public disabled: boolean = false;
  public value: ValueType | undefined = undefined;
  // the default value
  public defaultValue: ValueType | undefined = undefined;
  // the data model describing this field's value
  public dataSchema: FormFieldModelDataConfig | string | null | undefined = null;

}
/** 
 * Config for the layout component configuration.
 */
export class FormComponentLayoutConfig extends FormComponentBaseConfig {
  // the top-level container id value, note this is not the same as the field name
  public id: string = '';
  // the component/control type
  public type: string = '';
  // the label
  public label: string = '';
}

/**
 * Config for the main component configuration.
 */
export class FormFieldComponentConfig extends FormComponentBaseConfig {
  
}

/**
 * The data model description for the field value (e.g. string, object, number, array)
 */
export class FormFieldModelDataConfig {

}