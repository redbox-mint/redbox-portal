import { TestBed } from '@angular/core/testing';
import { FormConfigFrame } from '@researchdatabox/sails-ng-common';
import {createFormAndWaitForReady, createTestbedModule, DynamicAssetOptions, FormComponentProps} from '../helpers.spec';
import { ConfirmationDialogService } from '../confirmation-dialog.service';
import { FormComponentEventBus } from '../form-state';
import { DeleteButtonComponent } from './delete-button.component';

let formConfig: FormConfigFrame;

describe('DeleteButtonComponent', () => {
  beforeEach(async () => {
    await createTestbedModule({
      declarations: {
        DeleteButtonComponent,
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

  it('updates native disabled state after configured disabling is changed without an OID change', async () => {
    formConfig.componentDefinitions![0].component.config!.disabled = true;
    const props: FormComponentProps = { oid: 'oid-123', editMode: true, recordType: 'rdmp', formName: 'delete-test', downloadAndCreateOnInit: false };
    const { fixture, formComponent } = await createFormAndWaitForReady(formConfig, props);
    const component = formComponent.getComponentDefByName('delete_button')!.component as DeleteButtonComponent;
    const button = fixture.nativeElement.querySelector('redbox-form-delete-button button') as HTMLButtonElement;
    expect(button.disabled).toBeTrue();
    component.setDisabled(false);
    fixture.detectChanges();
    expect(button.disabled).toBeFalse();
    component.setDisabled(true);
    fixture.detectChanges();
    expect(button.disabled).toBeTrue();
  });

  it('cancels native deletion without publishing, and respects disabling while confirmation is pending', async () => {
    // A redirect is irrelevant to Cancel and would otherwise require a compiled template fixture.
    Object.assign(formConfig.componentDefinitions![0].component.config!, { redirectLocation: '' });
    const props: FormComponentProps = { oid: 'oid-123', editMode: true, recordType: 'rdmp', formName: 'delete-test', downloadAndCreateOnInit: false };
    const { fixture, formComponent } = await createFormAndWaitForReady(formConfig, props);
    const component = formComponent.getComponentDefByName('delete_button')!.component as DeleteButtonComponent;
    const dialog = TestBed.inject(ConfirmationDialogService);
    const events: unknown[] = [];
    const sub = TestBed.inject(FormComponentEventBus).select$('form.delete.requested').subscribe(event => events.push(event));
    try {
      const pending = component.delete();
      fixture.detectChanges();
      (fixture.nativeElement.querySelector('.modal-footer .btn-secondary') as HTMLButtonElement).click();
      await pending;
      expect(events.length).toBe(0);
      const next = component.delete();
      component.setDisabled(true);
      dialog.resolve(true);
      await next;
      expect(events.length).toBe(0);
    } finally { sub.unsubscribe(); }
  });

  it('cannot render, confirm or publish deletion from a view-mode record', async () => {
    const { fixture, formComponent } = await createFormAndWaitForReady(formConfig);
    const component = formComponent.getComponentDefByName('delete_button')!.component as DeleteButtonComponent;
    const publish = spyOn(TestBed.inject(FormComponentEventBus), 'publish');
    const confirm = spyOn(TestBed.inject(ConfirmationDialogService), 'confirm');
    expect(fixture.nativeElement.querySelector('redbox-form-delete-button button')).toBeNull();
    await component.delete();
    expect(confirm).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });

  it('should create DeleteButtonComponent', async () => {
    const { fixture } = await createFormAndWaitForReady(formConfig, { oid: 'oid-123', editMode: true } as any);
    const component = fixture.nativeElement.querySelector('redbox-form-delete-button');
    expect(component).toBeTruthy();
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
});
