import {FormConfigFrame, KeyValueStringNested, KeyValueStringProperty, TabFieldComponentConfigFrame, TabFieldLayoutConfigFrame } from '@researchdatabox/sails-ng-common';
import {SimpleInputComponent} from './simple-input.component';
import {createFormAndWaitForReady, createTestbedModule} from "../helpers.spec";
import {TestBed} from "@angular/core/testing";
import { TabComponent, TabSelectionErrorType } from './tab.component';

let formConfig: FormConfigFrame;

describe('TabComponent', () => {
  beforeEach(async () => {
    await createTestbedModule({
      declarations: {
        "SimpleInputComponent,": SimpleInputComponent,
        "TabComponent": TabComponent,
      }
    });

    formConfig = {
      debugValue: true,
      domElementType: 'form',
      defaultComponentConfig: {
        defaultComponentCssClasses: 'row',
      },
      editCssClasses: "redbox-form form",
      componentDefinitions: [
        {
          name: 'main_tab',
          layout: {
            class: 'TabLayout',
            config: {
                // layout-specific config goes here
                hostCssClasses: 'd-flex align-items-start',
                buttonSectionCssClass: 'nav flex-column nav-pills me-5',
                tabPaneCssClass: 'tab-pane fade',
                tabPaneActiveCssClass: 'active show',
            }
          },
          component: {
            class: 'TabComponent',
            config: {
              hostCssClasses: 'tab-content',
              tabs: [
                {
                  name: 'tab1',
                  layout: {
                    class: 'TabContentLayout',
                    config: {
                      buttonLabel: 'Tab 1',
                    }
                  },
                  component: {
                    class: 'TabContentComponent',
                    config: {
                      componentDefinitions: [
                        {
                          name: 'textfield_1',
                          model: {
                            class: 'SimpleInputModel',
                            config: {
                              value: 'Hello from Tab 1!',
                              defaultValue: 'Default value for Tab 1'
                            }
                          },
                          component: {
                            class: 'SimpleInputComponent'
                          }
                        }
                      ]
                    }
                  }
                },
                {
                  name: 'tab2',
                  layout: {
                    class: 'TabContentLayout',
                    config: {
                      buttonLabel: 'Tab 2',
                    }
                  },
                  component: {
                    class: 'TabContentComponent',
                    config: {
                      selected: true,
                      componentDefinitions: [
                        {
                          name: 'textfield_2',
                          model: {
                            class: 'SimpleInputModel',
                            config: {
                              value: 'Hello from Tab 2!',
                              defaultValue: 'Default value for Tab 2'
                            }
                          },
                          component: {
                            class: 'SimpleInputComponent'
                          }
                        }
                      ]
                    }
                  }
                }
              ]
            }
          }
        }
      ]
    };
  });

  it('should create component', () => {
    let fixture = TestBed.createComponent(TabComponent);
    let component = fixture.componentInstance;
    expect(component).toBeDefined();
  });

  it('should render the tab with a text field component', async () => {
    // act
    const {fixture, formComponent, componentDefinitions} = await createFormAndWaitForReady(formConfig);
    // assert text field component is rendered with name 'textfield_1'
    const compiled = fixture.nativeElement as HTMLElement;
    let inputElements = compiled.querySelectorAll('input[type="text"]');
    expect(inputElements).toHaveSize(2);
  });

  // check if the tab component's css classes are applied correctly
  it('should apply the correct CSS classes to the tab component', async () => {
    const {fixture, componentDefinitions} = await createFormAndWaitForReady(formConfig);

    if (!componentDefinitions?.component) {
      throw new Error("Component definition is not defined");
    }

    const compiled = fixture.nativeElement as HTMLElement;

    const tabConfig =  componentDefinitions?.component?.config as TabFieldComponentConfigFrame;
    const tabLayoutConfig= componentDefinitions?.layout?.config as TabFieldLayoutConfigFrame;
    expect(tabConfig).toBeDefined();

    // Get the element with the tab's id equal to the `formConfig.componentDefinitions[0].name`
    const mainTabElement = compiled.querySelector(`#${componentDefinitions.name}`);
    expect(mainTabElement).toBeTruthy();
    expect(tabLayoutConfig.hostCssClasses).toBeDefined();

    // check styles exists with the caveat that Angular treats the space delimited classes as sets and therefore the order of class names are not guaranteed.
    // Convert the class list to an array using space as a delimiter, then check if the elements match the expected classes.
    let classList = splitClasses(mainTabElement?.className);
    let expectedClasses = splitClasses(tabLayoutConfig.hostCssClasses);
    // check if all expected classes are present in the class list
    expectedClasses.forEach((expectedClass:string) => {
      expect(classList).toContain(expectedClass);
    });
    // query with 'role="tablist"' to find the button section
    const buttonContainerElement = compiled.querySelector('[role="tablist"]');
    expect(buttonContainerElement).toBeTruthy();
    classList = splitClasses(buttonContainerElement?.className);
    expectedClasses = splitClasses(tabLayoutConfig.buttonSectionCssClass);
    // check if all expected classes are present in the class list
    expectedClasses.forEach((expectedClass:string) => {
      expect(classList).toContain(expectedClass);
    });
    const tabContentContainerElement = compiled.querySelector(`#${componentDefinitions.name}_tab-content`);
    expect(tabContentContainerElement).toBeTruthy();
    classList = splitClasses(tabContentContainerElement?.className);
    expectedClasses = splitClasses(tabConfig.hostCssClasses);
    // check if all expected classes are present in the class list
    expectedClasses.forEach((expectedClass:string) => {
      expect(classList).toContain(expectedClass);
    });
  });

  it('should select the last tab with an "selected" equal to true on init and do the same on the new tab selected', async () => {
    const {fixture, formComponent, componentDefinitions} = await createFormAndWaitForReady(formConfig);
    if (!componentDefinitions?.component) {
      throw new Error("Component definition is not defined");
    }

    const compiled = fixture.nativeElement as HTMLElement;

    const tabConfig =  componentDefinitions?.component?.config as TabFieldComponentConfigFrame;
    expect(tabConfig).toBeDefined();

    const tabSelected = tabConfig.tabs?.find(tab => tab.component.config?.selected);
    expect(tabSelected).toBeDefined();
    expect(tabSelected?.name).toBe('tab2');


    // check if the second tab is selected
    const secondTabButton = compiled.querySelector(`#tab2-tab-button`);
    expect(secondTabButton).toBeTruthy();
    let classList = secondTabButton?.className.split(' ') || [];
    expect(classList).toContain('active');

    // check if aria-selected is set to true
    expect(secondTabButton?.getAttribute('aria-selected')).toBe('true');

  });

  it('should allow tab switching', async () => {
    const {fixture, formComponent, componentDefinitions} = await createFormAndWaitForReady(formConfig);
    if (!componentDefinitions?.component) {
      throw new Error("Component definition is not defined");
    }

    const compiled = fixture.nativeElement as HTMLElement;

    const tabConfig =  componentDefinitions?.component?.config as TabFieldComponentConfigFrame;
    expect(tabConfig).toBeDefined();

    const mainTabDef = formComponent.getComponentDefByName('main_tab');
    expect(mainTabDef).toBeDefined();
    if (mainTabDef === undefined) {
      throw new Error("Main tab component is not defined");
    }
    const mainTab = (mainTabDef.component as TabComponent);
    const selectionResult = mainTab?.selectTab('tab1');
    expect(selectionResult).toBeDefined();
    expect(selectionResult?.changed).toBe(true);
    expect(selectionResult?.errorType).toBe(TabSelectionErrorType.NONE);
    expect(selectionResult?.selectedWrapper).toBeDefined();

    const tabSelected = mainTab?.tabs?.find(tab => tab.selected);
    expect(tabSelected).toBeDefined();
    expect(tabSelected?.id).toBe('tab1');
    // Trigger change detection
    fixture.detectChanges();
    await fixture.whenStable();
    // check if the first tab is selected
    const firstTabButton = compiled.querySelector(`#tab1-tab-button`);
    expect(firstTabButton).toBeTruthy();
    // check if the first tab button has the 'active' class
    let classList = firstTabButton?.className.split(' ') || [];
    expect(classList).toContain('active');

    // check if aria-selected is set to true
    expect(firstTabButton?.getAttribute('aria-selected')).toBe('true');

    // Check response if reselection is attempted
    const reselectionResult = mainTab?.selectTab('tab1');
    expect(reselectionResult).toBeDefined();
    expect(reselectionResult?.changed).toBe(false);
    expect(reselectionResult?.errorType).toBe(TabSelectionErrorType.ALREADY_SELECTED);
    expect(reselectionResult?.selectedWrapper).toBeDefined();
  });

  it('should not allow tab switching with invalid tab IDs', async () => {
    const {fixture, formComponent, componentDefinitions} = await createFormAndWaitForReady(formConfig);
    if (!componentDefinitions?.component) {
      throw new Error("Component definition is not defined");
    }
    const compiled = fixture.nativeElement as HTMLElement;
    const tabConfig =  componentDefinitions?.component?.config as TabFieldComponentConfigFrame;
    expect(tabConfig).toBeDefined();

    const mainTabDef = formComponent.getComponentDefByName('main_tab');
    expect(mainTabDef).toBeDefined();
    if (mainTabDef === undefined) {
      throw new Error("Main tab component is not defined");
    }

    const mainTab = (mainTabDef.component as TabComponent);
    const selectionResult = mainTab?.selectTab('tab-invalid-id');
    expect(selectionResult).toBeDefined();
    expect(selectionResult?.changed).toBe(false);
    expect(selectionResult?.errorType).toBe(TabSelectionErrorType.INVALID_TAB);
    expect(selectionResult?.selectedWrapper).toBeNull();

  });

});

function splitClasses(classes: KeyValueStringNested | KeyValueStringProperty): string[] {
  // check if classes is of type string
  if (typeof classes === 'string') {
    return classes.split(' ');
  }
  // If classes is an  Record<string,  KeyValueStringProperty>, which may contain KeyValueStringProperty, iterate
  if (typeof classes === 'object' && classes !== null) {
    return Object.values(classes).flatMap((value: KeyValueStringProperty) => {
      if (typeof value === 'string') {
        return value.split(' ');
      } else if (typeof value === 'object') {
        return splitClasses(value as KeyValueStringProperty);
      }
      return [];
    });
  }
  return [];
}
