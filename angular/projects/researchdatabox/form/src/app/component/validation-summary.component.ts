import { Component, inject, Injector, Input } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { FormFieldBaseComponent, FormFieldCompMapEntry, TranslationService } from "@researchdatabox/portal-ng-common";
import { FormComponent } from "../form.component";
import { TabComponent } from './tab.component';
import {
  FormValidatorComponentErrors,
  FormValidatorSummaryErrors,
  GroupFieldComponentName,
  GroupFieldModelName,
  isTypeFieldDefinitionName,
  RepeatableComponentName,
  TabContentComponentName,
  TabContentLayoutName,
  ValidationSummaryComponentName,
} from "@researchdatabox/sails-ng-common";
import { FormComponentEventBus } from '../form-state/events/form-component-event-bus.service';
import { createLineageFieldFocusRequestEvent } from '../form-state/events/form-component-event.types';


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
      margin-left: 2rem;
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
  private readonly eventBus = inject(FormComponentEventBus);
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
    const lineagePath = summary.lineagePaths?.angularComponents ?? [];
    if (lineagePath.length > 0) {
      this.eventBus.publish(
        createLineageFieldFocusRequestEvent({
          fieldId: summary.id ?? String(lineagePath[lineagePath.length - 1]),
          targetElementId: summary.id ?? undefined,
          lineagePath,
          requestId: this.buildFocusRequestId(),
          source: 'validation-summary',
          sourceId: this.getFormComponent.eventScopeId
        })
      );
    }
    void this.revealAndFocusValidationTarget(summary);
  }

  public getValidationSummaryLabel(summary: FormValidatorSummaryErrors): string {
    const lineageLabels = this.getLineageLabels(summary);
    const leafLabel = this.getLeafValidationLabel(summary);
    if (lineageLabels.length > 0) {
      const shouldAppendLeaf =
        !!leafLabel &&
        (summary.message !== null || !summary.id || leafLabel !== summary.id);
      if (shouldAppendLeaf && lineageLabels[lineageLabels.length - 1] !== leafLabel) {
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
          this.isRepeatableEntry(entry) ||
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

      const labelKey = this.getDefinitionLabel(current);
      if (!labelKey) {
        continue;
      }

      const isLeaf = index === formPath.length - 1;
      const includeLabel =
        isLeaf ||
        this.isGroupDefinition(current) ||
        this.isRepeatableDefinition(current) ||
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

  private getDefinitionLabel(definition: unknown): string | null {
    if (!definition || typeof definition !== 'object') {
      return null;
    }
    const def = definition as {
      layout?: { config?: { label?: string; buttonLabel?: string } };
      component?: { config?: { label?: string } };
    };
    const layoutConfig = def.layout?.config;
    const componentConfig = def.component?.config;
    if (this.isTabDefinition(definition)) {
      return layoutConfig?.label ?? layoutConfig?.buttonLabel ?? componentConfig?.label ?? null;
    }
    return layoutConfig?.label ?? componentConfig?.label ?? null;
  }

  private isGroupDefinition(definition: unknown): boolean {
    if (!definition || typeof definition !== 'object') {
      return false;
    }
    const byComponent = isTypeFieldDefinitionName((definition as { component?: unknown }).component, GroupFieldComponentName);
    const model = (definition as { model?: unknown }).model;
    const byModel = isTypeFieldDefinitionName(model, GroupFieldModelName);
    return byComponent || byModel;
  }

  private isTabDefinition(definition: unknown): boolean {
    if (!definition || typeof definition !== 'object') {
      return false;
    }
    const byComponent = isTypeFieldDefinitionName((definition as { component?: unknown }).component, TabContentComponentName);
    const layout = (definition as { layout?: unknown }).layout;
    const byLayout = isTypeFieldDefinitionName(layout, TabContentLayoutName);
    return byComponent || byLayout;
  }

  private isRepeatableDefinition(definition: unknown): boolean {
    if (!definition || typeof definition !== 'object') {
      return false;
    }
    return isTypeFieldDefinitionName((definition as { component?: unknown }).component, RepeatableComponentName);
  }

  private isGroupEntry(entry: FormFieldCompMapEntry): boolean {
    return this.isGroupDefinition(entry.compConfigJson);
  }

  private isRepeatableEntry(entry: FormFieldCompMapEntry): boolean {
    return this.isRepeatableDefinition(entry.compConfigJson);
  }

  private isTabEntry(entry: FormFieldCompMapEntry): boolean {
    return this.isTabDefinition(entry.compConfigJson);
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
    return result;
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

  private buildFocusRequestId(): string {
    return `validation-summary-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
}
