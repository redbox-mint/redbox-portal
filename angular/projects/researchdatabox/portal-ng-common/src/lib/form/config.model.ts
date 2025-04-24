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
  components?: FormComponentConfig[] | null | undefined = null;

  // debug: show the form JSON
  debugValue?: boolean = false;
}

export abstract class FormComponentIdentiy {
  name?: string | null | undefined; // top-level field name, applies to field and the component, etc.
  class?: string | null | undefined; // makes the 'layout' optional
}
/**
 * The form component configuration, the basic building block config of the form.
 * 
 */
export class FormComponentConfig extends FormComponentIdentiy {
  
  // Either 'class' or 'layout' should be defined, but not both.
  // Note: This exclusivity is not enforced at compile time by this class definition alone.
  // the inheried `class` property makes the 'layout' optional
  layout?: FormComponentLayoutConfig | null | undefined;
  model?: FormFieldModelConfig | null | undefined = null;
  component?: FormFieldComponentConfig | null | undefined = null; 
  module?: string | null | undefined = null;
}

/**
 * Base configuration class for all components.
 */
export class FormComponentBaseConfig extends FormComponentIdentiy {
  // class name 
  public override class: string = ''; // make the class mandatory
  // the view read-only state
  public readonly: boolean = false;
  // the visibility state
  public visible: boolean = true;
  // the editMode
  public editMode: boolean = true;
  // the component/control type
  public type: string = '';
  // the label
  public label: string = '';
}

/**
 * Config for the field model configuration, the data binding
 */
export class FormFieldModelConfig<ValueType = string | undefined> extends FormComponentIdentiy {
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