import { Component, ViewChild, ViewContainerRef, ComponentRef, inject, Injector, HostBinding } from '@angular/core';
import { FormFieldBaseComponent, FormFieldCompMapEntry } from '@researchdatabox/portal-ng-common';
import { FormConfig, TabComponentEntryDefinition, TabComponentConfig, TabContentComponentConfig } from '@researchdatabox/sails-ng-common';
import { set as _set, isEmpty as _isEmpty, cloneDeep as _cloneDeep, get as _get, isUndefined as _isUndefined, isNull as _isNull, find as _find, merge as _merge } from 'lodash-es';
import { FormComponent } from "../form.component";
import { FormBaseWrapperComponent } from './base-wrapper.component';
import { FormComponentsMap, FormService } from '../form.service';
/**
 * Repeatable Form Field Component
 *
 * The layout-specific section is meant to be minimal.
 *
 *
 */
@Component({
  selector: 'redbox-form-tab',
  template:` 
  <div [class]="mainCssClass" [id]="name">
    <!-- Button Section -->
    <div [class]="buttonSectionCssClass" role="tablist" aria-orientation="vertical">
      <!-- Loop through tabs and create buttons -->
      @for (tab of tabs; track $index) {
        <button class="nav-link"
                [class.active]="tab.id == selectedTabId"
                [attr.id]="tab.id + '-tab-button'"
                type="button"
                role="tab" 
                [attr.aria-selected]="tab.id == selectedTabId" 
                [attr.aria-controls]="tab.id + '-tab-content'"  
                [innerHTML]="tab.buttonLabel" (click)="selectTab(tab.id)"> 
        </button>
      } 
    </div>
    <!-- Content Section -->
    <div [class]="tabContentSectionCssClass" [id]="name + '_tabContent'">
      <ng-container #tabsContainer />
    </div>
  </div>
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

  protected get mainCssClass(): string | undefined {
    return this.tabConfig.mainCssClass;
  }

  protected get buttonSectionCssClass(): string | undefined{
    return this.tabConfig.buttonSectionCssClass;
  }

  protected get tabContentSectionCssClass(): string | undefined {
    return this.tabConfig.tabContentSectionCssClass;
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

  public selectTab(tabId: string) {
    this.loggerService.info(`${this.logName}: Selecting tab with ID: ${tabId}`);
    if (tabId === this.selectedTabId) {
      this.loggerService.warn(`${this.logName}: Tab with ID ${tabId} is already selected.`);
      return;
    }
    const tab = this.tabs.find(t => t.id === tabId);
    if (!tab) {
      this.loggerService.error(`${this.logName}: Tab with ID ${tabId} not found.`);
      return;
    }
    // Peek ahead if the tab exists
    const wrapperInst = _find(this.wrapperRefs, (ref: ComponentRef<FormBaseWrapperComponent<unknown>>) => {
      return ref.instance.formFieldCompMapEntry?.compConfigJson?.name === tabId;
    });
    if (!wrapperInst) {
      this.loggerService.warn(`${this.logName}: Wrapper instance not found for tab ID: ${tabId}`);
      return;
    }
    // remove the 'show active' classes from all tabs
    this.wrapperRefs.forEach((ref: ComponentRef<FormBaseWrapperComponent<unknown>>) => {
      const instance = ref.instance;
      instance.hostBindingCssClasses = this.tabConfig.tabPaneCssClass;
    });
    wrapperInst.instance.hostBindingCssClasses = `${this.tabConfig.tabPaneCssClass} ${this.tabConfig.tabPaneActiveCssClass}`;
    this.selectedTabId = tabId;
    tab.selected = true;
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

  public get tabs(): TabComponentEntryDefinition[] {
    return this.tabs;
  }
}




