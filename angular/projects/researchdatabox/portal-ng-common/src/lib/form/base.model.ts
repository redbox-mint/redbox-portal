import { FormFieldModelConfig } from './config.model';
import { get as _get, set as _set, extend as _extend, isEmpty as _isEmpty, isUndefined as _isUndefined, merge as _merge, trim as _trim, isNull as _isNull, orderBy as _orderBy, map as _map, find as _find, indexOf as _indexOf, isArray as _isArray, forEach as _forEach, join as _join, first as _first, template as _template, toLower as _toLowe, clone as _clone, cloneDeep as _cloneDeep } from 'lodash-es';

import {AbstractControl, FormControl} from '@angular/forms';
/**
 * Core model for form elements.
 *
 */
export abstract class FormModel<ConfigType> {
  // The configuration when the field is created
  public initConfig: ConfigType;
  // The "live" config
  public fieldConfig: ConfigType;

  constructor(initConfig: ConfigType) {
    this.initConfig = initConfig;
    this.fieldConfig = _cloneDeep(initConfig);
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
export class FormFieldModel<ValueType> extends FormModel< FormFieldModelConfig<ValueType> > {
  // The value when the field is created
  public initValue?: ValueType | null | undefined;

  public formControl: AbstractControl<ValueType | null | undefined> | null | undefined;
  // TODO: strongly type
  public validators?: any[] = [];

  constructor(initConfig: FormFieldModelConfig<ValueType>) {
    super(initConfig);
  }

  public override postCreate(): void {
    this.initValue = _get(this.fieldConfig.config, 'value', this.fieldConfig.config?.defaultValue);

    // TODO: create or configure the validators

    // create the form model
    this.formControl = new FormControl<ValueType | null | undefined>(this.initValue) as AbstractControl<ValueType | null | undefined>;
    console.log(`FormFieldModel: created form control '${this.fieldConfig?.name ?? '(no name)'}' with model class '${this.fieldConfig?.class}' and initial value '${this.initValue}'`);
  }
  /**
   * Get the value of the field
   */
  public getValue(): ValueType | null | undefined {
    return this.formControl?.value;
  }
  /**
   * Set the value of the field
   * @param value the value to set
   */
  public setValue(value: ValueType | null): void {
    this.formControl?.setValue(value);
  }

  /**
   * Primitive implementation returns the form control.
   * Complex implementations should override this method to create complex form controls.
   * @returns the form control
   */
  public getFormGroupEntry(): AbstractControl<ValueType | null | undefined> | null | undefined {
    if (this.formControl) {
      return this.formControl;
    } else {
      throw new Error('Form control is not defined');
    }
  }
}



