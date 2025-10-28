import {TestBed} from '@angular/core/testing';
import {FormComponent} from './form.component';
import {FormConfigFrame} from '@researchdatabox/sails-ng-common';
import {SimpleInputComponent} from './component/simple-input.component';
import {createFormAndWaitForReady, createTestbedModule} from "./helpers.spec";
import { FormComponentEventBus } from './form-state/events/form-component-event-bus.service';
import { createFormSaveExecuteEvent } from './form-state/events/form-component-event.types';

describe('FormComponent', () => {
  beforeEach(async () => {
    await createTestbedModule(
      {
        declarations: {
          "SimpleInputComponent": SimpleInputComponent
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
              defaultValue: 'hello world!'
            }
          },
          component: {
            class: 'SimpleInputComponent'
          }
        }
      ]
    };
    const {fixture, formComponent} = await createFormAndWaitForReady(formConfig);

    // Now run your expectations
    const compiled = fixture.nativeElement as HTMLElement;
    const inputElement = compiled.querySelector('input[type="text"]');
    expect(inputElement).toBeTruthy();
  });

  it('should call saveForm when form.save.execute is published (Task 15)', () => {
    const fixture = TestBed.createComponent(FormComponent);
    const component = fixture.componentInstance;
    const bus = TestBed.inject(FormComponentEventBus);

    const spy = spyOn(component, 'saveForm').and.stub();

    // Publish execute command
    bus.publish(createFormSaveExecuteEvent({ force: true, skipValidation: true, targetStep: 'S1' }));

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(true, 'S1', true);
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
              defaultValue: 'legacy value'
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
    await formComponent.saveForm(true, 'legacy-step', true);
    expect(submitSpy).toHaveBeenCalledWith(true, 'legacy-step',  true);
    expect(formComponent.form?.pristine).toBeTrue();
  });

});
