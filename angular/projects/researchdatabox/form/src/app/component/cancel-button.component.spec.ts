import { TestBed } from '@angular/core/testing';
import { CancelButtonComponent } from './cancel-button.component';
import { SimpleInputComponent } from './simple-input.component';
import { createFormAndWaitForReady, createTestbedModule } from '../helpers.spec';
import { FormConfigFrame } from '@researchdatabox/sails-ng-common';
import { FormStateFacade } from '../form-state';

let formConfig: FormConfigFrame;

describe('CancelButtonComponent', () => {
  beforeEach(async () => {
    await createTestbedModule({
      declarations: {
        SimpleInputComponent,
        CancelButtonComponent,
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
          name: 'text_1_event',
          model: {
            class: 'SimpleInputModel',
            config: {
              value: 'hello world default!',
            },
          },
          component: {
            class: 'SimpleInputComponent',
          },
        },
        {
          name: 'cancel_button',
          component: {
            class: 'CancelButtonComponent',
            config: {
              label: 'Cancel',
              confirmationMessage: 'Are you sure?',
              confirmationTitle: 'Confirm',
              cancelButtonMessage: 'No',
              confirmButtonMessage: 'Yes',
            },
          },
        },
      ],
    };
  });

  it('should create CancelButtonComponent', () => {
    const fixture = TestBed.createComponent(CancelButtonComponent);
    const component = fixture.componentInstance;
    expect(component).toBeDefined();
  });

  it('should show confirmation dialog only when dirty', async () => {
    const { fixture } = await createFormAndWaitForReady(formConfig, { editMode: true } as any);
    const button = fixture.nativeElement.querySelector('button.btn.btn-secondary') as HTMLButtonElement;
    expect(button).toBeTruthy();

    button.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.modal')).toBeNull();

    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    input.value = 'new value';
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    fixture.detectChanges();

    button.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.modal')).toBeTruthy();
  });

  it('should disable cancel when form is saving', async () => {
    const { fixture } = await createFormAndWaitForReady(formConfig, { editMode: true } as any);
    const facade = TestBed.inject(FormStateFacade);
    spyOn(facade, 'isSaving').and.returnValue(true as any);
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector('button.btn.btn-secondary') as HTMLButtonElement;
    expect(button.disabled).toBeTrue();
  });
});
