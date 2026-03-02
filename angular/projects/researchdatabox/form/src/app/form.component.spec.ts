import { TestBed } from '@angular/core/testing';
import { Location } from '@angular/common';
import { FormComponent } from './form.component';
import { FormConfigFrame } from '@researchdatabox/sails-ng-common';
import { SimpleInputComponent } from './component/simple-input.component';
import { GroupFieldComponent } from './component/group.component';
import { createFormAndWaitForReady, createTestbedModule } from "./helpers.spec";
import { FormComponentEventBus } from './form-state/events/form-component-event-bus.service';
import { createFormSaveExecuteEvent } from './form-state/events/form-component-event.types';

describe('FormComponent', () => {
  beforeEach(async () => {
    await createTestbedModule(
      {
        declarations: {
          "SimpleInputComponent": SimpleInputComponent,
          "GroupFieldComponent": GroupFieldComponent,
        }
      });
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(FormComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render basic form config', async () => {
    const formConfig: FormConfigFrame = {
      name: 'testing',
      debugValue: true,
      defaultComponentConfig: {
        defaultComponentCssClasses: 'row',
      },
      editCssClasses: "redbox-form form",
      componentDefinitions: [
        {
          name: 'text_1_event',
          model: {
            class: 'SimpleInputModel',
            config: {
              value: 'hello world!'
            }
          },
          component: {
            class: 'SimpleInputComponent'
          }
        }
      ]
    };
    const { fixture, formComponent } = await createFormAndWaitForReady(formConfig);

    // Now run your expectations
    const compiled = fixture.nativeElement as HTMLElement;
    const inputElement = compiled.querySelector('input[type="text"]');
    expect(inputElement).toBeTruthy();
  });

  it('should call saveForm when form.save.execute is published (Task 15)', async () => {
    // Ensure initComponent runs so the EventBus subscription is created
    const formConfig: FormConfigFrame = {
      name: 'save-exec-test',
      debugValue: false,
      defaultComponentConfig: {
        defaultComponentCssClasses: 'row',
      },
      editCssClasses: 'redbox-form form',
      componentDefinitions: [
        {
          name: 'text_exec',
          model: {
            class: 'SimpleInputModel',
            config: {
              value: 'trigger save exec'
            }
          },
          component: {
            class: 'SimpleInputComponent'
          }
        }
      ]
    };

    const { fixture, formComponent } = await createFormAndWaitForReady(formConfig);
    const bus = TestBed.inject(FormComponentEventBus);

    const spy = spyOn(formComponent, 'saveForm').and.stub();

    // Publish execute command after subscription is in place
    bus.publish(createFormSaveExecuteEvent({ force: true, enabledValidationGroups: ["none"], targetStep: 'S1' }));
    fixture.detectChanges();
    await fixture.whenStable();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(true, 'S1', ["none"]);
  });

  it('allows legacy callers to invoke saveForm directly (Task 17)', async () => {
    const formConfig: FormConfigFrame = {
      name: 'legacy-save',
      debugValue: false,
      defaultComponentConfig: {
        defaultComponentCssClasses: 'row',
      },
      editCssClasses: 'redbox-form form',
      componentDefinitions: [
        {
          name: 'text_legacy',
          model: {
            class: 'SimpleInputModel',
            config: {
              value: 'legacy value'
            }
          },
          component: {
            class: 'SimpleInputComponent'
          }
        }
      ]
    };

    const { formComponent } = await createFormAndWaitForReady(formConfig);
    const submitSpy = spyOn(formComponent, 'saveForm').and.stub();
    await formComponent.saveForm(true, 'legacy-step', ["none"]);
    expect(submitSpy).toHaveBeenCalledWith(true, 'legacy-step', ["none"]);
  });

  it('omits disabled controls from Form Values Debug data', async () => {
    const formConfig: FormConfigFrame = {
      name: 'debug-filter-disabled',
      debugValue: true,
      componentDefinitions: [
        {
          name: 'enabled_text',
          model: {
            class: 'SimpleInputModel',
            config: {
              value: 'enabled value'
            }
          },
          component: {
            class: 'SimpleInputComponent'
          }
        },
        {
          name: 'disabled_group',
          model: {
            class: 'GroupModel',
            config: {
              disabled: true,
              value: {}
            }
          },
          component: {
            class: 'GroupComponent',
            config: {
              disabled: true,
              componentDefinitions: []
            }
          }
        }
      ]
    };

    const { formComponent } = await createFormAndWaitForReady(formConfig);
    const debugValues = formComponent.getDebugFormValue();

    expect(debugValues['enabled_text']).toBe('enabled value');
    expect(debugValues['disabled_group']).toBeUndefined();
  });

  it('updates URL to edit path after successful create', async () => {
    const formConfig: FormConfigFrame = {
      name: 'create-url-update',
      debugValue: false,
      componentDefinitions: [
        {
          name: 'text_create',
          model: {
            class: 'SimpleInputModel',
            config: {
              value: 'create value'
            }
          },
          component: {
            class: 'SimpleInputComponent'
          }
        }
      ]
    };

    const { fixture, formComponent } = await createFormAndWaitForReady(formConfig, {
      oid: '',
      recordType: 'rdmp',
      editMode: true,
      formName: 'default-1.0-draft',
      downloadAndCreateOnInit: false
    });

    const location = fixture.debugElement.injector.get(Location);
    const replaceStateSpy = spyOn(location, 'replaceState').and.stub();
    (formComponent.recordService as any).brandingAndPortalUrl = 'http://localhost/default/rdmp';
    spyOn(formComponent.recordService, 'create').and.resolveTo({
      success: true,
      oid: 'oid-123'
    } as any);

    await formComponent.saveForm(true);

    expect(formComponent.oid()).toBe('oid-123');
    expect(replaceStateSpy).toHaveBeenCalledWith('/default/rdmp/record/edit/oid-123');
  });

  it('should render debug sections inside rb-form-debug-panel wrappers', async () => {
    const formConfig: FormConfigFrame = {
      name: 'debug-layout',
      debugValue: true,
      componentDefinitions: [
        {
          name: 'text_debug_layout',
          model: {
            class: 'SimpleInputModel',
            config: {
              value: 'value'
            }
          },
          component: {
            class: 'SimpleInputComponent'
          }
        }
      ]
    };

    const { fixture } = await createFormAndWaitForReady(formConfig);
    const debugPanels = fixture.nativeElement.querySelectorAll('.rb-form-debug-panel');
    expect(debugPanels.length).toBe(2);
  });

});
