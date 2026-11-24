import { Component, DestroyRef, Directive, inject, Input, signal, ViewContainerRef } from '@angular/core';
import { AbstractControl, FormArray, FormControl, FormGroup, FormRecord } from '@angular/forms';
import { FormFieldBaseComponent, FormFieldCompMapEntry, FormFieldModel } from '@researchdatabox/portal-ng-common';
import {
  buildLineagePaths,
  checkboxDetailFields,
  checkboxDetailsDisplayFields,
  checkboxDetailsOptionPath,
  CheckboxDetailFieldFrame,
  CheckboxWithDetailsComponentName,
  CheckboxWithDetailsFieldComponentConfigFrame,
  CheckboxWithDetailsModelName,
  CheckboxWithDetailsOption,
  CheckboxWithDetailsRow,
  checkCheckboxWithDetailsOptions,
  FormValidationGroups,
  FormValidatorFn,
  readCheckboxWithDetailsRows,
} from '@researchdatabox/sails-ng-common';
import { cloneDeep } from 'lodash-es';
import { FormComponent } from '../form.component';
import { FormService } from '../form.service';
import { createFormDefinitionChangeRequestEvent, FormComponentEventBus } from '../form-state';
import { ControlSetValueOptions, CustomSetValueControl } from '../form-state/custom-set-value.control';
import { TypeaheadDataService } from '../service/typeahead-data.service';
import { FormBaseWrapperComponent } from './base-wrapper.component';

type EditorOption = CheckboxWithDetailsOption & { storedOnly?: true };

type DetailsControl = FormRecord<FormControl<string | null>>;
type RowControl = FormGroup<{ value: FormControl<string>; details: DetailsControl }>;

const optionsReadyRule = { class: 'checkboxDetailsOptions' };

interface EditorRow {
  control: RowControl;
  fields: FormFieldCompMapEntry[];
}

function createRowControl(value: string, details: Record<string, FormControl<string | null>>): RowControl {
  return new FormGroup({
    value: new FormControl(value, { nonNullable: true }),
    details: new FormRecord(details),
  });
}

function savedDetailControls(row?: CheckboxWithDetailsRow): Record<string, FormControl<string | null>> {
  return Object.fromEntries(Object.entries(row?.details ?? {}).map(([name, answer]) => [name, new FormControl(answer)]));
}

class CheckboxWithDetailsFormArray extends FormArray<AbstractControl<unknown>> implements CustomSetValueControl {
  replaceSelection?: (value: CheckboxWithDetailsRow[], options?: ControlSetValueOptions) => void;
  private changingRows = false;

  setCustomValue(value: unknown, options?: ControlSetValueOptions): void {
    if (options?.isCurrent?.() === false) return;
    const rows = readCheckboxWithDetailsRows(value);
    if (this.replaceSelection) {
      this.replaceSelection(rows, options);
    } else {
      this.replaceRows(rows.map(row => createRowControl(row.value, savedDetailControls(row))), options);
    }
  }

  override setValue(value: unknown[], options?: ControlSetValueOptions): void {
    this.setCustomValue(value, options);
  }

  // Array values replace the selection by code, even when patched through a parent group.
  override patchValue(value: unknown[], options?: ControlSetValueOptions): void {
    if (value != null) this.setCustomValue(value, options);
  }

  override reset(value?: unknown[], options?: ControlSetValueOptions): void {
    if (options?.isCurrent?.() === false) return;
    this.setCustomValue(value, { onlySelf: true, emitEvent: false });
    super.reset(this.getRawValue(), options);
  }

  replaceRows(rows: readonly RowControl[], options?: ControlSetValueOptions): void {
    if (this.disabled) {
      for (const row of rows) row.disable({ onlySelf: true, emitEvent: false });
    }
    this.changingRows = true;
    try {
      this.controls.forEach(control => control.setParent(null));
      this.clear({ emitEvent: false });
      if (rows.length) this.push([...rows], { emitEvent: false });
    } finally {
      this.changingRows = false;
    }
    this.updateValueAndValidity(options);
  }

  override updateValueAndValidity(options?: ControlSetValueOptions): void {
    super.updateValueAndValidity(this.changingRows ? { onlySelf: true, emitEvent: false } : options);
  }

  refreshRowStatuses(): void {
    for (const control of this.controls as RowControl[]) {
      control.controls.details.updateValueAndValidity({ onlySelf: true, emitEvent: false });
      control.updateValueAndValidity({ onlySelf: true, emitEvent: false });
    }
  }
}

export class CheckboxWithDetailsModel extends FormFieldModel<unknown[]> {
  protected override logName = CheckboxWithDetailsModelName;
  public override formControl?: CheckboxWithDetailsFormArray;

  protected override postCreateGetInitValue(): unknown[] {
    return this.fieldConfig.config?.value ?? [];
  }

  protected override postCreateGetFormControl(): CheckboxWithDetailsFormArray {
    const control = new CheckboxWithDetailsFormArray([]);
    control.setValue(this.initValue ?? [], { emitEvent: false });
    return control;
  }

  public override setValue(value: unknown[], options?: ControlSetValueOptions): void {
    this.formControl?.setValue(value, options);
  }
}

@Directive({ selector: '[redboxCheckboxDetailField]', standalone: false })
export class CheckboxDetailFieldDirective {
  private readonly container = inject(ViewContainerRef);

  @Input({ required: true }) set redboxCheckboxDetailField(entry: FormFieldCompMapEntry) {
    const ref = this.container.createComponent(FormBaseWrapperComponent);
    void ref.instance.initWrapperComponent(entry);
  }
}

let nextGroupId = 0;

@Component({
  selector: 'redbox-checkbox-with-details',
  templateUrl: './checkbox-with-details.component.html',
  styleUrl: './checkbox-with-details.component.scss',
  standalone: false,
})
export class CheckboxWithDetailsComponent extends FormFieldBaseComponent<unknown[]> {
  protected override logName = CheckboxWithDetailsComponentName;
  public override model?: CheckboxWithDetailsModel;

  protected readonly groupId = `redbox-checkbox-details-${nextGroupId++}`;
  protected readonly loadState = signal<'ready' | 'loading' | 'failed'>('ready');

  private readonly formService = inject(FormService);
  private readonly vocab = inject(TypeaheadDataService);
  private readonly eventBus = inject(FormComponentEventBus);
  private readonly destroyRef = inject(DestroyRef);
  private readonly templateEntries = new Map<CheckboxDetailFieldFrame, FormFieldCompMapEntry>();
  private readonly rows = new Map<string, EditorRow>();
  private readonly initiallySelected = new Set<string>();
  private readonly optionIds = new Map<string, string>();

  private get config(): CheckboxWithDetailsFieldComponentConfigFrame {
    return (this.componentDefinition?.config as CheckboxWithDetailsFieldComponentConfigFrame) ?? {};
  }

  private get array(): CheckboxWithDetailsFormArray {
    return this.model!.formControl!;
  }

  private get root(): FormComponent {
    return this.formComponent;
  }

  protected get outerLabel(): string | undefined {
    return this.formFieldCompMapEntry?.compConfigJson.layout?.config?.label;
  }

  protected get legend(): string {
    return this.outerLabel || this.label || 'checkbox-details-label';
  }

  protected get options(): EditorOption[] {
    const options = this.config.options ?? [];
    const result: EditorOption[] = options.filter(
      option =>
        !option.historical || this.config.historicalVocabMode === 'disable' || this.initiallySelected.has(option.value)
    );
    const known = new Set(options.map(option => option.value));
    for (const value of this.initiallySelected) {
      if (!known.has(value)) result.push({ value, label: value, historical: true, storedOnly: true });
    }
    return result;
  }

  public override get formFieldCompMapEntries(): FormFieldCompMapEntry[] {
    return (
      this.model?.formControl?.controls.flatMap(
        control => this.rows.get((control as RowControl).controls.value.value)?.fields ?? []
      ) ?? []
    );
  }

  public override get formFieldBaseComponents(): FormFieldBaseComponent<unknown>[] {
    return this.formFieldCompMapEntries.flatMap(entry => (entry.component ? [entry.component] : []));
  }

  protected override async initData(): Promise<void> {
    const config = this.config;
    checkCheckboxWithDetailsOptions(config);
    const templates = [...(config.detailFields ?? []), ...Object.values(config.detailFieldsByValue ?? {}).flat()];
    const entries = await this.formService.resolveFormComponentClasses(templates, buildLineagePaths());
    templates.forEach((template, index) => this.templateEntries.set(template, entries[index]));
    this.array.replaceSelection = (value, options) => {
      this.replaceSelection(value, options);
      this.publishDefinitionChange();
    };
    this.replaceSelection(readCheckboxWithDetailsRows(this.array.getRawValue()), { emitEvent: false });
    if (config.vocabRef && config.options === undefined) {
      this.formService.updateValidators(this.formFieldCompMapEntry!, this.root.enabledValidationGroups, this.root.validationGroups);
      void this.loadOptions();
    }
  }

  protected async loadOptions(): Promise<void> {
    const config = this.config;
    if (!config.vocabRef || this.loadState() === 'loading') return;
    this.loadState.set('loading');
    this.refreshLookupStatus();
    const options: CheckboxWithDetailsOption[] = [];
    const limit = 1000;
    try {
      for (let offset = 0; ; offset += limit) {
        const page = await this.vocab.searchVocabularyEntries(config.vocabRef, '', limit, offset, true);
        if (this.destroyRef.destroyed) return;
        options.push(...page.map(({ label, value, historical }) => ({ label, value, historical })));
        if (page.length < limit) break;
      }
      const unmatched = checkCheckboxWithDetailsOptions({ ...config, options });
      if (unmatched.length) {
        this.loggerService.warn(`${this.logName}: '${this.name}' vocabulary '${config.vocabRef}' has no entries for detail mappings ${JSON.stringify(unmatched)}.`);
      }
      const selected = readCheckboxWithDetailsRows(this.array.getRawValue());
      config.options = options;
      this.loadState.set('ready');
      this.replaceSelection(selected, { emitEvent: false });
      this.publishDefinitionChange();
      this.root.broadcastFormStatus(false);
    } catch (error) {
      if (this.destroyRef.destroyed) return;
      this.loggerService.error(`${this.logName}: could not load options for '${this.name}'.`, error);
      this.loadState.set('failed');
      this.refreshLookupStatus();
    }
  }

  public deferredOptionsValidator(
    groups: string[],
    validationGroups: FormValidationGroups,
    hasEnabledParentValidator: boolean
  ): FormValidatorFn {
    const validateChoices = hasEnabledParentValidator ||
      this.formService.isValidatorEnabled(optionsReadyRule, groups, validationGroups);
    return control => {
      const state = this.loadState();
      if (state === 'ready') return null;
      // The raw rows have no child controls until the lookup resolves. A draft
      // with child rules disabled can still save those rows as received.
      if (!validateChoices) {
        const rows = readCheckboxWithDetailsRows(control.value);
        const validateDetails = rows.some(row => checkboxDetailFields(this.config, row.value).some(field =>
          !field.model?.config?.disabled && !field.component.config?.disabled && !field.layout?.config?.disabled &&
          field.model?.config?.validators?.some(rule => this.formService.isValidatorEnabled(rule, groups, validationGroups))
        ));
        if (!validateDetails) return null;
      }
      return {
        [optionsReadyRule.class]: {
          message: state === 'loading' ? 'checkbox-details-loading' : 'checkbox-details-load-failed',
          params: {},
        },
      };
    };
  }

  private refreshLookupStatus(): void {
    this.array.updateValueAndValidity({ emitEvent: false });
    this.root.broadcastFormStatus(false);
  }

  protected optionId(option: CheckboxWithDetailsOption): string {
    let id = this.optionIds.get(option.value);
    if (!id) {
      id = `${this.groupId}-${this.optionIds.size}`;
      this.optionIds.set(option.value, id);
    }
    return id;
  }

  protected selectedRow(value: string): EditorRow | undefined {
    const row = this.rows.get(value);
    return row && this.array.controls.includes(row.control) ? row : undefined;
  }

  protected get selectionLocked(): boolean {
    return this.isReadonly || this.isDisabled || this.formFieldCompMapEntry?.compConfigJson.layout?.config?.disabled === true;
  }

  protected optionDisabled(option: EditorOption): boolean {
    if (this.selectionLocked || option.disabled) return true;
    // A stored-only label provides no vocabulary policy. The editor can always
    // remove that answer; reselecting it must pass the usual choice checks.
    if (option.storedOnly && this.selectedRow(option.value)) return false;
    const enabled = this.config.enabledOptionValues;
    return (
      this.loadState() !== 'ready' ||
      (option.historical === true && this.config.historicalVocabMode === 'disable') ||
      (Array.isArray(enabled) && !enabled.includes(option.value))
    );
  }

  protected toggle(option: EditorOption, checked: boolean): void {
    if (this.optionDisabled(option) || !!this.selectedRow(option.value) === checked) return;
    if (checked) {
      const cached = this.rows.get(option.value);
      const index = this.array.length;
      const row = cached ?? this.createRow(option.value, index);
      this.rows.set(option.value, row);
      if (cached) {
        for (const field of row.fields) {
          this.setFieldPaths(field, option.value, index);
          this.formService.updateValidators(field, this.root.enabledValidationGroups, this.root.validationGroups);
        }
        row.control.controls.details.updateValueAndValidity({ onlySelf: true, emitEvent: false });
        row.control.updateValueAndValidity({ onlySelf: true, emitEvent: false });
      }
      this.array.push(row.control);
    } else {
      const row = this.rows.get(option.value)!;
      const index = this.array.controls.indexOf(row.control);
      this.updateFieldPaths(this.array.controls.filter(control => control !== row.control) as RowControl[]);
      this.array.removeAt(index);
      row.control.setParent(null);
    }
    this.array.markAsDirty();
    this.array.markAsTouched();
    this.publishDefinitionChange();
  }

  protected archiveDetails(row: EditorRow) {
    const rendered = new Set(row.fields.map(field => field.compConfigJson.name));
    return checkboxDetailsDisplayFields(this.config, row.control.getRawValue(), true)
      .filter(detail => !rendered.has(detail.name));
  }

  private createRow(value: string, rowIndex: number, saved?: CheckboxWithDetailsRow): EditorRow {
    const option = this.config.options?.find(candidate => candidate.value === value);
    const templates = option ? checkboxDetailFields(this.config, value) : [];
    const controls = savedDetailControls(saved);
    const fields = templates.map(template => {
      const source = this.templateEntries.get(template)!;
      const child: FormFieldCompMapEntry = {
        componentClass: source.componentClass,
        modelClass: source.modelClass,
        layoutClass: source.layoutClass,
        compConfigJson: cloneDeep(source.compConfigJson),
        labelSuffix: option?.label,
      };
      const definition = child.compConfigJson;
      const name = definition.name!;
      if (definition.layout) {
        definition.layout.config ??= {};
        definition.layout.config.label ||= definition.component.config?.label || name;
      }
      const model = definition.model!;
      model.config ??= {};
      const componentConfig = (definition.component.config ??= {});
      const layoutConfig = definition.layout?.config;
      // Keep disabled answers in the selected row so an unrelated save can
      // preserve them even when every detail on that row is disabled.
      if (model.config.disabled || componentConfig.disabled || layoutConfig?.disabled) {
        model.config.disabled = false;
        model.config.validators = [];
        componentConfig.disabled = false;
        componentConfig.readonly = true;
        if (layoutConfig) layoutConfig.disabled = false;
      }
      if (saved) {
        model.config.value = Object.hasOwn(saved.details, name) ? saved.details[name] : null;
      } else {
        model.config.value = typeof model.config.value === 'string' ? model.config.value : null;
      }
      this.setFieldPaths(child, value, rowIndex);
      const field = this.formService.createFormFieldModelInstance(
        child,
        this.root.enabledValidationGroups,
        this.root.validationGroups
      );
      controls[name] = field!.formControl as FormControl<string | null>;
      return child;
    });

    return { control: createRowControl(value, controls), fields };
  }

  private replaceSelection(values: CheckboxWithDetailsRow[], options: ControlSetValueOptions = {}): void {
    this.rows.clear();
    this.initiallySelected.clear();
    const selected = values.map((value, index) => {
      this.initiallySelected.add(value.value);
      const row = this.createRow(value.value, index, value);
      this.rows.set(value.value, row);
      return row.control;
    });
    this.array.replaceRows(selected, options);
  }

  private updateFieldPaths(rows: readonly RowControl[]): void {
    for (const [index, control] of rows.entries()) {
      const value = control.controls.value.value;
      for (const child of this.rows.get(value)?.fields ?? []) this.setFieldPaths(child, value, index);
    }
  }

  private setFieldPaths(child: FormFieldCompMapEntry, value: string, index: number): void {
    const optionPath = checkboxDetailsOptionPath(value);
    const name = child.compConfigJson.name!;
    const sharedIndex = this.config.detailFields?.findIndex(field => field.name === name) ?? -1;
    const byValue = this.config.detailFieldsByValue;
    const optionIndex =
      byValue && Object.hasOwn(byValue, value) ? byValue[value].findIndex(field => field.name === name) : -1;
    child.lineagePaths = buildLineagePaths(this.formFieldCompMapEntry?.lineagePaths, {
      angularComponents: [optionPath, name],
      layout: [optionPath, `${name}-layout`],
      dataModel: [index, 'details', name],
      formConfig: [
        'component',
        'config',
        ...(sharedIndex >= 0 ? ['detailFields', sharedIndex] : ['detailFieldsByValue', value, optionIndex]),
      ],
    });
  }

  private publishDefinitionChange(): void {
    this.eventBus.publish(createFormDefinitionChangeRequestEvent({ sourceId: this.formFieldConfigName() }));
  }
}
