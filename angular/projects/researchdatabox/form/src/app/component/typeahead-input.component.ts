import { AfterViewChecked, Component, DestroyRef, inject, Input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl } from '@angular/forms';
import {
  FormFieldBaseComponent,
  FormFieldCompMapEntry,
  FormFieldModel,
  HandlebarsTemplateService,
} from '@researchdatabox/portal-ng-common';
import {
  DynamicScriptResponse,
  TypeaheadInputComponentName,
  TypeaheadInputFieldComponentConfig,
  TypeaheadInputModelName,
  TypeaheadInputModelValueType,
  TypeaheadOption,
} from '@researchdatabox/sails-ng-common';
import { TypeaheadMatch } from 'ngx-bootstrap/typeahead';
import { defer, from, Observable } from 'rxjs';
import { FormComponent } from '../form.component';
import { TypeaheadDataService } from '../service/typeahead-data.service';

type TypeaheadStatus = 'idle' | 'loading' | 'no-results' | 'error' | 'misconfigured';

type DisabledStateOptions = {
  emitEvent?: boolean;
  onlySelf?: boolean;
};

export class TypeaheadInputModel extends FormFieldModel<TypeaheadInputModelValueType> {
  protected override logName = TypeaheadInputModelName;
}

@Component({
  selector: 'redbox-typeahead-input',
  template: `
    @if (isVisible) {
      <ng-container *ngTemplateOutlet="getTemplateRef('before')" />
      <input
        type="text"
        class="form-control"
        [formControl]="displayControl"
        [class.is-valid]="showValidState"
        [class.is-invalid]="!isValid"
        [placeholder]="placeholder | i18next"
        [title]="tooltip | i18next"
        [readonly]="isReadonly || readOnlyAfterSelectLocked"
        [disabled]="isDisabled"
        [attr.role]="'combobox'"
        [attr.aria-expanded]="isOpen"
        [attr.aria-autocomplete]="'list'"
        [attr.aria-busy]="searchState === 'loading'"
        [attr.aria-describedby]="statusElementId"
        [typeahead]="suggestions$"
        [typeaheadAsync]="true"
        [typeaheadMinLength]="minChars"
        [typeaheadWaitMs]="debounceMs"
        [typeaheadOptionsLimit]="maxResults"
        [typeaheadOptionField]="'label'"
        [typeaheadSingleWords]="false"
        [dropup]="false"
        [adaptivePosition]="true"
        [typeaheadScrollable]="true"
        (typeaheadOnShown)="onDropdownShown()"
        (typeaheadOnHidden)="onDropdownHidden()"
        (typeaheadOnSelect)="onSelect($event)"
        (blur)="onBlur()"
      />
      <div class="small mt-1 text-muted" [id]="statusElementId" aria-live="polite">
        @if (searchState === 'loading') {
          Searching...
        }
        @if (searchState === 'no-results') {
          No matches found
        }
        @if (searchState === 'error') {
          {{ statusMessage || 'Lookup failed' }}
        }
        @if (searchState === 'misconfigured') {
          {{ statusMessage || 'Typeahead field is misconfigured' }}
        }
      </div>
      <ng-container *ngTemplateOutlet="getTemplateRef('after')" />
    }
  `,
  styles: [
    `
      ::ng-deep typeahead-container.dropdown-menu {
        display: block !important;
        z-index: 5000;
      }
    `,
  ],
  standalone: false,
})
export class TypeaheadInputComponent extends FormFieldBaseComponent<TypeaheadInputModelValueType> implements AfterViewChecked {
  protected override logName = TypeaheadInputComponentName;

  public tooltip = '';
  public placeholder = '';
  public minChars = 2;
  public debounceMs = 250;
  public maxResults = 25;
  public allowFreeText = true;
  public searchState: TypeaheadStatus = 'idle';
  public statusMessage = '';
  public statusElementId = 'typeahead-status';
  public isOpen = false;
  public readOnlyAfterSelectLocked = false;

  private sourceType: 'static' | 'vocabulary' | 'namedQuery' | 'external' = 'static';
  private queryId = '';
  private vocabRef = '';
  private provider = '';
  private resultArrayProperty = '';
  private labelField = 'label';
  private valueField = 'value';
  private valueMode: 'value' | 'optionObject' = 'value';
  private cacheResults = true;
  private historicalVocabMode: 'hide' | 'disable' = 'hide';
  private staticOptions: TypeaheadOption[] = [];
  private cache = new Map<string, TypeaheadOption[]>();
  private programmaticDisplayUpdate = false;
  private modelSubscriptionInitialised = false;
  private autoDisplaySyncInFlight: boolean = false;
  private lastAutoDisplaySyncSignature = '';
  private labelTemplate = '';
  private labelTemplatePath: (string | number)[] = [];
  private compiledItems?: DynamicScriptResponse;
  private readonly destroyRef = inject(DestroyRef);
  private readonly handlebarsTemplateService = inject(HandlebarsTemplateService);
  private readonly typeaheadDataService = inject(TypeaheadDataService);

  public readonly displayControl = new FormControl<string>('');
  public readonly selectedItem = signal<TypeaheadOption | null>(null);
  public readonly suggestions$: Observable<TypeaheadOption[]> = defer(() =>
    from(this.lookup(String(this.displayControl.value ?? '')))
  );

  @Input() public override model?: TypeaheadInputModel;

  protected get getFormComponent(): FormComponent {
    return this.formComponent;
  }

  protected override setPropertiesFromComponentMapEntry(formFieldCompMapEntry: FormFieldCompMapEntry): void {
    super.setPropertiesFromComponentMapEntry(formFieldCompMapEntry);
    this.statusElementId = `${this.name ?? 'typeahead'}-status`;

    const cfg =
      (this.componentDefinition?.config as TypeaheadInputFieldComponentConfig) ??
      new TypeaheadInputFieldComponentConfig();
    this.tooltip = this.getStringProperty('tooltip');
    this.placeholder = String(cfg.placeholder ?? '');
    this.sourceType = cfg.sourceType ?? 'static';
    this.queryId = String(cfg.queryId ?? '').trim();
    this.vocabRef = String(cfg.vocabRef ?? '').trim();
    this.provider = String(cfg.provider ?? '').trim();
    this.resultArrayProperty = String(cfg.resultArrayProperty ?? '').trim();
    this.labelField = String(cfg.labelField ?? 'label').trim() || 'label';
    this.labelTemplate = String(cfg.labelTemplate ?? '').trim();
    this.labelTemplatePath = [
      ...(this.formFieldCompMapEntry?.lineagePaths?.formConfig ?? []),
      'component',
      'config',
      'labelTemplate',
    ];
    this.compiledItems = undefined;
    this.valueField = String(cfg.valueField ?? 'value').trim() || 'value';
    this.minChars = Number.isInteger(cfg.minChars) && (cfg.minChars ?? 0) >= 0 ? Number(cfg.minChars) : 2;
    this.debounceMs = Number.isInteger(cfg.debounceMs) && (cfg.debounceMs ?? 0) >= 0 ? Number(cfg.debounceMs) : 250;
    this.maxResults = Number.isInteger(cfg.maxResults) && (cfg.maxResults ?? 0) > 0 ? Number(cfg.maxResults) : 25;
    this.allowFreeText = cfg.requireSelection !== true;
    this.valueMode = cfg.valueMode === 'optionObject' ? 'optionObject' : 'value';
    this.cacheResults = cfg.cacheResults ?? this.sourceType !== 'namedQuery';
    this.historicalVocabMode = cfg.historicalVocabMode === 'disable' ? 'disable' : 'hide';
    this.readOnlyAfterSelectLocked = Boolean(cfg.readOnlyAfterSelect) && Boolean(this.model?.getValue());
    this.staticOptions = Array.isArray(cfg.staticOptions) ? cfg.staticOptions : [];

    this.applyInitialDisplayFromModel();
    this.bindModelValueSync();
    if (this.isDisabled) {
      this.setDisabled(true, { emitEvent: false, onlySelf: true });
    }
    this.displayControl.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(value => {
      if (this.programmaticDisplayUpdate) {
        return;
      }
      if (this.selectedItem() !== null) {
        this.selectedItem.set(null);
      }
      this.onInputTextChanged(String(value ?? ''));
    });
  }

  protected override async initData(): Promise<void> {
    if (!this.validateConfiguration()) {
      return;
    }
    await this.prepareLabelTemplate();
    await this.resolvePrepopulatedLabel();
  }


  public ngAfterViewChecked(): void {
    if (!this.shouldAutoSyncDisplayFromModel()) {
      return;
    }
    const signature = this.getAutoDisplaySyncSignature();
    if (!signature || signature === this.lastAutoDisplaySyncSignature || this.autoDisplaySyncInFlight) {
      return;
    }
    this.autoDisplaySyncInFlight = true;
    const p = this.syncDisplayFromModel();
    void p.then(() => {
      this.lastAutoDisplaySyncSignature = signature;
    }).finally(() => {
      this.autoDisplaySyncInFlight = false;
    });
  }

  public onSelect(event: TypeaheadMatch): void {
    const selected = (event?.item ?? null) as TypeaheadOption | null;
    if (!selected || selected.disabled === true) {
      return;
    }
    this.isOpen = false;
    this.searchState = 'idle';
    this.statusMessage = '';
    this.setDisplayValue(selected.label);
    this.setModelFromOption(selected);
    this.selectedItem.set(selected);
    if (
      this.readOnlyAfterSelectLocked ||
      (this.componentDefinition?.config as TypeaheadInputFieldComponentConfig)?.readOnlyAfterSelect
    ) {
      this.readOnlyAfterSelectLocked = true;
    }
  }

  public onBlur(): void {
    this.isOpen = false;
    const text = String(this.displayControl.value ?? '').trim();
    if (!text) {
      this.setModelValue(null);
      return;
    }
    if (!this.allowFreeText) {
      return;
    }
    this.setModelFromFreeText(text);
  }

  public setDisabled(disabled: boolean, opts?: DisabledStateOptions): void {
    const currentDisabled = this.isDisabled;
    try {
      if (!disabled && this.formControl?.disabled) {
        this.formControl.enable(opts);
      } else if (disabled && this.formControl?.enabled) {
        this.formControl.disable(opts);
      }
      if (!disabled && this.displayControl.disabled) {
        this.displayControl.enable(opts);
      } else if (disabled && this.displayControl.enabled) {
        this.displayControl.disable(opts);
      }
      if (this.componentDefinition?.config) {
        this.componentDefinition.config.disabled = disabled;
      }
    } catch (error) {
      if (this.componentDefinition?.config) {
        this.componentDefinition.config.disabled = currentDisabled;
      }
      this.loggerService.error(
        `Could not set typeahead disabled state with value ${disabled} and opts ${JSON.stringify(opts)}.`,
        error
      );
    }
  }

  private onInputTextChanged(text: string): void {
    if (this.isDisabled || this.isReadonly || this.readOnlyAfterSelectLocked) {
      return;
    }
    this.isOpen = text.length >= this.minChars;
    if (!text) {
      this.searchState = 'idle';
      this.statusMessage = '';
      this.isOpen = false;
      if (this.allowFreeText) {
        this.setModelValue(null);
      }
      return;
    }
    if (text.length < this.minChars) {
      this.searchState = 'idle';
      this.statusMessage = '';
      this.isOpen = false;
    }
  }

  public onDropdownShown(): void {
    this.isOpen = true;
  }

  public onDropdownHidden(): void {
    this.isOpen = false;
  }

  private validateConfiguration(): boolean {
    if (this.sourceType === 'vocabulary' && !this.vocabRef) {
      this.searchState = 'misconfigured';
      this.statusMessage = 'Missing vocabRef for vocabulary typeahead source';
      return false;
    }
    if (this.sourceType === 'namedQuery' && !this.queryId) {
      this.searchState = 'misconfigured';
      this.statusMessage = 'Missing queryId for namedQuery typeahead source';
      return false;
    }
    if (this.sourceType === 'external' && !this.provider) {
      this.searchState = 'misconfigured';
      this.statusMessage = 'Missing provider for external typeahead source';
      return false;
    }
    if (this.sourceType === 'static' && this.staticOptions.length === 0) {
      this.searchState = 'misconfigured';
      this.statusMessage = 'Missing staticOptions for static typeahead source';
      return false;
    }
    this.searchState = 'idle';
    this.statusMessage = '';
    return true;
  }

  private async lookup(term: string, includeHistoricalValues = this.sourceType === 'vocabulary'): Promise<TypeaheadOption[]> {
    if (!this.validateConfiguration()) {
      return [];
    }
    const trimmedTerm = term.trim();
    if (trimmedTerm.length < this.minChars) {
      return [];
    }
    const cacheKey = `${this.sourceType}:${includeHistoricalValues ? 'historical' : 'current'}:${trimmedTerm}`;
    if (this.cacheResults && this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey) ?? [];
      this.searchState = cached.length > 0 ? 'idle' : 'no-results';
      return cached;
    }

    this.searchState = 'loading';
    this.statusMessage = '';
    try {
      let options: TypeaheadOption[] = [];
      if (this.sourceType === 'static') {
        options = await this.typeaheadDataService.searchStatic(trimmedTerm, this.staticOptions, this.maxResults);
      } else if (this.sourceType === 'vocabulary') {
        options = await this.typeaheadDataService.searchVocabularyEntries(
          this.vocabRef,
          trimmedTerm,
          this.maxResults,
          0,
          includeHistoricalValues
        );
      } else if (this.sourceType === 'external') {
        options = await this.typeaheadDataService.searchExternal(
          this.provider,
          trimmedTerm,
          this.resultArrayProperty,
          this.labelField,
          this.valueField
        );
      } else {
        options = await this.typeaheadDataService.searchNamedQuery(
          this.queryId,
          trimmedTerm,
          0,
          this.maxResults,
          this.labelField,
          this.valueField
        );
      }
      options = this.filterHistoricalOptions(options);
      options = this.applyTemplateLabels(options);

      this.searchState = options.length > 0 ? 'idle' : 'no-results';
      if (this.cacheResults) {
        this.cache.set(cacheKey, options);
      }
      return options;
    } catch (error) {
      this.loggerService.warn(`${this.logName}: typeahead lookup failed`, error);
      this.searchState = 'error';
      this.statusMessage = 'Unable to fetch matches';
      return [];
    }
  }

  private applyInitialDisplayFromModel(): void {
    const value = this.model?.getValue();
    if (this.valueMode === 'optionObject' && this.isOptionObjectValue(value)) {
      this.setDisplayValue(value.label);
      return;
    }
    if (this.valueMode === 'value' && typeof value === 'string') {
      this.setDisplayValue(value);
      return;
    }
    this.setDisplayValue('');
  }

  private bindModelValueSync(): void {
    if (this.modelSubscriptionInitialised || !this.formControl) {
      return;
    }
    this.modelSubscriptionInitialised = true;
    this.formControl.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      void this.syncDisplayFromModel();
    });
  }

  private async syncDisplayFromModel(): Promise<void> {
    this.applyInitialDisplayFromModel();
    await this.resolvePrepopulatedLabel();
  }

  private async resolvePrepopulatedLabel(): Promise<void> {
    if (this.valueMode !== 'value') {
      return;
    }
    const storedValue = this.model?.getValue();
    if (typeof storedValue !== 'string' || !storedValue.trim()) {
      return;
    }
    if (this.sourceType === 'static') {
      const found = this.staticOptions.find(opt => opt.value === storedValue || opt.label === storedValue);
      if (found?.label) {
        this.setDisplayValue(found.label);
      }
      return;
    }
    try {
      const matches = await this.lookup(storedValue, true);
      const exactMatch = matches.find(opt => opt.value === storedValue || opt.label === storedValue);
      if (exactMatch?.label) {
        this.setDisplayValue(exactMatch.label);
      }
    } catch {
      // Non-blocking label resolution by design.
    }
  }

  private shouldAutoSyncDisplayFromModel(): boolean {
    if (this.programmaticDisplayUpdate) {
      return false;
    }
    if (String(this.displayControl.value ?? '').trim().length > 0) {
      return false;
    }
    const value = this.model?.getValue();
    if (this.valueMode === 'optionObject' && this.isOptionObjectValue(value)) {
      return String(value.label ?? '').trim().length > 0;
    }
    return typeof value === 'string' && value.trim().length > 0;
  }

  private getAutoDisplaySyncSignature(): string {
    const value = this.model?.getValue();
    if (this.valueMode === 'optionObject' && this.isOptionObjectValue(value)) {
      return `option:${value.value}:${value.label}`;
    }
    return typeof value === 'string' ? `value:${value}` : '';
  }

  private setModelFromOption(option: TypeaheadOption): void {
    if (this.valueMode === 'optionObject') {
      this.setModelValue({
        label: option.label,
        value: option.value,
        sourceType: option.sourceType,
      });
      return;
    }
    this.setModelValue(option.value);
  }

  private setModelFromFreeText(text: string): void {
    if (this.valueMode === 'optionObject') {
      this.setModelValue({
        label: text,
        value: text,
        sourceType: 'freeText',
      });
      return;
    }
    this.setModelValue(text);
  }

  private setDisplayValue(value: string): void {
    this.programmaticDisplayUpdate = true;
    this.displayControl.setValue(value, { emitEvent: false });
    this.programmaticDisplayUpdate = false;
  }

  private setModelValue(value: TypeaheadInputModelValueType): void {
    this.model?.setValue(value);
    this.formControl.markAsDirty();
    this.formControl.markAsTouched();
  }

  private async prepareLabelTemplate(): Promise<void> {
    if (!this.labelTemplate) {
      return;
    }
    try {
      this.compiledItems = await this.getFormComponent.getRecordCompiledItems();
    } catch (error) {
      this.loggerService.warn(
        `${this.logName}: Unable to load compiled suggestion label template, using default labels.`,
        error
      );
      this.compiledItems = undefined;
    }
  }

  private applyTemplateLabels(options: TypeaheadOption[]): TypeaheadOption[] {
    if (!this.labelTemplate || !this.compiledItems || this.labelTemplatePath.length === 0) {
      return options;
    }
    return options.map(option => {
      const label = this.renderOptionLabel(option);
      return { ...option, label };
    });
  }

  private filterHistoricalOptions(options: TypeaheadOption[]): TypeaheadOption[] {
    if (this.sourceType !== 'vocabulary') {
      return options;
    }
    const selectedValues = this.selectedValuesFromModel();
    return options.flatMap(option => {
      if (!this.isHistoricalOption(option)) {
        return [option];
      }
      if (this.historicalVocabMode === 'disable') {
        return [{ ...option, disabled: true }];
      }
      if (selectedValues.has(String(option.value ?? ''))) {
        return [option];
      }
      return [];
    });
  }

  private selectedValuesFromModel(): Set<string> {
    const values = new Set<string>();
    const value = this.model?.getValue();
    if (value === null || value === undefined) {
      return values;
    }
    if (this.isOptionObjectValue(value)) {
      values.add(String(value.value ?? ''));
      return values;
    }
    values.add(String(value));
    return values;
  }

  private isHistoricalOption(option: TypeaheadOption): boolean {
    if (option.historical === true) {
      return true;
    }
    const raw = option.raw as { historical?: unknown } | null | undefined;
    return raw?.historical === true;
  }

  private renderOptionLabel(option: TypeaheadOption): string {
    try {
      const context = {
        option,
        result: option.raw ?? option,
        raw: option.raw ?? option,
        label: option.label,
        value: option.value,
        sourceType: option.sourceType,
      };
      const extra = { libraries: this.handlebarsTemplateService.getLibraries() };
      const rendered = this.compiledItems?.evaluate(this.labelTemplatePath, context, extra);
      const output = String(rendered ?? '').trim();
      return output || option.label;
    } catch (error) {
      this.loggerService.warn(`${this.logName}: Failed to evaluate typeahead label template.`, error);
      return option.label;
    }
  }

  private isOptionObjectValue(
    value: TypeaheadInputModelValueType | undefined
  ): value is { label: string; value: string } {
    return Boolean(
      value &&
      typeof value === 'object' &&
      'label' in value &&
      'value' in value &&
      typeof value.label === 'string' &&
      typeof value.value === 'string'
    );
  }
}
