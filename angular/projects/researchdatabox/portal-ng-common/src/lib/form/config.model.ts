/**
 * Model for the field configuration.
 */
export class FieldConfig<ValueType = string> {
  // class name 
  public class: string = '';
  // set the `disabled` property: https://angular.dev/api/forms/FormControl#disabled
  public disabled: boolean = false;
  // field name 
  public name: string = '';
  // whether required
  public required: boolean = false;
  // the default value
  public defaultValue: ValueType | undefined = undefined;
}


/** 
 * Model for the component configuration.
 */
export class ComponentConfig<ValueType = string> extends FieldConfig<ValueType> {
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
