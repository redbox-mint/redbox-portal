import { Component, ViewChild, ViewContainerRef, ComponentRef, inject, Injector, HostBinding } from '@angular/core';
import { FormFieldBaseComponent, FormFieldCompMapEntry } from '@researchdatabox/portal-ng-common';
import { FormConfig, TabComponentEntryDefinition, TabComponentConfig, TabContentComponentConfig, TabComponentFormFieldLayoutDefinition } from '@researchdatabox/sails-ng-common';
import { set as _set, isEmpty as _isEmpty, cloneDeep as _cloneDeep, get as _get, isUndefined as _isUndefined, isNull as _isNull, find as _find, merge as _merge } from 'lodash-es';
import { FormComponent } from "../form.component";
import { FormBaseWrapperComponent } from './base-wrapper.component';
import { FormComponentsMap, FormService } from '../form.service';
import { DefaultLayoutComponent } from './default-layout.component';

/** 
 * TabLayout Component.
 * 
 * Note: Tab and related components will always be visible.
 */
@Component({
  selector: 'redbox-form-tab-layout',
  template: `
    <!-- Button Section -->
    <div [class]="getStringProperty('buttonSectionCssClass')" role="tablist" [attr.aria-orientation]="getStringProperty('buttonSectionAriaOrientation')">
      <!-- Loop through tabs and create buttons -->
      @for (tab of tabConfig.tabs; track $index) {
        <button class="nav-link"
                [class.active]="tabInstance && tab.id == tabInstance.selectedTabId"
                [attr.id]="tab.id + '-tab-button'"
                type="button"
                role="tab" 
                [attr.aria-selected]="tabInstance && tab.id == tabInstance.selectedTabId" 
                [attr.aria-controls]="tab.id + '-tab-content'"  
                [innerHTML]="tab.buttonLabel" (click)="selectTab(tab.id)"> 
        </button>
      } 
    </div>
    <ng-container #componentContainer ></ng-container>
  `,
  standalone: false
}) 
export class TabComponentLayout extends DefaultLayoutComponent<undefined> {
  protected override logName = "TabComponentLayout";
  public override componentDefinition?: TabComponentFormFieldLayoutDefinition;
  
  protected get tabConfig(): TabComponentConfig {
    return (this.formFieldCompMapEntry?.compConfigJson?.component?.config as TabComponentConfig) || {};
  }

  protected get tabInstance(): TabComponent {
    return this.formFieldCompMapEntry?.componentRef?.instance as TabComponent;
  }
  
  @HostBinding('id') get hostId(): string {
    return this.formFieldCompMapEntry?.compConfigJson?.name || '';
  }

  public selectTab(tabId: string) {
    const selectionResult = this.tabInstance.selectTab(tabId);
    if (selectionResult && selectionResult.changed) {
      this.loggerService.info(`${this.logName}: Tab selection changed`, selectionResult);
          // remove the 'show active' classes from all tabs
      selectionResult.tabContentWrappers.forEach((instance: FormBaseWrapperComponent<unknown>) => {
        instance.hostBindingCssClasses = this.componentDefinition?.config?.tabPaneCssClass;
      });
      if (selectionResult.selectedWrapper != null && selectionResult.selectedWrapper !== undefined) {
        selectionResult.selectedWrapper.hostBindingCssClasses = `${this.componentDefinition?.config?.tabPaneCssClass} ${this.componentDefinition?.config?.tabPaneActiveCssClass}`;
      }
    }
  }
}

/**
 * Tab Component
 *
 */
@Component({
  selector: 'redbox-form-tab',
  template:` 
    <ng-container #tabsContainer />
`,
  standalone: false
})
export class TabComponent extends FormFieldBaseComponent<undefined> {
  protected override logName: string | null = "TabComponent";
  tabs: TabComponentEntryDefinition[] = [];
  selectedTabId: string | null = null;
  wrapperRefs: ComponentRef<FormBaseWrapperComponent<unknown>>[] = [];
  componentInstances: any[] = [];
  componentFormMapEntries: FormFieldCompMapEntry[] = [];
  @ViewChild('tabsContainer', { read: ViewContainerRef, static: true }) private tabsContainer!: ViewContainerRef;

  protected get tabConfig(): TabComponentConfig {
    return (this.componentDefinition?.config as TabComponentConfig);
  }

  protected override async initData() {
    this.tabs = this.tabConfig.tabs || [];
  }

  protected override async setComponentReady(): Promise<void> {
    await this.untilViewIsInitialised();
    this.loggerService.info(`${this.logName}: Initializing TabComponent with ${this.tabs.length} tabs.`);
    this.tabsContainer.clear();

    for (let i = 0; i < this.tabs.length; i++) {
      const tab = this.tabs[i];
      const tabWrapperRef = this.tabsContainer.createComponent(FormBaseWrapperComponent<null>);
      tab.id = `${tab.id || i}`;
      const fieldMapDefEntry = {
        componentClass: TabContentComponent,
        compConfigJson: {
          name: tab.id,
          component: {
            class: 'TabContentComponent',
            config: {
              tab: tab
            }
          }
        }
      } as FormFieldCompMapEntry;
      
      try {
        await tabWrapperRef.instance.initWrapperComponent(fieldMapDefEntry, false);
      } catch (error) {
        this.loggerService.error(`${this.logName}: Error initializing tab wrapper component`, error);
      }

      this.componentFormMapEntries.push(fieldMapDefEntry);
      this.wrapperRefs.push(tabWrapperRef);
      // append the tab's content pane together
      this.componentInstances.push(...fieldMapDefEntry.component?.formFieldBaseComponents || []);
      // Merge the tab content `formControlMap` into the main model map
      if (fieldMapDefEntry.formControlMap && this.formFieldCompMapEntry != null) {
        if (this.formFieldCompMapEntry?.formControlMap == null) {
          this.formFieldCompMapEntry.formControlMap = {};
        }
        _merge(this.formFieldCompMapEntry.formControlMap, fieldMapDefEntry.formControlMap);
      }
      if (tab.selected) {
        this.selectTab(tab.id);
      }
    }      
    await super.setComponentReady();
  }

  public selectTab(tabId: string): { changed: boolean, selectedWrapper: FormBaseWrapperComponent<unknown> | null, tabContentWrappers: FormBaseWrapperComponent<unknown>[] } {
    this.loggerService.info(`${this.logName}: Selecting tab with ID: ${tabId}`);
    if (tabId === this.selectedTabId) {
      this.loggerService.warn(`${this.logName}: Tab with ID ${tabId} is already selected.`);
      const alreadySelected = this.wrapperRefs.find(ref =>
        ref.instance.formFieldCompMapEntry?.compConfigJson?.name === tabId
      );
      return {
        changed: false,
        selectedWrapper: alreadySelected ? alreadySelected.instance : null,
        tabContentWrappers: this.wrapperRefs.map(ref => ref.instance)
      };
    }
    const tab = this.tabs.find(t => t.id === tabId);
    if (!tab) {
      this.loggerService.error(`${this.logName}: Tab with ID ${tabId} not found.`);
      return { changed: false, selectedWrapper: null, tabContentWrappers: this.wrapperRefs.map(ref => ref.instance) };
    }
    const wrapperInst = _find(this.wrapperRefs, (ref: ComponentRef<FormBaseWrapperComponent<unknown>>) => {
      return ref.instance.formFieldCompMapEntry?.compConfigJson?.name === tabId;
    });
    if (!wrapperInst) {
      this.loggerService.warn(`${this.logName}: Wrapper instance not found for tab ID: ${tabId}`);
      return { changed: false, selectedWrapper: null, tabContentWrappers: this.wrapperRefs.map(ref => ref.instance) };
    }

    this.selectedTabId = tabId;
    tab.selected = true;

    return {
      changed: true,
      selectedWrapper: wrapperInst.instance,
      tabContentWrappers: this.wrapperRefs.map(ref => ref.instance)
    };
  }

  public override get formFieldBaseComponents(): FormFieldBaseComponent<unknown>[] {
    return this.componentInstances;
  }

  public override get formFieldCompMapEntries() : FormFieldCompMapEntry[] {
    return this.componentFormMapEntries;
  }

  public get activeTabId(): string | null {
    return this.selectedTabId;
  }

  @HostBinding('id') get hostId(): string {
    return `${this.name}_tab-content`;
  }
  
}

@Component({
  selector: 'redbox-form-tab-content',
  template: `<ng-container #componentContainer></ng-container>`,
  standalone: false,
})
export class TabContentComponent extends FormFieldBaseComponent<undefined> {
  protected override logName: string | null = "TabContentComponent";
  tab?: TabComponentEntryDefinition;
   @ViewChild('componentContainer', {
    read: ViewContainerRef,
    static: false
  })
  componentsDefinitionsContainerRef?: ViewContainerRef;
  protected formService = inject(FormService);
  private injector = inject(Injector);
  componentRefs: ComponentRef<FormBaseWrapperComponent<unknown>>[] = [];
  private componentInstances: any[] = [];
  protected formDefMap?: FormComponentsMap;

  protected override async initData() {
    this.tab = (this.componentDefinition?.config as TabContentComponentConfig)?.tab;
    if (!this.tab) {
      this.loggerService.error(`${this.logName}: No tab defined in component configuration.`);
    }
  }

  protected override async setComponentReady(): Promise<void> {
    await this.untilViewIsInitialised();
    if (this.componentsDefinitionsContainerRef == null || this.componentsDefinitionsContainerRef == undefined) {
      throw new Error(`${this.logName}: componentsDefinitionsContainer is not defined.`);
    }
    const formConfig = this.formComponentRef.formDefMap?.formConfig;
    const compFormConfig: FormConfig = {
      componentDefinitions: this.tab?.componentDefinitions || [],
      defaultComponentConfig: formConfig?.defaultComponentConfig,
      // Get the validator definitions so the child components can use them.
      validatorDefinitions: formConfig?.validatorDefinitions ?? [],
    };
    
    this.formDefMap = await this.formService.createFormComponentsMap(compFormConfig);
    if (this.formDefMap != null && this.formDefMap != undefined) {
      for (const formFieldDef of this.formDefMap.components) {
        const componentRef = this.componentsDefinitionsContainerRef.createComponent(FormBaseWrapperComponent<unknown>);
        await componentRef.instance.initWrapperComponent(formFieldDef);
        this.componentRefs.push(componentRef);
        this.componentInstances.push(componentRef.instance?.componentRef?.instance);
      }
      
      const groupedByNameMap = this.formService.groupComponentsByName(this.formDefMap);
      if (this.formFieldCompMapEntry != null && this.formFieldCompMapEntry != undefined) {
        // Populate the `formControlMap` with the controls of the content components.
        this.formFieldCompMapEntry.formControlMap = groupedByNameMap.withFormControl;
      }
    }
        
    this.loggerService.info(`${this.logName}: TabContentComponent is ready for tab: ${this.tab?.id}.`);
    await super.setComponentReady();
  }

  protected get formComponentRef(): FormComponent {
    return this.injector.get(FormComponent);
  }

  public override get formFieldBaseComponents(): FormFieldBaseComponent<unknown>[] {
    return this.componentInstances;
  }

  public override get formFieldCompMapEntries() : FormFieldCompMapEntry[]  {
    return this.formDefMap?.components || [];
  }

  @HostBinding('id') get hostId(): string {
    return this.tab?.id + '-tab-content';
  }
}




