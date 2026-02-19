import {
  AfterViewChecked,
  Component,
  ComponentRef,
  ElementRef,
  HostBinding,
  Injector,
  ViewChild,
  ViewContainerRef,
  inject,
} from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { FormFieldBaseComponent, FormFieldCompMapEntry } from '@researchdatabox/portal-ng-common';
import {
  AccordionComponentName,
  AccordionFieldComponentConfigFrame,
  AccordionFieldComponentDefinitionFrame,
  AccordionPanelComponentName,
  AccordionPanelFieldComponentDefinitionFrame,
  AccordionPanelFormComponentDefinitionFrame,
  AccordionStartingOpenModeOptionsType,
  FormConfigFrame,
  isTypeFieldDefinitionName,
  isTypeFormComponentDefinitionName,
} from '@researchdatabox/sails-ng-common';
import { merge as _merge } from 'lodash-es';
import { FormBaseWrapperComponent } from './base-wrapper.component';
import { FormService } from '../form.service';
import { FormComponentsMap } from '../form.service';
import { FormComponent } from '../form.component';

@Component({
  selector: 'redbox-form-accordion',
  template: `
    <div class="accordion-controls d-flex justify-content-end mb-3" role="group" aria-label="Accordion controls">
      <div class="btn-group btn-group-sm shadow-sm rounded-pill border border-secondary overflow-hidden">
        <button
          type="button"
          class="btn btn-outline-secondary accordion-control-btn border-0 rounded-0"
          [class.active]="allPanelsOpen"
          [disabled]="allPanelsOpen"
          (click)="expandAllPanels()"
        >
          Expand all
        </button>
        <button
          type="button"
          class="btn btn-outline-secondary accordion-control-btn border-0 border-left border-secondary rounded-0"
          [class.active]="allPanelsCollapsed"
          [disabled]="allPanelsCollapsed"
          (click)="collapseAllPanels()"
        >
          Collapse all
        </button>
      </div>
    </div>
    <ng-container #panelsContainer></ng-container>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .accordion-control-btn {
        font-weight: 600;
        letter-spacing: 0.01em;
        transition: all 0.2s ease;
      }

      .accordion-control-btn.active,
      .accordion-control-btn:disabled {
        opacity: 1;
      }
    `,
  ],
  standalone: false,
})
export class AccordionComponent extends FormFieldBaseComponent<undefined> {
  protected override logName = AccordionComponentName;
  protected formService = inject(FormService);

  public override componentDefinition?: AccordionFieldComponentDefinitionFrame;
  panels: AccordionPanelFormComponentDefinitionFrame[] = [];
  panelWrapperRefs: ComponentRef<FormBaseWrapperComponent<unknown>>[] = [];
  panelFormMapEntries: FormFieldCompMapEntry[] = [];
  panelComponents: AccordionPanelComponent[] = [];

  @ViewChild('panelsContainer', { read: ViewContainerRef, static: true })
  private panelsContainer!: ViewContainerRef;

  protected get accordionConfig(): AccordionFieldComponentConfigFrame {
    const component = this.componentDefinition;
    if (!component || !isTypeFieldDefinitionName<AccordionFieldComponentDefinitionFrame>(component, component.class)) {
      throw new Error(`Invalid accordion config ${JSON.stringify(component)}`);
    }
    return component.config ?? { panels: [], startingOpenMode: 'all-open' };
  }

  protected override async initData() {
    this.panels = this.accordionConfig.panels ?? [];
    this.panels.forEach((panel, index) => {
      panel.name = `${panel.name || index}`;
    });
  }

  protected override async setComponentReady(): Promise<void> {
    await this.untilViewIsInitialised();

    this.panelWrapperRefs.forEach(panelWrapperRef => panelWrapperRef?.destroy());
    this.panelsContainer.clear();
    this.panelWrapperRefs = [];
    this.panelFormMapEntries = [];
    this.panelComponents = [];

    for (let index = 0; index < this.panels.length; index++) {
      const panel = this.panels[index];

      const panelWrapperRef = this.panelsContainer.createComponent(FormBaseWrapperComponent<null>);
      const fieldMapDefEntry: FormFieldCompMapEntry = {
        componentClass: AccordionPanelComponent,
        compConfigJson: panel,
        lineagePaths: this.formService.buildLineagePaths(this.formFieldCompMapEntry?.lineagePaths, {
          angularComponents: [panel?.name],
          dataModel: [],
          formConfig: ['component', 'config', 'panels', index],
        }),
      };

      await panelWrapperRef.instance.initWrapperComponent(fieldMapDefEntry, false);

      this.panelFormMapEntries.push(fieldMapDefEntry);
      this.panelWrapperRefs.push(panelWrapperRef);

      const panelInstance = fieldMapDefEntry.component;
      if (panelInstance && panelInstance instanceof AccordionPanelComponent) {
        panelInstance.panelIndex = index;
        panelInstance.registerParentAccordion(this);
        this.panelComponents.push(panelInstance);
      }

      if (fieldMapDefEntry.formControlMap && this.formFieldCompMapEntry != null) {
        if (this.formFieldCompMapEntry.formControlMap == null) {
          this.formFieldCompMapEntry.formControlMap = {};
        }
        _merge(this.formFieldCompMapEntry.formControlMap, fieldMapDefEntry.formControlMap);
      }
    }

    this.applyStartingOpenMode(this.accordionConfig.startingOpenMode ?? 'all-open');
    await super.setComponentReady();
  }

  private applyStartingOpenMode(mode: AccordionStartingOpenModeOptionsType): void {
    if (mode === 'first-open') {
      this.panelComponents.forEach((panel, index) => panel.setOpen(index === 0));
      return;
    }
    if (mode === 'last-open') {
      const lastIndex = this.panelComponents.length - 1;
      this.panelComponents.forEach((panel, index) => panel.setOpen(index === lastIndex));
      return;
    }
    this.panelComponents.forEach(panel => panel.setOpen(true));
  }

  public expandAllPanels(): void {
    this.panelComponents.forEach(panel => panel.setOpen(true));
  }

  public collapseAllPanels(): void {
    this.panelComponents.forEach(panel => panel.setOpen(false));
  }

  public get allPanelsOpen(): boolean {
    return this.panelComponents.length > 0 && this.panelComponents.every(panel => panel.isOpen);
  }

  public get allPanelsCollapsed(): boolean {
    return this.panelComponents.length > 0 && this.panelComponents.every(panel => !panel.isOpen);
  }

  public focusHeaderAtIndex(index: number): void {
    this.panelComponents[index]?.focusHeader();
  }

  public focusNextHeader(currentIndex: number): void {
    if (this.panelComponents.length === 0) {
      return;
    }
    const nextIndex = (currentIndex + 1) % this.panelComponents.length;
    this.focusHeaderAtIndex(nextIndex);
  }

  public focusPreviousHeader(currentIndex: number): void {
    if (this.panelComponents.length === 0) {
      return;
    }
    const previousIndex = (currentIndex - 1 + this.panelComponents.length) % this.panelComponents.length;
    this.focusHeaderAtIndex(previousIndex);
  }

  public override get formFieldBaseComponents(): FormFieldBaseComponent<unknown>[] {
    return this.panelComponents.flatMap(panel => panel.formFieldBaseComponents);
  }

  public override get formFieldCompMapEntries(): FormFieldCompMapEntry[] {
    return this.panelFormMapEntries;
  }

  @HostBinding('id') get hostId(): string {
    return this.name ?? '';
  }
}

@Component({
  selector: 'redbox-form-accordion-panel',
  template: `
    <div class="panel panel-default shadow-sm">
      <div class="panel-heading">
        <h4 class="panel-title mb-0">
          <button
            #panelToggleButton
            class="btn w-100 text-left p-0 border-0 bg-transparent text-decoration-none d-flex align-items-center"
            type="button"
            [attr.id]="panelHeaderId"
            [attr.aria-expanded]="isOpen"
            [attr.aria-controls]="panelContentId"
            (keydown)="onHeaderKeyDown($event)"
            (click)="toggleOpen()"
          >
            <span class="panel-toggle-icon" aria-hidden="true">{{ isOpen ? '▾' : '▸' }}</span>
            {{ panelLabel }}
          </button>
        </h4>
      </div>
      <div
        #panelContentContainer
        class="panel-collapse collapse"
        role="region"
        [class.show]="isOpen"
        [attr.id]="panelContentId"
        [attr.aria-labelledby]="panelHeaderId"
      >
        @if (isOpen) {
          <div class="panel-body">
            <ng-container #componentContainer></ng-container>
          </div>
        }
      </div>
      <span class="sr-only" aria-live="polite">{{ ariaLiveMessage }}</span>
    </div>
  `,
  styles: [
    `
      .panel.panel-default {
        border: 0;
        border-radius: 0.5rem;
        overflow: hidden;
        margin-bottom: 1rem;
      }

      .panel-heading .btn {
        font-weight: 600;
        padding: 1rem 1.25rem !important;
        transition: background-color 0.2s ease;
      }

      .panel-toggle-icon {
        margin-right: 0.5rem;
      }
    `,
  ],
  standalone: false,
})
export class AccordionPanelComponent extends FormFieldBaseComponent<undefined> implements AfterViewChecked {
  protected override logName = AccordionPanelComponentName;
  protected formService = inject(FormService);
  private injector = inject(Injector);
  private document = inject(DOCUMENT);
  private parentAccordion?: AccordionComponent;

  public override componentDefinition?: AccordionPanelFieldComponentDefinitionFrame;
  panel?: AccordionPanelFormComponentDefinitionFrame;
  panelIndex = 0;
  isOpen = true;
  ariaLiveMessage = '';

  @ViewChild('panelToggleButton', { read: ElementRef, static: false })
  panelToggleButtonRef?: ElementRef<HTMLButtonElement>;

  @ViewChild('panelContentContainer', { read: ElementRef, static: false })
  panelContentContainerRef?: ElementRef<HTMLElement>;

  @ViewChild('componentContainer', { read: ViewContainerRef, static: false })
  componentsDefinitionsContainerRef?: ViewContainerRef;

  componentRefs: ComponentRef<FormBaseWrapperComponent<unknown>>[] = [];
  private componentInstances: FormFieldBaseComponent<unknown>[] = [];
  private formDefMap?: FormComponentsMap;
  private childrenInitialised = false;
  private childrenInitializing = false;
  private pendingOpenInitialise = false;

  protected override async initData() {
    const formCompDef = this.formFieldCompMapEntry?.compConfigJson;
    if (isTypeFormComponentDefinitionName<AccordionPanelFormComponentDefinitionFrame>(formCompDef, AccordionPanelComponentName)) {
      this.panel = formCompDef;
    }
  }

  protected override async setComponentReady(): Promise<void> {
    await this.initialiseChildrenIfNeeded();
    await super.setComponentReady();
  }

  public setOpen(open: boolean): void {
    if (!open) {
      this.preserveFocusBeforeClose();
    }
    if (open && !this.isOpen) {
      this.pendingOpenInitialise = true;
    }
    if (open !== this.isOpen) {
      this.announceState(open);
    }
    this.isOpen = open;
  }

  public toggleOpen(): void {
    this.setOpen(!this.isOpen);
  }

  ngAfterViewChecked(): void {
    if (this.isOpen && this.pendingOpenInitialise && !this.childrenInitializing) {
      this.pendingOpenInitialise = false;
      this.childrenInitializing = true;
      this.initialiseChildrenIfNeeded()
        .catch(() => undefined)
        .finally(() => {
          this.childrenInitializing = false;
        });
    }
  }

  public get panelLabel(): string {
    const layoutConfig = this.panel?.layout?.config as { buttonLabel?: string; label?: string } | undefined;
    const componentConfig = this.panel?.component?.config as { label?: string } | undefined;
    return layoutConfig?.buttonLabel ?? layoutConfig?.label ?? componentConfig?.label ?? this.panel?.name ?? `${this.panelIndex}`;
  }

  public get panelContentId(): string {
    return `${this.panelDomIdBase}-content`;
  }

  public get panelHeaderId(): string {
    return `${this.panelDomIdBase}-header`;
  }

  public override get formFieldBaseComponents(): FormFieldBaseComponent<unknown>[] {
    return this.componentInstances;
  }

  public override get formFieldCompMapEntries(): FormFieldCompMapEntry[] {
    return this.formDefMap?.components ?? [];
  }

  protected get formComponentRef(): FormComponent | null {
    return this.injector.get(FormComponent, null);
  }

  public registerParentAccordion(accordion: AccordionComponent): void {
    this.parentAccordion = accordion;
  }

  public focusHeader(): void {
    this.panelToggleButtonRef?.nativeElement?.focus();
  }

  public onHeaderKeyDown(event: KeyboardEvent): void {
    if (!this.parentAccordion) {
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
      event.preventDefault();
      this.parentAccordion.focusNextHeader(this.panelIndex);
      return;
    }
    if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
      event.preventDefault();
      this.parentAccordion.focusPreviousHeader(this.panelIndex);
      return;
    }
    if (event.key === 'Home') {
      event.preventDefault();
      this.parentAccordion.focusHeaderAtIndex(0);
      return;
    }
    if (event.key === 'End') {
      event.preventDefault();
      this.parentAccordion.focusHeaderAtIndex(this.parentAccordion.panelComponents.length - 1);
    }
  }

  private async initialiseChildrenIfNeeded(): Promise<void> {
    try {
      await this.untilViewIsInitialised();
      if (!this.componentsDefinitionsContainerRef) {
        return;
      }
      if (this.childrenInitialised && this.componentsDefinitionsContainerRef.length > 0) {
        return;
      }
      if (this.childrenInitialised) {
        this.componentRefs.forEach(componentRef => componentRef.destroy());
        this.componentRefs = [];
        this.componentInstances = [];
      }

      const formComponentRef = this.formComponentRef;
      if (!formComponentRef) {
        throw new Error('AccordionPanelComponent requires FormComponent in the injector hierarchy to initialise children.');
      }

      const formConfig = formComponentRef.formDefMap?.formConfig;
      const formComponentName = this.formFieldCompMapEntry?.compConfigJson?.name ?? '';
      const compFormConfig: FormConfigFrame = {
        name: `form-config-generated-accordion-panel-${formComponentName}`,
        componentDefinitions: this.panel?.component?.config?.componentDefinitions ?? [],
        defaultComponentConfig: formConfig?.defaultComponentConfig,
      };

      const parentLineagePaths = this.formService.buildLineagePaths(this.formFieldCompMapEntry?.lineagePaths, {
        angularComponents: [],
        dataModel: [],
        formConfig: ['component', 'config', 'componentDefinitions'],
      });

      this.formDefMap = await this.formService.createFormComponentsMap(compFormConfig, parentLineagePaths);
      for (const formFieldDef of this.formDefMap.components) {
        const componentRef = this.componentsDefinitionsContainerRef.createComponent(FormBaseWrapperComponent<unknown>);
        await componentRef.instance.initWrapperComponent(formFieldDef);
        this.componentRefs.push(componentRef);
        if (componentRef.instance.componentRef?.instance) {
          this.componentInstances.push(componentRef.instance.componentRef.instance);
        }
      }

      const groupedByNameMap = this.formService.groupComponentsByName(this.formDefMap);
      if (this.formFieldCompMapEntry) {
        this.formFieldCompMapEntry.formControlMap = groupedByNameMap.withFormControl;
      }
      this.childrenInitialised = true;
    } catch (error) {
      console.error('Failed to initialise accordion panel children', error);
      throw error;
    }
  }

  private preserveFocusBeforeClose(): void {
    const activeElement = this.document.activeElement as HTMLElement | null;
    const panelContentEl = this.panelContentContainerRef?.nativeElement;
    if (activeElement && panelContentEl?.contains(activeElement)) {
      this.focusHeader();
    }
  }

  private announceState(open: boolean): void {
    this.ariaLiveMessage = `${this.panelLabel} ${open ? 'expanded' : 'collapsed'}.`;
  }

  private get panelDomIdBase(): string {
    const raw = `${this.panel?.name ?? this.panelIndex}`;
    return `${raw.replace(/[^a-zA-Z0-9_-]+/g, '-')}-accordion-panel`;
  }
}
