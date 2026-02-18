import { AfterViewChecked, Component, ComponentRef, HostBinding, Injector, ViewChild, ViewContainerRef, inject } from '@angular/core';
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
            class="btn w-100 text-left p-0 border-0 bg-transparent text-decoration-none d-flex align-items-center"
            type="button"
            [attr.aria-expanded]="isOpen"
            [attr.aria-controls]="panelContentId"
            (click)="toggleOpen()"
          >
            <span class="panel-toggle-icon" aria-hidden="true">{{ isOpen ? '▾' : '▸' }}</span>
            {{ panelLabel }}
          </button>
        </h4>
      </div>
      <div class="panel-collapse collapse" [class.show]="isOpen" [attr.id]="panelContentId">
        @if (isOpen) {
          <div class="panel-body">
            <ng-container #componentContainer></ng-container>
          </div>
        }
      </div>
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

  public override componentDefinition?: AccordionPanelFieldComponentDefinitionFrame;
  panel?: AccordionPanelFormComponentDefinitionFrame;
  panelIndex = 0;
  isOpen = true;

  @ViewChild('componentContainer', { read: ViewContainerRef, static: false })
  componentsDefinitionsContainerRef?: ViewContainerRef;

  componentRefs: ComponentRef<FormBaseWrapperComponent<unknown>>[] = [];
  private componentInstances: FormFieldBaseComponent<unknown>[] = [];
  private formDefMap?: FormComponentsMap;
  private childrenInitialised = false;
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
    if (open && !this.isOpen) {
      this.pendingOpenInitialise = true;
    }
    this.isOpen = open;
  }

  public toggleOpen(): void {
    this.isOpen = !this.isOpen;
    if (this.isOpen) {
      this.pendingOpenInitialise = true;
    }
  }

  ngAfterViewChecked(): void {
    if (this.isOpen && this.pendingOpenInitialise) {
      this.pendingOpenInitialise = false;
      void this.initialiseChildrenIfNeeded();
    }
  }

  public get panelLabel(): string {
    const layoutConfig = this.panel?.layout?.config as { buttonLabel?: string; label?: string } | undefined;
    const componentConfig = this.panel?.component?.config as { label?: string } | undefined;
    return layoutConfig?.buttonLabel ?? layoutConfig?.label ?? componentConfig?.label ?? this.panel?.name ?? `${this.panelIndex}`;
  }

  public get panelContentId(): string {
    return `${this.panel?.name ?? this.panelIndex}-accordion-panel-content`;
  }

  public override get formFieldBaseComponents(): FormFieldBaseComponent<unknown>[] {
    return this.componentInstances;
  }

  public override get formFieldCompMapEntries(): FormFieldCompMapEntry[] {
    return this.formDefMap?.components ?? [];
  }

  protected get formComponentRef(): FormComponent {
    return this.injector.get(FormComponent);
  }

  private async initialiseChildrenIfNeeded(): Promise<void> {
    await this.untilViewIsInitialised();
    if (!this.componentsDefinitionsContainerRef) {
      return;
    }
    if (this.childrenInitialised && this.componentsDefinitionsContainerRef.length > 0) {
      return;
    }
    if (this.childrenInitialised) {
      this.componentRefs = [];
      this.componentInstances = [];
    }

    const formConfig = this.formComponentRef.formDefMap?.formConfig;
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
  }
}
