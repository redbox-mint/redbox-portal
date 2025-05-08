import { FormFieldModelConfig, FormValidatorInstance } from './config.model';
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
export class FormFieldModel<ValueType = string> extends FormModel< FormFieldModelConfig<ValueType> > {
  // The value when the field is created
  public initValue?: ValueType | null | undefined;

  public formControl: FormControl<ValueType | null | undefined> | null | undefined;

  public validators?: FormValidatorInstance[] | null | undefined;

  constructor(
    initConfig: FormFieldModelConfig<ValueType>,
    validators?: FormValidatorInstance[] | null | undefined) {
    super(initConfig);
    this.validators = validators;
    this.setValidators();
  }

  public override postCreate(): void {
    this.initValue = _get(this.fieldConfig.config, 'value', this.fieldConfig.config?.defaultValue);

    // create the form model
    console.log("FormFieldModel: creating form model with value:", this.initValue);
    this.formControl = new FormControl<ValueType | null | undefined>(this.initValue) as FormControl<ValueType | null | undefined>;
    console.log("FormFieldModel: created form model:", this.formControl);
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
   * Primitive implementation returns the form control. Complex implementations should override this method to create complex form controls.
   * @returns the form control
   */
  public getFormGroupEntry(): FormControl {
    if (this.formControl) {
      return this.formControl;
    } else {
      throw new Error('Form control is not defined');
    }
  }

  private setValidators() {
    // set validators to the form control
    const validators = this.validators?.filter(v => v?.validator !== undefined) ?? [];
    const validatorFns = validators.map(v => v.validator);
    console.log("FormFieldModel: setting validators to formControl", {
      validators: this.validators,
      formControl: this.formControl
    });
    if (validatorFns.length > 0) {
      this.formControl?.setValidators(validatorFns);
      this.formControl?.updateValueAndValidity();
    }
  }
}



