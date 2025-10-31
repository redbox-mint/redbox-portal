import {cloneDeep as _cloneDeep, get as _get} from 'lodash-es';
import {AbstractControl, FormControl} from '@angular/forms';
import {FieldModelDefinitionFrame, FormValidatorFn} from "@researchdatabox/sails-ng-common";

/**
 * Core model for form elements.
 *
 */
export abstract class FormModel<ValueType, DefinitionType extends FieldModelDefinitionFrame<ValueType>> {
  protected logName = "FormModel";
  // The configuration when the field is created
  public initConfig: DefinitionType;
  // The "live" config
  public fieldConfig: DefinitionType;

  protected constructor(initConfig: DefinitionType) {
    this.initConfig = initConfig;
    this.fieldConfig = _cloneDeep(initConfig);
    this.postCreate();
  }

  /**
   * Custom initialization logic when constructing the model
   */
  abstract postCreate(): void;
}

/**
 * Model for the form field configuration.
 *
 */
export class FormFieldModel<ValueType> extends FormModel<ValueType, FieldModelDefinitionFrame<ValueType>> {
  protected override logName = "FormFieldModel";
  // The value when the field is created
  public initValue?: ValueType;

  public formControl?: AbstractControl<ValueType>;

  public validators?: FormValidatorFn[];

  constructor(initConfig: FieldModelDefinitionFrame<ValueType>, validators?: FormValidatorFn[]) {
    super(initConfig);
    this.validators = validators;
    this.setValidators();
  }

  public override postCreate(): void {
    this.initValue = _get(this.fieldConfig.config, 'value', this.fieldConfig.config?.defaultValue);

    // create the form model
    this.formControl = this.initValue === undefined ? new FormControl() : new FormControl<ValueType>(this.initValue);
    console.debug(`${this.logName}: created form control with model class '${this.fieldConfig?.class}' and initial value:`, this.initValue);
  }

  /**
   * Get the value of the field
   */
  public getValue(): ValueType | undefined {
    return this.formControl?.value;
  }

  /**
   * Set the value of the field
   * @param value the value to set
   */
  public setValue(value: ValueType): void {
    this.formControl?.setValue(value);
  }

  /**
   * Set the value of the field if it is provided in value, otherwise keeps the existing value.
   * @param value The new form field value.
   */
  public patchValue(value: ValueType): void {
    this.formControl?.patchValue(value);
  }

  /**
   * Set the value of the field
   * @param value the value to set
   */
  public setValueDontEmitEvent(value: ValueType): void {
    this.formControl?.setValue(value, {emitEvent: false});
  }

  /**
   * Primitive implementation returns the form control.
   * Complex implementations should override this method to create complex form controls.
   * @returns the form control
   */
  public getFormGroupEntry(): AbstractControl<ValueType>  {
    if (this.formControl) {
      return this.formControl;
    } else {
      throw new Error(`${this.logName}: Form control is not defined`);
    }
  }

  // /**
  //  * Enable all validators for this model.
  //  *
  //  * TODO: consider being able to describe a subset of validators to enable/disable.
  //  */
  // public enableValidators() {
  //   this.formControl?.clearValidators();
  //   this.setValidators();
  // }
  //
  // /**
  //  * Disable all validators for this model.
  //  */
  // public disableValidators() {
  //   this.formControl?.clearValidators();
  //   this.formControl?.updateValueAndValidity();
  // }

  /**
   * Apply the validators to the form control.
   * @private
   */
  private setValidators() {
    // TODO: This method is duplicated in FormService.setValidators, see if they can be collapsed to one place.
    // set validators to the form control
    const validatorFns = this.validators?.filter(v => !!v) ?? [];
    console.debug(`${this.logName}: setting validators to formControl`, {
      validators: this.validators,
      formControl: this.formControl
    });
    if (validatorFns.length > 0) {
      this.formControl?.setValidators(validatorFns);
      this.formControl?.updateValueAndValidity();
    }
  }
}



