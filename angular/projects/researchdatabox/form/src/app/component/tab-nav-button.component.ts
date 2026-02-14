import { Component, inject, signal, OnInit } from '@angular/core';
import { FormFieldBaseComponent } from '@researchdatabox/portal-ng-common';
import { FormComponent } from '../form.component';
import {
  TabNavButtonComponentName,
  TabNavButtonFieldComponentDefinitionOutline,
} from '@researchdatabox/sails-ng-common';
import { TabComponent } from './tab.component';

@Component({
  selector: 'redbox-form-tab-nav-button',
  template: `
    @if (isVisible) {
      <ng-container *ngTemplateOutlet="getTemplateRef('before')" />
      @if (endDisplayMode === 'disabled') {
        <button type="button" class="btn btn-secondary" [disabled]="!canGoPrev()" (click)="stepToTab(-1)">
          {{ prevLabel }}
        </button>
        <button type="button" class="btn btn-primary" [disabled]="!canGoNext()" (click)="stepToTab(1)">
          {{ nextLabel }}
        </button>
      }
      @if (endDisplayMode === 'hidden') {
        @if (canGoPrev()) {
          <button type="button" class="btn btn-secondary" (click)="stepToTab(-1)">{{ prevLabel }}</button>
        }
        @if (canGoNext()) {
          <button type="button" class="btn btn-primary" (click)="stepToTab(1)">{{ nextLabel }}</button>
        }
      }
      <ng-container *ngTemplateOutlet="getTemplateRef('after')" />
    }
  `,
  standalone: false,
})
export class TabNavButtonComponent extends FormFieldBaseComponent<undefined> implements OnInit {
  public override logName = TabNavButtonComponentName;
  protected override formComponent: FormComponent = inject(FormComponent);
  public override componentDefinition?: TabNavButtonFieldComponentDefinitionOutline;

  private tabComponent: TabComponent | null = null;
  private tabIds: string[] = [];
  currentTabIndex = signal<number>(0);

  get prevLabel(): string {
    return this.componentDefinition?.config?.prevLabel ?? 'Previous';
  }

  get nextLabel(): string {
    return this.componentDefinition?.config?.nextLabel ?? 'Next';
  }

  get endDisplayMode(): string {
    return this.componentDefinition?.config?.endDisplayMode ?? 'disabled';
  }

  get targetTabContainerId(): string {
    return this.componentDefinition?.config?.targetTabContainerId ?? '';
  }

  ngOnInit() {
    this.resolveTabComponent();
  }

  private resolveTabComponent() {
    if (!this.targetTabContainerId) {
      this.loggerService.warn(`${this.logName}: No targetTabContainerId configured.`);
      return;
    }
    const entry = this.formComponent.getComponentDefByName(this.targetTabContainerId);
    if (entry?.component instanceof TabComponent) {
      this.tabComponent = entry.component;
      this.tabIds = this.tabComponent.tabs.map((tab, index) => tab.name ?? `${index}`);
      this.currentTabIndex.set(this.getActiveTabIndex());
    } else {
      this.loggerService.warn(
        `${this.logName}: Target tab container '${this.targetTabContainerId}' not found or not a TabComponent.`
      );
    }
  }

  public canGoPrev(): boolean {
    if (!this.hasTargetTabs) {
      return false;
    }
    return this.getActiveTabIndex() > 0;
  }

  public canGoNext(): boolean {
    if (!this.hasTargetTabs) {
      return false;
    }
    return this.getActiveTabIndex() < this.tabIds.length - 1;
  }

  public stepToTab(step: number) {
    if (!this.hasTargetTabs) {
      return;
    }
    const newIndex = this.getActiveTabIndex() + step;
    if (newIndex >= 0 && newIndex < this.tabIds.length) {
      const tabId = this.tabIds[newIndex];
      if (this.tabComponent) {
        const result = this.tabComponent.selectTab(tabId);
        if (result.changed) {
          this.currentTabIndex.set(newIndex);
          // Replicate legacy behaviour where the viewport scrolls so the user can see the top of the tab
          const nativeElement = this.tabComponent?.formFieldCompMapEntry?.componentRef?.location.nativeElement;
          if (nativeElement) {
            nativeElement.scrollIntoView({
              behavior: 'smooth',
              block: 'start',
            });
          }
        } else {
          this.loggerService.warn(`${this.logName}: Tab selection did not change for tabId: ${tabId}`);
        }
      }
    } else {
      this.loggerService.warn(`${this.logName}: Invalid tab index: ${newIndex}`);
    }
  }

  private get hasTargetTabs(): boolean {
    return !!this.tabComponent && this.tabIds.length > 0;
  }

  private getActiveTabIndex(): number {
    const activeId = this.tabComponent?.activeTabId;
    if (activeId != null) {
      const idx = this.tabIds.indexOf(activeId);
      if (idx >= 0) {
        return idx;
      }
    }
    return this.currentTabIndex();
  }
}
