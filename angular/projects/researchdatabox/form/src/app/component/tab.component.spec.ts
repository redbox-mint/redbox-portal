import {FormConfig} from '@researchdatabox/sails-ng-common';
import {TextFieldComponent} from './textfield.component';

import {createFormAndWaitForReady, createTestbedModule} from "../helpers.spec";
import {TestBed} from "@angular/core/testing";
import { TabComponent } from './tab.component';
// Import TabComponentConfig type
import type { TabComponentConfig, FormComponentDefinition } from '@researchdatabox/sails-ng-common';

let formConfig: FormConfig;

describe('TabComponent', () => {
  beforeEach(async () => {
    await createTestbedModule([
      TextFieldComponent,
      TabComponent
    ]);

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
          component: {
            class: 'TabComponent',
            config: {
              mainCssClass: 'd-flex align-items-start',
              buttonSectionCssClass: 'nav flex-column nav-pills me-5',
              tabContentSectionCssClass: 'tab-content',
              tabPaneCssClass: 'tab-pane fade',
              tabPaneActiveCssClass: 'active show',
              tabs: [
                {
                  id: 'tab1',
                  buttonLabel: 'Tab 1',
                  componentDefinitions: [
                    {
                      name: 'textfield_1',
                      model: {
                        class: 'TextFieldModel',
                        config: {
                          value: 'Hello from Tab 1!',
                          defaultValue: 'Default value for Tab 1'
                        }
                      },
                      component: {
                        class: 'TextFieldComponent'
                      }
                    }
                  ]
                },
                {
                  id: 'tab2',
                  buttonLabel: 'Tab 2',
                  selected: true,
                  componentDefinitions: [
                    {
                      name: 'textfield_2',
                      model: {
                        class: 'TextFieldModel',
                        config: {
                          value: 'Hello from Tab 2!',
                          defaultValue: 'Default value for Tab 2'
                        }
                      },
                      component: {
                        class: 'TextFieldComponent'
                      }
                    }
                  ]
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
    
    const tabConfig: TabComponentConfig | undefined =  componentDefinitions?.component?.config as TabComponentConfig;
    expect(tabConfig).toBeDefined();
    
    // Get the element with the tab's id equal to the `formConfig.componentDefinitions[0].name`
    const mainTabElement = compiled.querySelector(`#${componentDefinitions.name}`);
    expect(mainTabElement).toBeTruthy();
    expect(tabConfig.mainCssClass).toBeDefined();

    // check styles exists with the caveat that Angular treats the space delimited classes as sets and therefore the order of class names are not guaranteed.
    // Convert the class list to an array using space as a delimiter, then check if the elements match the expected classes.
    let classList = mainTabElement?.className.split(' ') || [];
    let expectedClasses = tabConfig.mainCssClass?.split(' ') || [];
    // check if all expected classes are present in the class list
    expectedClasses.forEach(expectedClass => {
      expect(classList).toContain(expectedClass);
    });
    // query with 'role="tablist"' to find the button section
    const buttonContainerElement = compiled.querySelector('[role="tablist"]');
    expect(buttonContainerElement).toBeTruthy();
    classList = buttonContainerElement?.className.split(' ') || [];
    expectedClasses = tabConfig.buttonSectionCssClass?.split(' ') || [];
    // check if all expected classes are present in the class list
    expectedClasses.forEach(expectedClass => {
      expect(classList).toContain(expectedClass);
    });
    const tabContentContainerElement = compiled.querySelector(`#${componentDefinitions.name}_tabContent`);
    expect(tabContentContainerElement).toBeTruthy();
    classList = tabContentContainerElement?.className.split(' ') || [];
    expectedClasses = tabConfig.tabContentSectionCssClass?.split(' ') || [];
    // check if all expected classes are present in the class list
    expectedClasses.forEach(expectedClass => {
      expect(classList).toContain(expectedClass);
    });
  });
  
  it('should select the last tab with an "selected" equal to true on init and do the same on the new tab selected', async () => {
    const {fixture, formComponent, componentDefinitions} = await createFormAndWaitForReady(formConfig);
    if (!componentDefinitions?.component) {
      throw new Error("Component definition is not defined");
    }

    const compiled = fixture.nativeElement as HTMLElement;

    const tabConfig: TabComponentConfig | undefined =  componentDefinitions?.component?.config as TabComponentConfig;
    expect(tabConfig).toBeDefined();

    const tabSelected = tabConfig.tabs?.find(tab => tab.selected);
    expect(tabSelected).toBeDefined();
    expect(tabSelected?.id).toBe('tab2');
    

    // check if the second tab is selected
    const secondTabButton = compiled.querySelector(`#tab2-tab-button`);
    expect(secondTabButton).toBeTruthy();
    let classList = secondTabButton?.className.split(' ') || [];
    expect(classList).toContain('active');

    // check if aria-selected is set to true
    expect(secondTabButton?.getAttribute('aria-selected')).toBe('true');

  });

});
