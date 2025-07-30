import { Component, ViewChild, ViewContainerRef, TemplateRef, signal, input, Input, ViewChildren, ElementRef, QueryList, Directive, ContentChildren, contentChildren, computed, ComponentRef, inject, Injector } from '@angular/core';
import { FormFieldBaseComponent, FormFieldCompMapEntry } from '@researchdatabox/portal-ng-common';
import { FormConfig, TabComponentEntryDefinition, TabComponentConfig, TabContentComponentConfig } from '@researchdatabox/sails-ng-common';
import { set as _set, isEmpty as _isEmpty, cloneDeep as _cloneDeep, get as _get, isUndefined as _isUndefined, isNull as _isNull, find as _find, merge as _merge } from 'lodash-es';
import { FormComponent } from "../form.component";
import { FormBaseWrapperComponent } from './base-wrapper.component';
import { TabsetComponent } from 'ngx-bootstrap/tabs';
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
  <div class="d-flex align-items-start">
    <!-- Button Section -->
    <div class="nav flex-column nav-pills me-3" id="v-pills-tab" role="tablist" aria-orientation="vertical">
      <!-- Loop through tabs and create buttons -->
      @for (tab of tabs; track $index) {
        <button class="nav-link"
                [class.active]="$index === 0"
                [attr.id]="'v-pills-' + tab.id + '-tab'"
                [attr.data-bs-toggle]="'pill'"
                [attr.data-bs-target]="'#v-pills-' + tab.id"
                type="button"
                role="tab" 
                [attr.aria-controls]="'v-pills-' + tab.id"
                [attr.aria-selected]="$index === 0" 
                [innerHTML]="tab.buttonLabel" (click)="selectTab(tab.id)"> 
        </button>
      }
    </div>
    <!-- Content Section -->
    <div class="tab-content" id="v-pills-tabContent">
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

  protected override async initData() {
    this.tabs = (this.componentDefinition?.config as TabComponentConfig)?.tabs || [];
    
  }

  protected override async setComponentReady(): Promise<void> {
    await this.untilViewIsInitialised();
    this.loggerService.info(`${this.logName}: Initializing TabComponent with ${this.tabs.length} tabs.`);
    this.tabsContainer.clear();

    for (let i = 0; i < this.tabs.length; i++) {
      const tab = this.tabs[i];
      const tabWrapperRef = this.tabsContainer.createComponent(FormBaseWrapperComponent<null>);

      const fieldMapDefEntry = {
        componentClass: TabContentComponent,
        compConfigJson: {
          name: tab.id,
          component: {
            class: 'TabContentComponent',
            config: {
              tab: tab,
              wrapperCssClasses: 'tab-pane fade'
            }
          }
        }
      } as FormFieldCompMapEntry;
      if (i === 0) {
        _set(fieldMapDefEntry, 'compConfigJson.component.config.wrapperCssClasses', 'tab-pane fade show active');
      }
      console.log(fieldMapDefEntry);
      // tabWrapperRef.instance.tab = tab;
      try {
        await tabWrapperRef.instance.initWrapperComponent(fieldMapDefEntry, false);
      } catch (error) {
        this.loggerService.error(`${this.logName}: Error initializing tab wrapper component`, error);
      }
      console.log(fieldMapDefEntry);
      this.componentFormMapEntries.push(fieldMapDefEntry);
      this.wrapperRefs.push(tabWrapperRef);
      // append the tab's content pane together
      this.componentInstances.push(...fieldMapDefEntry.component?.getComponents() || []);
      // Merge the tab content `formControlMap` into the main model map
      if (fieldMapDefEntry.formControlMap && this.formFieldCompMapEntry != null) {
        if (this.formFieldCompMapEntry?.formControlMap == null) {
          this.formFieldCompMapEntry.formControlMap = {};
        }
        _merge(this.formFieldCompMapEntry.formControlMap, fieldMapDefEntry.formControlMap);
      }
    }      
    await super.setComponentReady();
  }

  selectTab(tabId: string) {
    this.loggerService.info(`${this.logName}: Selecting tab with ID: ${tabId}`);
    if (tabId === this.selectedTabId) {
      this.loggerService.warn(`${this.logName}: Tab with ID ${tabId} is already selected.`);
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
      if (instance.formFieldCompMapEntry?.compConfigJson?.name == tabId) {
        instance.hostBindingCssClasses = `${instance.hostBindingCssClasses} show active`;
        this.selectedTabId = tabId;
      } else {
        instance.hostBindingCssClasses = instance.hostBindingCssClasses?.replace('show active', '');
      }
    });
  }

  public override getComponents(): any[] {
    return this.componentInstances;
  }

  public get components(): FormFieldCompMapEntry[] {
    return this.componentFormMapEntries;
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
        // Populate the `formControlMap` with the models of the created components
        this.formFieldCompMapEntry.formControlMap = groupedByNameMap.withFormControl;
      }
    }
        
    this.loggerService.info(`${this.logName}: TabContentComponent is ready for tab: ${this.tab?.id}.`);
    await super.setComponentReady();
  }

  protected get formComponentRef(): FormComponent {
    return this.injector.get(FormComponent);
  }

  public override getComponents(): any[] {
    return this.componentInstances;
  }

  public get components(): FormFieldCompMapEntry[] {
    return this.formDefMap?.components || [];
  }
}




