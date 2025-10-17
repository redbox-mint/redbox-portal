import { Component, ViewChild, ViewContainerRef, ComponentRef, inject, Injector, HostBinding } from '@angular/core';
import { FormFieldBaseComponent, FormFieldCompMapEntry } from '@researchdatabox/portal-ng-common';
import {
  FormConfigFrame, isTypeFieldDefinitionName, isTypeFormComponentDefinitionName,
  TabComponentName,
  TabContentComponentName, TabContentFieldComponentDefinitionFrame,
  TabContentFormComponentDefinitionFrame,
  TabFieldComponentConfigFrame, TabFieldComponentDefinitionFrame,
  TabFieldLayoutDefinitionFrame, TabLayoutName
} from '@researchdatabox/sails-ng-common';
import { find as _find, merge as _merge } from 'lodash-es';
import { FormComponent } from "../form.component";
import { FormBaseWrapperComponent } from './base-wrapper.component';
import { FormComponentsMap, FormService } from '../form.service';
import { DefaultLayoutComponent } from './default-layout.component';

/**
 * TabLayout Component. Responsible for UI management.
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
                [class.active]="tabInstance && tab.name == tabInstance.selectedTabId"
                [attr.id]="tab.name + '-tab-button'"
                type="button"
                role="tab"
                [attr.aria-selected]="tabInstance && tab.name == tabInstance.selectedTabId"
                [attr.aria-controls]="tab.name + '-tab-content'"
                [innerHTML]="tab.layout?.config?.buttonLabel" (click)="selectTab(tab.name)">
        </button>
      }
    </div>
    <ng-container #componentContainer ></ng-container>
  `,
  standalone: false
})
export class TabComponentLayout extends DefaultLayoutComponent<undefined> {
  protected override logName = TabLayoutName;
  public override componentDefinition?: TabFieldLayoutDefinitionFrame;

  protected get tabConfig(): TabFieldComponentConfigFrame {
    const component = this.formFieldCompMapEntry?.compConfigJson?.component;
    if (!component || !isTypeFieldDefinitionName<TabFieldComponentDefinitionFrame>(component, component.class)){
      throw new Error();
    }
    return component?.config || {tabs:[]};
  }

  protected get tabInstance(): TabComponent {
    const instance = this.formFieldCompMapEntry?.component;
    if (!instance) {
      throw new Error("Could not get instance of TabComponent for TabComponentLayout.");
    }
    if (instance instanceof TabComponent) {
      return instance;
    }
    throw new Error(`Expected instance to be TabComponent for TabComponentLayout, but instance was '${instance.constructor.name}'.`);
  }

  @HostBinding('id') get hostId(): string {
    return this.formFieldCompMapEntry?.compConfigJson?.name || '';
  }

  public selectTab(tabId: string) {
    const selectionResult = this.tabInstance.selectTab(tabId);
    if (selectionResult && selectionResult.changed) {
      this.loggerService.debug(`${this.logName}: Tab selection changed`, selectionResult);
      // remove the 'show active' classes from all tabs
      selectionResult.wrappers?.forEach((instance: FormBaseWrapperComponent<unknown>) => {
        instance.hostBindingCssClasses = this.componentDefinition?.config?.tabPaneCssClass;
      });
      // add the 'show active' class to the selected tab
      if (selectionResult.selectedWrapper !== null && selectionResult.selectedWrapper !== undefined) {
        selectionResult.selectedWrapper.hostBindingCssClasses = `${this.componentDefinition?.config?.tabPaneCssClass} ${this.componentDefinition?.config?.tabPaneActiveCssClass}`;
      }
    }
  }
}

/**
 * Tab Component
 *
 * Manages the individual tab content/panes within the tab.
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
  protected override logName = TabComponentName;
  tabs: TabContentFormComponentDefinitionFrame[] = [];
  selectedTabId: string | null = null;
  wrapperRefs: ComponentRef<FormBaseWrapperComponent<unknown>>[] = [];
  componentInstances: any[] = [];
  componentFormMapEntries: FormFieldCompMapEntry[] = [];
  @ViewChild('tabsContainer', { read: ViewContainerRef, static: true }) private tabsContainer!: ViewContainerRef;
  protected formService = inject(FormService);
  public override componentDefinition?: TabFieldComponentDefinitionFrame;

  protected get tabConfig(): TabFieldComponentConfigFrame {
    return this.componentDefinition?.config || {tabs: []};
  }

  protected override async initData() {
    this.tabs = this.tabConfig?.tabs || [];
  }

  protected override async setComponentReady(): Promise<void> {
    await this.untilViewIsInitialised();
    this.loggerService.debug(`${this.logName}: Initializing TabComponent with ${this.tabs.length} tabs.`);
    this.tabsContainer.clear();

    for (let index = 0; index < this.tabs.length; index++) {
      const tab = this.tabs[index];
      const tabWrapperRef = this.tabsContainer.createComponent(FormBaseWrapperComponent<null>);
      tab.name = `${tab.name || index}`;
      const fieldMapDefEntry: FormFieldCompMapEntry = {
        componentClass: TabContentComponent,
        compConfigJson: tab,
        lineagePaths: this.formService.buildLineagePaths(this.formFieldCompMapEntry?.lineagePaths, {
          angularComponents: [],
          dataModel: [],
          formConfig: ['component', 'config', 'tabs', index],
        }),
      };

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
      if (tab.component?.config?.selected) {
        this.selectTab(tab.name);
      }
    }
    await super.setComponentReady();
  }

  public selectTab(tabId: string): TabSelectionResult {
    this.loggerService.debug(`${this.logName}: Selecting tab with ID: ${tabId}`);
    const selectionResult: TabSelectionResult = {
      changed: false,
      errorType: TabSelectionErrorType.NONE,
      selectedWrapper: null,
      wrappers: this.wrapperRefs.map(ref => ref.instance)
    };
    if (tabId === this.selectedTabId) {
      this.loggerService.warn(`${this.logName}: Tab with ID ${tabId} is already selected.`);
      const alreadySelected = this.wrapperRefs.find(ref =>
        ref.instance.formFieldCompMapEntry?.compConfigJson?.name === tabId
      );
      selectionResult.errorType = TabSelectionErrorType.ALREADY_SELECTED;
      selectionResult.selectedWrapper = alreadySelected ? alreadySelected.instance : null;
      return selectionResult;
    }
    const tab = this.tabs.find(t => t.name === tabId);
    if (!tab) {
      this.loggerService.error(`${this.logName}: Tab with ID ${tabId} not found.`);
      selectionResult.errorType = TabSelectionErrorType.INVALID_TAB;
      return selectionResult;
    }
    const wrapperInst = _find(this.wrapperRefs, (ref: ComponentRef<FormBaseWrapperComponent<unknown>>) => {
      return ref.instance.formFieldCompMapEntry?.compConfigJson?.name === tabId;
    });
    if (!wrapperInst) {
      this.loggerService.warn(`${this.logName}: Wrapper instance not found for tab ID: ${tabId}`);
      selectionResult.errorType = TabSelectionErrorType.INVALID_TAB;
      return selectionResult;
    }

    this.selectedTabId = tabId;
    if (tab.component?.config) {
      tab.component.config.selected = true;
    }
    selectionResult.changed = true;
    selectionResult.selectedWrapper = wrapperInst.instance;
    return selectionResult;
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

/**
 * TabContent Component.
 *
 * Manages the content area of a tab.
 */
@Component({
  selector: 'redbox-form-tab-content',
  template: `<ng-container #componentContainer></ng-container>`,
  standalone: false,
})
export class TabContentComponent extends FormFieldBaseComponent<undefined> {
  protected override logName = TabContentComponentName;
  public override componentDefinition?: TabContentFieldComponentDefinitionFrame;
  tab?: TabContentFormComponentDefinitionFrame;
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
    const formCompDef = this.formFieldCompMapEntry?.compConfigJson;
    if (isTypeFormComponentDefinitionName<TabContentFormComponentDefinitionFrame>(formCompDef, TabContentComponentName)) {
      this.tab = formCompDef;
      if (!this.tab) {
        this.loggerService.error(`${this.logName}: No tab defined in component configuration.`);
      }
    }
  }

  protected override async setComponentReady(): Promise<void> {
    await this.untilViewIsInitialised();
    if (this.componentsDefinitionsContainerRef === null || this.componentsDefinitionsContainerRef === undefined) {
      throw new Error(`${this.logName}: componentsDefinitionsContainer is not defined.`);
    }
    const formConfig = this.formComponentRef.formDefMap?.formConfig;
    const compFormConfig: FormConfigFrame = {
      name: `form-config-generated-tab-${this.formFieldCompMapEntry?.compConfigJson?.name}`,
      componentDefinitions: this.tab?.component?.config?.componentDefinitions || [],
      defaultComponentConfig: formConfig?.defaultComponentConfig,
    };

    const parentLineagePaths = this.formService.buildLineagePaths(
      this.formFieldCompMapEntry?.lineagePaths,
      {
        angularComponents: [],
        dataModel: [],
        formConfig: ['componentDefinitions'],
      });
    this.formDefMap = await this.formService.createFormComponentsMap(compFormConfig, parentLineagePaths);
    if (this.formDefMap !== null && this.formDefMap != undefined) {
      for (const formFieldDef of this.formDefMap.components) {
        const componentRef = this.componentsDefinitionsContainerRef.createComponent(FormBaseWrapperComponent<unknown>);
        await componentRef.instance.initWrapperComponent(formFieldDef);
        this.componentRefs.push(componentRef);
        this.componentInstances.push(componentRef.instance?.componentRef?.instance);
      }

      const groupedByNameMap = this.formService.groupComponentsByName(this.formDefMap);
      if (this.formFieldCompMapEntry !== null && this.formFieldCompMapEntry !== undefined) {
        // Populate the `formControlMap` with the controls of the content components.
        this.formFieldCompMapEntry.formControlMap = groupedByNameMap.withFormControl;
      }
    }

    this.loggerService.debug(`${this.logName}: TabContentComponent is ready for tab: ${this.tab?.name}.`);
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
    return this.tab?.name + '-tab-content';
  }
}

/**
 * Represents the error types that can occur during tab selection.
 */
export enum TabSelectionErrorType {
  NONE,
  INVALID_TAB,
  ALREADY_SELECTED
}

/**
 * Represents the result of a tab selection change.
 */
export interface TabSelectionResult {
  changed: boolean;
  selectedWrapper: FormBaseWrapperComponent<unknown> | null;
  wrappers: FormBaseWrapperComponent<unknown>[] | null;
  errorType: TabSelectionErrorType;
}


