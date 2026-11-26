import { fakeAsync, flushMicrotasks, TestBed, tick } from '@angular/core/testing';
import { Store } from '@ngrx/store';
import { RecordActionResult } from '@researchdatabox/portal-ng-common';
import { FormConfigFrame, FormStatus } from '@researchdatabox/sails-ng-common';
import {createFormAndWaitForReady, createTestbedModule, DynamicAssetOptions} from '../helpers.spec';
import { ConfirmationDialogService } from '../confirmation-dialog.service';
import {
  deleteRecord, FormComponentEventBus, FormComponentEventType, selectPending, selectStatus, submitForm,
} from '../form-state';
import { DeleteButtonComponent } from './delete-button.component';
import { SimpleInputComponent } from './simple-input.component';

let formConfig: FormConfigFrame;

describe('DeleteButtonComponent', () => {
  beforeEach(async () => {
    await createTestbedModule({
      declarations: {
        DeleteButtonComponent,
        SimpleInputComponent,
      },
      providers: {
        ConfirmationDialogService,
      },
    });

    formConfig = {
      name: 'delete-test',
      debugValue: false,
      defaultComponentConfig: {
        defaultComponentCssClasses: 'row',
      },
      editCssClasses: 'redbox-form form',
      componentDefinitions: [
        {
          name: 'delete_button',
          component: {
            class: 'DeleteButtonComponent',
            config: {
              label: 'Delete',
              closeOnDelete: true,
              redirectLocation: '{{concat "/" branding "/" portal "/dashboard/" oid}}',
              redirectDelaySeconds: 0,
              confirmationMessage: 'Delete this record?',
              confirmationTitle: 'Confirm delete',
              cancelButtonMessage: 'Cancel',
              confirmButtonMessage: 'Delete now',
            },
          },
        },
      ],
    };
  });

  it('should create DeleteButtonComponent', async () => {
    const { fixture } = await createFormAndWaitForReady(formConfig, { oid: 'oid-123', editMode: true } as any);
    const component = fixture.nativeElement.querySelector('redbox-form-delete-button');
    expect(component).toBeTruthy();
  });

  it('retains view-mode confirmation cancellation and confirmed Delete publication', async () => {
    const { fixture, formComponent } = await createFormAndWaitForReady(formConfig, { oid: 'view-record', editMode: false });
    const remove = formComponent.componentDefArr[0].component as DeleteButtonComponent;
    const confirmation = spyOn(TestBed.inject(ConfirmationDialogService), 'confirm').and.resolveTo(false);
    const publish = spyOn(TestBed.inject(FormComponentEventBus), 'publish');
    const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    expect(button.disabled).toBeFalse();
    button.click();
    await fixture.whenStable();
    expect(confirmation).toHaveBeenCalledTimes(1);
    expect(publish).not.toHaveBeenCalled();
    confirmation.and.resolveTo(true);
    await remove.delete();
    expect(confirmation).toHaveBeenCalledTimes(2);
    expect(publish).toHaveBeenCalledWith(jasmine.objectContaining({ type: 'form.delete.requested', sourceId: 'delete_button' }));
  });

  it('keeps a configured disabled Delete disabled in view mode', async () => {
    const config = formConfig.componentDefinitions?.[0]?.component?.config;
    if (!config) throw new Error('Missing Delete config');
    config.disabled = true;
    const { fixture, formComponent } = await createFormAndWaitForReady(formConfig, { oid: 'view-record', editMode: false });
    const confirmation = spyOn(TestBed.inject(ConfirmationDialogService), 'confirm');
    const publish = spyOn(TestBed.inject(FormComponentEventBus), 'publish');
    expect((fixture.nativeElement.querySelector('button') as HTMLButtonElement).disabled).toBeTrue();
    await (formComponent.componentDefArr[0].component as DeleteButtonComponent).delete();
    expect(confirmation).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });

  it('publishes form.delete.requested after confirmation', async () => {
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
    const { fixture } = await createFormAndWaitForReady(
      formConfig, { oid: 'oid-123', editMode: true } as any, undefined, dynamicAssetOptions);
    const confirmationDialogService = TestBed.inject(ConfirmationDialogService);
    spyOn(confirmationDialogService, 'confirm').and.resolveTo(true);

    const eventBus = TestBed.inject(FormComponentEventBus);
    const events: any[] = [];
    const sub = eventBus.select$('form.delete.requested').subscribe(e => events.push(e));

    try {
      const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
      button.click();
      await fixture.whenStable();

      expect(events.length).toBe(1);
      expect(events[0].closeOnDelete).toBeTrue();
      expect(events[0].redirectLocation).toBe('/dashboard/oid-123');
      expect(events[0].sourceId).toBe('delete_button');
    } finally {
      sub.unsubscribe();
    }
  });

  it('drops a delete waiting on its redirect template when a save starts closing the form', fakeAsync(async () => {
    const { fixture, formComponent } = await createFormAndWaitForReady({
      ...formConfig,
      componentDefinitions: [
        ...formConfig.componentDefinitions,
        {
          name: 'title',
          model: { class: 'SimpleInputModel', config: { value: 'Draft title' } },
          component: { class: 'SimpleInputComponent' },
        },
      ],
    }, { oid: 'oid-123', editMode: true });
    const button = formComponent.componentDefArr[0].component as DeleteButtonComponent;
    spyOn(TestBed.inject(ConfirmationDialogService), 'confirm').and.resolveTo(true);
    let resolveRedirect!: (redirect: string) => void;
    const lookup = spyOn<any>(button, 'resolveRedirectLocation').and.returnValue(
      new Promise<string>(resolve => resolveRedirect = resolve)
    );
    const bus = TestBed.inject(FormComponentEventBus);
    const publish = spyOn(bus, 'publish').and.callThrough();
    const remove = spyOn(formComponent.recordService, 'delete');
    const navigate = spyOn<any>(formComponent, 'changeLocationHref');
    const update = spyOn(formComponent.recordService, 'update').and.resolveTo(RecordActionResult.fromResponse({
      meta: { oid: 'oid-123', outcome: 'saved', concurrency: { formReloadRequired: true } },
    }));
    const store = TestBed.inject(Store);
    const status = store.selectSignal(selectStatus);
    const pendingActions = store.selectSignal(selectPending);

    (fixture.nativeElement.querySelector('redbox-form-delete-button button') as HTMLButtonElement).click();
    flushMicrotasks();
    expect(lookup).toHaveBeenCalledTimes(1);

    store.dispatch(submitForm({
      force: true, targetStep: 'active', enabledValidationGroups: [],
      closeOnSave: true, redirectLocation: '/next', redirectDelaySeconds: 2,
    }));
    flushMicrotasks();
    expect(update).toHaveBeenCalledTimes(1);
    expect(formComponent.saveNavigationPending()).toBeTrue();
    expect(status()).toBe(FormStatus.READY);

    resolveRedirect('/after-delete');
    flushMicrotasks();
    expect(publish).not.toHaveBeenCalledWith(jasmine.objectContaining({ type: FormComponentEventType.FORM_DELETE_REQUESTED }));
    expect(remove).not.toHaveBeenCalled();
    expect(pendingActions()).not.toContain('deleteRecord');

    for (let attempt = 0; attempt < 2; attempt++) {
      store.dispatch(submitForm({ force: true, enabledValidationGroups: [] }));
      expect(status()).toBe(FormStatus.READY);
      expect(pendingActions()).not.toContain('submitForm');
      store.dispatch(deleteRecord({}));
      expect(status()).toBe(FormStatus.READY);
      expect(pendingActions()).not.toContain('deleteRecord');
    }
    expect(update).toHaveBeenCalledTimes(1);
    expect(remove).not.toHaveBeenCalled();
    tick(2000);
    expect(navigate).toHaveBeenCalledOnceWith('/next');
  }));
});
