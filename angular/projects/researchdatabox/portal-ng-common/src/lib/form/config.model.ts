/**
 * These classes are used to define the configuration for the form components. 
 * 
 * These can be used to generate JSON schema for validation, etc.
 */

/**
 * Base configuration class for all components.
 */
export class FormComponentConfig {
  // class name 
  public class: string = '';
  // field name 
  public name: string | null = null;
}

/**
 * Config for the field component configuration, 
 */
export class FormFieldComponentConfig<ValueType = string | undefined> extends FormComponentConfig {
  // set the `disabled` property: https://angular.dev/api/forms/FormControl#disabled
  public disabled: boolean = false;
  // the default value
  public defaultValue: ValueType | undefined = undefined;
}
/** 
 * Config for the layout component configuration.
 */
export class FormComponentLayoutConfig extends FormComponentConfig {
  // the top-level container id value, note this is not the same as the field name
  public id: string = '';
  // the component/control type
  public type: string = '';
  // the label
  public label: string = '';
  // the view read-only state
  public readonly: boolean = false;
  // the visibility state
  public visible: boolean = true;
  // the editMode
  public editMode: boolean = true;

}
/**
 * The data model that is storing the value (e.g. string, object, number, array)
 */
export class FormDataModelConfig {

}