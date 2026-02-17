import { DOCUMENT } from '@angular/common';
import { Component, inject, Injector, Input } from '@angular/core';
import { FormFieldBaseComponent, FormFieldCompMapEntry, TranslationService } from "@researchdatabox/portal-ng-common";
import { FormComponent } from "../form.component";
import {
  FormValidatorComponentErrors,
  FormValidatorSummaryErrors,
  GroupFieldComponentName,
  GroupFieldModelName,
  TabContentComponentName,
  TabContentLayoutName,
  ValidationSummaryComponentName,
} from "@researchdatabox/sails-ng-common";
import { TabComponent } from './tab.component';


@Component({
  selector: 'redbox-validation-summary-field',
  template: `
    @let validationList = allValidationErrorsDisplay;
    @if (validationList.length === 0) {
      <div class="alert alert-info" role="alert">
        The form is valid.
      </div>
    }
    @if (validationList.length > 0) {
      <div class="alert alert-danger mt-3" role="alert">
        <p class="mb-2">{{ '@dmpt-form-validation-summary-header' | i18next }}</p>
        <div class="validation-summary-list mb-0">
          @for (summary of validationList; track summary.id ?? summary.message ?? $index) {
            @if (summary.errors.length > 0) {
              <div class="validation-summary-item">
                @if (summary.id) {
                  <a [attr.data-validation-summary-id]="summary.id"
                     [attr.data-validation-summary-message]="summary.message"
                     [attr.href]="'#' + summary.id"
                     (click)="onValidationSummaryClick($event, summary)">{{ getValidationSummaryLabel(summary) }}</a>
                } @else if (summary.message) {
                  <span [attr.data-validation-summary-id]="summary.id"
                        [attr.data-validation-summary-message]="summary.message">{{ getValidationSummaryLabel(summary) }}</span>
                } @else {
                  <span [attr.data-validation-summary-id]="summary.id"
                        [attr.data-validation-summary-message]="summary.message">{{ getValidationSummaryLabel(summary) }}</span>
                }
                <ul class="validation-summary-errors mb-0">
                  @for (error of summary.errors; track trackValidationError(error, $index)) {
                    @if (error.message) {
                      <li [attr.data-validation-error-class]="error.class"
                          [attr.data-validation-error-message]="error.message">{{ error.message | i18next: error.params }}</li>
                    }
                  }
                </ul>
              </div>
            }
          }
        </div>
      </div>
    }
  `,
  styles: [`
    .validation-summary-list {
      margin: 0;
    }
    .validation-summary-item + .validation-summary-item {
      margin-top: 0.5rem;
    }
    .validation-summary-errors {
      margin-top: 0.25rem;
      margin-left: 1rem;
      padding-left: 1.25rem;
    }
  `],
  standalone: false
})
export class ValidationSummaryFieldComponent extends FormFieldBaseComponent<string> {
  protected override logName = ValidationSummaryComponentName;

  /**
   * The model associated with this component.
   *
   * @type {FieldModel<any>}
   * @memberof FieldComponent
   */
  @Input() public override model?: never;

  private _injector = inject(Injector);
  private readonly doc = inject(DOCUMENT);
  private readonly translationService = inject(TranslationService);
  private readonly focusableSelector = [
    'input:not([type="hidden"]):not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    'button:not([disabled])',
    'a[href]:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(',');

  get allValidationErrorsDisplay(): FormValidatorSummaryErrors[] {
    return this.getFormComponent?.getValidationErrors() ?? [];
  }

  public trackValidationError(error: FormValidatorComponentErrors, errorIndex: number): string {
    return `${error.class}-${error.message}-${errorIndex}`;
  }

  public onValidationSummaryClick(event: MouseEvent, summary: FormValidatorSummaryErrors): void {
    event.preventDefault();
    void this.revealAndFocusValidationTarget(summary);
  }

  public getValidationSummaryLabel(summary: FormValidatorSummaryErrors): string {
    const lineageLabels = this.getLineageLabels(summary);
    const leafLabel = this.getLeafValidationLabel(summary);
    if (lineageLabels.length > 0) {
      if (lineageLabels[lineageLabels.length - 1] !== leafLabel) {
        lineageLabels.push(leafLabel);
      }
      return lineageLabels.join(' - ');
    }
    return leafLabel;
  }

  private async revealAndFocusValidationTarget(summary: FormValidatorSummaryErrors): Promise<void> {
    this.revealTabParents(summary.lineagePaths?.angularComponents ?? []);
    await new Promise((resolve) => setTimeout(resolve, 0));
    this.focusValidationTarget(summary);
  }

  private revealTabParents(angularPath: Array<string | number>): void {
    if (angularPath.length < 2) {
      return;
    }
    for (let index = 0; index < angularPath.length - 1; index++) {
      const containerName = String(angularPath[index]);
      const targetTabId = String(angularPath[index + 1]);
      const candidate = this.findComponentEntryByName(containerName);
      if (candidate?.component instanceof TabComponent) {
        candidate.component.selectTab(targetTabId);
      }
    }
  }

  private focusValidationTarget(summary: FormValidatorSummaryErrors): void {
    const linkedElement = summary.id ? this.doc.getElementById(summary.id) : null;
    if (linkedElement instanceof HTMLElement) {
      this.scrollAndFocus(linkedElement);
      return;
    }

    const entry = this.findComponentEntryFromLineage(summary.lineagePaths?.angularComponents ?? []);
    const targetElement =
      entry?.componentRef?.location?.nativeElement ??
      entry?.layoutRef?.location?.nativeElement;
    if (targetElement instanceof HTMLElement) {
      const focusable = this.findFocusableElement(targetElement) ?? targetElement;
      this.scrollAndFocus(focusable);
    }
  }

  private scrollAndFocus(element: HTMLElement): void {
    element.scrollIntoView({
      behavior: 'smooth',
      block: 'center'
    });
    if (typeof element.focus === 'function') {
      element.focus({ preventScroll: true });
    }
  }

  private findFocusableElement(parent: HTMLElement): HTMLElement | null {
    const focusable = parent.querySelector(this.focusableSelector);
    return focusable instanceof HTMLElement ? focusable : null;
  }

  private getLineageLabels(summary: FormValidatorSummaryErrors): string[] {
    const formConfigLabels = this.getLineageLabelsFromFormConfig(summary);
    if (formConfigLabels.length > 0) {
      return formConfigLabels;
    }

    const labels: string[] = [];
    const path = summary.lineagePaths?.angularComponents ?? [];
    let currentEntries = this.getFormComponent?.componentDefArr ?? [];

    for (let index = 0; index < path.length; index++) {
      const segment = path[index];
      const segmentName = String(segment);
      const entry = currentEntries.find((item) => item.compConfigJson?.name === segmentName);
      if (!entry) {
        if (typeof segment === 'number' || /^\d+$/.test(segmentName)) {
          continue;
        }
        break;
      }

      const labelKey = this.getEntryLabel(entry);
      if (labelKey) {
        const isLeaf = index === path.length - 1;
        const includeLabel =
          isLeaf ||
          this.isGroupEntry(entry) ||
          (this.includeTabLabel && this.isTabEntry(entry));
        if (includeLabel) {
          labels.push(this.translate(labelKey));
        }
      }

      currentEntries = entry.component?.formFieldCompMapEntries ?? [];
    }

    return labels;
  }

  private getLineageLabelsFromFormConfig(summary: FormValidatorSummaryErrors): string[] {
    const labels: string[] = [];
    const formPath = summary.lineagePaths?.formConfig ?? [];
    const formConfig = (this.getFormComponent as any)?.formDefMap?.formConfig as Record<string, unknown> | undefined;
    if (!formConfig || formPath.length === 0) {
      return labels;
    }

    let current: unknown = formConfig;
    for (let index = 0; index < formPath.length; index++) {
      const segment = formPath[index] as string | number;
      if (current === null || current === undefined || (typeof current !== 'object' && !Array.isArray(current))) {
        break;
      }
      current = (current as any)[segment];

      if (!this.isFormComponentDefinitionObject(current)) {
        continue;
      }

      const labelKey = this.getDefinitionLabel(current);
      if (!labelKey) {
        continue;
      }

      const isLeaf = index === formPath.length - 1;
      const includeLabel =
        isLeaf ||
        this.isGroupDefinition(current) ||
        (this.includeTabLabel && this.isTabDefinition(current));
      if (includeLabel) {
        labels.push(this.translate(labelKey));
      }
    }

    return labels;
  }

  private getEntryLabel(entry: FormFieldCompMapEntry): string | null {
    const layoutConfig = entry.compConfigJson?.layout?.config as { label?: string; buttonLabel?: string } | undefined;
    if (this.isTabEntry(entry)) {
      return layoutConfig?.label ?? layoutConfig?.buttonLabel ?? null;
    }
    return layoutConfig?.label ?? (entry.compConfigJson?.component?.config as { label?: string } | undefined)?.label ?? null;
  }

  private isFormComponentDefinitionObject(value: unknown): value is { component?: { class?: string; config?: { label?: string } }; model?: { class?: string }; layout?: { class?: string; config?: { label?: string; buttonLabel?: string } } } {
    return !!value && typeof value === 'object' && ('component' in (value as object) || 'layout' in (value as object) || 'model' in (value as object));
  }

  private getDefinitionLabel(definition: { component?: { class?: string; config?: { label?: string } }; layout?: { class?: string; config?: { label?: string; buttonLabel?: string } } }): string | null {
    if (this.isTabDefinition(definition)) {
      return definition.layout?.config?.label ?? definition.layout?.config?.buttonLabel ?? definition.component?.config?.label ?? null;
    }
    return definition.layout?.config?.label ?? definition.component?.config?.label ?? null;
  }

  private isGroupDefinition(definition: { component?: { class?: string }; model?: { class?: string } }): boolean {
    return definition.component?.class === GroupFieldComponentName || definition.model?.class === GroupFieldModelName;
  }

  private isTabDefinition(definition: { component?: { class?: string }; layout?: { class?: string } }): boolean {
    return definition.component?.class === TabContentComponentName || definition.layout?.class === TabContentLayoutName;
  }

  private isGroupEntry(entry: FormFieldCompMapEntry): boolean {
    return entry.compConfigJson?.component?.class === GroupFieldComponentName || entry.compConfigJson?.model?.class === GroupFieldModelName;
  }

  private isTabEntry(entry: FormFieldCompMapEntry): boolean {
    return entry.compConfigJson?.component?.class === TabContentComponentName || entry.compConfigJson?.layout?.class === TabContentLayoutName;
  }

  private get includeTabLabel(): boolean {
    const config = this.formFieldCompMapEntry?.compConfigJson?.component?.config as { includeTabLabel?: boolean } | undefined;
    return config?.includeTabLabel === true;
  }

  private getLeafValidationLabel(summary: FormValidatorSummaryErrors): string {
    if (summary.message) {
      return this.translate(summary.message);
    }
    if (summary.id) {
      return summary.id;
    }
    return this.translate("@validator-label-default");
  }

  private translate(key: string): string {
    const translated = this.translationService.t(key);
    if (translated === undefined || translated === null || translated === '') {
      return key;
    }
    const result = typeof translated === 'string' ? translated : String(translated);
    return result === 'undefined' ? key : result;
  }

  private findComponentEntryFromLineage(angularPath: Array<string | number>): FormFieldCompMapEntry | undefined {
    let currentEntries = this.getFormComponent?.componentDefArr ?? [];
    let currentEntry: FormFieldCompMapEntry | undefined;

    for (const segment of angularPath) {
      const segmentName = String(segment);
      currentEntry = currentEntries.find((entry) => entry.compConfigJson?.name === segmentName);
      if (!currentEntry) {
        return undefined;
      }
      currentEntries = currentEntry.component?.formFieldCompMapEntries ?? [];
    }

    return currentEntry;
  }

  private findComponentEntryByName(name: string, entries: FormFieldCompMapEntry[] = this.getFormComponent?.componentDefArr ?? []): FormFieldCompMapEntry | undefined {
    for (const entry of entries) {
      if (entry.compConfigJson?.name === name) {
        return entry;
      }
      const childEntry = this.findComponentEntryByName(name, entry.component?.formFieldCompMapEntries ?? []);
      if (childEntry) {
        return childEntry;
      }
    }
    return undefined;
  }

  private get getFormComponent(): FormComponent {
    return this._injector.get(FormComponent);
  }

}
