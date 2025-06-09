import {FormFieldModelConfig} from './config.model';
import {cloneDeep as _cloneDeep, get as _get} from 'lodash-es';

import {AbstractControl, FormControl} from '@angular/forms';
import {FormValidatorFn} from "@researchdatabox/sails-ng-common";
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

export type FormFieldModelValueType<ValueType> = ValueType | null | undefined;

/**
 * Model for the form field configuration.
 *
 */
export class FormFieldModel<ValueType = string> extends FormModel<FormFieldModelConfig<ValueType>> {
  // The value when the field is created
  public initValue?: FormFieldModelValueType<ValueType>;

  public formControl: AbstractControl<FormFieldModelValueType<ValueType>> | null | undefined;

  public validators?: FormValidatorFn[] | null | undefined;

  constructor(
    initConfig: FormFieldModelConfig<ValueType>,
    validators?: FormValidatorFn[] | null | undefined) {
    super(initConfig);
    this.validators = validators;
    this.setValidators();
  }

  public override postCreate(): void {
    this.initValue = _get(this.fieldConfig.config, 'value', this.fieldConfig.config?.defaultValue);

    // create the form model
    this.formControl = new FormControl<FormFieldModelValueType<ValueType>>(this.initValue) as AbstractControl<FormFieldModelValueType<ValueType>>;
    console.log(`FormFieldModel: created form control '${this.fieldConfig?.name ?? '(no model name)'}' with model class '${this.fieldConfig?.class}' and initial value '${this.initValue}'`);
  }

  /**
   * Get the value of the field
   */
  public getValue(): FormFieldModelValueType<ValueType> {
    return this.formControl?.value;
  }

  /**
   * Set the value of the field
   * @param value the value to set
   */
  public setValue(value: FormFieldModelValueType<ValueType>): void {
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

  /**
   * Apply the validators to the form control.
   * @private
   */
  private setValidators() {
    // set validators to the form control
    const validatorFns = this.validators?.filter(v => !!v) ?? [];
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



