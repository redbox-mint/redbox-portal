import {cloneDeep as _cloneDeep} from 'lodash-es';
import {AbstractControl, FormControl} from '@angular/forms';
import {FieldModelDefinitionFrame, FormValidatorConfig, guessType} from "@researchdatabox/sails-ng-common";


/**
 * Common angular modify options.
 */
export type ModifyOptions = {
  /**
   * When true or not supplied the statusChanges, valueChanges and events observables
   * emit events with the latest status and value when the control is updated.
   * When false, no events are emitted.
   *
   * Default true.
   */
  emitEvent?: boolean,
  /**
   * When true, mark only this control.
   * When false or not supplied, marks all direct ancestors. Default is false.
   */
  onlySelf?: boolean
};

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
  protected abstract postCreate(): void;
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

  protected override postCreate(): void {
    this.initValue = this.postCreateGetInitValue();
    this.formControl = this.postCreateGetFormControl();
    // If the config specifies, disable the form control.
    if (this.fieldConfig.config?.disabled) {
      this.formControl.disable();
    }
    console.debug(`${this.logName}: created form control with model class '${this.fieldConfig?.class}' and initial value: ${JSON.stringify(this.initValue)}.`);
  }

  protected postCreateGetInitValue(): ValueType | undefined {
    // The server processes the form config and combines defaultValue and value into just value.
    // The client should not check defaultValue.
    return this.fieldConfig.config?.value;
  }

  protected postCreateGetFormControl(): AbstractControl<ValueType> {
    // Create a form control with a type based on the ValueType and init value.
    if (this.initValue === undefined) {
      return new FormControl();
    } else {
      // TODO: FormControl requires considering if ValueType can be null, but we don't do that yet.
      return new FormControl<ValueType>(this.initValue) as FormControl<ValueType>;
    }
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
   * @param opts The modify options.
   */
  public setValue(value: ValueType, opts?: ModifyOptions): void {
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

    this.formControl?.setValue(value, opts);
  }

  /**
   * Set the value of the field if it is provided in value, otherwise keeps the existing value.
   * @param value The new form field value.
   * @param opts The modify options.
   */
  public patchValue(value: ValueType, opts?: ModifyOptions): void {
    this.formControl?.patchValue(value, opts);
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

  /**
   * Get all the validators initially set on this model.
   */
  get validators(): FormValidatorConfig[] {
    return this.initConfig?.config?.validators ?? [];
  }

  /**
   * True if this model is disabled, false if enabled.
   */
  public get isDisabled(): boolean {
    return this.formControl?.disabled ?? false;
  }

  /**
   * Set this model to be disabled or enabled.
   * @param disabled Set the disabled status.
   * @param opts The modify options.
   */
  public setDisabled(disabled: boolean, opts?: ModifyOptions): void {
    const isDisabled = this.formControl?.disabled;
    if (isDisabled === undefined) {
      return;
    }
    if (!disabled && isDisabled) {
      this.formControl?.enable(opts);
    } else if (disabled && !isDisabled) {
      this.formControl?.disable(opts);
    }
  }
}



