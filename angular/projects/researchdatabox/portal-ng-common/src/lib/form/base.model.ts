import { cloneDeep as _cloneDeep } from 'lodash-es';
import { AbstractControl, FormControl } from '@angular/forms';
import { FieldModelDefinitionFrame, FormValidatorConfig, guessType } from "@researchdatabox/sails-ng-common";

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
    if (this.fieldConfig.config?.disabled) {
      this.formControl.disable();
    }
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
    // NOTE: There are some form configs or form modes that will throw an error when setting the value.
    // This can occur when a repeatable (FormArray) or group (FormGroup) component has no controls that have a model.
    // Use the 'controls' property to check if there are any controls before trying to set the value.
    if (this.formControl && 'controls' in this.formControl) {
      const controls = this.formControl.controls;
      const guessedTypeControls = guessType(controls);
      if (guessedTypeControls === "array" && (controls as any[]).length === 0) {
        console.warn(`${this.logName}: FormArray has no controls so not setting value`, {
          formControl: this.formControl, value
        });
        return;
      }
      if (guessedTypeControls === "object" && Object.keys(controls as object).length === 0) {
        console.warn(`${this.logName}: FormGroup has no controls so not setting value`, {
          formControl: this.formControl, value
        });
        return;
      }
    }

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
    this.formControl?.setValue(value, { emitEvent: false });
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



