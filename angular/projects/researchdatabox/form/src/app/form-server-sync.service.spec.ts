import { TestBed } from '@angular/core/testing';
import { FormControl, FormGroup } from '@angular/forms';
import { LoggerService } from '@researchdatabox/portal-ng-common';
import { FormConfigFrame } from '@researchdatabox/sails-ng-common';
import { FormComponentsMap, FormService } from './form.service';
import { FormServerSyncService } from './form-server-sync.service';

describe('FormServerSyncService', () => {
  let service: FormServerSyncService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        FormServerSyncService,
        { provide: FormService, useValue: { shouldIncludeInFormControlMap: () => true } },
        { provide: LoggerService, useValue: { warn: () => undefined } },
      ],
    });
    service = TestBed.inject(FormServerSyncService);
  });

  it('keeps a control dirty when it was edited while the save was in flight', async () => {
    const serverControl = new FormControl('before-server-sync');
    const localControl = new FormControl('before-local-edit');
    const form = new FormGroup({ serverControl, localControl });
    form.markAsPristine();
    localControl.setValue('edited-during-save');
    localControl.markAsDirty();

    const formDefMap = new FormComponentsMap([], {} as FormConfigFrame);
    formDefMap.withFormControl = { serverControl, localControl };

    const result = await service.applyServerMetadata(
      { serverControl: 'before-server-sync', localControl: 'before-local-edit' },
      { serverControl: 'after-server-sync', localControl: 'server-value' },
      formDefMap,
      form,
      'preserveLocalEdits'
    );

    expect(serverControl.value).toBe('after-server-sync');
    expect(serverControl.pristine).toBeTrue();
    expect(localControl.value).toBe('edited-during-save');
    expect(localControl.dirty).toBeTrue();
    expect(form.dirty).toBeTrue();
    expect(result.patched).toEqual(['serverControl']);
    expect(result.skipped).toEqual([{ name: 'localControl', reason: 'local-edit' }]);
  });
});
