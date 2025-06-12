import {
  FormValidatorErrors,
  FormValidatorConfig,
  FormValidatorControl,
  FormValidatorFn,
  FormValidatorCreateFn,
  FormValidatorDefinition,
  FormValidatorBlock,
  FormValidatorComponentErrors,
  FormValidatorSummaryErrors,
} from '@researchdatabox/sails-ng-common';

/**
 * These classes are used to define the configuration for the form and form components.
 *
 * These can be used to generate JSON schema for validation, etc. both on the client and server side.
 * 
 * Classes ending `Definition` are used to define the expected JSON configuration for the form and its components. 
 * 
 * Classes ending `Config` are used to define the field names of the form and its components. These may or may not share the same field name(s) as the `Definition` classes. This could also be used to define the expected JSON schema, where it is indicated.
 */

/** 
 * The form definition.
 * 
 * Also, used to define the JSON schema.
 * 
 * */
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
  componentDefinitions?: FormComponentDefinition<unknown>[] | null | undefined = null;

  // debug: show the form JSON
  debugValue?: boolean = false;
}

export interface HasFormComponentIdentity {
  name?: string | null | undefined; // top-level field name, applies to field and the component, etc.
}

export interface HasFormComponentClass {
  class?: string | null | undefined; // makes the 'layout' optional
}

export interface HasFormComponentConfig {
  config?: any;
}
/**
 * The form component configuration definition.
 *
 */
export class FormComponentDefinition<ValueType> implements HasFormComponentIdentity {
  name?: string | null | undefined; // top-level field name, applies to field and the component, etc.
  // Either 'class' or 'layout' should be defined, but not both.
  // Note: This exclusivity is not enforced at compile time by this class definition alone.
  // the inheried `class` property makes the 'layout' optional
  layout?: FormComponentLayoutDefinition | null | undefined;
  model?: FormFieldModelConfig<ValueType> | null | undefined = null;
  component?: FormFieldComponentDefinition | null | undefined = null;
  module?: string | null | undefined = null;
}

/**
 * Minimum configuration for all configuration components.
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

export class FormFieldModelDefinition<ValueType> {
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
 * Config field model, aka the data binding
 */
export class FormFieldModelConfig<ValueType = string | undefined> implements HasFormComponentIdentity, HasFormComponentClass, HasFormComponentConfig {
  public name?: string | null | undefined; // top-level field name, applies to field and the component, etc.
  public class: string = ''; // make the class mandatory
  
  public config?: FormFieldModelDefinition<ValueType> | null | undefined = null;

}
/** Layout specific config */
export class FormLayoutConfig extends FormComponentBaseConfig {
  public labelRequiredStr: string = '*';
  public helpText: string = '';
  public cssClassesMap: { [key: string]: string } = {};
}
/**
 * Config for the layout component configuration.
 */
export class FormComponentLayoutDefinition implements HasFormComponentIdentity, HasFormComponentClass, HasFormComponentConfig {
  public name?: string | null | undefined; // top-level field name, applies to field and the component, etc.
  public class?: string | null | undefined; // makes the 'layout' optional

  public config?: FormLayoutConfig | null | undefined = null;
}

/**
 * 
 */
export class FormFieldDefinition extends FormComponentBaseConfig {
  componentDefinitions?: FormComponentDefinition<unknown>[] | null | undefined = null;
}
/**
 * Config for the main component configuration.
 */
export class FormFieldComponentDefinition implements HasFormComponentClass, HasFormComponentConfig {
  public class?: string | null | undefined; // makes the 'layout' optional
  public config?: FormFieldDefinition | null | undefined = null;
}

/**
 * The data model description for the field value (e.g. string, object, number, array)
 */
export class FormFieldModelDataConfig {

}
