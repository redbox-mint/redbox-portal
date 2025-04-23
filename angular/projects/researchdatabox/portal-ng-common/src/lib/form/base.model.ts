import { FormFieldComponentConfig } from './config.model';
import { get as _get, set as _set, extend as _extend, isEmpty as _isEmpty, isUndefined as _isUndefined, merge as _merge, trim as _trim, isNull as _isNull, orderBy as _orderBy, map as _map, find as _find, indexOf as _indexOf, isArray as _isArray, forEach as _forEach, join as _join, first as _first, template as _template, toLower as _toLowe, clone as _clone, cloneDeep as _cloneDeep } from 'lodash-es';

import { FormControl } from '@angular/forms';
/**
 * Core model for form elements.
 * 
 */
export abstract class FormModel<ConfigType> {
  // The configuration when the field is created
  public initConfig: ConfigType;
  // The "live" config
  public config: ConfigType;

  constructor(initConfig: ConfigType) {
    this.initConfig = initConfig;
    this.config = _cloneDeep(initConfig);
    this.postCreate();
  }
  /**
   * Custom initialization logic when constructing the model
   */
  public postCreate(): void {
    
  }
}
/**
 * Model for the form field configuration.
 * 
 */
export class FormFieldModel<ValueType = string> extends FormModel< FormFieldComponentConfig<ValueType> > {

  // The value when the field is created
  public initValue?: ValueType | null;

  // the actual bound value, intentionally renamed as 'model' to avoid confusion with overriding classes that might use an extension of this type
  public formModel: FormControl<ValueType | null> = new FormControl<ValueType | null>(null);
  // TODO: strongly type 
  public validators?: any[] = [];

  constructor(initConfig: FormFieldComponentConfig<ValueType>) {
    super(initConfig);
  }

  public override postCreate(): void {
    const defaultValue = _get(this.config, 'defaultValue', null);
    this.initValue = _get(this.config, 'initValue', defaultValue);
    // TODO: create or configure the validators
    
    // create the form model
    this.formModel = new FormControl<ValueType | null>(this.initValue) as FormControl<ValueType | null>;
  }
  /**
   * Get the value of the field
   */
  public getValue(): ValueType | null {
    return this.formModel.value;
  }
  /**
   * Set the value of the field
   * @param value the value to set
   */
  public setValue(value: ValueType | null): void {
    this.formModel.setValue(value);
  }
}



