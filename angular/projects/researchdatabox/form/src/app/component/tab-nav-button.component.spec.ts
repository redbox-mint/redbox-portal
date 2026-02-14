import { TestBed } from '@angular/core/testing';
import { TabNavButtonComponent } from './tab-nav-button.component';
import { TabComponent } from './tab.component';
import { createFormAndWaitForReady, createTestbedModule } from '../helpers.spec';
import { FormConfigFrame } from '@researchdatabox/sails-ng-common';

let formConfig: FormConfigFrame;

describe('TabNavButtonComponent', () => {
  beforeEach(async () => {
    await createTestbedModule({
      declarations: {
        TabComponent,
        TabNavButtonComponent,
      },
    });

    formConfig = {
      name: 'testing',
      debugValue: true,
      domElementType: 'form',
      defaultComponentConfig: {
        defaultComponentCssClasses: 'row',
      },
      editCssClasses: 'redbox-form form',
      componentDefinitions: [
        {
          name: 'main_tab',
          layout: {
            class: 'TabLayout',
            config: {
              hostCssClasses: 'd-flex align-items-start',
              buttonSectionCssClass: 'nav flex-column nav-pills me-5',
              tabPaneCssClass: 'tab-pane fade',
              tabPaneActiveCssClass: 'active show',
            },
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
                    },
                  },
                  component: {
                    class: 'TabContentComponent',
                    config: {
                      componentDefinitions: [],
                    },
                  },
                },
                {
                  name: 'tab2',
                  layout: {
                    class: 'TabContentLayout',
                    config: {
                      buttonLabel: 'Tab 2',
                    },
                  },
                  component: {
                    class: 'TabContentComponent',
                    config: {
                      selected: true,
                      componentDefinitions: [],
                    },
                  },
                },
              ],
            },
          },
        },
        {
          name: 'tab_nav',
          component: {
            class: 'TabNavButtonComponent',
            config: {
              prevLabel: 'Previous',
              nextLabel: 'Next',
              targetTabContainerId: 'main_tab',
              endDisplayMode: 'disabled',
            },
          },
        },
      ],
    };
  });

  it('should create TabNavButtonComponent', () => {
    const fixture = TestBed.createComponent(TabNavButtonComponent);
    const component = fixture.componentInstance;
    expect(component).toBeDefined();
  });

  it('should move to previous tab when clicking prev', async () => {
    const { fixture, formComponent } = await createFormAndWaitForReady(formConfig, { editMode: true } as any);
    const mainTabDef = formComponent.getComponentDefByName('main_tab');
    const mainTab = mainTabDef?.component as TabComponent;
    expect(mainTab.selectedTabId).toBe('tab2');

    const buttons = fixture.nativeElement.querySelectorAll('button');
    const prevButton = buttons[0] as HTMLButtonElement;
    prevButton.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(mainTab.selectedTabId).toBe('tab1');
    const tab1Wrapper = mainTab.wrapperRefs.find((ref) => ref.instance.formFieldCompMapEntry?.compConfigJson?.name === 'tab1');
    const tab2Wrapper = mainTab.wrapperRefs.find((ref) => ref.instance.formFieldCompMapEntry?.compConfigJson?.name === 'tab2');
    expect(`${tab1Wrapper?.instance.hostBindingCssClasses || ''}`).toContain('active');
    expect(`${tab2Wrapper?.instance.hostBindingCssClasses || ''}`).not.toContain('active');
  });

  it('should scroll to the top of the tab when clicking next', async () => {
    const { fixture, formComponent } = await createFormAndWaitForReady(formConfig, { editMode: true } as any);
    const mainTabDef = formComponent.getComponentDefByName('main_tab');
    const mainTab = mainTabDef?.component as TabComponent;

    const nativeElement = mainTab.formFieldCompMapEntry?.componentRef?.location.nativeElement;
    const scrollSpy = spyOn(nativeElement, 'scrollIntoView');

    const navHost = fixture.nativeElement.querySelector('redbox-form-tab-nav-button');
    const buttons = navHost.querySelectorAll('button');
    const prevButton = buttons[0] as HTMLButtonElement;
    prevButton.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(mainTab.selectedTabId).toBe('tab1');
    expect(scrollSpy).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
  });

  it('should disable buttons when target tab container is missing', async () => {
    const tabNavConfig = formConfig.componentDefinitions[1]?.component?.config as Record<string, unknown> | undefined;
    if (tabNavConfig) {
      tabNavConfig['targetTabContainerId'] = 'missing_tab';
    }
    const { fixture } = await createFormAndWaitForReady(formConfig, { editMode: true } as any);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const navHost = fixture.nativeElement.querySelector('redbox-form-tab-nav-button') as HTMLElement | null;
    expect(navHost).toBeTruthy();
    const buttons = navHost?.querySelectorAll('button') ?? [];
    expect((buttons[0] as HTMLButtonElement).disabled).toBeTrue();
    expect((buttons[1] as HTMLButtonElement).disabled).toBeTrue();
  });
});
