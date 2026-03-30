import { DOCUMENT } from '@angular/common';
import { Injectable, OnDestroy, inject } from '@angular/core';
import { FormFieldCompMapEntry } from '@researchdatabox/portal-ng-common';
import { LoggerService } from '@researchdatabox/portal-ng-common';
import { Subscription } from 'rxjs';
import type { FormComponent } from '../../form.component';
import { FormComponentEventBus } from './form-component-event-bus.service';
import { FieldFocusRequestEvent, FormComponentEventType } from './form-component-event.types';

@Injectable()
export class FormComponentFocusRequestCoordinator implements OnDestroy {
  private readonly logger = inject(LoggerService);
  private readonly eventBus = inject(FormComponentEventBus);
  private readonly doc = inject(DOCUMENT);

  private subscription?: Subscription;
  private formComponent?: FormComponent;
  private formScopeId = '';

  public bind(formComponent: FormComponent): void {
    this.formComponent = formComponent;
    this.formScopeId = formComponent.eventScopeId;
    this.subscription?.unsubscribe();
    this.subscription = this.eventBus
      .select$(FormComponentEventType.FIELD_FOCUS_REQUEST)
      .subscribe((event) => {
        void this.consume(event);
      });
  }

  public destroy(): void {
    this.subscription?.unsubscribe();
    this.subscription = undefined;
  }

  ngOnDestroy(): void {
    this.destroy();
  }

  private async consume(event: FieldFocusRequestEvent): Promise<void> {
    if (!this.formComponent) {
      return;
    }
    if (event.sourceId && event.sourceId !== this.formScopeId) {
      return;
    }

    const lineagePath = event.lineagePath ?? [];
    this.revealTabParents(lineagePath);
    await this.awaitPaint();

    const focused = await this.focusWithRetry(event, 3);
    if (!focused) {
      this.logger.warn('FormComponentFocusRequestCoordinator: Failed to resolve focus target.', event);
    }
  }

  private async focusWithRetry(event: FieldFocusRequestEvent, maxAttempts: number): Promise<boolean> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (this.tryFocus(event)) {
        return true;
      }
      await this.awaitMacrotask();
    }
    return false;
  }

  private tryFocus(event: FieldFocusRequestEvent): boolean {
    const options = {
      scroll: true,
      scrollOptions: {
        behavior: 'smooth',
        block: 'center'
      } as ScrollIntoViewOptions
    };

    if (event.lineagePath && event.lineagePath.length > 0) {
      const targetEntry = this.findComponentEntryFromLineage(event.lineagePath);
      if (this.hasRequestFocus(targetEntry?.component) && targetEntry.component.requestFocus(options)) {
        return true;
      }
      const entryElement =
        targetEntry?.componentRef?.location?.nativeElement ??
        targetEntry?.layoutRef?.location?.nativeElement;
      if (entryElement instanceof HTMLElement && this.focusElement(entryElement, options.scrollOptions)) {
        return true;
      }
    }

    if (event.targetElementId) {
      const byTargetId = this.doc.getElementById(event.targetElementId);
      if (byTargetId instanceof HTMLElement && this.focusElement(byTargetId, options.scrollOptions)) {
        return true;
      }
    }

    if (event.fieldId) {
      const byFieldId = this.doc.getElementById(event.fieldId);
      if (byFieldId instanceof HTMLElement && this.focusElement(byFieldId, options.scrollOptions)) {
        return true;
      }
    }

    return false;
  }

  private focusElement(element: HTMLElement, scrollOptions: ScrollIntoViewOptions): boolean {
    const focusable = this.findFocusableElement(element) ?? element;
    if (typeof focusable.scrollIntoView === 'function') {
      focusable.scrollIntoView(scrollOptions);
    }
    if (typeof focusable.focus === 'function') {
      focusable.focus({ preventScroll: true });
      return true;
    }
    return false;
  }

  private findFocusableElement(parent: HTMLElement): HTMLElement | null {
    const focusable = parent.querySelector(
      'input:not([type="hidden"]):not([disabled]),select:not([disabled]),textarea:not([disabled]),button:not([disabled]),a[href]:not([disabled]),[tabindex]:not([tabindex="-1"])'
    );
    return focusable instanceof HTMLElement ? focusable : null;
  }

  private revealTabParents(angularPath: Array<string | number>): void {
    if (!this.formComponent || angularPath.length < 2) {
      return;
    }
    for (let index = 0; index < angularPath.length - 1; index++) {
      const containerName = String(angularPath[index]);
      const targetTabId = String(angularPath[index + 1]);
      const candidate = this.findComponentEntryByName(containerName, this.formComponent.componentDefArr);
      if (this.hasSelectTab(candidate?.component)) {
        candidate.component.selectTab(targetTabId);
      }
    }
  }

  private hasSelectTab(component: unknown): component is { selectTab: (tabId: string) => unknown } {
    if (!component || typeof component !== 'object') {
      return false;
    }
    return typeof (component as { selectTab?: unknown }).selectTab === 'function';
  }

  private hasRequestFocus(component: unknown): component is { requestFocus: (options: unknown) => boolean } {
    if (!component || typeof component !== 'object') {
      return false;
    }
    return typeof (component as { requestFocus?: unknown }).requestFocus === 'function';
  }

  private findComponentEntryFromLineage(angularPath: Array<string | number>): FormFieldCompMapEntry | undefined {
    let currentEntries = this.formComponent?.componentDefArr ?? [];
    let currentEntry: FormFieldCompMapEntry | undefined;

    for (const segment of angularPath) {
      const segmentName = String(segment);
      currentEntry = currentEntries.find((entry) => entry.compConfigJson?.name === segmentName);
      if (!currentEntry) {
        const index = Number(segment);
        if (Number.isInteger(index) && index >= 0 && index < currentEntries.length) {
          currentEntry = currentEntries[index];
        }
      }
      if (!currentEntry) {
        return undefined;
      }
      currentEntries = currentEntry.component?.formFieldCompMapEntries ?? [];
    }

    return currentEntry;
  }

  private findComponentEntryByName(name: string, entries: FormFieldCompMapEntry[]): FormFieldCompMapEntry | undefined {
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

  private async awaitPaint(): Promise<void> {
    await new Promise<void>((resolve) => {
      if (typeof globalThis.requestAnimationFrame === 'function') {
        globalThis.requestAnimationFrame(() => resolve());
        return;
      }
      setTimeout(() => resolve(), 0);
    });
  }

  private async awaitMacrotask(): Promise<void> {
    await new Promise<void>((resolve) => setTimeout(() => resolve(), 0));
  }
}
