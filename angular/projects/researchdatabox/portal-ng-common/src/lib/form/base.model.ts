import { FieldConfig } from './config.model';
import { get as _get, set as _set, extend as _extend, isEmpty as _isEmpty, isUndefined as _isUndefined, merge as _merge, trim as _trim, isNull as _isNull, orderBy as _orderBy, map as _map, find as _find, indexOf as _indexOf, isArray as _isArray, forEach as _forEach, join as _join, first as _first, template as _template, toLower as _toLowe, clone as _clone, cloneDeep as _cloneDeep } from 'lodash-es';

import { FormControl, Validators } from '@angular/forms';
/**
 * Core model for form elements.
 * 
 */
export abstract class Model<ValueType, ConfigType> {
  // The configuration when the field is created
  public initConfig: ConfigType;
  // The "live" config
  public config: ConfigType;

  constructor(initConfig: ConfigType) {
    this.initConfig = initConfig;
    this.config = _cloneDeep(initConfig);
    this.onCreate();
  }
  /**
   * Custom initialization logic when constructing the model
   */
  public onCreate(): void {
    
  }
}
/**
 * Model for the form field configuration.
 * 
 */
export class FieldModel<ValueType = string> extends Model<ValueType, FieldConfig<ValueType> > {

  // The value when the field is created
  public initValue?: ValueType | null;

  // the actual bound value, intentionally renamed as 'model' to avoid confusion with overriding classes that might use an extension of this type
  public formModel?: FormControl<ValueType | undefined> | null;
  // TODO: strongly type 
  public validators?: any[] = [];

  public override onCreate(): void {
    const defaultValue = _get(this.config, 'defaultValue', undefined);
    this.initValue = _get(this.config, 'initValue', defaultValue);
    // TODO: create or configure the validators
    
    // create the form model
    this.formModel = new FormControl<ValueType | undefined>(this.initValue, this.config.required ? { validators: [Validators.required] } : null) as FormControl<ValueType | undefined>;
  }
  /**
   * Get the value of the field
   */
  public getValue(): ValueType | undefined {
    return this.formModel?.value;
  }
  /**
   * Set the value of the field
   * @param value the value to set
   */
  public setValue(value: ValueType): void {
    this.formModel?.setValue(value);
  }

  
}



