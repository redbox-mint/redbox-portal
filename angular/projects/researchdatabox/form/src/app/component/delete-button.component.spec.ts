import { TestBed } from '@angular/core/testing';
import { FormConfigFrame } from '@researchdatabox/sails-ng-common';
import { createFormAndWaitForReady, createTestbedModule, setUpDynamicAssets } from '../helpers.spec';
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

  it('should create DeleteButtonComponent', async () => {
    const { fixture } = await createFormAndWaitForReady(formConfig, { oid: 'oid-123', editMode: true } as any);
    const component = fixture.nativeElement.querySelector('redbox-form-delete-button');
    expect(component).toBeTruthy();
  });

  it('publishes form.delete.requested after confirmation', async () => {
    setUpDynamicAssets({
      urlKeyStart: 'http://localhost/default/rdmp/dynamicAsset/formCompiledItems/rdmp/oid-123',
      callable: (keyString, _key, context) => {
        if (keyString === 'componentDefinitions__0__component__config__redirectLocation') {
          return `/dashboard/${context.oid}`;
        }
        throw new Error(`Unknown key: ${keyString}`);
      },
    });
    const { fixture } = await createFormAndWaitForReady(formConfig, { oid: 'oid-123', editMode: true } as any);
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
