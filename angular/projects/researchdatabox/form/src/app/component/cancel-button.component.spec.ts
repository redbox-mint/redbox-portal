import { TestBed } from '@angular/core/testing';
import { CancelButtonComponent } from './cancel-button.component';
import { SimpleInputComponent } from './simple-input.component';
import {createFormAndWaitForReady, createTestbedModule, DynamicAssetOptions} from '../helpers.spec';
import {
  CancelButtonComponentName, CancelButtonFieldComponentDefinitionFrame,
  FormConfigFrame, isTypeFieldDefinitionName,
} from '@researchdatabox/sails-ng-common';
import {FormComponentEventBus, FormComponentEventType, FormStateFacade} from '../form-state';
import {Location} from "@angular/common";


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

  it('should create CancelButtonComponent', async () => {
    const { fixture } = await createFormAndWaitForReady(formConfig, { editMode: true } as any);
    const component = fixture.nativeElement.querySelector('redbox-form-cancel-button');
    expect(component).toBeTruthy();
  });

  it('should show confirmation dialog only when dirty', async () => {
    const { fixture } = await createFormAndWaitForReady(formConfig, { editMode: true } as any);
    const button = fixture.nativeElement.querySelector('button.btn.btn-warning') as HTMLButtonElement;
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

    const button = fixture.nativeElement.querySelector('button.btn.btn-warning') as HTMLButtonElement;
    expect(button.disabled).toBeTrue();
  });

  it('should publish form.redirect.requested event', async () => {
    const dynamicAssetOptions: DynamicAssetOptions = {
      entries: [{
        urlKeyStart: 'http://localhost/default/rdmp/dynamicAsset/formCompiledItems/rdmp/oid-123',
        callable: (keyString, _key, context) => {
          if (keyString === 'componentDefinitions__0__component__config__redirectLocation') {
            return `/dashboard/${context.oid}`;
          }
          throw new Error(`Unknown key: ${keyString}`);
        },
      }]
    };
    const formConfigRedirect = structuredClone(formConfig);
    const cancelButtonComp = formConfigRedirect.componentDefinitions[1].component;
    if (!isTypeFieldDefinitionName<CancelButtonFieldComponentDefinitionFrame>(cancelButtonComp, CancelButtonComponentName)) {
      throw new Error(`Expected ${CancelButtonComponentName}, got ${JSON.stringify(cancelButtonComp)}`);
    }
    const redirectLocation = '/brand-1/portal-1/dashboard/dataPublication';
    if (cancelButtonComp.config) {
      cancelButtonComp.config.redirectLocation = redirectLocation;
      cancelButtonComp.config.redirectDelaySeconds = 2;
    }

    const {fixture, formComponent} = await createFormAndWaitForReady(
      formConfigRedirect, {oid: 'oid-123', editMode: true} as any, undefined, dynamicAssetOptions);

    const eventBus = TestBed.inject(FormComponentEventBus);
    const events: any[] = [];
    const sub = eventBus
      .select$(FormComponentEventType.FORM_REDIRECT_REQUESTED)
      .subscribe(e => events.push(e));

    try {
      const location = fixture.debugElement.injector.get(Location);
      const changeLocationHrefSpy = spyOn<any>(formComponent, 'changeLocationHref').and.stub();
      const locationHistoryGoSpy = spyOn(location, 'historyGo').and.stub();

      const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
      button.click();
      await fixture.whenStable();

      expect(changeLocationHrefSpy).toHaveBeenCalledWith(redirectLocation);
      expect(locationHistoryGoSpy).not.toHaveBeenCalled();
      expect(events.length).toEqual(1);
      expect(events[0].historyDelta).toEqual(undefined);
      expect(events[0].redirectLocation).toBe(redirectLocation);
      expect(events[0].redirectDelaySeconds).toEqual(2);
      expect(events[0].sourceId).toBe('cancel_button');
    } finally {
      sub.unsubscribe();
    }
  });
});
