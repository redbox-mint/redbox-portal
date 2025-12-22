import {cloneDeep as _cloneDeep, get as _get} from 'lodash-es';
import {AbstractControl, FormControl} from '@angular/forms';
import {FieldModelDefinitionFrame, FormValidatorConfig} from "@researchdatabox/sails-ng-common";

/**
 * Core model for form elements.
 */
export abstract class FormModel<ValueType, DefinitionType extends FieldModelDefinitionFrame<ValueType>> {
  protected logName = "FormModel";
  /**
   * The configuration when the field is created
   */
  public readonly initConfig: DefinitionType;
  /**
   * The "live" config
   */
  public readonly fieldConfig: DefinitionType;

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
  /**
   * The value when the field is created
   */
  public initValue?: ValueType;
  /**
   * The angular form control this class wraps.
   */
  public formControl?: AbstractControl<ValueType>;

  constructor(initConfig: FieldModelDefinitionFrame<ValueType>) {
    super(initConfig);
  }

  public override postCreate(): void {
    // The server processes the form config and combines defaultValue and value into just value.
    // The client should not check defaultValue.
    this.initValue = this.fieldConfig.config?.value;

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
  public getFormControl(): AbstractControl<ValueType> | undefined {
    if (this.formControl) {
      return this.formControl;
    } else {
      throw new Error(`${this.logName}: Form control is not defined`);
    }
  }

  get validators(): FormValidatorConfig[] {
    return this.initConfig?.config?.validators ?? [];
  }
}



