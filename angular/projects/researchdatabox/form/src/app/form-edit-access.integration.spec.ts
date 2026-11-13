import { TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { RecordActionResult } from '@researchdatabox/portal-ng-common';
import { FormConfigFrame } from '@researchdatabox/sails-ng-common';
import { createFormAndWaitForReady, createTestbedModule } from './helpers.spec';
import { SimpleInputComponent } from './component/simple-input.component';
import { SaveButtonComponent } from './component/save-button.component';
import { ValidationSummaryFieldComponent } from './component/validation-summary.component';
import { FormComponentEventBus } from './form-state/events';

// Real native controls and save orchestration; RecordService is always mocked.
describe('Form edit access denial and retry', () => {
  beforeEach(async () => {
    await createTestbedModule({ declarations: {
      SimpleInputComponent, SaveButtonComponent, ValidationSummaryFieldComponent,
    } });
  });

  for (const denial of ['action', 'edit-lost', 'deleted']) {
    const editLost = denial !== 'action';
    const deleted = denial === 'deleted';
    it(`${editLost ? `blocks button and direct retries after ${denial}` : 'allows ordinary save after workflow denial'}`, async () => {
      const config: FormConfigFrame = {
        name: 'edit-access-retry', enabledValidationGroups: ['all'],
        componentDefinitions: [
          { name: 'title', model: { class: 'SimpleInputModel', config: { value: 'Loaded title' } },
            component: { class: 'SimpleInputComponent' } },
          { name: 'transition', component: { class: 'SaveButtonComponent', config: {
            label: 'Close record', targetStep: 'closed',
          } } },
          { name: 'save', component: { class: 'SaveButtonComponent', config: { label: 'Save draft' } } },
          { name: 'force', component: { class: 'SaveButtonComponent', config: { label: 'Force save', forceSave: true } } },
          { name: 'summary', component: { class: 'ValidationSummaryComponent' } },
        ],
      };
      const { fixture, formComponent } = await createFormAndWaitForReady(config, {
        oid: 'fixture-edit-access', recordType: 'rdmp', editMode: true,
        formName: 'edit-access-retry', downloadAndCreateOnInit: false,
      });
      const update = spyOn(formComponent.recordService, 'update').and.resolveTo(
        RecordActionResult.fromResponse({ meta: {
          outcome: 'not-saved', oid: 'fixture-edit-access', problems: [{
            kind: deleted ? 'conflict' : 'authorization', phase: 'pre-save', issues: [{
              code: deleted ? 'record-deleted' : editLost ? 'record-validation-edit-unauthorized' : 'scu-rdmp-action-unauthorized',
              message: editLost ? 'Edit access was removed.' : 'You cannot close this record. You may still save a draft.',
            }],
          }],
        } }, deleted ? 412 : 403, '44444444-4444-4444-8444-444444444444')
      );
      const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
      input.value = 'Unsaved local title';
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      await fixture.whenStable();
      const buttons = Array.from(fixture.nativeElement.querySelectorAll('.rb-form-save-button button')) as HTMLButtonElement[];
      expect(buttons.length).toBe(3);
      buttons[0].click();
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(update).toHaveBeenCalledTimes(1);
      expect(update.calls.argsFor(0)[2]).toBe('closed');
      expect(formComponent.form?.get('title')?.value).toBe('Unsaved local title');
      expect(formComponent.conflictState()?.status ?? null).toBe(deleted ? 'deleted' : editLost ? 'permission-lost' : null);
      expect(formComponent.canRetryFormLevelServerErrors()).toBe(!editLost);
      if (!editLost) {
        expect(input.disabled).toBeFalse();
        expect(buttons[1].disabled).toBeFalse();
        expect(fixture.nativeElement.textContent).toContain('You cannot close this record.');
      }
      update.and.resolveTo(RecordActionResult.fromResponse({ meta: {
        outcome: 'saved', oid: 'fixture-edit-access', metadata: { title: 'Unsaved local title' },
      } }, 200, '55555555-5555-4555-8555-555555555555'));
      // Even a direct retry must stop at the form's authoritative conflict guard.
      if (editLost) {
        // Editing local values clears form-level server errors, but cannot restore edit authority.
        input.value = 'More unsaved local edits';
        input.dispatchEvent(new Event('input'));
        fixture.detectChanges();
        await fixture.whenStable();
        fixture.detectChanges();
        for (const button of buttons) {
          expect(button.disabled).withContext(`${denial}: ${button.textContent}`).toBeTrue();
          button.click();
        }
        await fixture.whenStable();
        await formComponent.saveForm();
        await formComponent.saveForm({ force: true });
      }
      else {
        buttons[1].click();
        fixture.detectChanges();
        await fixture.whenStable();
      }
      expect(update).toHaveBeenCalledTimes(editLost ? 1 : 2);
      if (!editLost) {
        expect(update.calls.argsFor(1)[2]).toBe('');
        expect(update.calls.argsFor(1)[3]).toBeUndefined();
        expect(formComponent.saveResponse()?.wasPersisted()).toBeTrue();
        expect(formComponent.form?.errors).toBeNull();
      }
      if (editLost) {
        formComponent.oid.set('replacement-oid');
        await formComponent.downloadAndCreateFormComponents(config);
        expect(formComponent.conflictState()).toBeNull();
        expect(formComponent.getExpressionRuntimeContext()['oid']).toBe('replacement-oid');
        update.and.resolveTo(RecordActionResult.fromResponse({ meta: {
          outcome: 'saved', oid: 'replacement-oid', metadata: { title: 'Replacement draft' },
        } }, 200));
        await formComponent.saveForm({ force: true });
        expect(update).toHaveBeenCalledTimes(2);
        expect(update.calls.argsFor(1)[0]).toBe('replacement-oid');
      }
      TestBed.inject(HttpTestingController).expectNone(request => /recordmeta|api\/records\/metadata/.test(request.url));
    });
  }
});

// Reusing a host is supported: pending work still belongs to the original record.
describe('Form denial isolation across record replacement', () => {
  const config = (title: string): FormConfigFrame => ({
    name: 'edit-access-retry', componentDefinitions: [
      { name: 'title', model: { class: 'SimpleInputModel', config: { value: title } }, component: { class: 'SimpleInputComponent' } },
      { name: 'save', component: { class: 'SaveButtonComponent', config: { label: 'Save draft' } } },
    ],
  });
  beforeEach(async () => {
    await createTestbedModule({ declarations: { SimpleInputComponent, SaveButtonComponent } });
  });

  for (const [outcome, replacementOid] of [
    ['edit-lost', 'new-oid'], ['deleted', 'new-oid'], ['rejects', 'new-oid'],
    ['edit-lost', 'old-oid'], ['deleted', 'old-oid'], ['rejects', 'old-oid'],
  ]) {
    it(`ignores an old ${outcome} response while ${replacementOid} saves after a reload`, async () => {
      const { fixture, formComponent } = await createFormAndWaitForReady(config('Old'), {
        oid: 'old-oid', editMode: true, formName: 'edit-access-retry',
      });
      let releaseOld!: (result: RecordActionResult) => void;
      let rejectOld!: (error: Error) => void;
      let releaseNew!: (result: RecordActionResult) => void;
      const oldResult = new Promise<RecordActionResult>((resolve, reject) => { releaseOld = resolve; rejectOld = reject; });
      const newResult = new Promise<RecordActionResult>(resolve => { releaseNew = resolve; });
      const update = spyOn(formComponent.recordService, 'update').and.returnValues(oldResult, newResult);
      const savingOld = formComponent.saveForm({ force: true, targetStep: 'closed' });
      expect(update).toHaveBeenCalledTimes(1);
      formComponent.oid.set(replacementOid);
      await formComponent.downloadAndCreateFormComponents(config('New'));
      expect(formComponent.saveResponse()).toBeUndefined();
      const failures: unknown[] = [];
      const events = TestBed.inject(FormComponentEventBus).select$('form.save.failure').subscribe(event => failures.push(event));
      const savingNew = formComponent.saveForm({ force: true });
      expect(update).toHaveBeenCalledTimes(2);
      if (outcome === 'rejects') rejectOld(new Error('Old request pre-dispatch failure'));
      else releaseOld(RecordActionResult.fromResponse({ meta: {
        oid: 'old-oid', outcome: 'not-saved', problems: [{
          kind: outcome === 'deleted' ? 'conflict' : 'authorization', phase: 'pre-save', issues: [{
            code: outcome === 'deleted' ? 'record-deleted' : 'record-validation-edit-unauthorized', message: 'Old record denial',
          }],
        }],
      } }, outcome === 'deleted' ? 412 : 403));
      await savingOld;
      expect(formComponent.saveResponse()).toBeNull();
      expect(formComponent.form?.errors).toBeNull();
      expect(formComponent.conflictState()).toBeNull();
      expect(failures).toEqual([]);
      expect(formComponent.getExpressionRuntimeContext()['oid']).toBe(replacementOid);
      releaseNew(RecordActionResult.fromResponse({ meta: { oid: replacementOid, outcome: 'saved', metadata: { title: 'New' } } }, 200));
      await savingNew;
      expect(formComponent.recordBaseline()?.oid).toBe(replacementOid);
      expect(formComponent.saveResponse()?.wasPersisted()).toBeTrue();
      events.unsubscribe();
      fixture.destroy();
    });
  }

  it('does not submit a replacement record after the old record finishes pending validation', async () => {
    const { fixture, formComponent } = await createFormAndWaitForReady(config('Old'), {
      oid: 'old-oid', editMode: true, formName: 'edit-access-retry',
    });
    let settle!: (errors: null) => void;
    const pending = new Promise<null>(resolve => { settle = resolve; });
    const oldControl = formComponent.form!.get('title')!;
    oldControl.setAsyncValidators(() => pending);
    oldControl.updateValueAndValidity();
    const update = spyOn(formComponent.recordService, 'update').and.resolveTo(RecordActionResult.fromResponse({ meta: { outcome: 'saved', oid: 'new-oid' } }, 200));
    const savingOld = formComponent.saveForm({ force: true, targetStep: 'closed' });
    expect(update).not.toHaveBeenCalled();
    formComponent.oid.set('new-oid');
    await formComponent.downloadAndCreateFormComponents(config('New'));
    settle(null);
    await savingOld;
    expect(update).not.toHaveBeenCalled();
    expect(formComponent.form?.get('title')?.value).toBe('New');
    expect(formComponent.conflictState()).toBeNull();
    fixture.destroy();
  });
});
