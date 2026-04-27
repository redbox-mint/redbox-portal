import { Component, ComponentRef, DestroyRef, inject, ViewChild, ViewContainerRef, TemplateRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormArray, AbstractControl } from '@angular/forms';
import { FormFieldBaseComponent, FormFieldModel, FormFieldCompMapEntry, ModifyOptions } from '@researchdatabox/portal-ng-common';
import {
  ContentComponentName,
  FormConfigFrame,
  GroupFieldComponentName,
  isTypeFieldDefinitionName,
  RepeatableComponentName,
  RepeatableElementLayoutName,
  RepeatableFieldComponentConfig,
  RepeatableFieldComponentDefinitionFrame,
  RepeatableModelName,
  ReusableComponentName,
  SyncSourceEntry,
} from '@researchdatabox/sails-ng-common';
import { isEmpty as _isEmpty, cloneDeep as _cloneDeep, isEqual as _isEqual, isUndefined as _isUndefined } from 'lodash-es';
import { FormService } from '../form.service';
import { FormBaseWrapperComponent } from "./base-wrapper.component";
import { DefaultLayoutComponent } from "./default-layout.component";
import { createFormDefinitionChangeRequestEvent, createFormStatusDirtyRequestEvent, FormComponentEventBus } from '../form-state';
import { CustomSetValueControl } from '../form-state/custom-set-value.control';
import {FormComponent} from "../form.component";
import { FieldValueChangedEvent, FormComponentEventType } from '../form-state/events/form-component-event.types';

type RepeatableSetValueOptions = ModifyOptions;

class RepeatableFormArray
  extends FormArray<AbstractControl<unknown>>
  implements CustomSetValueControl<Array<unknown>>
{
  public customValueSetter?: (value: Array<unknown>, options?: RepeatableSetValueOptions) => Promise<void> | void;

  public async setCustomValue(
    value: Array<unknown>,
    options?: RepeatableSetValueOptions
  ): Promise<void> {
    if (this.customValueSetter) {
      await this.customValueSetter(value, options);
      return;
    }

    if (value.length !== this.controls.length) {
      throw new Error(
        `RepeatableFormArray.setCustomValue requires ${this.controls.length} values to match the current control count when no customValueSetter is registered, but received ${value.length}.`
      );
    }

    this.setValue(value, options);
  }
}

/**
 * Repeatable Form Field Component
 *
 * The layout-specific section is meant to be minimal.
 *
 *
 */
@Component({
  selector: 'redbox-form-repeatable',
  template:
    `
    <ng-container *ngTemplateOutlet="getTemplateRef('before')" />
    <div class="rb-form-repeatable">
      <div class="rb-form-repeatable__items" [class.d-none]="isStatusReady() && hideWhenZeroRows && compDefMapEntries.length === 0">
        <ng-container #repeatableContainer></ng-container>
      </div>
      @if (isStatusReady() && isVisible && addButtonShow && (!hideWhenZeroRows || compDefMapEntries.length > 0)) {
        <button type="button"
                class="rb-form-repeatable__add btn btn-success"
                (click)="appendNewElement()"
                [attr.aria-label]="'add-button-label' | i18next"
                [disabled]="isDisabled">
          <span class="fa fa-plus-circle" aria-hidden="true"></span>
          <span>{{ 'add-button-label' | i18next }}</span>
        </button>
      }
    </div>
    <ng-container *ngTemplateOutlet="getTemplateRef('after')" />
  `,
  standalone: false
})
export class RepeatableComponent extends FormFieldBaseComponent<Array<unknown>> {
  protected override logName = RepeatableComponentName;
  public override model?: RepeatableComponentModel;
  protected addButtonShow = true;
  protected allowZeroRows = false;
  protected hideWhenZeroRows = false;

  protected formService = inject(FormService);
  protected elemInitFieldEntry?: FormFieldCompMapEntry;

  protected compDefMapEntries: Array<RepeatableElementEntry> = [];
  private syncSourcesUpdatePromise: Promise<void> = Promise.resolve();

  @ViewChild('repeatableContainer', { read: ViewContainerRef, static: true }) repeatableContainer!: ViewContainerRef;
  @ViewChild('removeButtonTemplate', { read: TemplateRef<any>, static: false }) removeButtonTemplate!: TemplateRef<any>;


  private readonly eventBus = inject(FormComponentEventBus);
  private readonly destroyRef = inject(DestroyRef);

  public override get formFieldBaseComponents(): FormFieldBaseComponent<unknown>[] {
    return this.formFieldCompMapEntries
      .map(c => c.component)
      .filter(c => c !== undefined && c !== null);
  }

  public override get formFieldCompMapEntries(): FormFieldCompMapEntry[] {
    return this.compDefMapEntries?.map(i => i?.defEntry) ?? [];
  }

  protected get getFormComponent(): FormComponent {
    return this.formComponent;
  }

  protected override async initData() {
    // Prepare the element template
    const formComponentName = this.formFieldCompMapEntry?.compConfigJson?.name ?? "";

    const componentFormConfig = this.componentDefinition;
    if (!isTypeFieldDefinitionName<RepeatableFieldComponentDefinitionFrame>(componentFormConfig, RepeatableComponentName)) {
      throw new Error(`Expected a repeatable component, but got ${JSON.stringify(componentFormConfig)}`);
    }

    const componentConfigFormConfig = componentFormConfig.config;
    this.addButtonShow = _isUndefined(componentConfigFormConfig?.addButtonShow) ? true : componentConfigFormConfig?.addButtonShow;
    this.allowZeroRows = componentConfigFormConfig?.allowZeroRows ?? false;
    this.hideWhenZeroRows = componentConfigFormConfig?.hideWhenZeroRows ?? false;
    const elementTemplate = componentConfigFormConfig?.elementTemplate;
    if (!elementTemplate) {
      throw new Error(`${this.logName}: elementTemplate is not defined in the component definition for '${formComponentName}'.`);
    }

    // Resolve the classes using the FormService
    const newElementFormConfig: FormConfigFrame = {
      name: `form-config-generated-repeatable-${formComponentName}`,
      // Add an empty name to satisfy the FormConfig, the name will be replaced with a generated name.
      componentDefinitions: [{ ...elementTemplate, name: "" }],
      // TODO: Get the default config?
      // defaultComponentConfig: this.getFormComponent.formDefMap?.formConfig?.defaultComponentConfig,
      // Use the current enabledValidationGroups for creating the component.
      // Subsequent updates will use the FormComponent's enabledValidationGroups property.
      enabledValidationGroups: this.getFormComponent.enabledValidationGroups,
      validationGroups: this.getFormComponent.validationGroups,
    };
    const parentLineagePaths = this.formService.buildLineagePaths(
      this.formFieldCompMapEntry?.lineagePaths,
      {
        angularComponents: [],
        layout: [],
        dataModel: [],
        formConfig: ['component', 'config', 'elementTemplate'],
      }
    );
    const formComponentsMap = await this.formService.createFormComponentsMap(newElementFormConfig, parentLineagePaths);

    if (_isEmpty(formComponentsMap)) {
      throw new Error(`${this.logName}: No components found in the formComponentsMap for '${formComponentName}'.`);
    }
    if (!this.model) {
      throw new Error(`${this.logName}: model is not defined. Cannot initialize the component for '${formComponentName}'.`);
    }
    const formControl = this.model.formControl;
    if (formControl instanceof RepeatableFormArray) {
      formControl.customValueSetter = (value, options) => this.replaceAllElements(Array.isArray(value) ? value : [], options);
    }

    this.elemInitFieldEntry = formComponentsMap.components[0];
    let layoutClass = this.elemInitFieldEntry?.layoutClass;
    if (!layoutClass) {
      // If the layout class is not defined, use the default layout class.
      layoutClass = RepeatableElementLayoutComponent
    }
    this.elemInitFieldEntry.layoutClass = layoutClass;

    // Loop through the elements of the model and insert into the container
    const elemVals = this.model.initValue;
    if (!Array.isArray(elemVals)) {
      throw new Error(`${this.logName}: model value is not an array. Cannot initialize the component for '${formComponentName}'.`);
    }

    // By default a repeatable creates one row. Legacy configs can opt into zero-row behavior.
    if (elemVals.length === 0 && !this.allowZeroRows) {
      // If we get here, there is no default from the repeatable or an ancestor.
      // Use the default value from the elementTemplate, because elementTemplate defines the default for new entries.
      // If there is no model value, use undefined.
      // Undefined is not set to control.value, anything else is set, which is what we want.
      const elementTemplateValue = this.getElementTemplateDefaultValue();
      elemVals.push(elementTemplateValue);
      this.loggerService.warn(`${this.logName}: Created one element for repeatable '${formComponentName}' with no value: ${JSON.stringify(elemVals)}`);
    }

    for (const elementValue of elemVals) {
      await this.appendNewElement(elementValue, false);
    }

    this.setupSyncSourceSubscriptions();
  }

  private setupSyncSourceSubscriptions(): void {
    const syncSources = this.getSyncSources();
    if (syncSources.length === 0) {
      return;
    }

    void this.syncFromCurrentSources(false);

    this.eventBus.select$(FormComponentEventType.FIELD_VALUE_CHANGED)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((event: FieldValueChangedEvent) => {
        if (this.isSyncSourceTriggerEvent(event, syncSources)) {
          void this.syncFromCurrentSources(false);
        }
      });
  }

  private getSyncSources(): SyncSourceEntry[] {
    const cfg = this.componentDefinition?.config as RepeatableFieldComponentConfig | undefined;
    return Array.isArray(cfg?.syncSources) ? cfg.syncSources : [];
  }

  private shouldKeepAtLeastOneRow(): boolean {
    return !this.allowZeroRows || this.getSyncSources().length > 0;
  }

  private isSyncSourceTriggerEvent(event: FieldValueChangedEvent, syncSources: SyncSourceEntry[]): boolean {
    const fieldId = event.fieldId || '';
    return syncSources.some(source =>
      fieldId.endsWith(`/${source.fieldName}`)
      || (!!source.visibilityConditionField && fieldId.endsWith(`/${source.visibilityConditionField}`))
    );
  }

  private async syncFromCurrentSources(emitEvent: boolean): Promise<void> {
    this.syncSourcesUpdatePromise = this.syncSourcesUpdatePromise
      .catch(() => undefined)
      .then(async () => {
        const syncSources = this.getSyncSources();
        if (syncSources.length === 0) {
          return;
        }

        const currentValue = Array.isArray(this.model?.formControl?.value)
          ? _cloneDeep(this.model?.formControl?.value)
          : [];
        let nextValue = currentValue;

        for (const source of syncSources) {
          if (!this.isActiveSyncSource(source)) {
            continue;
          }
          nextValue = this.upsertSyncedSource(nextValue, this.getNamedFieldValue(source.fieldName), source);
        }

        if (_isEqual(nextValue, currentValue)) {
          return;
        }

        await this.replaceAllElements(nextValue, { emitEvent });
      });

    await this.syncSourcesUpdatePromise;
  }

  private isActiveSyncSource(source: SyncSourceEntry): boolean {
    if (!source.visibilityConditionField) {
      return true;
    }
    const conditionValue = this.getNamedFieldValue(source.visibilityConditionField);
    const allowed = Array.isArray(source.visibilityConditionValues) ? source.visibilityConditionValues : [];
    return typeof conditionValue === 'string' && allowed.includes(conditionValue);
  }

  private getNamedFieldValue(fieldName: string): unknown {
    const rawFormValue = this.getFormComponent.form?.getRawValue?.() as Record<string, unknown> | undefined;
    if (rawFormValue && fieldName in rawFormValue) {
      return rawFormValue[fieldName];
    }
    const pointerSource = this.getFormComponent.getQuerySource()?.jsonPointerSource as Record<string, unknown> | undefined;
    return pointerSource?.[fieldName];
  }

  private upsertSyncedSource(existing: unknown[], sourceValue: unknown, syncSource: SyncSourceEntry): unknown[] {
    const source = (typeof sourceValue === 'object' && sourceValue !== null)
      ? _cloneDeep(sourceValue as Record<string, unknown>)
      : null;
    if (!source) {
      return existing;
    }

    const template = this.getSyncDefaultTemplate(syncSource);
    const items = existing.map(item => _cloneDeep(item as Record<string, unknown>));
    const syncKey = syncSource.syncKey;
    const syncValue = syncKey ? source[syncKey] : undefined;
    if (syncKey && (_isUndefined(syncValue) || syncValue === null || syncValue === '')) {
      return existing;
    }

    const hasSyncKey = !!syncKey;

    if (hasSyncKey) {
      const existingIndex = items.findIndex(item => item?.[syncKey] === syncValue);
      if (existingIndex >= 0) {
        items[existingIndex] = { ...items[existingIndex], ...source, ...template };
        return items;
      }
    }

    if (items.length === 1 && this.isBlankPlaceholder(items[0], syncSource, source)) {
      return [{ ...items[0], ...source, ...template }];
    }

    return [...items, { ...source, ...template }];
  }

  private isBlankPlaceholder(
    item: Record<string, unknown> | undefined,
    syncSource?: SyncSourceEntry,
    source?: Record<string, unknown> | null,
  ): boolean {
    if (!item) {
      return false;
    }

    const blankCheckFields = this.getBlankCheckFields(syncSource, item, source);
    if (blankCheckFields.length === 0) {
      return false;
    }

    return blankCheckFields.every(fieldName => {
      const value = item[fieldName];
      return value === undefined || value === null || value === '';
    });
  }

  private getBlankCheckFields(
    syncSource: SyncSourceEntry | undefined,
    item: Record<string, unknown>,
    source?: Record<string, unknown> | null,
  ): string[] {
    const configuredFields = this.normalizeBlankCheckFields(syncSource?.blankCheckFields);
    if (configuredFields.length > 0) {
      return configuredFields;
    }

    const elementTemplate = (this.componentDefinition?.config as RepeatableFieldComponentConfig | undefined)?.elementTemplate;
    return this.inferBlankCheckFields(elementTemplate, item, source);
  }

  private normalizeBlankCheckFields(blankCheckFields: SyncSourceEntry['blankCheckFields']): string[] {
    if (!Array.isArray(blankCheckFields)) {
      return [];
    }

    const seen = new Set<string>();
    const normalized: string[] = [];
    for (const fieldName of blankCheckFields) {
      if (typeof fieldName !== 'string') {
        continue;
      }
      const trimmedFieldName = fieldName.trim();
      if (!trimmedFieldName || seen.has(trimmedFieldName)) {
        continue;
      }
      seen.add(trimmedFieldName);
      normalized.push(trimmedFieldName);
    }
    return normalized;
  }

  private inferBlankCheckFields(
    elementTemplate: RepeatableFieldComponentConfig['elementTemplate'] | undefined,
    item: Record<string, unknown>,
    source?: Record<string, unknown> | null,
  ): string[] {
    if (!elementTemplate || typeof elementTemplate !== 'object') {
      return [];
    }

    const inferredFields = new Set<string>();
    const structuralClasses = new Set<string>([
      ContentComponentName,
      GroupFieldComponentName,
      RepeatableComponentName,
      ReusableComponentName,
    ]);

    const visitTemplate = (node: unknown): void => {
      if (!node || typeof node !== 'object') {
        return;
      }

      const templateNode = node as Record<string, unknown>;
      const component = templateNode['component'];
      const componentRecord = (component && typeof component === 'object')
        ? component as Record<string, unknown>
        : undefined;
      const componentClass = typeof componentRecord?.['class'] === 'string'
        ? componentRecord['class']
        : undefined;
      const componentConfig = componentRecord?.['config'];
      const componentConfigRecord = (componentConfig && typeof componentConfig === 'object')
        ? componentConfig as Record<string, unknown>
        : undefined;
      const childDefinitions = Array.isArray(componentConfigRecord?.['componentDefinitions'])
        ? componentConfigRecord['componentDefinitions'] as unknown[]
        : [];

      const name = typeof templateNode['name'] === 'string' ? templateNode['name'].trim() : '';
      if (name && !structuralClasses.has(componentClass ?? '') && childDefinitions.length === 0) {
        inferredFields.add(name);
      }

      const model = templateNode['model'];
      const modelRecord = (model && typeof model === 'object') ? model as Record<string, unknown> : undefined;
      const modelConfig = modelRecord?.['config'];
      const modelConfigRecord = (modelConfig && typeof modelConfig === 'object')
        ? modelConfig as Record<string, unknown>
        : undefined;
      const templateValue = [modelConfigRecord?.['newEntryValue'], modelConfigRecord?.['value']]
        .find(value => !!value && typeof value === 'object' && !Array.isArray(value));
      if (templateValue && typeof templateValue === 'object') {
        for (const key of Object.keys(templateValue as Record<string, unknown>)) {
          if (key) {
            inferredFields.add(key);
          }
        }
      }

      for (const childDefinition of childDefinitions) {
        visitTemplate(childDefinition);
      }

      const nestedElementTemplate = componentConfigRecord?.['elementTemplate'];
      if (nestedElementTemplate) {
        visitTemplate(nestedElementTemplate);
      }
    };

    visitTemplate(elementTemplate);

    const candidateFields = Array.from(inferredFields);
    if (candidateFields.length === 0) {
      return [];
    }

    const relevantKeys = new Set<string>([
      ...Object.keys(item),
      ...(source ? Object.keys(source) : []),
    ]);
    const matchedFields = candidateFields.filter(fieldName => relevantKeys.has(fieldName));
    return matchedFields.length > 0 ? matchedFields : candidateFields;
  }

  private getSyncDefaultTemplate(syncSource: SyncSourceEntry | undefined): Record<string, unknown> {
    const template = syncSource?.defaultTemplate;
    if (!template || typeof template !== 'object' || Array.isArray(template)) {
      return {};
    }
    return _cloneDeep(template as Record<string, unknown>);
  }

  private getElementTemplateDefaultValue(): unknown {
    const elementTemplateModelConfig =
      (this.componentDefinition?.config as RepeatableFieldComponentConfig | undefined)?.elementTemplate?.model?.config;
    return elementTemplateModelConfig?.newEntryValue ?? elementTemplateModelConfig?.value;
  }

  public async appendNewElement(value?: any, markFormDirty: boolean = true, options?: RepeatableSetValueOptions) {
    if (!this.elemInitFieldEntry) {
      throw new Error(`${this.logName}: elemInitFieldEntry is not defined. Cannot append new element.`);
    }
    if (value === undefined) {
      value = this.getElementTemplateDefaultValue();
    }
    const elemEntry = this.createFieldNewMapEntry(this.elemInitFieldEntry, value, options);
    await this.createElement(elemEntry, options);
    if (markFormDirty && this.shouldEmitComponentEvents(options)) {
      this.requestFormDirty('repeatable.element.appended');
    }
  }

  public async replaceAllElements(values?: unknown[], options?: RepeatableSetValueOptions): Promise<void> {
    const nextValues = Array.isArray(values) ? values : [];

    while (this.compDefMapEntries.length > 0) {
      const lastEntry = this.compDefMapEntries[this.compDefMapEntries.length - 1];
      this.removeElementFn(lastEntry, options)();
    }

    if (nextValues.length === 0 && !this.allowZeroRows) {
      await this.appendNewElement(undefined, false, options);
      return;
    }

    for (const value of nextValues) {
      await this.appendNewElement(value, false, options);
    }
  }

  protected rebuildLineagePaths(options?: RepeatableSetValueOptions) {
    for (let index = 0; index < this.compDefMapEntries.length; index++) {
      const indexStr = index.toString();
      const lineagePath = this.formService.buildLineagePaths(
        this.formFieldCompMapEntry?.lineagePaths,
        {
          angularComponents: [indexStr],
          layout: [indexStr],
          dataModel: [indexStr],
          formConfig: ['component', 'config', 'elementTemplate'],
        });
      this.compDefMapEntries[index].defEntry.lineagePaths = lineagePath;
    }
    if (!this.shouldEmitComponentEvents(options)) {
      return;
    }
    // Every time the lineage paths are rebuilt, the form definition has essentially changed. Sending an event to notify listeners.
    this.eventBus.publish(
      createFormDefinitionChangeRequestEvent({
        sourceId: this.formFieldConfigName() || undefined
      })
    );
  }

  protected createFieldNewMapEntry(templateEntry: FormFieldCompMapEntry, value: any, options?: RepeatableSetValueOptions): RepeatableElementEntry {
    const localUniqueId = RepeatableFieldComponentConfig.getLocalUID();

    const elemEntry: FormFieldCompMapEntry = {
      modelClass: templateEntry.modelClass,
      layoutClass: templateEntry.layoutClass,
      componentClass: templateEntry.componentClass,
      compConfigJson: _cloneDeep(templateEntry.compConfigJson),
    };

    // The component and layout names are set from the repeatable component name or a default name,
    // with localUniqueId appended to ensure uniqueness.
    const baseName = this.formFieldConfigName('repeatable');

    if (elemEntry.compConfigJson) {
      elemEntry.compConfigJson.name = `${baseName}-${localUniqueId}`;
      if (elemEntry.compConfigJson.component?.class === ContentComponentName && !_isUndefined(value)) {
        let coercedContent: string;
        if (typeof value === 'string') {
          coercedContent = value;
        } else if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
          coercedContent = String(value);
        } else {
          // For non-primitive values (objects, arrays, null, etc.), keep behaviour equivalent
          // to the previous implementation where non-string content was effectively ignored.
          coercedContent = '';
        }

        elemEntry.compConfigJson.component.config = {
          ...(elemEntry.compConfigJson.component.config ?? {}),
          content: coercedContent,
        } as typeof elemEntry.compConfigJson.component.config;
      }
    }
    if (elemEntry.compConfigJson?.layout) {
      elemEntry.compConfigJson.layout.name = `${baseName}-layout-${localUniqueId}`;
    }

    // Create new form field.
    const model = this.formService.createFormFieldModelInstance(
      elemEntry, this.getFormComponent.enabledValidationGroups, this.getFormComponent.validationGroups);
    if (model !== null) {
      if (!_isUndefined(value)) {
        model.initValue = value;
        if (model.formControl && !('controls' in model.formControl)) {
          model.formControl.setValue(value as never, options);
        }
      }
      elemEntry.model = model;
    }

    // Note that the repeatable elementTemplate does not have a 'name' property.
    // This means that the array elements do not have to have a 'top-level key', like most other components.
    // This is done to enable the array to be strings or numbers (using e.g. input component), as well as objects (using e.g. group component).
    return {
      defEntry: elemEntry,
      wrapperRef: null,
      localUniqueId: localUniqueId,
      value: value
    };
  }

  protected async createElement(elemEntry: RepeatableElementEntry, options?: RepeatableSetValueOptions) {
    const elemFieldEntry = elemEntry.defEntry;
    // Pushing early so rebuilding the lineage paths will be accurate
    this.compDefMapEntries.push(elemEntry);
    this.updateCanRemoveFlags();
    this.rebuildLineagePaths(options);
    // Create a new component for the repeatable element
    const wrapperRef = this.repeatableContainer.createComponent(FormBaseWrapperComponent<unknown>);
    // TODO: how to know when to apply defaultComponentConfig or not?
    // componentRef.instance.defaultComponentConfig = this.newElementFormConfig?.defaultComponentConfig;
    const compInstance = await wrapperRef.instance.initWrapperComponent(elemFieldEntry);
    const layoutInstance = elemFieldEntry.layoutRef?.instance as RepeatableElementLayoutComponent<Array<unknown>> | undefined;
    if (!layoutInstance) {
      this.loggerService.warn(`${this.logName}: repeatable element layout was not initialised for`, elemFieldEntry);
      elemEntry.wrapperRef = wrapperRef;
      return wrapperRef;
    }
    layoutInstance.removeFn = this.removeElementFn(elemEntry);
    layoutInstance.canRemove = this.shouldKeepAtLeastOneRow()
      ? this.compDefMapEntries.length > 1
      : this.compDefMapEntries.length > 0;
    elemEntry.layoutInstance = layoutInstance;
    if (this.model?.formControl && compInstance?.model) {
      this.model.addElement(compInstance.model, options);
    } else {
      this.loggerService.warn(`${this.logName}: model or formControl is not defined, not adding the element's form control to the 'this.formControl'. If any data is missing, this is why.`);
    }
    elemEntry.wrapperRef = wrapperRef;
    return wrapperRef;
  }

  public removeElementFn(elemEntry: RepeatableElementEntry, options?: RepeatableSetValueOptions) {
    const that = this;
    return function () {
      that.loggerService.debug(`${that.logName}: removeElement called: `, elemEntry.localUniqueId);
      that.loggerService.debug(`${that.logName}: removeElement called, matching elemEntry:`,
        that.compDefMapEntries.find(i => i === elemEntry)
      );
      const defIdx = that.compDefMapEntries.findIndex((entry) => entry.localUniqueId === elemEntry.localUniqueId);
      if (defIdx === -1) {
        that.loggerService.warn(`${that.logName}: removeElement called, but no tracked element found with localUniqueId. Falling back to model removal.`, elemEntry.localUniqueId);
        try {
          elemEntry.wrapperRef?.destroy();
          that.model?.removeElement(elemEntry.defEntry?.model, options);
          if (that.shouldEmitComponentEvents(options)) {
            that.requestFormDirty('repeatable.element.removed');
          }
          that.updateCanRemoveFlags();
          that.rebuildLineagePaths(options);
        } catch (error) {
          that.loggerService.warn(`${that.logName}: fallback removeElement failed`, error);
        }
        return;
      }
      that.compDefMapEntries.splice(defIdx, 1);
      elemEntry.wrapperRef?.destroy();
      that.model?.removeElement(elemEntry.defEntry?.model, options);
      if (that.shouldEmitComponentEvents(options)) {
        that.requestFormDirty('repeatable.element.removed');
      }
      that.updateCanRemoveFlags();
      that.rebuildLineagePaths(options);
    }
  }

  protected shouldEmitComponentEvents(options?: RepeatableSetValueOptions): boolean {
    return options?.emitEvent !== false;
  }

  protected requestFormDirty(reason: string) {
    this.eventBus.publish(
      createFormStatusDirtyRequestEvent({
        fieldId: this.formFieldConfigName() || undefined,
        sourceId: this.formFieldConfigName() || undefined,
        reason,
      })
    );
  }

  protected updateCanRemoveFlags() {
    const canRemove = this.shouldKeepAtLeastOneRow()
      ? this.compDefMapEntries.length > 1
      : this.compDefMapEntries.length > 0;
    for (const entry of this.compDefMapEntries) {
      if (entry.layoutInstance) {
        entry.layoutInstance.canRemove = canRemove;
      }
    }
  }
}




export class RepeatableComponentModel extends FormFieldModel<Array<unknown>> {
  protected override logName = RepeatableModelName;
  public override formControl?: RepeatableFormArray;

  protected override postCreateGetInitValue(): Array<unknown> | undefined {
    // Store the init value. Use an empty array if the value is not set.
    return this.fieldConfig.config?.value ?? [];
  }

  protected override postCreateGetFormControl(): RepeatableFormArray {
    // not setting value yet, this will be done in the component for lazy init
    const modelElems: AbstractControl[] = [];
    const formControl = new RepeatableFormArray(modelElems);
    return formControl;
  }

  public addElement(targetModel?: FormFieldModel<unknown>, options?: RepeatableSetValueOptions) {
    const control = targetModel?.getFormControl();
    if (this.formControl && control) {
      if (this.formControl.disabled && control.enabled) {
        control.disable();
      }
      this.formControl.push(control, options);
    } else {
      throw new Error(`${this.logName}: formControl or targetModel are not valid. Cannot add element.`);
    }
  }

  public removeElement(targetModel?: FormFieldModel<unknown>, options?: RepeatableSetValueOptions): void {
    if (this.formControl && this.formControl instanceof FormArray) {
      const modelIdx = this.formControl?.controls.findIndex((control: unknown) => control === targetModel?.getFormControl());
      if (modelIdx === -1 || modelIdx === undefined) {
        throw new Error(`${this.logName}: model not found in formControl.`);
      }
      this.formControl.removeAt(modelIdx, options);
    } else {
      throw new Error(`${this.logName}: formControl is not a FormArray. Cannot remove element.`);
    }
  }
}



/**
 * Used to store the information about a repeatable element in the form, including its model, component, and layout, and other information needed to add or remove it from the form dynamically.
 */
export interface RepeatableElementEntry {
  defEntry: FormFieldCompMapEntry;
  wrapperRef: ComponentRef<FormBaseWrapperComponent<unknown>> | null | undefined;
  layoutInstance?: RepeatableElementLayoutComponent<unknown>;
  // The unique ID of the repeatable element, used to identify it in the form. This is not meant to be persisted in the database, but rather to be used for dynamic operations in the form.
  localUniqueId?: string;
  // The value of the element. Unfortunately, in the group compoment, the structure of the data model is not known until after the component is initialised, so we store the value here to set afterwards.
  value: unknown;
}

@Component({
  selector: 'redbox-form-repeatable-component-layout',
  template: `
  <div class="rb-form-repeatable-item" [class.rb-form-repeatable-item--contributor]="isContributorInline">
    <div class="rb-form-repeatable-item__content">
      <ng-container #componentContainer></ng-container>
    </div>
    @if (isVisible && canRemove) {
      <button
        type="button"
        class="rb-form-repeatable-item__remove btn btn-danger"
        (click)="clickedRemove()"
        [attr.aria-label]="'remove-button-label' | i18next"
        [disabled]="isDisabled">
        <span class="fa fa-minus-circle" aria-hidden="true"></span>
      </button>
    }
  </div>
  <ng-template #afterComponentTemplate>
    @if (isVisible) {
      @let componentValidationList = getFormValidatorComponentErrors;
      <redbox-field-error-summary [errors]="componentValidationList" [fieldName]="componentName"></redbox-field-error-summary>
    }
  </ng-template>
  `,
  standalone: false,
})
export class RepeatableElementLayoutComponent<ValueType> extends DefaultLayoutComponent<ValueType> {
  protected override logName = RepeatableElementLayoutName;
  public removeFn?: () => void;
  public canRemove = false;

  protected get isContributorInline(): boolean {
    const hostCssClasses = this.formFieldCompMapEntry?.compConfigJson?.component?.config?.hostCssClasses;
    if (typeof hostCssClasses !== 'string') {
      return false;
    }
    return hostCssClasses.split(/\s+/).includes('rb-form-contributor-inline');
  }

  protected clickedRemove() {
    this.removeFn?.call(this);
  }
}
