import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { Store } from '@ngrx/store';
import { FormConfigFrame } from '@researchdatabox/sails-ng-common';
import { createFormAndWaitForReady, createTestbedModule } from '../helpers.spec';
import * as FormActions from '../form-state/state/form.actions';
import { createFormDeleteSuccessEvent, FormComponentEventBus } from '../form-state';
import { SaveStatusComponent } from './save-status.component';
import { SimpleInputComponent } from './simple-input.component';

let formConfig: FormConfigFrame;

describe('SaveStatusComponent', () => {
  beforeEach(async () => {
    await createTestbedModule({
      declarations: {
        "SimpleInputComponent": SimpleInputComponent,
        "SaveStatusComponent": SaveStatusComponent,
      }
    });
    formConfig = {
      name: 'testing',
      debugValue: true,
      domElementType: 'form',
      defaultComponentConfig: {
        defaultComponentCssClasses: 'row',
      },
      editCssClasses: 'redbox-form form',
      enabledValidationGroups: ['none'],
      componentDefinitions: [
        {
          name: 'text_1_event',
          model: {
            class: 'SimpleInputModel',
            config: {
              value: 'hello world default!'
            }
          },
          component: {
            class: 'SimpleInputComponent'
          }
        },
        {
          name: 'save_status',
          component: {
            class: 'SaveStatusComponent',
            config: {
              successDisplayDurationMs: 3000
            }
          }
        }
      ]
    };
  });

  it('should create SaveStatusComponent', () => {
    const fixture = TestBed.createComponent(SaveStatusComponent);
    expect(fixture.componentInstance).toBeDefined();
  });

  it('should show saving status while save is in progress', fakeAsync(() => {
    let fixture: any;
    let formComponent: any;
    createFormAndWaitForReady(formConfig).then(result => {
      fixture = result.fixture;
      formComponent = result.formComponent;
    });
    tick();

    spyOn(formComponent, 'saveForm').and.returnValue(new Promise(() => {}));
    const store = TestBed.inject(Store);
    store.dispatch(FormActions.submitForm({ force: true }));
    fixture.detectChanges();
    tick();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.rb-form-save-status.alert-info')).toBeTruthy();
  }));

  it('should show save success after a successful save', async () => {
    const { fixture } = await createFormAndWaitForReady(formConfig);
    const store = TestBed.inject(Store);
    store.dispatch(FormActions.submitFormSuccess({ savedData: {}, lastSavedAt: new Date().toISOString() }));
    fixture.detectChanges();
    await fixture.whenStable();

    const el = fixture.nativeElement.querySelector('.rb-form-save-status.alert-success');
    expect(el).toBeTruthy();
  });

  it('should keep save success visible for the configured duration before hiding it', fakeAsync(() => {
    let fixture: any;
    createFormAndWaitForReady(formConfig).then(result => {
      fixture = result.fixture;
    });
    tick();

    const store = TestBed.inject(Store);
    store.dispatch(FormActions.submitFormSuccess({ savedData: {}, lastSavedAt: new Date().toISOString() }));
    fixture.detectChanges();
    tick();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.rb-form-save-status.alert-success')).toBeTruthy();

    tick(2900);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.rb-form-save-status.alert-success')).toBeTruthy();

    tick(200);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.rb-form-save-status.alert-success')).toBeFalsy();
  }));

  it('should show save failure after a failed save', async () => {
    const { fixture } = await createFormAndWaitForReady(formConfig);
    const store = TestBed.inject(Store);
    store.dispatch(FormActions.submitFormFailure({ error: 'Boom' }));
    fixture.detectChanges();
    await fixture.whenStable();

    const el = fixture.nativeElement.querySelector('.rb-form-save-status.alert-danger');
    expect(el?.textContent).toContain('Boom');
  });

  it('should keep save failure visible until another save starts', fakeAsync(() => {
    let fixture: any;
    let formComponent: any;
    createFormAndWaitForReady(formConfig).then(result => {
      fixture = result.fixture;
      formComponent = result.formComponent;
    });
    tick();

    const store = TestBed.inject(Store);
    store.dispatch(FormActions.submitFormFailure({ error: 'Boom' }));
    fixture.detectChanges();
    tick();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.rb-form-save-status.alert-danger')).toBeTruthy();

    tick(5000);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.rb-form-save-status.alert-danger')).toBeTruthy();

    spyOn(formComponent, 'saveForm').and.returnValue(new Promise(() => {}));
    store.dispatch(FormActions.submitForm({ force: true }));
    fixture.detectChanges();
    tick();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.rb-form-save-status.alert-info')).toBeTruthy();
  }));

  it('should show deleting status while delete is in progress', fakeAsync(() => {
    let fixture: any;
    let formComponent: any;
    createFormAndWaitForReady(formConfig).then(result => {
      fixture = result.fixture;
      formComponent = result.formComponent;
    });
    tick();

    spyOn(formComponent, 'deleteRecord').and.returnValue(new Promise(() => {}));
    const store = TestBed.inject(Store);
    store.dispatch(FormActions.deleteRecord({ closeOnDelete: false }));
    fixture.detectChanges();
    tick();
    fixture.detectChanges();

    const el = fixture.nativeElement.querySelector('.rb-form-save-status.alert-info');
    expect(el).toBeTruthy();
    expect(el?.querySelector('.fa-spinner')).toBeTruthy();
  }));

  it('should show delete success after a successful delete event', fakeAsync(() => {
    let fixture: any;
    createFormAndWaitForReady(formConfig).then(result => {
      fixture = result.fixture;
    });
    tick();

    const eventBus = TestBed.inject(FormComponentEventBus);
    eventBus.publish(createFormDeleteSuccessEvent({ oid: 'oid-1' }));
    fixture.detectChanges();
    tick();
    fixture.detectChanges();

    const el = fixture.nativeElement.querySelector('.rb-form-save-status.alert-success');
    expect(el).toBeTruthy();
  }));
});
