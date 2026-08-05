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

  it('reports controls that cannot be synchronized', async () => {
    const unchanged = new FormControl('same');
    const excluded = new FormControl('old');
    const failed = {
      dirty: false,
      pristine: true,
      markAsPristine: () => undefined,
      setCustomValue: () => Promise.reject(new Error('cannot set')),
    } as any;
    const form = new FormGroup({ unchanged, excluded });
    const formDefMap = new FormComponentsMap([], {} as FormConfigFrame);
    formDefMap.withFormControl = {
      unchanged,
      excluded,
      failed,
      missingFromServer: new FormControl('local'),
      noComponent: new FormControl('old'),
    };
    formDefMap.completeGroupMap = {
      excluded: {} as any,
    };

    const formService = TestBed.inject(FormService);
    spyOn(formService, 'shouldIncludeInFormControlMap').and.callFake(
      component => component !== formDefMap.completeGroupMap?.['excluded']
    );

    const result = await service.applyServerMetadata(
      {
        unchanged: 'same',
        missingFromServer: 'sent',
        noComponent: 'sent',
        excluded: 'sent',
        failed: 'old',
      },
      {
        unchanged: 'same',
        noComponent: 'server',
        excluded: 'server',
        failed: 'new',
      },
      formDefMap,
      form,
      'always'
    );

    expect(result.patched).toEqual(['noComponent']);
    expect(result.skipped).toEqual([
      { name: 'unchanged', reason: 'unchanged' },
      { name: 'missingFromServer', reason: 'not-in-server' },
      { name: 'excluded', reason: 'excluded' },
      { name: 'failed', reason: 'set-failed' },
    ]);
  });

  it('does nothing when server synchronization is disabled', async () => {
    const control = new FormControl('local');
    const form = new FormGroup({ control });
    const formDefMap = new FormComponentsMap([], {} as FormConfigFrame);
    formDefMap.withFormControl = { control };

    const result = await service.applyServerMetadata(
      { control: 'local' },
      { control: 'server' },
      formDefMap,
      form,
      'never'
    );

    expect(control.value).toBe('local');
    expect(result).toEqual({ patched: [], skipped: [] });
  });
});
